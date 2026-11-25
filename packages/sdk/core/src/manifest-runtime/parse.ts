import {
	MANIFEST_STEP_TYPES,
	VENDOR_MANIFEST_KIND,
	VENDOR_MANIFEST_SCHEMA_VERSION,
} from './types';
import type { ResolvedManifest } from './types';

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

/** A category name, or an `and` / `or` / `not` condition over them. */
const isCategoryCondition = (value: unknown, depth = 0): boolean => {
	if (typeof value === 'string') {
		return value.length > 0;
	}
	if (!isRecord(value) || depth > 16) {
		return false;
	}
	const keys = Object.keys(value);
	if (keys.length !== 1) {
		return false;
	}
	if (Object.hasOwn(value, 'not')) {
		return isCategoryCondition(value.not, depth + 1);
	}
	const operands = Object.hasOwn(value, 'and') ? value.and : value.or;
	return (
		(Object.hasOwn(value, 'and') || Object.hasOwn(value, 'or')) &&
		Array.isArray(operands) &&
		operands.length > 0 &&
		operands.every((operand) => isCategoryCondition(operand, depth + 1))
	);
};

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
	if (typeof manifest.vendor !== 'string' || manifest.vendor.length === 0) {
		return 'it names no vendor';
	}
	if (!isCategoryCondition(manifest.category)) {
		return 'its category is not a category condition';
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
		}
	}
	const { loadScript } = manifest;
	if (
		loadScript !== undefined &&
		!(
			isRecord(loadScript) &&
			loadScript.type === 'loadScript' &&
			isHttpsUrl(loadScript.src) &&
			isOptional(loadScript.attributes, (attributes) =>
				isStringRecord(attributes, (entry) => typeof entry === 'string')
			)
		)
	) {
		return 'its loadScript has no https src';
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
		!isOptional(manifest.consentMapping, (value) =>
			isStringRecord(
				value,
				(entry) =>
					Array.isArray(entry) &&
					entry.every((name) => typeof name === 'string')
			)
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
