import type { ManifestStep } from './types';

/**
 * Names that lead back to a window or a document, or navigate. A global a
 * vendor names can itself be a window (an iframe's name puts its window on
 * this one), so a name is refused at any depth, not only as the root.
 */
const WINDOW_NAMES = [
	'window',
	'self',
	'globalThis',
	'frames',
	'parent',
	'top',
	'opener',
	'defaultView',
	'ownerDocument',
	'location',
	'navigation',
	'contentDocument',
	'contentWindow',
];

/**
 * Names that lead from an element to another element or to its attribute
 * nodes, whose `value` a write turns into markup or a URL.
 */
const ELEMENT_NAMES = ['parentElement', 'parentNode', 'attributes'];

/**
 * Names a manifest call may not pass through: those, and each function
 * that runs a string as code, writes markup or an attribute, or opens a
 * window.
 */
const BROWSER_NAMES: ReadonlySet<unknown> = new Set([
	...WINDOW_NAMES,
	...ELEMENT_NAMES,
	'eval',
	'Function',
	'setTimeout',
	'setInterval',
	'open',
	'write',
	'writeln',
	'insertAdjacentHTML',
	'setHTMLUnsafe',
	'setAttribute',
	'setAttributeNS',
]);

/**
 * Names a manifest step may not write, at any depth: those, the document,
 * each property that navigates (`href`, `action`) or puts markup or code in
 * the page (`innerHTML`, `srcdoc`, `src`, a script element's text), and
 * prototype names.
 */
const WRITE_NAMES: ReadonlySet<unknown> = new Set([
	...WINDOW_NAMES,
	...ELEMENT_NAMES,
	'document',
	'innerHTML',
	'outerHTML',
	'srcdoc',
	'href',
	'src',
	'action',
	'formAction',
	'text',
	'textContent',
	'innerText',
	'outerText',
	'__proto__',
	'prototype',
	'constructor',
]);

/** A name that cannot become a property key, which no check passes. */
const UNKNOWN_KEY = Symbol('unknown key');

/**
 * The property key `value` reads as. A list of one name reaches the same
 * property as the name, so a check of the raw value would miss it.
 */
const keyOf = (value: unknown): unknown => {
	try {
		return typeof value === 'symbol' ? value : String(value);
	} catch {
		return UNKNOWN_KEY;
	}
};

/**
 * Whether calling or constructing `path` under window could run a string as
 * code, write markup to the document or navigate. Under `document` only a
 * method of the document itself may be called: its elements hold
 * `insertAdjacentHTML`, `outerHTML` and similar.
 *
 * @param path - The global, then each property down to the function.
 * @internal
 */
export const callReachesCode = function callReachesCode(
	path: readonly unknown[]
): boolean {
	const keys = path.map(keyOf);
	return (
		keys.some((name) => name === UNKNOWN_KEY || BROWSER_NAMES.has(name)) ||
		(keys[0] === 'document' && keys.length > 2)
	);
};

/**
 * Whether writing the names in `names` could navigate, put markup or code
 * in the page, replace a window or a document, or reach a prototype. An
 * event handler property is `on` and a lowercase event name; `once` is an
 * emitter method several vendors queue, and no event is named `ce`.
 *
 * @param names - Every name a step writes or passes through to write.
 * @internal
 */
export const writeReachesCode = function writeReachesCode(
	names: readonly unknown[]
): boolean {
	return names
		.map(keyOf)
		.some(
			(key) =>
				key === UNKNOWN_KEY ||
				WRITE_NAMES.has(key) ||
				(typeof key === 'string' && /^on[a-z]+$/u.test(key) && key !== 'once')
		);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Fields that hold data a step passes on, not names it reads or writes. */
const DATA_KEYS: ReadonlySet<string> = new Set([
	'value',
	'args',
	'properties',
	'attributes',
	'cookie',
	'src',
]);

/** Names that would reach an object's prototype instead of a property. */
const PROTOTYPE_NAMES: ReadonlySet<string> = new Set([
	'__proto__',
	'prototype',
	'constructor',
]);

const MAX_DEPTH = 32;

/**
 * The first prototype name among the names a step reads or writes, at any
 * depth, or `undefined`. A call's path and a read path count as well as a
 * written name, since `x.constructor.constructor` is `Function`.
 *
 * @internal
 */
export const prototypeName = function prototypeName(
	value: unknown,
	depth = 0
): string | undefined {
	if (typeof value === 'string') {
		return PROTOTYPE_NAMES.has(value) ? value : undefined;
	}
	if (depth > MAX_DEPTH || !(Array.isArray(value) || isRecord(value))) {
		return undefined;
	}
	const entries = Array.isArray(value)
		? value
		: Object.entries(value)
				.filter(([key]) => !DATA_KEYS.has(key))
				.map(([, entry]) => entry);
	for (const entry of entries) {
		const name = prototypeName(entry, depth + 1);
		if (name !== undefined) {
			return name;
		}
	}
	return undefined;
};

/**
 * The global a step calls or constructs, as a path under window. A stub
 * with a `dispatchProperty` calls that property of its global.
 *
 * @internal
 */
export const calledPath = function calledPath(
	step: Readonly<Record<string, unknown>>
): readonly unknown[] {
	if (step.type === 'constructGlobal') {
		return [step.constructor];
	}
	if (step.type === 'defineStubFunction') {
		return step.dispatchProperty === undefined
			? []
			: [step.name, step.dispatchProperty];
	}
	if (step.type !== 'callGlobal') {
		return [];
	}
	if (Array.isArray(step.path)) {
		return step.path;
	}
	return step.method === undefined ? [step.global] : [step.global, step.method];
};

/**
 * Fields that name a global or path a step sets, a global it defines or
 * puts properties on, or a property it puts there or on its own function.
 * `queue` names a global a step pushes to or creates.
 */
const WRITTEN_FIELDS = [
	'name',
	'path',
	'assignTo',
	'target',
	'aliases',
	'selfReferences',
	'methods',
	'queue',
	'queueProperty',
	'copyAssignedValueToArgProperty',
];

/**
 * Every name a step writes, from a step that may not have passed the
 * parser. A call's path is what it calls, which `calledPath` reads, a
 * `listen` step's target is the window or document it listens on, and a
 * flag's name is a key in the script's own flags, not on the page.
 *
 * @internal
 */
export const writtenNames = function writtenNames(
	step: Readonly<Record<string, unknown>>
): readonly unknown[] {
	if (
		step.type === 'callGlobal' ||
		step.type === 'listen' ||
		step.type === 'setFlag'
	) {
		return [];
	}
	return [
		...WRITTEN_FIELDS.flatMap((field) => step[field] ?? []),
		...(isRecord(step.properties) ? Object.keys(step.properties) : []),
	].flatMap((name) =>
		// A queue (`{ global }` or `{ property }`) or a method (`{ name }`).
		isRecord(name) ? [name.global, name.property, name.name] : [name]
	);
};

/**
 * Whether `step` names a prototype, or calls or writes a name, that the
 * parser refuses. The runtime and the inline runner skip such a step, since
 * a manifest built in code never meets the parser.
 *
 * @internal
 */
export const stepReachesCode = function stepReachesCode(
	step: ManifestStep
): boolean {
	const fields = step as unknown as Readonly<Record<string, unknown>>;
	return (
		prototypeName(fields) !== undefined ||
		callReachesCode(calledPath(fields)) ||
		writeReachesCode(writtenNames(fields))
	);
};
