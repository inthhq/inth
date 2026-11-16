/**
 * Read the IAB GPP string.
 */

import type { ConsentSnapshot } from '../protocol';
import { useConsentSelector } from './use-consent-selector';

/** Module scope, so the subscription behind {@link useGPPString} is stable. */
const selectGPPString = (snapshot: ConsentSnapshot): string | null =>
	snapshot.gppString ?? null;

/**
 * The IAB GPP string the native core derived for the current state.
 *
 * The React Native twin of reading `gppString` from `__gpp('ping')` on web, and
 * the same value the core writes to `IABGPP_HDR_GppString` for ad SDKs. It
 * carries the US National section for a US visitor under a rule that offers an
 * opt-out, or the TCF EU section under an `iab` rule once a TC String is
 * committed.
 *
 * @returns The GPP string, or `null` while GPP is off or no section applies.
 *
 * @example
 * ```tsx
 * const gppString = useGPPString();
 * adRequest.setExtra('gpp', gppString ?? '');
 * ```
 */
export const useGPPString = function useGPPString(): string | null {
	return useConsentSelector(selectGPPString);
};
