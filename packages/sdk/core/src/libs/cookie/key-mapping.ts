/**
 * @packageDocumentation
 * The short keys of the v2 compact cookie format, expanded when a v2
 * cookie is read.
 */

/**
 * Mapping of full keys to shortened keys for cookie storage optimization.
 * Keeps consent keys readable but shortens metadata to reduce cookie size.
 *
 * @internal
 */
const COOKIE_KEY_MAP = {
	consentInfo: 'i',
	consents: 'c',
	externalId: 'eid',
	iabCustomVendorConsents: 'icv',
	iabCustomVendorLegitimateInterests: 'icvli',
	id: 'id',
	identityProvider: 'idp',
	materialPolicyFingerprint: 'mpf',
	subjectId: 'sid',
	time: 't',
	timestamp: 'ts',
	type: 'y',
} as const;

/**
 * Reverse mapping for deserializing cookie data
 *
 * @internal
 */
const REVERSE_COOKIE_KEY_MAP = Object.entries(COOKIE_KEY_MAP).reduce(
	(acc, [key, value]) => {
		acc[value] = key;
		return acc;
	},
	{} as Record<string, string>
);

/**
 * Expands shortened keys in a flattened object back to full keys.
 *
 * @param shortened - Flattened object with shortened keys
 * @returns Flattened object with full keys
 *
 * @internal
 */
export const expandFlatKeys = function expandFlatKeys(
	shortened: Record<string, string>
): Record<string, string> {
	const expanded: Record<string, string> = {};

	for (const [key, value] of Object.entries(shortened)) {
		const keys = key.split('.');
		const expandedKeys = keys.map((k) => REVERSE_COOKIE_KEY_MAP[k] || k);
		expanded[expandedKeys.join('.')] = value;
	}

	return expanded;
};
