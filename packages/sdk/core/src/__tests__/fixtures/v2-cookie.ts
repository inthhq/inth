/**
 * The v2 compact cookie bytes c15t v2 wrote for a record object. Nothing
 * writes this format now; tests use it to seed a v2 cookie for the reader.
 *
 * Keys are dot paths with the metadata names shortened, `true` is `1`,
 * `false` is left out and `null` is empty: `c.necessary:1,i.t:123`.
 */
const SHORT_KEYS: Readonly<Record<string, string>> = {
	consentInfo: 'i',
	consents: 'c',
	externalId: 'eid',
	iabCustomVendorConsents: 'icv',
	iabCustomVendorLegitimateInterests: 'icvli',
	identityProvider: 'idp',
	materialPolicyFingerprint: 'mpf',
	subjectId: 'sid',
	time: 't',
	timestamp: 'ts',
	type: 'y',
};

const flatten = function flatten(
	record: Record<string, unknown>,
	prefix: string
): [string, string][] {
	return Object.entries(record).flatMap(([key, value]): [string, string][] => {
		const path = `${prefix}${SHORT_KEYS[key] ?? key}`;
		if (value === null || value === undefined) {
			return [[path, '']];
		}
		if (typeof value === 'boolean') {
			return value ? [[path, '1']] : [];
		}
		if (typeof value === 'object' && !Array.isArray(value)) {
			return flatten(value as Record<string, unknown>, `${path}.`);
		}
		return [[path, String(value)]];
	});
};

/** The v2 compact text for `record`. */
export const encodeV2Cookie = function encodeV2Cookie(
	record: Record<string, unknown>
): string {
	return flatten(record, '')
		.map(([key, value]) => `${key}:${value}`)
		.join(',');
};
