import {
	isCategoryCondition,
	isCategoryName,
} from '../modules/script-loader/category-condition';
import { MANIFEST_RUNTIME_LEVEL } from './level';
import {
	MANIFEST_STEP_TYPES,
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
] as const satisfies readonly (keyof ResolvedManifest)[];

const CONSENT_SIGNALS = new Set(['gtag', 'rudderstack', 'clarity']);

/**
 * Attributes a manifest may set on its script tag: `data-*` ones a vendor's
 * file reads, and the few that only shape the fetch. Never `src`, an event
 * handler or anything else that would change what runs.
 */
const TAG_ATTRIBUTE =
	/^(?:data-[a-z0-9][a-z0-9._-]*|crossorigin|integrity|charset|referrerpolicy)$/u;

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

const isStringRecord = (
	value: unknown,
	isValue: (entry: unknown) => boolean
): boolean => isRecord(value) && Object.values(value).every(isValue);

const isOptional = (value: unknown, check: (value: unknown) => boolean) =>
	value === undefined || check(value);

/** The fields each step type may carry, besides `type`. */
const STEP_KEYS: {
	readonly [Type in ManifestStep['type']]: readonly Exclude<
		keyof Extract<ManifestStep, { type: Type }>,
		'type'
	>[];
} = {
	callGlobal: ['global', 'method', 'args', 'literalArgs'],
	constructGlobal: [
		'constructor',
		'assignTo',
		'args',
		'copyAssignedValueToArgProperty',
	],
	defineGlobalMethods: ['target', 'methods', 'ifGlobalIsQueue'],
	defineQueueClass: ['target', 'name', 'queueProperty', 'methods'],
	defineQueueFunction: ['name', 'queue', 'ifUndefined', 'pushStyle'],
	defineQueueMethods: [
		'target',
		'methods',
		'queue',
		'queueFormat',
		'returnTarget',
		'preserveExisting',
	],
	defineQueueProxy: ['name', 'queue'],
	defineStubFunction: [
		'name',
		'queue',
		'dispatchProperty',
		'queueFormat',
		'aliases',
		'selfReferences',
		'properties',
		'ifUndefined',
	],
	loadScript: ['src', 'async', 'defer', 'attributes', 'fetchPriority'],
	pushToQueue: ['queue', 'value'],
	setCookie: ['cookie'],
	setGlobal: ['name', 'value', 'ifUndefined', 'keepExistingQueue'],
	setGlobalPath: ['path', 'value', 'ifGlobalIsQueue', 'ifUndefined'],
};

const MANIFEST_KEYS: ReadonlySet<string> = new Set<keyof ResolvedManifest>([
	...STEP_LISTS,
	'kind',
	'schemaVersion',
	'requires',
	'vendor',
	'vendorDetails',
	'category',
	'alwaysLoad',
	'persistAfterConsentRevoked',
	'loadScript',
	'consentMapping',
	'consentSignal',
	'consentSignalTarget',
	'consentSignalDefaults',
]);

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

const RUNTIME_VALUES: ReadonlySet<unknown> = new Set(['date', 'timestamp']);

const MAX_DEPTH = 32;

const unknownKey = (
	value: Record<string, unknown>,
	known: ReadonlySet<string>
): string | undefined => Object.keys(value).find((key) => !known.has(key));

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
		return (
			unknownKey(value, new Set(['kind', 'value'])) !== undefined ||
			!RUNTIME_VALUES.has(value.value)
		);
	}
	return Object.values(value).some((entry) =>
		hasUnknownRuntimeValue(entry, depth + 1)
	);
};

/** Why a step of a known type cannot run, or `undefined`. */
const stepProblem = (step: Record<string, unknown>): string | undefined => {
	const known = new Set<string>([
		'type',
		...STEP_KEYS[step.type as ManifestStep['type']],
	]);
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
		if (!Array.isArray(steps)) {
			return `${list} is not a list`;
		}
		for (const step of steps) {
			if (
				!(
					isRecord(step) &&
					typeof step.type === 'string' &&
					Object.hasOwn(MANIFEST_STEP_TYPES, step.type)
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
			isOptional(
				loadScript.attributes,
				(attributes) =>
					isStringRecord(attributes, (entry) => typeof entry === 'string') &&
					Object.keys(attributes as object).every((name) =>
						TAG_ATTRIBUTE.test(name)
					)
			)
		)
	) {
		return 'its loadScript has no https src, or sets an attribute other than data-*, crossorigin, integrity, charset or referrerpolicy';
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
		!isOptional(
			manifest.consentMapping,
			(value) =>
				isStringRecord(
					value,
					(entry) =>
						Array.isArray(entry) &&
						entry.every((name) => typeof name === 'string')
				) && Object.keys(value as object).every(isCategoryName)
		) ||
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
