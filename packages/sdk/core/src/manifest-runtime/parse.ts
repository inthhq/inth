import {
	isCategoryCondition,
	isCategoryName,
} from '../modules/script-loader/category-condition';
import {
	calledPath,
	callReachesCode,
	writeReachesCode,
	writtenNames,
} from './call-path';
import {
	levelOf,
	MANIFEST_FIELD_LEVELS,
	QUEUE_METHOD_FORMATS,
	RUNTIME_VALUE_LEVELS,
	SCRIPT_ATTRIBUTE_LEVELS,
	STEP_FIELD_LEVELS,
} from './features';
import { MANIFEST_RUNTIME_LEVEL } from './level';
import {
	RUNTIME_VALUE_KIND,
	VENDOR_MANIFEST_KIND,
	VENDOR_MANIFEST_SCHEMA_VERSION,
} from './types';
import type { ManifestStep, ResolvedManifest } from './types';

/** A manifest that passed {@link parseResolvedManifest}, or why it failed. */
export type ParsedManifest =
	| { ok: true; manifest: ResolvedManifest }
	| { ok: false; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const STEP_LISTS = [
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
const UNSAFE_NAMES: ReadonlySet<string> = new Set([
	'__proto__',
	'prototype',
	'constructor',
]);

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

/** The first unsafe name among the names a step reads or writes. */
const unsafeName = (value: unknown, depth = 0): string | undefined => {
	if (typeof value === 'string') {
		return UNSAFE_NAMES.has(value) ? value : undefined;
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
		const name = unsafeName(entry, depth + 1);
		if (name !== undefined) {
			return name;
		}
	}
	return undefined;
};

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

/** Why a step of a known type cannot run, or `undefined`. */
const stepProblem = (step: Record<string, unknown>): string | undefined => {
	const known = new Set<string>(
		Object.keys(STEP_FIELD_LEVELS[step.type as ManifestStep['type']])
	);
	const extra = unknownKey(step, known);
	if (extra !== undefined) {
		return `has a ${String(step.type)} step with the unknown field ${extra}`;
	}
	const name = unsafeName(step);
	if (name !== undefined) {
		return `has a ${String(step.type)} step that names ${name}`;
	}
	if (hasUnknownRuntimeValue(step)) {
		return `has a ${String(step.type)} step with a runtime value this SDK does not know`;
	}
	const problem = fieldProblem(step);
	if (problem !== undefined) {
		return `has a ${String(step.type)} step that ${problem}`;
	}
	if (callReachesCode(calledPath(step))) {
		return `has a ${String(step.type)} step that calls ${calledPath(step).join('.')}`;
	}
	if (writeReachesCode(writtenNames(step))) {
		return `has a ${String(step.type)} step that writes ${writtenNames(step).join(', ')}`;
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
	for (const list of STEP_LISTS) {
		const steps = manifest[list];
		if (steps === undefined && OPTIONAL_STEP_LISTS.has(list)) {
			continue;
		}
		if (!Array.isArray(steps)) {
			return `${list} is not a list`;
		}
		for (const step of steps) {
			if (
				!(
					isRecord(step) &&
					typeof step.type === 'string' &&
					Object.hasOwn(STEP_FIELD_LEVELS, step.type)
				)
			) {
				return `${list} has a step of unknown type ${JSON.stringify(
					isRecord(step) ? step.type : step
				)}`;
			}
			// A manifest loads its file through its top-level `loadScript`;
			// one in a step list would never run.
			if (step.type === 'loadScript') {
				return `${list} has a loadScript step`;
			}
			// Nothing would remove a tag inserted after disposal.
			if (list === 'onDisposeSteps' && step.type === 'loadScriptStep') {
				return `${list} has a loadScriptStep step`;
			}
			const problem = stepProblem(step);
			if (problem !== undefined) {
				return `${list} ${problem}`;
			}
		}
	}
	const { loadScript } = manifest;
	if (
		loadScript !== undefined &&
		!(
			isRecord(loadScript) &&
			loadScript.type === 'loadScript' &&
			stepProblem(loadScript) === undefined &&
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
	return problem === undefined
		? { manifest: value as unknown as ResolvedManifest, ok: true }
		: { ok: false, reason: problem };
};
