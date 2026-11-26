/**
 * The window roots a manifest touches, and which roots it may declare.
 *
 * A manifest lists in `globals` every window property its steps read,
 * write or call through. The parser refuses a step whose root is not
 * listed, and a list that names a platform or built-in global. The block
 * lists in `call-path.ts` stay as a second layer.
 */
import { PLATFORM_GLOBALS } from './platform-globals';
import type { ManifestStep, ResolvedManifest } from './types';

/**
 * A window property name a manifest may declare: an identifier, or one
 * with dots or hyphens after its first character, since GTM's `dataLayer`
 * option names an exact property such as `app.layer`. No platform global
 * has a dot or hyphen, and the first character keeps out array indexes,
 * which reach a frame's window.
 */
const ROOT_NAME = /^[A-Za-z_$][\w$.-]*$/u;

let platformNames: ReadonlySet<string> | undefined;

const nativeSource = Function.prototype.toString;

/**
 * Whether `value` is a function the browser or the JavaScript engine
 * provides, not one a page or vendor wrote. A bound function reads as
 * native too, since it may wrap one.
 *
 * @internal
 */
export const isNativeFunction = (value: unknown): boolean => {
	if (typeof value !== 'function') {
		return false;
	}
	try {
		return nativeSource.call(value).includes('[native code]');
	} catch {
		// A revoked proxy throws; treat what cannot be read as native.
		return true;
	}
};

/**
 * Whether `window` has `name` as one of its own interface objects or
 * platform properties: a native getter, or a native function a page did
 * not assign (assignment makes an enumerable property). Covers the
 * interface objects the static list leaves out, and names other browsers
 * add.
 */
const isWindowPlatformName = (name: string): boolean => {
	if (typeof window === 'undefined') {
		return false;
	}
	for (
		let holder: object | null = window;
		holder;
		holder = Object.getPrototypeOf(holder)
	) {
		const descriptor = Object.getOwnPropertyDescriptor(holder, name);
		if (descriptor) {
			return descriptor.get
				? isNativeFunction(descriptor.get)
				: !descriptor.enumerable && isNativeFunction(descriptor.value);
		}
	}
	return false;
};

/**
 * Whether a manifest may declare `name` as a root: a property name that
 * is not a platform or built-in global, an event handler property or a
 * prototype name.
 *
 * Vendor data layers such as `dataLayer`, `_hsq` or `_paq` are declarable:
 * the page and the vendor's file create them, not the browser, and GTM and
 * gtag read `dataLayer`. Calling the `push` of such an array is the one
 * native call a manifest makes (see `runtime.ts`).
 *
 * @internal
 */
export const isDeclarableGlobal = (name: unknown): boolean => {
	if (typeof name !== 'string' || !ROOT_NAME.test(name)) {
		return false;
	}
	platformNames ??= new Set([
		...PLATFORM_GLOBALS.split(' '),
		'__proto__',
		'prototype',
	]);
	return (
		!platformNames.has(name) &&
		!/^on[a-z]+$/u.test(name) &&
		!isWindowPlatformName(name)
	);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const first = (value: unknown): unknown =>
	Array.isArray(value) ? value[0] : undefined;

/** A queue field: a global's name, or `{ global }` or `{ property }`. */
const queueRoot = (queue: unknown): unknown[] => {
	if (isRecord(queue)) {
		return queue.global === undefined ? [] : [queue.global];
	}
	return queue === undefined ? [] : [queue];
};

/**
 * Every window root `step` reads, writes or calls through, from a step
 * that may not have passed the parser. A name the step puts on another
 * object (a method, a property, a queue property) is not a root.
 *
 * @internal
 */
// oxlint-disable-next-line complexity -- One case per step type.
export const stepRoots = function stepRoots(
	step: Readonly<Record<string, unknown>>
): unknown[] {
	switch (step.type) {
		case 'setGlobal':
		case 'defineQueueFunction':
		case 'defineQueueProxy': {
			return [step.name, ...queueRoot(step.queue)];
		}
		case 'defineStubFunction': {
			return [
				step.name,
				...queueRoot(step.queue),
				...(Array.isArray(step.aliases) ? step.aliases : []),
			];
		}
		case 'callGlobal': {
			return [step.path === undefined ? step.global : first(step.path)];
		}
		case 'pushToQueue': {
			return [step.queue];
		}
		case 'setGlobalPath': {
			return [first(step.path)];
		}
		case 'defineQueueMethods': {
			return [step.target, ...queueRoot(step.queue)];
		}
		case 'defineQueueClass':
		case 'defineGlobalMethods': {
			return [step.target];
		}
		case 'constructGlobal': {
			return [step.constructor, step.assignTo];
		}
		case 'loadScriptStep': {
			return step.unlessGlobal === undefined ? [] : [first(step.unlessGlobal)];
		}
		default: {
			return [];
		}
	}
};

/** The global the consent signal calls, when the manifest sends one. */
const SIGNAL_TARGETS: Readonly<Record<string, string>> = {
	clarity: 'clarity',
	gtag: 'gtag',
	rudderstack: 'rudderanalytics',
};

/** The step lists a manifest runs. */
export const MANIFEST_STEP_LISTS = [
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
	'onDisposeSteps',
] as const satisfies readonly (keyof ResolvedManifest)[];

/**
 * Every root `manifest` touches, in its steps and in the consent signal it
 * sends, without duplicates. `compileManifest` stores this as `globals`.
 *
 * @internal
 */
export const manifestRoots = function manifestRoots(
	manifest: Readonly<Partial<ResolvedManifest>>
): unknown[] {
	const roots = new Set<unknown>();
	for (const list of MANIFEST_STEP_LISTS) {
		for (const step of manifest[list] ?? []) {
			for (const root of stepRoots(
				step as unknown as Readonly<Record<string, unknown>>
			)) {
				roots.add(root);
			}
		}
	}
	if (
		manifest.consentMapping &&
		manifest.consentSignal &&
		Object.hasOwn(SIGNAL_TARGETS, manifest.consentSignal)
	) {
		roots.add(
			manifest.consentSignalTarget ?? SIGNAL_TARGETS[manifest.consentSignal]
		);
	}
	return [...roots];
};

/**
 * The first root of `step` that `globals` does not declare, or that no
 * manifest may declare, or `undefined`.
 *
 * @internal
 */
export const undeclaredRoot = function undeclaredRoot(
	step: ManifestStep,
	globals: readonly unknown[] | undefined
): { root: unknown } | undefined {
	for (const root of stepRoots(
		step as unknown as Readonly<Record<string, unknown>>
	)) {
		if (!(globals?.includes(root) && isDeclarableGlobal(root))) {
			return { root };
		}
	}
	return undefined;
};
