import { emitScriptDebugEvent } from '../libs/script-loader/debug';
import type {
	Script,
	ScriptCallbackInfo,
	ScriptLifecycleCallback,
	ScriptServerStart,
} from '../libs/script-loader/types';
import type { ConsentState } from '../types';
import { stepReachesCode } from './call-path';
import { mapConsentState } from './consent-mapping';
import { levelOf, RUNTIME_VALUE_LEVELS } from './features';
import { isNativeFunction, undeclaredRoot } from './globals';
import { RUNTIME_VALUE_KIND } from './types';
import type { ManifestStep, ResolvedManifest, RuntimeValue } from './types';
import { ALL_DENIED, signalConsents } from './vendor-consent';

/**
 * Turns a manifest's pre-load steps into inline code for a server render,
 * or `undefined` when they can't be inlined.
 */
export type InlineStepsStart = (
	steps: ManifestStep[]
) => ScriptServerStart | undefined;

type ManifestLifecycleCallback = Exclude<ScriptLifecycleCallback, 'onError'>;

/** What one manifest script keeps between its callbacks. */
interface ScriptState {
	/** Tags its `loadScriptStep` steps inserted, by id. */
	tags: Map<string, HTMLScriptElement>;
	/** Its script element, from the last callback that had one. */
	element?: HTMLScriptElement;
	/** The last callback info it got before disposal. */
	latest?: ScriptCallbackInfo;
	disposed: boolean;
	/**
	 * The `consentGate` value: one function per registration. Once the
	 * registration is disposed it returns `null` for ever.
	 */
	gate: (value: unknown) => unknown;
}

/** What runtime values and owned tags read while steps run. */
interface StepValues {
	/** The callback info the steps run for. */
	info?: ScriptCallbackInfo;
	state?: ScriptState;
	/** The manifest's `globals`: the only roots a step may use. */
	globals?: readonly string[];
}

interface StepExecutionContext {
	scriptId: string;
	elementId: string;
	hasConsent: boolean;
	callback: ManifestLifecycleCallback;
	phase: string;
	values?: StepValues;
}

const isRuntimeValue = function isRuntimeValue(
	value: unknown
): value is RuntimeValue {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		(value as Partial<RuntimeValue>).kind === RUNTIME_VALUE_KIND &&
		levelOf(RUNTIME_VALUE_LEVELS, (value as Partial<RuntimeValue>).value) !==
			undefined
	);
};

/**
 * Whether the vendor may run: its consent condition holds and the visitor
 * has not turned it off.
 */
const permitted = (info: ScriptCallbackInfo | undefined): boolean =>
	!!info?.hasConsent && info.vendor?.granted !== false;

const elementNonce = (
	element: HTMLScriptElement | undefined
): string | undefined =>
	// A browser hides the attribute once the element is in the document.
	element?.nonce || element?.getAttribute('nonce') || undefined;

const resolveRuntimeValue = function resolveRuntimeValue(
	value: RuntimeValue,
	{ info, state }: StepValues
): unknown {
	switch (value.value) {
		case 'date': {
			return new Date();
		}
		case 'hasConsent': {
			return permitted(info);
		}
		case 'consents': {
			const allowed = permitted(info);
			const states = mapConsentState(
				value.mapping,
				allowed ? signalConsents(info as ScriptCallbackInfo) : ALL_DENIED
			);
			return Object.fromEntries(
				Object.entries(states).map(([purpose, consent]) => {
					const granted = allowed && consent === 'granted';
					if (value.format === 'boolean') {
						return [purpose, granted];
					}
					return [purpose, granted ? 'granted' : 'denied'];
				})
			);
		}
		case 'scriptElement': {
			return info?.element ?? state?.element;
		}
		case 'scriptNonce': {
			return elementNonce(info?.element ?? state?.element);
		}
		case 'consentGate': {
			return state?.gate;
		}
		default: {
			return Date.now();
		}
	}
};

const cloneStepValue = function cloneStepValue(
	value: unknown,
	values: StepValues
): unknown {
	if (isRuntimeValue(value)) {
		return resolveRuntimeValue(value, values);
	}

	if (value instanceof Date) {
		return new Date(value);
	}

	if (Array.isArray(value)) {
		return value.map((item) => cloneStepValue(item, values));
	}

	if (value !== null && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, nestedValue] of Object.entries(
			value as Record<string, unknown>
		)) {
			const cloned = cloneStepValue(nestedValue, values);
			// A vendor reads a missing nonce as none; an `undefined` one it may
			// set as the string "undefined".
			if (
				cloned === undefined &&
				isRuntimeValue(nestedValue) &&
				nestedValue.value === 'scriptNonce'
			) {
				continue;
			}
			result[key] = cloned;
		}
		return result;
	}

	return value;
};

/** Whether `value` holds the runtime value `name` anywhere. */
const usesRuntimeValue = function usesRuntimeValue(
	value: unknown,
	name: RuntimeValue['value']
): boolean {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	if (isRuntimeValue(value)) {
		return value.value === name;
	}
	return Object.values(value).some((entry) => usesRuntimeValue(entry, name));
};

/**
 * Whether a server render leaves `step` to the browser and starts the rest
 * of the steps from the HTML: a call that hands the vendor a consent gate,
 * which has to be the browser's own function.
 */
const isHydrationOnly = (step: ManifestStep): boolean =>
	step.type === 'callGlobal' &&
	!step.literalArgs &&
	usesRuntimeValue(step.args, 'consentGate');

export const isRecord = function isRecord(
	value: unknown
): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const objectTag = Object.prototype.toString;

/** Tags of the objects a vendor's own data is made of. */
const DATA_TAGS: ReadonlySet<string> = new Set([
	'[object Object]',
	'[object Array]',
	'[object Arguments]',
	'[object Date]',
]);

/**
 * Whether `value` is an object the browser made, such as an element, a
 * window, a document, a location or an attribute, rather than a vendor's
 * plain object or array. A global may be one without the manifest knowing:
 * an element's id or an iframe's name puts it on window.
 */
const isPlatformObject = (value: unknown): boolean => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	try {
		return !DATA_TAGS.has(objectTag.call(value));
	} catch {
		// A cross-origin window throws.
		return true;
	}
};

const MAX_ARG_DEPTH = 32;

/** Whether `value` holds a browser object, such as `scriptElement`. */
const holdsPlatformObject = (value: unknown, depth = 0): boolean =>
	isPlatformObject(value) ||
	(depth < MAX_ARG_DEPTH &&
		typeof value === 'object' &&
		value !== null &&
		Object.values(value).some((entry) =>
			holdsPlatformObject(entry, depth + 1)
		));

/** The native methods a manifest may call, on an array only. */
const ARRAY_METHODS: ReadonlySet<unknown> = new Set(['push', 'unshift']);

/**
 * Whether `fn` is the `push` or `unshift` that `holder`, an array, gets from
 * its realm's `Array.prototype`, and not one set on the array itself. An
 * array from a frame inherits its frame's. A realm's `Array.prototype` is
 * an array whose own prototype is not one.
 */
const isArrayMethod = (
	fn: unknown,
	holder: unknown,
	method: unknown
): boolean => {
	if (
		!(Array.isArray(holder) && ARRAY_METHODS.has(method)) ||
		Object.hasOwn(holder, method as string)
	) {
		return false;
	}
	const prototype: unknown = Object.getPrototypeOf(holder);
	return (
		Array.isArray(prototype) &&
		!Array.isArray(Object.getPrototypeOf(prototype)) &&
		Object.hasOwn(prototype, method as string) &&
		(prototype as unknown as Record<string, unknown>)[method as string] === fn
	);
};

/**
 * Whether a manifest may call `fn` on `holder` with `args`: a vendor's
 * function, or `push` or `unshift` of an array (a vendor's queue) given no
 * browser object. Every other native function is refused, so a declared
 * root that turns out to reach a browser API cannot call it.
 */
const mayCall = (
	fn: unknown,
	holder: unknown,
	method: unknown,
	args: () => unknown[]
): boolean =>
	!isNativeFunction(fn) ||
	(isArrayMethod(fn, holder, method) && !holdsPlatformObject(args()));

/**
 * Reports a call that a function the manifest defined refused when it was
 * called, after its step ran.
 */
const reportRefusedCall = (step: ManifestStep, values: StepValues): void => {
	emitScriptDebugEvent({
		action: 'skipped',
		elementId: values.info?.elementId,
		message: `Refused a ${step.type} call to a browser object or native function`,
		scope: 'step',
		scriptId: values.info?.id ?? '',
		source: 'manifest-runtime',
		stepType: step.type,
	});
};

/**
 * The object at `path` under `root`, and the one holding it, or `undefined`
 * when a segment before the last is not an object or function, or is a
 * browser object.
 */
const readPath = function readPath(
	root: Record<string, unknown>,
	path: readonly string[]
): { holder: Record<string, unknown>; value: unknown } | undefined {
	let holder = root;
	for (const segment of path.slice(0, -1)) {
		const next = holder[segment];
		if (
			next === null ||
			(typeof next !== 'object' && typeof next !== 'function') ||
			isPlatformObject(next)
		) {
			return undefined;
		}
		holder = next as Record<string, unknown>;
	}
	return { holder, value: holder[path.at(-1) as string] };
};

/** `window[name]` when it is an object or function a step may write on. */
const writableTarget = (
	win: Record<string, unknown>,
	name: string
): Record<string, unknown> | undefined => {
	const target = win[name];
	return target === null ||
		(typeof target !== 'object' && typeof target !== 'function') ||
		isPlatformObject(target)
		? undefined
		: (target as Record<string, unknown>);
};

const getPathTarget = function getPathTarget(
	root: Record<string, unknown>,
	path: string[]
): { target: Record<string, unknown>; key: string } | undefined {
	if (path.length === 0) {
		return undefined;
	}

	let target = root;
	for (const segment of path.slice(0, -1)) {
		const next = target[segment];
		if (next === null || typeof next !== 'object' || isPlatformObject(next)) {
			return undefined;
		}

		target = next as Record<string, unknown>;
	}

	return {
		key: path[path.length - 1] as string,
		target,
	};
};

const resolveQueueTarget = function resolveQueueTarget(
	root: Record<string, unknown>,
	queue:
		| { global: string; property?: never }
		| { global?: never; property: string },
	owner?: Record<string, unknown>
): unknown[] | undefined {
	if ('global' in queue && typeof queue.global === 'string') {
		const queueTarget = root[queue.global];
		return Array.isArray(queueTarget) ? queueTarget : undefined;
	}

	if (!owner) {
		return undefined;
	}

	const queueProperty = queue.property as string;
	const queueTarget = owner[queueProperty];
	return Array.isArray(queueTarget) ? queueTarget : undefined;
};

// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
const executeStep = function executeStep(
	step: ManifestStep,
	values: StepValues
): void {
	const win = window as unknown as Record<string, unknown>;

	// The parser refuses these; a manifest built without it must not run
	// them either.
	if (stepReachesCode(step) || undeclaredRoot(step, values.globals)) {
		return;
	}

	// oxlint-disable-next-line default-case -- Preserve established branch order and control flow.
	switch (step.type) {
		case 'setGlobal': {
			const shouldSet = step.ifUndefined !== false;
			if (shouldSet && win[step.name] !== undefined) {
				break;
			}
			if (step.keepExistingQueue && Array.isArray(win[step.name])) {
				break;
			}

			win[step.name] = cloneStepValue(step.value, values);
			break;
		}

		case 'defineQueueFunction': {
			const shouldSet = step.ifUndefined !== false;
			if (shouldSet && win[step.name] !== undefined) {
				break;
			}

			win[step.name] = function queueFunction(this: unknown) {
				const queueTarget = win[step.queue];
				if (!Array.isArray(queueTarget)) {
					return;
				}

				if (step.pushStyle === 'array') {
					// oxlint-disable-next-line prefer-rest-params -- Preserve sequential execution and callback compatibility.
					queueTarget.push(Array.from(arguments));
					return;
				}

				// oxlint-disable-next-line prefer-rest-params -- Preserve sequential execution and callback compatibility.
				queueTarget.push(arguments);
			};
			break;
		}

		case 'defineStubFunction': {
			const shouldSet = step.ifUndefined !== false;
			if (shouldSet && win[step.name] !== undefined) {
				break;
			}

			// oxlint-disable-next-line func-name-matching -- Preserve declaration order, interface shape, and public compatibility.
			const stub = function stubFunction(this: unknown) {
				// A later step may have set the global to a browser object,
				// such as the script element; then the stub neither calls nor
				// queues on it.
				const current = win[step.name];
				const self = isPlatformObject(current)
					? undefined
					: (current as Record<string, unknown> | undefined);
				const dispatcher =
					self && step.dispatchProperty
						? self[step.dispatchProperty]
						: undefined;
				// oxlint-disable-next-line prefer-rest-params -- Preserve sequential execution and callback compatibility.
				const runtimeArgs = Array.from(arguments);

				if (
					typeof dispatcher === 'function' &&
					mayCall(dispatcher, self, step.dispatchProperty, () => runtimeArgs)
				) {
					dispatcher.apply(self, runtimeArgs);
					return;
				}
				if (self !== current || typeof dispatcher === 'function') {
					reportRefusedCall(step, values);
				}

				const queueTarget = resolveQueueTarget(win, step.queue, self);
				if (!queueTarget) {
					return;
				}

				if (step.queueFormat === 'array') {
					queueTarget.push(runtimeArgs);
					return;
				}

				// oxlint-disable-next-line prefer-rest-params -- Preserve sequential execution and callback compatibility.
				queueTarget.push(arguments);
			};

			win[step.name] = stub;
			const stubRecord = stub as unknown as Record<string, unknown>;

			if ('property' in step.queue && typeof step.queue.property === 'string') {
				const queueProperty = step.queue.property;
				if (stubRecord[queueProperty] === undefined) {
					stubRecord[queueProperty] = [];
				}
			}

			for (const alias of step.aliases ?? []) {
				win[alias] = stub;
			}

			for (const selfReference of step.selfReferences ?? []) {
				stubRecord[selfReference] = stub;
			}

			for (const [key, value] of Object.entries(step.properties ?? {})) {
				stubRecord[key] = cloneStepValue(value, values);
			}

			break;
		}

		case 'callGlobal': {
			// Arguments are read only once there is something to call.
			const readArgs = () =>
				step.literalArgs
					? (JSON.parse(JSON.stringify(step.args ?? [])) as unknown[])
					: (step.args ?? []).map((arg) => cloneStepValue(arg, values));

			let args: unknown[] | undefined;
			const argsOnce = () => {
				args ??= readArgs();
				return args;
			};

			if (step.path) {
				const found = readPath(win, step.path);
				if (
					typeof found?.value === 'function' &&
					mayCall(found.value, found.holder, step.path.at(-1), argsOnce)
				) {
					(found.value as (...args: unknown[]) => unknown).apply(
						found.holder,
						argsOnce()
					);
				}
				break;
			}

			const target = win[step.global];
			if (!target || isPlatformObject(target)) {
				break;
			}

			if (step.method) {
				const objectTarget = target as Record<
					string,
					(...args: unknown[]) => unknown
				>;
				const method = objectTarget[step.method];
				if (
					typeof method === 'function' &&
					mayCall(method, objectTarget, step.method, argsOnce)
				) {
					method.apply(objectTarget, argsOnce());
				}
			} else if (
				typeof target === 'function' &&
				mayCall(target, undefined, undefined, argsOnce)
			) {
				(target as (...args: unknown[]) => unknown)(...argsOnce());
			}
			break;
		}

		case 'pushToQueue': {
			const queueTarget = win[step.queue];
			if (!Array.isArray(queueTarget)) {
				break;
			}
			const item = cloneStepValue(step.value, values);
			const { push } = queueTarget;
			if (mayCall(push, queueTarget, 'push', () => [item])) {
				push.call(queueTarget, item);
			}
			break;
		}

		case 'setGlobalPath': {
			const [rootGlobal] = step.path;
			if (
				step.ifGlobalIsQueue &&
				(!rootGlobal || !Array.isArray(win[rootGlobal]))
			) {
				break;
			}

			const pathTarget = getPathTarget(win, step.path);
			if (!pathTarget) {
				break;
			}
			if (step.ifUndefined && pathTarget.target[pathTarget.key] !== undefined) {
				break;
			}

			pathTarget.target[pathTarget.key] = cloneStepValue(step.value, values);
			break;
		}

		case 'defineQueueMethods': {
			const target = writableTarget(win, step.target);
			if (!target) {
				break;
			}

			// When the queue lives on the target itself, a non-array target means
			// the real SDK already replaced the snippet queue (for example a
			// grant → revoke → grant cycle without a page reload). Redefining the
			// methods would overwrite live SDK methods with dead stubs.
			if (!step.queue && !Array.isArray(target)) {
				break;
			}

			const targetRecord = target as Record<string, unknown>;
			for (const methodName of step.methods) {
				if (
					step.preserveExisting &&
					typeof targetRecord[methodName] === 'function'
				) {
					continue;
				}

				targetRecord[methodName] = function queueMethod() {
					// oxlint-disable-next-line prefer-rest-params -- `nameAndArguments` queues the Arguments object itself.
					const callArguments = arguments;
					const args = Array.from(callArguments) as unknown[];
					const queueTarget = resolveQueueTarget(
						win,
						step.queue ?? { global: step.target },
						targetRecord
					);
					if (!queueTarget) {
						return;
					}

					if (
						step.queueFormat === 'methodCall' ||
						step.queueFormat === 'wrappedMethodCall' ||
						step.queueFormat === 'voidMethodCall'
					) {
						const promise = new Promise<unknown>((resolve) => {
							queueTarget.push({
								args,
								name: methodName,
								resolve,
							});
						});

						if (step.queueFormat === 'wrappedMethodCall') {
							return { promise };
						}

						if (step.queueFormat === 'voidMethodCall') {
							return undefined;
						}

						return promise;
					}

					if (step.queueFormat === 'callback') {
						queueTarget.push({
							fn: () => {
								const latestTarget = win[step.target];
								if (
									latestTarget === null ||
									(typeof latestTarget !== 'object' &&
										typeof latestTarget !== 'function')
								) {
									return;
								}
								// A later step may have set the target to a browser
								// object, such as the script element.
								if (isPlatformObject(latestTarget)) {
									reportRefusedCall(step, values);
									return;
								}

								const method = (
									latestTarget as Record<
										string,
										(...methodArgs: unknown[]) => unknown
									>
								)[methodName];
								if (typeof method !== 'function') {
									return;
								}
								if (mayCall(method, latestTarget, methodName, () => args)) {
									method.apply(latestTarget, args);
								} else {
									reportRefusedCall(step, values);
								}
							},
							name: methodName,
						});
						return;
					}

					if (step.queueFormat === 'nameAndArguments') {
						queueTarget.push([methodName, callArguments]);
					} else {
						queueTarget.push(
							step.queueFormat === 'nameAndArgs'
								? [methodName, args]
								: [methodName, ...args]
						);
					}
					return step.returnTarget ? targetRecord : undefined;
				};
			}
			break;
		}

		case 'defineQueueClass': {
			const target = writableTarget(win, step.target);
			if (!target) {
				break;
			}

			const queueProperty = step.queueProperty ?? '_q';
			// oxlint-disable-next-line func-name-matching -- Preserve declaration order, interface shape, and public compatibility.
			const QueueClass = function queuedHelperClass(
				this: Record<string, unknown>
			) {
				this[queueProperty] = [];
			};
			const prototype = QueueClass.prototype as Record<string, unknown>;

			for (const methodName of step.methods) {
				prototype[methodName] = function queuedHelperMethod(
					this: Record<string, unknown>,
					...args: unknown[]
				) {
					const queueTarget = this[queueProperty];
					if (Array.isArray(queueTarget)) {
						queueTarget.push({
							args,
							name: methodName,
						});
					}

					return this;
				};
			}

			(target as Record<string, unknown>)[step.name] = QueueClass;
			break;
		}

		case 'defineGlobalMethods': {
			const target = writableTarget(win, step.target);
			if (!target) {
				break;
			}
			if (step.ifGlobalIsQueue && !Array.isArray(target)) {
				break;
			}

			const targetRecord = target as Record<string, unknown>;
			for (const method of step.methods) {
				targetRecord[method.name] =
					method.behavior === 'return'
						? () => cloneStepValue(method.value, values)
						: () => {
								/* empty */
							};
			}
			break;
		}

		case 'setCookie': {
			// oxlint-disable-next-line unicorn/no-document-cookie -- The step sets a vendor's documented cookie.
			document.cookie = step.cookie;
			break;
		}

		case 'defineQueueProxy': {
			if (win[step.name]) {
				break;
			}
			win[step.queue] ||= [];
			// The vendor's script may swap the array for its own `push`.
			const queue = () =>
				win[step.queue] as
					| { push: (...items: unknown[]) => unknown }
					| undefined;
			win[step.name] = new Proxy(
				{},
				{
					get(target: Record<PropertyKey, unknown>, method) {
						// Queuing `then`, `toJSON` or an Object.prototype member when
						// something awaits, serializes or stringifies the object makes
						// the vendor throw during replay, and every later call hangs.
						if (
							typeof method !== 'string' ||
							method === 'then' ||
							method === 'toJSON' ||
							method in target
						) {
							return target[method];
						}

						if (method === 'push') {
							return (...items: unknown[]) => queue()?.push(...items);
						}

						return (...args: unknown[]) => {
							const callback =
								typeof args.at(-1) === 'function'
									? (args.pop() as (result: unknown) => void)
									: undefined;

							return new Promise((resolve) => {
								queue()?.push([
									method,
									...args,
									(result: unknown) => {
										// oxlint-disable-next-line promise/prefer-await-to-callbacks, node/callback-return -- The queued call takes an optional trailing callback.
										callback?.(result);
										resolve(result);
									},
								]);
							});
						};
					},
				}
			);
			break;
		}

		case 'constructGlobal': {
			const Constructor = win[step.constructor];
			if (typeof Constructor !== 'function' || isNativeFunction(Constructor)) {
				break;
			}

			const args = (step.args ?? []).map((arg) => cloneStepValue(arg, values));
			if (step.copyAssignedValueToArgProperty) {
				// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
				const firstArg = args[0];
				const targetOptions = isRecord(firstArg) ? firstArg : {};
				targetOptions[step.copyAssignedValueToArgProperty] = win[step.assignTo];
				if (!isRecord(firstArg)) {
					args.unshift(targetOptions);
				}
			}

			win[step.assignTo] = new (Constructor as new (
				...args: unknown[]
			) => unknown)(...args);
			break;
		}

		case 'loadScriptStep': {
			if (
				!values.state ||
				// Only a script counts: a page element under the same id would
				// otherwise stop the vendor's file from loading.
				document.getElementById(step.id) instanceof HTMLScriptElement ||
				(step.unlessGlobal &&
					readPath(win, step.unlessGlobal)?.value !== undefined)
			) {
				break;
			}
			const tag = document.createElement('script');
			tag.id = step.id;
			tag.src = step.src;
			if (step.async !== undefined) {
				tag.async = step.async;
			}
			const nonce = elementNonce(values.info?.element ?? values.state.element);
			if (nonce) {
				tag.nonce = nonce;
			}
			for (const [name, value] of Object.entries(step.attributes ?? {})) {
				tag.setAttribute(name, value);
			}
			// The element, not the id: a later registration may insert its own
			// tag under the same id before this one is disposed.
			values.state.tags.set(step.id, tag);
			document.head.append(tag);
			break;
		}

		case 'removeScript': {
			values.state?.tags.get(step.id)?.remove();
			values.state?.tags.delete(step.id);
			break;
		}

		case 'loadScript': {
			break;
		}
	}
};

const executePhaseSteps = function executePhaseSteps(
	steps: ManifestStep[],
	context: StepExecutionContext
): void {
	if (steps.length === 0) {
		return;
	}

	emitScriptDebugEvent({
		action: 'phase_start',
		callback: context.callback,
		data: {
			stepCount: steps.length,
		},
		elementId: context.elementId,
		hasConsent: context.hasConsent,
		message: `Manifest phase ${context.phase} started`,
		phase: context.phase,
		scope: 'phase',
		scriptId: context.scriptId,
		source: 'manifest-runtime',
	});

	for (const [stepIndex, step] of steps.entries()) {
		try {
			executeStep(step, context.values ?? {});
			emitScriptDebugEvent({
				action: 'step_executed',
				callback: context.callback,
				elementId: context.elementId,
				hasConsent: context.hasConsent,
				message: `Executed ${step.type}`,
				phase: context.phase,
				scope: 'step',
				scriptId: context.scriptId,
				source: 'manifest-runtime',
				stepIndex,
				stepType: step.type,
			});
		} catch (error) {
			emitScriptDebugEvent({
				action: 'step_error',
				callback: context.callback,
				data: {
					error:
						// oxlint-disable-next-line no-nested-ternary -- Preserve established branch order and control flow.
						error instanceof Error
							? error.message
							: typeof error === 'string'
								? error
								: 'Unknown error',
				},
				elementId: context.elementId,
				hasConsent: context.hasConsent,
				message: `Failed to execute ${step.type}`,
				phase: context.phase,
				scope: 'step',
				scriptId: context.scriptId,
				source: 'manifest-runtime',
				stepIndex,
				stepType: step.type,
			});
			throw error;
		}
	}

	emitScriptDebugEvent({
		action: 'phase_complete',
		callback: context.callback,
		data: {
			stepCount: steps.length,
		},
		elementId: context.elementId,
		hasConsent: context.hasConsent,
		message: `Manifest phase ${context.phase} completed`,
		phase: context.phase,
		scope: 'phase',
		scriptId: context.scriptId,
		source: 'manifest-runtime',
	});
};

const partitionConsentIds = function partitionConsentIds(
	mapping: Record<string, string[]>,
	consents: ConsentState
): { allowedConsentIds: string[]; deniedConsentIds: string[] } {
	const allowedConsentIds: string[] = [];
	const deniedConsentIds: string[] = [];

	for (const [category, consentIds] of Object.entries(mapping)) {
		const isGranted = (consents as Record<string, boolean>)[category];
		for (const consentId of consentIds) {
			(isGranted ? allowedConsentIds : deniedConsentIds).push(consentId);
		}
	}

	return { allowedConsentIds, deniedConsentIds };
};

const getConsentSignalSteps = function getConsentSignalSteps(
	resolvedManifest: ResolvedManifest,
	mode: 'default' | 'update',
	info: Pick<ScriptCallbackInfo, 'consents' | 'vendor'>
): ManifestStep[] {
	if (!resolvedManifest.consentMapping || !resolvedManifest.consentSignal) {
		return [];
	}
	const consents = signalConsents(info);
	const mapState = (mapping: Record<string, string[]>) => ({
		...mapConsentState(mapping, consents),
		...(mode === 'default' && info.vendor?.granted !== false
			? resolvedManifest.consentSignalDefaults
			: undefined),
	});

	// oxlint-disable-next-line default-case -- Preserve established branch order and control flow.
	switch (resolvedManifest.consentSignal) {
		case 'gtag': {
			return [
				{
					args: ['consent', mode, mapState(resolvedManifest.consentMapping)],
					global: resolvedManifest.consentSignalTarget ?? 'gtag',
					type: 'callGlobal',
				},
			];
		}

		case 'clarity': {
			return [
				{
					args: ['consentv2', mapState(resolvedManifest.consentMapping)],
					global: resolvedManifest.consentSignalTarget ?? 'clarity',
					type: 'callGlobal',
				},
			];
		}

		case 'rudderstack': {
			// RudderStack's consent() call carries the full allow/deny partition
			// each time, so the default and update modes share one shape. The
			// pre-load call is captured by the snippet queue and replayed by the
			// SDK as its initial consent state. Inth is the CMP, so the provider
			// is always 'custom'.
			const partition = partitionConsentIds(
				resolvedManifest.consentMapping,
				consents
			);

			return [
				{
					args: [
						{
							consentManagement: {
								allowedConsentIds: partition.allowedConsentIds,
								deniedConsentIds: partition.deniedConsentIds,
								enabled: true,
								provider: 'custom',
							},
						},
					],
					global: resolvedManifest.consentSignalTarget ?? 'rudderanalytics',
					method: 'consent',
					type: 'callGlobal',
				},
			];
		}
	}
};

/** The steps `onBeforeLoad` runs before the script loads, in order. */
const preLoadSteps = (
	resolvedManifest: ResolvedManifest,
	info: Pick<ScriptCallbackInfo, 'consents' | 'hasConsent' | 'vendor'>
): ManifestStep[] => [
	...resolvedManifest.bootstrapSteps,
	...getConsentSignalSteps(resolvedManifest, 'default', info),
	...resolvedManifest.setupSteps,
	...(info.hasConsent
		? resolvedManifest.onBeforeLoadGrantedSteps
		: resolvedManifest.onBeforeLoadDeniedSteps),
];

/**
 * What the manifest's `onBeforeLoad` runs, as inline code for a server
 * render that starts the vendor from the HTML, less the steps that wait
 * for hydration. A helper that wraps `onBeforeLoad` runs code the steps
 * don't have, so a script whose `onBeforeLoad` isn't
 * `manifestOnBeforeLoad` gets none. `undefined` for a manifest that loads
 * no script.
 */
const manifestServerStart = function manifestServerStart(
	resolvedManifest: ResolvedManifest,
	manifestOnBeforeLoad: Script['onBeforeLoad'],
	inlineStepsStart: InlineStepsStart | undefined
): Script['serverStart'] {
	if (!(resolvedManifest.loadScript && inlineStepsStart)) {
		return;
	}
	return (info, started) => {
		if (started.onBeforeLoad !== manifestOnBeforeLoad) {
			return;
		}
		const steps = preLoadSteps(resolvedManifest, info);
		// The browser skips a step whose root `globals` does not declare;
		// the inline runner does not know `globals`, so the browser starts
		// such a manifest.
		if (steps.some((step) => undeclaredRoot(step, resolvedManifest.globals))) {
			return;
		}
		return inlineStepsStart(steps.filter((step) => !isHydrationOnly(step)));
	};
};

/**
 * The script's `attributes` and `category` as copies, so a script changed by
 * its caller never changes another built from the same cached manifest.
 */
const ownCopies = (
	resolvedManifest: ResolvedManifest
): Pick<Script, 'attributes' | 'category'> => {
	const { category, loadScript } = resolvedManifest;
	return {
		attributes: loadScript?.attributes
			? { ...loadScript.attributes }
			: undefined,
		category: (typeof category === 'object'
			? structuredClone(category)
			: category) as Script['category'],
	};
};

const STEP_LIST_NAMES = [
	'bootstrapSteps',
	'setupSteps',
	'afterLoadSteps',
	'onBeforeLoadGrantedSteps',
	'onBeforeLoadDeniedSteps',
	'onLoadGrantedSteps',
	'onLoadDeniedSteps',
	'onConsentChangeSteps',
	'onConsentGrantedSteps',
	'onConsentDeniedSteps',
] as const;

/**
 * Whether the script needs an `onDispose`: for its own steps, to remove the
 * tags it inserts, or to close its consent gate. Others get none, so a
 * helper built again on a rerender keeps its registration.
 */
const needsDispose = (resolvedManifest: ResolvedManifest): boolean =>
	(resolvedManifest.onDisposeSteps?.length ?? 0) > 0 ||
	STEP_LIST_NAMES.some((list) =>
		resolvedManifest[list].some(
			(step) =>
				step.type === 'loadScriptStep' || usesRuntimeValue(step, 'consentGate')
		)
	);

const createScriptState = (): ScriptState => {
	const state: ScriptState = {
		disposed: false,
		gate: (value) => {
			if (state.disposed || !state.latest) {
				return null;
			}
			let current: ScriptCallbackInfo;
			try {
				current = state.latest.getCurrentConsent?.() ?? state.latest;
			} catch {
				return null;
			}
			return permitted(current) ? value : null;
		},
		tags: new Map(),
	};
	return state;
};

// oxlint-disable-next-line complexity -- One branch per lifecycle callback.
const manifestToScript = function manifestToScript(
	resolvedManifest: ResolvedManifest,
	inlineStepsStart: InlineStepsStart | undefined
): Script {
	const hasConsentMapping = !!(
		resolvedManifest.consentMapping && resolvedManifest.consentSignal
	);
	const hasLoadConsentBranches = !!(
		resolvedManifest.onLoadGrantedSteps.length > 0 ||
		resolvedManifest.onLoadDeniedSteps.length > 0
	);
	const hasConsentLifecycle = !!(
		resolvedManifest.onConsentChangeSteps.length > 0 ||
		resolvedManifest.onConsentGrantedSteps.length > 0 ||
		resolvedManifest.onConsentDeniedSteps.length > 0 ||
		hasConsentMapping
	);

	// The vendor consent last seen by this script, so onConsentGranted and
	// onConsentDenied run on transitions only. Recorded in onBeforeLoad,
	// which is installed whenever the manifest has consent lifecycle steps.
	let lastHasConsent: boolean | undefined;
	// The loader can mount this script object again after disposing it, as
	// when a remote registration comes back once a code script leaves. Each
	// registration gets its own state, so a disposed one's gate stays closed
	// and the new one's opens.
	let state = createScriptState();

	/**
	 * The context a callback runs its phases in, after recording its info.
	 * `current` is the state of the registration the callback belongs to;
	 * without it, a callback after disposal starts a new registration.
	 */
	const contextFor = (
		callback: ManifestLifecycleCallback,
		info: ScriptCallbackInfo,
		current?: ScriptState
	) => {
		if (!current && state.disposed) {
			state = createScriptState();
		}
		const own = current ?? state;
		if (!own.disposed) {
			own.latest = info;
		}
		own.element = info.element ?? own.element;
		return {
			callback,
			elementId: info.elementId,
			hasConsent: info.hasConsent,
			scriptId: resolvedManifest.vendor,
			values: { globals: resolvedManifest.globals, info, state: own },
		};
	};

	const script: Script = {
		alwaysLoad: resolvedManifest.alwaysLoad,
		async: resolvedManifest.loadScript?.async,
		...ownCopies(resolvedManifest),
		callbackOnly: resolvedManifest.loadScript ? undefined : true,
		defer: resolvedManifest.loadScript?.defer,
		fetchPriority: resolvedManifest.loadScript?.fetchPriority,
		id: resolvedManifest.vendor,
		integration: resolvedManifest.vendor,
		observeConsentBeforeLoad: resolvedManifest.observeConsentBeforeLoad,
		persistAfterConsentRevoked: resolvedManifest.persistAfterConsentRevoked,
		persistAfterDispose: resolvedManifest.persistAfterDispose,
		resourceKey: resolvedManifest.resourceKey,
		src: resolvedManifest.loadScript?.src,
		target: resolvedManifest.target,
		// The manifest's vendor slug doubles as the vendor-level consent id, so
		// a subject can turn this vendor off inside a granted category.
		vendor: resolvedManifest.vendor,
		vendorDetails: resolvedManifest.vendorDetails,
	};

	if (
		resolvedManifest.bootstrapSteps.length > 0 ||
		resolvedManifest.setupSteps.length > 0 ||
		resolvedManifest.onBeforeLoadGrantedSteps.length > 0 ||
		resolvedManifest.onBeforeLoadDeniedSteps.length > 0 ||
		hasConsentLifecycle
	) {
		script.onBeforeLoad = (info: ScriptCallbackInfo) => {
			lastHasConsent = info.hasConsent;
			const baseContext = contextFor('onBeforeLoad', info);
			// The HTML already ran the other steps through `serverStart`.
			if (info.startedOnServer) {
				executePhaseSteps(
					preLoadSteps(resolvedManifest, info).filter(isHydrationOnly),
					{ ...baseContext, phase: 'hydration' }
				);
				return;
			}

			executePhaseSteps(resolvedManifest.bootstrapSteps, {
				...baseContext,
				phase: 'bootstrap',
			});
			executePhaseSteps(
				getConsentSignalSteps(resolvedManifest, 'default', info),
				{
					...baseContext,
					phase: 'consent-default',
				}
			);
			executePhaseSteps(resolvedManifest.setupSteps, {
				...baseContext,
				phase: 'setup',
			});
			executePhaseSteps(
				info.hasConsent
					? resolvedManifest.onBeforeLoadGrantedSteps
					: resolvedManifest.onBeforeLoadDeniedSteps,
				{
					...baseContext,
					phase: info.hasConsent ? 'onBeforeLoadGranted' : 'onBeforeLoadDenied',
				}
			);
		};
	}

	script.serverStart = manifestServerStart(
		resolvedManifest,
		script.onBeforeLoad,
		inlineStepsStart
	);

	if (resolvedManifest.afterLoadSteps.length > 0 || hasLoadConsentBranches) {
		script.onLoad = (info: ScriptCallbackInfo) => {
			const baseContext = contextFor('onLoad', info);
			executePhaseSteps(resolvedManifest.afterLoadSteps, {
				...baseContext,
				phase: 'afterLoad',
			});

			if (info.hasConsent && resolvedManifest.onLoadGrantedSteps.length > 0) {
				lastHasConsent = true;
				executePhaseSteps(resolvedManifest.onLoadGrantedSteps, {
					...baseContext,
					phase: 'onLoadGranted',
				});
			} else if (
				!info.hasConsent &&
				resolvedManifest.onLoadDeniedSteps.length > 0
			) {
				lastHasConsent = false;
				executePhaseSteps(resolvedManifest.onLoadDeniedSteps, {
					...baseContext,
					phase: 'onLoadDenied',
				});
			}
		};
	}

	if (hasConsentLifecycle) {
		script.onConsentChange = (info: ScriptCallbackInfo) => {
			const consentChanged = lastHasConsent !== info.hasConsent;
			lastHasConsent = info.hasConsent;
			const baseContext = contextFor('onConsentChange', info);
			executePhaseSteps(
				getConsentSignalSteps(resolvedManifest, 'update', info),
				{
					...baseContext,
					phase: 'consent-update',
				}
			);

			if (resolvedManifest.onConsentChangeSteps.length > 0) {
				executePhaseSteps(resolvedManifest.onConsentChangeSteps, {
					...baseContext,
					phase: 'onConsentChange',
				});
			}

			if (!consentChanged) {
				return;
			}

			if (
				info.hasConsent &&
				resolvedManifest.onConsentGrantedSteps.length > 0
			) {
				executePhaseSteps(resolvedManifest.onConsentGrantedSteps, {
					...baseContext,
					phase: 'onConsentGranted',
				});
			} else if (
				!info.hasConsent &&
				resolvedManifest.onConsentDeniedSteps.length > 0
			) {
				executePhaseSteps(resolvedManifest.onConsentDeniedSteps, {
					...baseContext,
					phase: 'onConsentDenied',
				});
			}
		};
	}

	if (needsDispose(resolvedManifest)) {
		script.onDispose = (info: ScriptCallbackInfo) => {
			// Deferred steps below still belong to this registration, even
			// when the same script has mounted again by the time they run.
			const disposed = state;
			disposed.disposed = true;
			// Before any deferred step: an incoming registration may insert a
			// tag under the same id as soon as this one is gone.
			for (const tag of disposed.tags.values()) {
				tag.remove();
			}
			disposed.tags.clear();
			const steps = resolvedManifest.onDisposeSteps ?? [];
			if (steps.length === 0) {
				return;
			}
			const run = (current: ScriptCallbackInfo) =>
				executePhaseSteps(steps, {
					...contextFor('onDispose', current, disposed),
					phase: 'onDispose',
				});
			// A replacement can be a withdrawal the incoming registration saves
			// as it starts, so wait for it and run with consent as it is then.
			if (info.afterReplacement) {
				info.afterReplacement(run);
			} else {
				run(info);
			}
		};
	}

	return script;
};

/**
 * Builds `resolvedManifestToScript`. With `inlineStepsStart`, each script
 * gets a `serverStart` that inlines its pre-load steps in a server render;
 * without it, scripts start in the browser only, which keeps the inline
 * runner out of browser bundles.
 */
export const createManifestScriptFactory = function createManifestScriptFactory(
	inlineStepsStart?: InlineStepsStart
): (resolvedManifest: ResolvedManifest) => Script {
	return (resolvedManifest) =>
		manifestToScript(resolvedManifest, inlineStepsStart);
};

/**
 * Turns a resolved manifest into a `Script` that starts in the browser.
 */
export const resolvedManifestToScript = createManifestScriptFactory();
