/**
 * The level 3 part of the manifest runtime: `if` steps and their
 * conditions, `setFlag`, `listen` and `callGlobal.then`, and the parser's
 * checks for them. The runtime runs them once `installLevelThree` has this
 * part (see `part.ts`).
 *
 * `listen` and `then` belong to a load: the run of the script that starts
 * with an `onBeforeLoad`. A load ends when its element fails, the script
 * is disposed, or the next `onBeforeLoad` starts another one, as a revoke
 * and grant without disposal does. A listener of an ended load is removed,
 * and a promise of one runs nothing when it settles, so a late answer
 * cannot act on a newer load.
 */
import { has } from '../libs/has';
import { emitScriptDebugEvent } from '../libs/script-loader/debug';
import type {
	ScriptCallbackInfo,
	ScriptLifecycleCallback,
} from '../libs/script-loader/types';
import {
	isCategoryCondition,
	isCategoryName,
} from '../modules/script-loader/category-condition';
import type { ConsentState } from '../types';
import { manifestFeatureLevel, STEP_FIELD_LEVELS } from './features';
import type {
	LevelThreePart,
	RuntimeAccess,
	ScriptState,
	StepCheck,
	StepValues,
} from './part';
import type { ManifestCondition, ManifestStep } from './types';
import { ALL_DENIED, signalConsents } from './vendor-consent';

/** One run of the script, from an `onBeforeLoad` until the next. */
interface Load {
	live: boolean;
	/** Removes what the load's `listen` steps added. */
	cleanups: (() => void)[];
	element?: HTMLScriptElement;
	/** `onLoad` ran for this load, and its element has not failed since. */
	loaded: boolean;
}

/** What level 3 keeps for one script. */
interface LevelThreeState {
	flags: Map<string, boolean>;
	load?: Load;
	/** The callback running, or the last one that ran. */
	callback: ScriptLifecycleCallback;
	/** While a callback runs: the consent its previous callback had. */
	previous?: ConsentState;
	running: boolean;
}

const scripts = new WeakMap<ScriptState, LevelThreeState>();

const stateOf = (state: ScriptState): LevelThreeState => {
	let own = scripts.get(state);
	if (!own) {
		own = { callback: 'onBeforeLoad', flags: new Map(), running: false };
		scripts.set(state, own);
	}
	return own;
};

const endLoad = (load: Load | undefined): void => {
	if (!load) {
		return;
	}
	load.live = false;
	for (const cleanup of load.cleanups.splice(0)) {
		cleanup();
	}
};

const consentsOf = (info: ScriptCallbackInfo | undefined): ConsentState =>
	info ? signalConsents(info) : ALL_DENIED;

/** The value at `path` under window, or `undefined` when a step on the way is missing. */
const readGlobal = (path: readonly string[]): unknown => {
	let value: unknown = window;
	for (const segment of path) {
		if (
			value === null ||
			(typeof value !== 'object' && typeof value !== 'function')
		) {
			return undefined;
		}
		value = (value as Record<string, unknown>)[segment];
	}
	return value;
};

// oxlint-disable-next-line complexity -- One branch per condition.
const holds = (condition: ManifestCondition, values: StepValues): boolean => {
	const own = values.state && stateOf(values.state);
	if ('not' in condition) {
		return !holds(condition.not, values);
	}
	if ('all' in condition) {
		return condition.all.every((entry) => holds(entry, values));
	}
	if ('consent' in condition) {
		return has(condition.consent, consentsOf(values.info));
	}
	if ('lost' in condition) {
		const now = consentsOf(values.info);
		// Between callbacks, the last callback is the previous run.
		const before = own?.running
			? own.previous
			: values.state?.latest && consentsOf(values.state.latest);
		return condition.lost.some(
			(category) => before?.[category] === true && now[category] !== true
		);
	}
	if ('flag' in condition) {
		return own?.flags.get(condition.flag) === true;
	}
	if ('loaded' in condition) {
		const load = own?.load;
		return !!load?.loaded && (!load.element || load.element.isConnected);
	}
	if ('documentReady' in condition) {
		return document.readyState !== 'loading';
	}
	const value = readGlobal(condition.global);
	if (condition.is === 'function') {
		return typeof value === 'function';
	}
	return condition.is === 'array' ? Array.isArray(value) : value !== undefined;
};

/**
 * Runs `steps` for `load` after the callback that started them returned,
 * with consent as it is now, unless the load has ended.
 */
const runLater = (
	state: ScriptState,
	load: Load,
	steps: ManifestStep[],
	phase: string,
	callback: ScriptLifecycleCallback,
	runtime: RuntimeAccess
): void => {
	if (!load.live || state.disposed) {
		return;
	}
	let info: ScriptCallbackInfo | undefined;
	try {
		info = state.latest?.getCurrentConsent?.() ?? state.latest;
	} catch {
		return;
	}
	if (!info) {
		return;
	}
	try {
		runtime.phase(steps, {
			callback,
			elementId: info.elementId,
			hasConsent: info.hasConsent,
			phase,
			scriptId: info.id,
			values: { info, state },
		});
	} catch {
		// `phase` reported the failed step; nothing called this to tell.
	}
};

const run: LevelThreePart['run'] = (step, values, runtime) => {
	const { state } = values;
	switch (step.type) {
		case 'if': {
			for (const inner of holds(step.when, values)
				? step.then
				: (step.else ?? [])) {
				runtime.step(inner, values);
			}
			break;
		}
		case 'setFlag': {
			if (state) {
				stateOf(state).flags.set(step.name, step.value);
			}
			break;
		}
		case 'listen': {
			const own = state && stateOf(state);
			const load = own?.load;
			if (!(state && own && load?.live) || state.disposed) {
				break;
			}
			const target = step.target === 'document' ? document : window;
			const { callback } = own;
			const listener = () =>
				runLater(state, load, step.steps, 'listen', callback, runtime);
			target.addEventListener(step.event, listener, { once: !!step.once });
			load.cleanups.push(() =>
				target.removeEventListener(step.event, listener)
			);
			break;
		}
		default: {
			break;
		}
	}
};

const settle: LevelThreePart['settle'] = (result, steps, values, runtime) => {
	const { info, state } = values;
	const own = state && stateOf(state);
	const load = own?.load;
	if (!(state && own && load?.live)) {
		return;
	}
	const { callback } = own;
	const wait = async () => {
		try {
			await result;
		} catch (error) {
			emitScriptDebugEvent({
				action: 'step_error',
				callback,
				data: {
					error: error instanceof Error ? error.message : String(error),
				},
				elementId: info?.elementId,
				message: 'The promise a callGlobal step waited for rejected',
				phase: 'then',
				scope: 'step',
				scriptId: info?.id ?? '',
				source: 'manifest-runtime',
				stepType: 'callGlobal',
			});
			return;
		}
		runLater(state, load, steps, 'then', callback, runtime);
	};
	void wait();
};

const LIFECYCLE: readonly ScriptLifecycleCallback[] = [
	'onBeforeLoad',
	'onLoad',
	'onError',
	'onConsentChange',
	'onDispose',
];

/** Whether `steps`, or steps nested in them, keep anything disposal has to clear. */
const keepsState = (steps: unknown): boolean =>
	Array.isArray(steps) &&
	steps.some(
		(step: Record<string, unknown>) =>
			step.type === 'setFlag' ||
			step.type === 'listen' ||
			(step.type === 'callGlobal' && step.then !== undefined) ||
			keepsState(step.then) ||
			keepsState(step.else) ||
			keepsState(step.steps)
	);

const script: LevelThreePart['script'] = (built, liveState, manifest) => {
	if (manifestFeatureLevel(manifest) < 3) {
		return;
	}
	const keeps = Object.values(manifest).some(keepsState);
	for (const name of LIFECYCLE) {
		const original = built[name];
		if (!original && name === 'onDispose' && !keeps) {
			continue;
		}
		if (!original && name === 'onConsentChange') {
			continue;
		}
		built[name] = (info: ScriptCallbackInfo) => {
			const state = liveState();
			const own = stateOf(state);
			if (name === 'onBeforeLoad') {
				endLoad(own.load);
				own.load = {
					cleanups: [],
					element: info.element,
					live: true,
					loaded: false,
				};
			} else if (name === 'onLoad' && own.load) {
				own.load.loaded = true;
			} else if (name === 'onError' && own.load) {
				own.load.loaded = false;
				endLoad(own.load);
			} else if (name === 'onDispose') {
				endLoad(own.load);
			}
			const outer = { previous: own.previous, running: own.running };
			own.callback = name;
			own.previous = state.latest && consentsOf(state.latest);
			own.running = true;
			try {
				if (name !== 'onDispose') {
					original?.(info);
					return;
				}
				// Steps the replacement defers still read the flags; clear them
				// once those ran, or now when nothing was deferred.
				let deferred = false;
				const { afterReplacement } = info;
				original?.(
					afterReplacement
						? Object.create(info, {
								afterReplacement: {
									value: (steps: (current: ScriptCallbackInfo) => void) => {
										deferred = true;
										afterReplacement((current) => {
											try {
												steps(current);
											} finally {
												own.flags.clear();
											}
										});
									},
								},
							})
						: info
				);
				if (!deferred) {
					own.flags.clear();
				}
			} finally {
				own.previous = outer.previous;
				own.running = outer.running;
			}
		};
	}
};

/** The deepest a step list may sit inside other steps. */
const MAX_NESTING = 4;

/** A JavaScript name: a path segment under window, or a flag. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

const EVENT_NAME = /^[a-z][\w:.-]*$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isIdentifier = (value: unknown): boolean =>
	typeof value === 'string' && IDENTIFIER.test(value);

const isList = (value: unknown, check: (entry: unknown) => boolean) =>
	Array.isArray(value) && value.length > 0 && value.every(check);

const GLOBAL_TESTS: ReadonlySet<unknown> = new Set([
	'function',
	'array',
	'defined',
]);

// oxlint-disable-next-line complexity -- One branch per condition.
const isCondition = (value: unknown, depth: number): boolean => {
	if (!isRecord(value) || depth > MAX_NESTING) {
		return false;
	}
	const keys = Object.keys(value);
	if (keys.includes('global')) {
		return (
			keys.length === 2 &&
			isList(value.global, isIdentifier) &&
			GLOBAL_TESTS.has(value.is)
		);
	}
	if (keys.length !== 1) {
		return false;
	}
	switch (keys[0]) {
		case 'consent': {
			return isCategoryCondition(value.consent);
		}
		case 'lost': {
			return isList(
				value.lost,
				(name) => typeof name === 'string' && isCategoryName(name)
			);
		}
		case 'flag': {
			return isIdentifier(value.flag);
		}
		case 'loaded':
		case 'documentReady': {
			return value[keys[0]] === true;
		}
		case 'not': {
			return isCondition(value.not, depth + 1);
		}
		case 'all': {
			return isList(value.all, (entry) => isCondition(entry, depth + 1));
		}
		default: {
			return false;
		}
	}
};

// oxlint-disable-next-line complexity -- One check per level 3 step and field.
const problem: LevelThreePart['problem'] = (step, list, depth, check) => {
	const type = String(step.type);
	const nested = (steps: unknown, optional = false): string | undefined => {
		if (optional && steps === undefined) {
			return undefined;
		}
		if (!Array.isArray(steps)) {
			return `${list} has a ${type} step whose steps are not a list`;
		}
		if (depth >= MAX_NESTING) {
			return `${list} nests steps more than ${MAX_NESTING} deep`;
		}
		for (const inner of steps) {
			const reason = check(inner, list, depth + 1);
			if (reason !== undefined) {
				return reason;
			}
		}
		return undefined;
	};
	// A listener or promise of a disposed script never runs its steps.
	if (
		list === 'onDisposeSteps' &&
		(type === 'listen' || type === 'callGlobal')
	) {
		return `${list} has a ${type} step whose steps would never run`;
	}
	switch (type) {
		case 'if': {
			return isCondition(step.when, 0)
				? (nested(step.then) ?? nested(step.else, true))
				: `${list} has an if step whose condition this SDK does not know`;
		}
		case 'setFlag': {
			return isIdentifier(step.name) && typeof step.value === 'boolean'
				? undefined
				: `${list} has a setFlag step without a flag name and a boolean value`;
		}
		case 'listen': {
			return (step.target === 'window' || step.target === 'document') &&
				typeof step.event === 'string' &&
				EVENT_NAME.test(step.event) &&
				(step.once === undefined || typeof step.once === 'boolean')
				? nested(step.steps)
				: `${list} has a listen step without a window or document target and an event name`;
		}
		default: {
			return nested(step.then);
		}
	}
};

/** The level 3 part, for `installLevelThree`. */
export const levelThreePart: LevelThreePart = {
	problem,
	run,
	script,
	settle,
	steps: STEP_FIELD_LEVELS,
};

export type { StepCheck };
