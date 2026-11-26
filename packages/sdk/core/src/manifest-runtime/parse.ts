import {
	isCategoryCondition,
	isCategoryName,
} from '../modules/script-loader/category-condition';
import {
	calledPath,
	callReachesCode,
	prototypeName,
	writeReachesCode,
	writtenNames,
} from './call-path';
import {
	levelOf,
	MANIFEST_FIELD_LEVELS,
	QUEUE_METHOD_FORMATS,
	RUNTIME_VALUE_LEVELS,
	EARLIER_STEP_FIELD_LEVELS,
	SCRIPT_ATTRIBUTE_LEVELS,
	someStep,
} from './features';
import {
	isDeclarableGlobal,
	MANIFEST_STEP_LISTS,
	manifestRoots,
	stepRoots,
} from './globals';
import { MANIFEST_RUNTIME_LEVEL } from './level';
import { levelThree } from './part';
import type { StepCheck } from './part';
import {
	RUNTIME_VALUE_KIND,
	VENDOR_MANIFEST_KIND,
	VENDOR_MANIFEST_SCHEMA_VERSION,
} from './types';
import type { ResolvedManifest } from './types';

/** A manifest that passed {@link parseResolvedManifest}, or why it failed. */
export type ParsedManifest =
	| { ok: true; manifest: ResolvedManifest }
	| {
			ok: false;
			reason: string;
			/**
			 * The manifest needs code this runtime has not loaded, such as the
			 * level 3 part, so a later parse, once it loads, may accept it.
			 */
			needsCode?: true;
	  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const STEP_LISTS = MANIFEST_STEP_LISTS;

/** Step lists a level 1 manifest leaves out. */
const OPTIONAL_STEP_LISTS: ReadonlySet<string> = new Set(['onDisposeSteps']);

const CONSENT_SIGNALS = new Set(['gtag', 'rudderstack', 'clarity']);

const isStringRecord = (
	value: unknown,
	isValue: (entry: unknown) => boolean
): boolean => isRecord(value) && Object.values(value).every(isValue);

const isOptional = (value: unknown, check: (value: unknown) => boolean) =>
	value === undefined || check(value);

/**
 * Attributes a manifest may set on its script tag: `data-*` ones a vendor's
 * file reads, and the few that only shape the fetch. Never `src`, an event
 * handler or anything else that would change what runs.
 */
const TAG_ATTRIBUTE =
	/^(?:data-[a-z0-9][a-z0-9._-]*|crossorigin|integrity|charset|referrerpolicy)$/u;

/** An element id a vendor's file looks its tag up by. */
const ELEMENT_ID = /^[A-Za-z][\w-]*$/u;

const isElementId = (value: unknown): boolean =>
	typeof value === 'string' && ELEMENT_ID.test(value);

/** Script tag attributes: the allowed names, and an `id` that is one. */
const isTagAttributes = (value: unknown): boolean =>
	isStringRecord(value, (entry) => typeof entry === 'string') &&
	Object.entries(value as Record<string, string>).every(([name, entry]) =>
		levelOf(SCRIPT_ATTRIBUTE_LEVELS, name) === undefined
			? TAG_ATTRIBUTE.test(name)
			: isElementId(entry)
	);

const isNameList = (value: unknown): boolean =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.every((name) => typeof name === 'string' && name.length > 0);

const isBoolean = (value: unknown): boolean => typeof value === 'boolean';

const isHttpsUrl = (value: unknown): boolean => {
	if (typeof value !== 'string') {
		return false;
	}
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
};

const MANIFEST_KEYS: ReadonlySet<string> = new Set(
	Object.keys(MANIFEST_FIELD_LEVELS)
);

const unknownKey = (
	value: Record<string, unknown>,
	known: ReadonlySet<string>
): string | undefined => Object.keys(value).find((key) => !known.has(key));

/** A consent mapping: Inth categories to lists of vendor names. */
const isConsentMapping = (value: unknown): boolean =>
	isStringRecord(
		value,
		(entry) =>
			Array.isArray(entry) && entry.every((name) => typeof name === 'string')
	) && Object.keys(value as object).every(isCategoryName);

/** Whether `value`, with `kind` set to the runtime value kind, is one this SDK fills in. */
const isKnownRuntimeValue = (value: Record<string, unknown>): boolean =>
	levelOf(RUNTIME_VALUE_LEVELS, value.value) !== undefined &&
	(value.value === 'consents'
		? unknownKey(value, new Set(['kind', 'value', 'mapping', 'format'])) ===
				undefined &&
			isConsentMapping(value.mapping) &&
			(value.format === 'boolean' || value.format === 'grantedDenied')
		: unknownKey(value, new Set(['kind', 'value'])) === undefined);

const MAX_DEPTH = 32;

/**
 * Whether `value` holds a runtime value this runtime cannot fill in. Such
 * a value would otherwise pass through as a plain object.
 */
const hasUnknownRuntimeValue = (value: unknown, depth = 0): boolean => {
	if (depth > MAX_DEPTH) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.some((entry) => hasUnknownRuntimeValue(entry, depth + 1));
	}
	if (!isRecord(value)) {
		return false;
	}
	if (value.kind === RUNTIME_VALUE_KIND) {
		return !isKnownRuntimeValue(value);
	}
	return Object.values(value).some((entry) =>
		hasUnknownRuntimeValue(entry, depth + 1)
	);
};

/**
 * Why a step's own fields are wrong, for the step types and fields that
 * came after level 1, or `undefined`.
 */
// oxlint-disable-next-line complexity -- One check per step type.
const fieldProblem = (step: Record<string, unknown>): string | undefined => {
	switch (step.type) {
		case 'callGlobal': {
			if (step.path === undefined) {
				return typeof step.global === 'string' &&
					isOptional(step.method, (method) => typeof method === 'string')
					? undefined
					: 'names no global';
			}
			return step.global === undefined &&
				step.method === undefined &&
				isNameList(step.path)
				? undefined
				: 'needs a path of names, or a global, not both';
		}
		case 'defineQueueMethods': {
			return isOptional(step.queueFormat, (format) =>
				QUEUE_METHOD_FORMATS.has(format)
			)
				? undefined
				: 'has an unknown queueFormat';
		}
		case 'loadScriptStep': {
			return isElementId(step.id) &&
				isHttpsUrl(step.src) &&
				isOptional(step.async, isBoolean) &&
				isOptional(step.unlessGlobal, isNameList) &&
				isOptional(
					step.attributes,
					(attributes) =>
						isTagAttributes(attributes) &&
						!Object.hasOwn(attributes as object, 'id')
				)
				? undefined
				: 'needs an id, an https src and allowed attributes';
		}
		case 'removeScript': {
			return isElementId(step.id) ? undefined : 'has no id';
		}
		default: {
			return undefined;
		}
	}
};

/** The most steps a manifest may have, nested ones included. */
const MAX_STEPS = 200;

/** Steps the manifest being parsed has so far. */
let stepCount = 0;

/** The `globals` of the manifest being parsed. */
let declaredGlobals: readonly unknown[] = [];

/** The level the manifest being parsed requires. */
let required = 1;

/** Why a step in `list` cannot run, as a parser reason, or `undefined`. */
// oxlint-disable-next-line complexity -- One check per rule, in order.
const stepProblem: StepCheck = (step, list, depth) => {
	const part = levelThree();
	// With the level 3 part, its table, which has level 3 in it.
	const fields = isRecord(step)
		? levelOf<Readonly<Record<string, number>>>(
				part?.steps ?? EARLIER_STEP_FIELD_LEVELS,
				step.type
			)
		: undefined;
	if (!(isRecord(step) && fields)) {
		return `${list} has a step of unknown type ${JSON.stringify(
			isRecord(step) ? step.type : step
		)}`;
	}
	stepCount += 1;
	if (stepCount > MAX_STEPS) {
		return `it has more than ${MAX_STEPS} steps`;
	}
	const type = String(step.type);
	// A manifest loads its file through its top-level `loadScript`; one in a
	// step list would never run.
	if (type === 'loadScript' && list !== 'loadScript') {
		return `${list} has a loadScript step`;
	}
	// Nothing would remove a tag inserted after disposal.
	if (list === 'onDisposeSteps' && type === 'loadScriptStep') {
		return `${list} has a loadScriptStep step`;
	}
	const extra = unknownKey(step, new Set(Object.keys(fields)));
	if (extra !== undefined) {
		return `${list} has a ${type} step with the unknown field ${extra}`;
	}
	const name = prototypeName(step);
	if (name !== undefined) {
		return `${list} has a ${type} step that names ${name}`;
	}
	if (hasUnknownRuntimeValue(step)) {
		return `${list} has a ${type} step with a runtime value this SDK does not know`;
	}
	const problem = fieldProblem(step);
	if (problem !== undefined) {
		return `${list} has a ${type} step that ${problem}`;
	}
	if (callReachesCode(calledPath(step))) {
		return `${list} has a ${type} step that calls ${calledPath(step).join('.')}`;
	}
	if (writeReachesCode(writtenNames(step))) {
		return `${list} has a ${type} step that writes ${writtenNames(step).join(', ')}`;
	}
	const roots = stepRoots(step);
	const undeclared = roots.findIndex((root) => !declaredGlobals.includes(root));
	if (undeclared !== -1) {
		return `${list} has a ${type} step that uses the global ${String(roots[undeclared])}, which globals does not declare`;
	}
	if (
		part &&
		Object.keys(step).some((field) => (fields[field] as number) > 2)
	) {
		// A runtime without the part refuses the step too, so the manifest
		// fails on every path.
		return required < 3
			? `${list} has a ${type} step that needs manifest runtime level 3, and the manifest requires level ${String(required)}`
			: part.problem(step, list, depth, stepProblem);
	}
	return undefined;
};

/** The ids of the tags `manifest` inserts, nested steps included. */
const tagIds = (manifest: Record<string, unknown>): unknown[] => {
	const ids: unknown[] =
		isRecord(manifest.loadScript) && isRecord(manifest.loadScript.attributes)
			? [manifest.loadScript.attributes.id]
			: [];
	for (const list of STEP_LISTS) {
		someStep(manifest[list], (step) => {
			if (step.type === 'loadScriptStep') {
				ids.push(step.id);
			}
			return false;
		});
	}
	return ids;
};

/**
 * Why `globals` is wrong, or `undefined`. It lists the window roots the
 * steps may use: names no platform or built-in global has, and not
 * the id of a tag the manifest inserts, which the browser puts on window
 * as that element. The consent signal's global counts as a root.
 */
const globalsProblem = (
	manifest: Record<string, unknown>
): string | undefined => {
	const globals = manifest.globals as unknown[];
	const refused = globals.find((name) => !isDeclarableGlobal(name));
	if (refused !== undefined) {
		return `its globals names ${String(refused)}, which a manifest may not use`;
	}
	const tag = tagIds(manifest).find((id) => globals.includes(id));
	if (tag !== undefined) {
		return `its globals names ${String(tag)}, the id of a tag it inserts`;
	}
	const signal = manifestRoots({
		consentMapping: manifest.consentMapping as never,
		consentSignal: manifest.consentSignal as never,
		consentSignalTarget: manifest.consentSignalTarget as never,
	}).find((root) => !globals.includes(root));
	if (signal !== undefined) {
		return `its consent signal calls ${String(signal)}, which globals does not declare`;
	}
	return undefined;
};

/** Why `manifest` cannot run, or `undefined` when it can. */
// oxlint-disable-next-line complexity -- One check per manifest field.
const manifestProblem = (
	manifest: Record<string, unknown>
): string | undefined => {
	if (
		manifest.kind !== VENDOR_MANIFEST_KIND ||
		manifest.schemaVersion !== VENDOR_MANIFEST_SCHEMA_VERSION
	) {
		return `it is not a version ${VENDOR_MANIFEST_SCHEMA_VERSION} vendor manifest`;
	}
	stepCount = 0;
	// A newer manifest's field this SDK does not know would be skipped,
	// running the rest without it.
	const extra = unknownKey(manifest, MANIFEST_KEYS);
	if (extra !== undefined) {
		return `it has the unknown field ${extra}`;
	}
	const { requires } = manifest;
	if (
		requires !== undefined &&
		!(Number.isInteger(requires) && (requires as number) >= 1)
	) {
		return 'its requires is not a whole number from 1';
	}
	required = (requires as number | undefined) ?? 1;
	// A level this SDK does not run uses steps or fields it would skip.
	if (typeof requires === 'number' && requires > MANIFEST_RUNTIME_LEVEL) {
		return `it needs manifest runtime level ${String(requires)}, and this SDK runs level ${MANIFEST_RUNTIME_LEVEL}`;
	}
	if (typeof manifest.vendor !== 'string' || manifest.vendor.length === 0) {
		return 'it names no vendor';
	}
	if (!isCategoryCondition(manifest.category)) {
		return 'its category is not a condition over known categories';
	}
	const globals: unknown = manifest.globals;
	if (
		!Array.isArray(globals) ||
		!globals.every((name) => typeof name === 'string')
	) {
		return 'its globals is not a list of names';
	}
	declaredGlobals = globals;
	for (const list of STEP_LISTS) {
		const steps = manifest[list];
		if (steps === undefined && OPTIONAL_STEP_LISTS.has(list)) {
			continue;
		}
		if (!Array.isArray(steps)) {
			return `${list} is not a list`;
		}
		for (const step of steps) {
			const problem = stepProblem(step, list, 0);
			if (problem !== undefined) {
				return problem;
			}
		}
	}
	// After the steps, so a step a block list refuses says why.
	const globalsIssue = globalsProblem(manifest);
	if (globalsIssue !== undefined) {
		return globalsIssue;
	}
	const { loadScript } = manifest;
	if (
		loadScript !== undefined &&
		!(
			isRecord(loadScript) &&
			loadScript.type === 'loadScript' &&
			stepProblem(loadScript, 'loadScript', 0) === undefined &&
			isHttpsUrl(loadScript.src) &&
			isOptional(loadScript.attributes, isTagAttributes)
		)
	) {
		return 'its loadScript has no https src, or sets an attribute other than data-*, crossorigin, integrity, charset, referrerpolicy or an id';
	}
	if (
		!isOptional(
			manifest.target,
			(value) => value === 'head' || value === 'body'
		) ||
		!isOptional(manifest.observeConsentBeforeLoad, isBoolean) ||
		!isOptional(manifest.persistAfterDispose, isBoolean) ||
		!isOptional(
			manifest.resourceKey,
			(value) => typeof value === 'string' && value.length > 0
		)
	) {
		return 'target, observeConsentBeforeLoad, persistAfterDispose or resourceKey has the wrong type';
	}
	if (
		!isOptional(manifest.alwaysLoad, (value) => typeof value === 'boolean') ||
		!isOptional(
			manifest.persistAfterConsentRevoked,
			(value) => typeof value === 'boolean' || value === 'loaded'
		)
	) {
		return 'alwaysLoad or persistAfterConsentRevoked has the wrong type';
	}
	if (
		!isOptional(manifest.consentMapping, isConsentMapping) ||
		!isOptional(manifest.consentSignal, (value) =>
			CONSENT_SIGNALS.has(value as string)
		) ||
		!isOptional(
			manifest.consentSignalTarget,
			(value) => typeof value === 'string'
		) ||
		!isOptional(manifest.consentSignalDefaults, (value) =>
			isStringRecord(
				value,
				(entry) => entry === 'granted' || entry === 'denied'
			)
		)
	) {
		return 'its consent signal fields have the wrong type';
	}
	if (
		!isOptional(
			manifest.vendorDetails,
			(value) =>
				isRecord(value) &&
				typeof value.name === 'string' &&
				typeof value.privacyPolicyUrl === 'string'
		)
	) {
		return 'its vendorDetails has no name or privacy policy URL';
	}
	return undefined;
};

/**
 * Checks a `ResolvedManifest` that arrived as JSON, such as one the Inth
 * server sends. A manifest with a step type this runtime does not know, a
 * `loadScript` without an https `src`, or fields of the wrong type fails,
 * so an older SDK never runs part of a newer manifest.
 */
export const parseResolvedManifest = function parseResolvedManifest(
	value: unknown
): ParsedManifest {
	if (!isRecord(value)) {
		return { ok: false, reason: 'it is not an object' };
	}
	const problem = manifestProblem(value);
	if (problem === undefined) {
		return { manifest: value as unknown as ResolvedManifest, ok: true };
	}
	const level = typeof value.requires === 'number' ? value.requires : 1;
	// A level above this SDK's needs code no later download brings.
	return level >= 3 && level <= MANIFEST_RUNTIME_LEVEL && !levelThree()
		? { needsCode: true, ok: false, reason: problem }
		: { ok: false, reason: problem };
};
