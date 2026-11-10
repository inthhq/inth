import { createHash } from 'node:crypto';

import { matchPolicyRules, readPolicyResolutionWire } from '@c15t/schema';

/**
 * The checks both native cores apply to a bundled resource before they use it,
 * so the CLI never writes or reuses one a device would discard.
 *
 * `native/protocol/bundled-policy/invalid-resources.json` lists resources the
 * Kotlin and Swift readers refuse, or load without a usable vendor list; this
 * check must find a problem in every one.
 */

const PAYLOAD_KEYS = new Set([
	'defaultLanguage',
	'disclosures',
	'endpoint',
	'expiresAt',
	'issuedAt',
	'manifestRevision',
	'policyPacks',
	'requiresAtp',
	'schemaVersion',
	'tenantId',
]);

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const isWholeNumberIn = (value: unknown, min: number, max: number) =>
	Number.isSafeInteger(value) &&
	(value as number) >= min &&
	(value as number) <= max;

/**
 * The native vendor-list gate: `fetchGVL`'s acceptance test. A list numbered 0,
 * a policy version below 1, or purposes and vendors that are not objects leave a
 * device with no vendor list.
 */
export const gvlProblem = function gvlProblem(data: unknown): string | null {
	if (!isRecord(data)) {
		return 'the vendor list is not an object';
	}
	if (!isWholeNumberIn(data.vendorListVersion, 1, Number.MAX_SAFE_INTEGER)) {
		return 'vendorListVersion must be a whole number from 1';
	}
	if (!isWholeNumberIn(data.tcfPolicyVersion, 1, Number.MAX_SAFE_INTEGER)) {
		return 'tcfPolicyVersion must be a whole number from 1';
	}
	if (!isRecord(data.purposes) || !isRecord(data.vendors)) {
		return 'purposes and vendors must be objects';
	}
	return null;
};

const disclosureProblem = function disclosureProblem(
	disclosures: unknown,
	issuedAt: number
): string | null {
	if (disclosures === undefined) {
		return null;
	}
	if (!isRecord(disclosures)) {
		return 'disclosures must be an object';
	}
	const { atp, gvl } = disclosures;
	if (gvl !== undefined) {
		if (!isRecord(gvl)) {
			return 'disclosures.gvl must be an object';
		}
		const problem = gvlProblem(gvl.data);
		if (problem !== null) {
			return problem;
		}
		if (!isWholeNumberIn(gvl.fetchedAt, 0, issuedAt)) {
			return 'the vendor list needs a fetch time no later than the issue time';
		}
	}
	if (
		atp !== undefined &&
		!(
			isRecord(atp) &&
			Array.isArray(atp.providers) &&
			isWholeNumberIn(atp.fetchedAt, 0, issuedAt)
		)
	) {
		return 'disclosures.atp needs providers and a fetch time no later than the issue time';
	}
	return null;
};

const packsProblem = function packsProblem(
	packs: unknown,
	defaultLanguage: string
): string | null {
	if (!Array.isArray(packs) || packs.length === 0) {
		return 'policyPacks must be a non-empty list';
	}
	for (const pack of packs) {
		if (!isRecord(pack) || !isRecord(pack.match)) {
			return 'each policy pack needs a match';
		}
		if (readPolicyResolutionWire(pack.policyResolution).status !== 'matched') {
			return 'each policy pack needs a readable matched policy';
		}
		const copy = isRecord(pack.translations)
			? pack.translations[defaultLanguage]
			: undefined;
		if (
			!isRecord(copy) ||
			typeof copy.language !== 'string' ||
			!isRecord(copy.translations)
		) {
			return `each policy pack needs ${defaultLanguage} copy`;
		}
	}
	const unknown = matchPolicyRules({
		countryCode: null,
		entries: packs.map((pack: Fields, index) => ({
			id: String(index),
			match: pack.match as never,
		})),
		regionCode: null,
	});
	const rule =
		unknown.status === 'matched'
			? ((packs[unknown.index] as Fields).policyResolution as Fields).policy
			: undefined;
	if (
		!isRecord(rule) ||
		!['opt-in', 'iab'].includes(rule.model as string) ||
		rule.prompt !== 'choice' ||
		!Array.isArray(rule.preselectedCategories) ||
		rule.preselectedCategories.length > 0
	) {
		return 'an unknown location needs a conservative opt-in choice rule that preselects nothing';
	}
	return null;
};

/**
 * The first reason a native core would refuse this resource, or `null`.
 *
 * @param text - The resource file, `{"payload": "...", "sha256": "..."}`.
 * @param options - The backend the app is built for, and the time to check against.
 */
export const resourceProblem = function resourceProblem(
	text: string,
	options: { endpoint: string; now: number }
): string | null {
	let wrapper: unknown;
	try {
		wrapper = JSON.parse(text);
	} catch {
		return 'the resource is not JSON';
	}
	if (
		!isRecord(wrapper) ||
		Object.keys(wrapper).sort().join(',') !== 'payload,sha256'
	) {
		return 'the resource must hold only payload and sha256';
	}
	if (
		typeof wrapper.payload !== 'string' ||
		wrapper.sha256 !==
			createHash('sha256').update(wrapper.payload).digest('hex')
	) {
		return 'the checksum does not match the payload';
	}
	let payload: unknown;
	try {
		payload = JSON.parse(wrapper.payload);
	} catch {
		return 'the payload is not JSON';
	}
	if (
		!isRecord(payload) ||
		Object.keys(payload).some((key) => !PAYLOAD_KEYS.has(key))
	) {
		return 'the payload has unsupported fields';
	}
	if (payload.schemaVersion !== 1) {
		return 'schemaVersion must be 1';
	}
	if (payload.endpoint !== options.endpoint.replace(/\/+$/u, '')) {
		return 'the resource belongs to another backend';
	}
	const { expiresAt, issuedAt } = payload;
	if (!isWholeNumberIn(issuedAt, 0, options.now)) {
		return 'issuedAt must be a whole number of milliseconds, not in the future';
	}
	if (
		!Number.isSafeInteger(expiresAt) ||
		(expiresAt as number) <= (issuedAt as number)
	) {
		return 'expiresAt must come after issuedAt';
	}
	if (
		typeof payload.manifestRevision !== 'string' ||
		payload.manifestRevision === ''
	) {
		return 'manifestRevision must be a non-empty string';
	}
	if (
		payload.requiresAtp !== undefined &&
		typeof payload.requiresAtp !== 'boolean'
	) {
		return 'requiresAtp must be true or false';
	}
	if (typeof payload.defaultLanguage !== 'string') {
		return 'defaultLanguage must be a string';
	}
	return (
		packsProblem(payload.policyPacks, payload.defaultLanguage) ??
		disclosureProblem(payload.disclosures, issuedAt as number)
	);
};
