/**
 * Purposes that TCF policy version 4 and later allow only with consent.
 * Purpose 1 was never allowed legitimate interest; TCF 2.2 removed it for
 * purposes 3 to 6 (TCF Policies Appendix A).
 *
 * @public
 */
export const CONSENT_ONLY_PURPOSES: readonly number[] = [1, 3, 4, 5, 6];

/**
 * The purposes in a legitimate interest declaration that TCF lets a CMP
 * signal. A custom vendor declares its own legal bases, so it can list
 * purposes 1 and 3 to 6, which TCF allows only with consent. Neither the
 * signals nor the preference UI may offer those.
 *
 * @param purposeIds - Purposes a vendor declares for legitimate interest.
 * @returns The declared purposes that may use legitimate interest.
 *
 * @example
 * ```ts
 * permittedLegitimateInterestPurposes([1, 3, 7]); // [7]
 * ```
 *
 * @public
 */
export const permittedLegitimateInterestPurposes =
	function permittedLegitimateInterestPurposes(
		purposeIds: readonly number[] | undefined
	): number[] {
		return (purposeIds ?? []).filter(
			(id) => !CONSENT_ONLY_PURPOSES.includes(id)
		);
	};
