/** Pure ACv2 parsing and encoding, shared by consent authoring and local evidence tools. */

/** Consented and disclosed provider IDs read from an AC string. */
export interface AdditionalConsentSignal {
	/** Providers the visitor consented to. */
	consented: number[];
	/**
	 * Every provider the visitor was shown, consented ones included. The
	 * string itself lists a consented provider only once.
	 */
	disclosed: number[];
}

/** @internal */
export const isProviderId = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const sortedIds = (ids: Iterable<number>): number[] =>
	[...new Set(ids)].filter(isProviderId).sort((a, b) => a - b);

/**
 * Builds an ACv2 string: `2~<consented>~dv.<disclosed, not consented>`.
 *
 * A consented provider is disclosed by definition, so it is written in the
 * consented part only.
 *
 * @example
 * ```ts
 * encodeAdditionalConsent({ consented: [1, 10], disclosed: [1, 2, 3, 4, 10] });
 * // '2~1.10~dv.2.3.4'
 * ```
 */
export const encodeAdditionalConsent = function encodeAdditionalConsent(
	signal: AdditionalConsentSignal
): string {
	const consented = sortedIds(signal.consented);
	const consentedSet = new Set(consented);
	const disclosedOnly = sortedIds(signal.disclosed).filter(
		(id) => !consentedSet.has(id)
	);
	return `2~${consented.join('.')}~dv.${disclosedOnly.join('.')}`;
};

const parseIds = (part: string): number[] | null => {
	if (part === '') {
		return [];
	}
	const ids = part.split('.').map(Number);
	return ids.every(isProviderId) ? ids : null;
};

/** Reads an ACv2 string. Version 1 strings and malformed input return `null`. */
export const decodeAdditionalConsent = function decodeAdditionalConsent(
	value: string
): AdditionalConsentSignal | null {
	const parts = value.split('~');
	if (parts.length !== 3 || parts[0] !== '2') {
		return null;
	}
	const consented = parseIds(parts[1] ?? '');
	const disclosedPart = parts[2] ?? '';
	// `dv` without the dot is allowed when nothing follows it.
	if (disclosedPart !== 'dv' && !disclosedPart.startsWith('dv.')) {
		return null;
	}
	const disclosedOnly = parseIds(disclosedPart.slice(3));
	if (!consented || !disclosedOnly) {
		return null;
	}
	return {
		consented: sortedIds(consented),
		disclosed: sortedIds([...consented, ...disclosedOnly]),
	};
};
