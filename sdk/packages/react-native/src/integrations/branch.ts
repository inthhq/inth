import type { AllConsentNames } from '../protocol/vocabulary';
import { connectConsentState } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';
import { resolveGoogleAdsConsent } from './google-consent-mode';
import type { GoogleAdsConsent } from './google-consent-mode';

/**
 * The Branch consumer protection attribution level {@link connectBranch} sets:
 * `FULL` with marketing, `MINIMAL` (analytics only) with measurement alone and
 * `NONE` otherwise.
 */
export type BranchAttribution = 'FULL' | 'MINIMAL' | 'NONE';

/** The Branch functions supplied by the app. No vendor dependency is loaded. */
export interface BranchClient {
	/** Call `branch.setConsumerProtectionAttributionLevel`. */
	setConsumerProtectionAttributionLevel: (
		level: BranchAttribution
	) => void | Promise<void>;
	/** Call `branch.setDMAParamsForEEA` with the app's EEA flag. */
	setDMAParamsForEEA: (consent: GoogleAdsConsent) => void | Promise<void>;
}

const attributionLevel = (
	isAllowed: (category: AllConsentNames) => boolean
): BranchAttribution => {
	if (isAllowed('marketing')) {
		return 'FULL';
	}
	return isAllowed('measurement') ? 'MINIMAL' : 'NONE';
};

/** Options for {@link connectBranch}. Branch reads marketing and measurement. */
export type BranchOptions = Pick<
	AnalyticsIntegrationOptions,
	'client' | 'onError'
>;

/**
 * Keep Branch's attribution level and Google DMA parameters in sync with
 * consent.
 *
 * Marketing sets `FULL`. Measurement alone sets `MINIMAL`, Branch's
 * analytics-only level. Anything else, including pending consent, sets `NONE`,
 * which keeps deep links working. In `setDMAParamsForEEA`, pass your own EEA
 * flag, since c15t's policy model is not a legal jurisdiction flag, then
 * `adPersonalization` and `adUserData`. Requires `react-native-branch` 6.5 or
 * later.
 *
 * @param branch - App-owned wrapper around `react-native-branch`.
 * @param options - Error handler and optional native client.
 * @returns An app-lifetime connection.
 * @example
 * ```ts
 * const consent = connectBranch(branchClient, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectBranch = (
	branch: BranchClient,
	options: BranchOptions
): ConsentIntegration =>
	connectConsentState(
		options,
		(isAllowed) => ({
			ads: resolveGoogleAdsConsent(isAllowed),
			level: attributionLevel(isAllowed),
		}),
		async (current) => {
			const state = current();
			// Lower the level before sending denials; send grants before raising it.
			if (state.level === 'FULL') {
				await branch.setDMAParamsForEEA(state.ads);
				const now = current();
				await branch.setConsumerProtectionAttributionLevel(now.level);
				return { ads: state.ads, level: now.level };
			}
			await branch.setConsumerProtectionAttributionLevel(state.level);
			await branch.setDMAParamsForEEA(state.ads);
			return state;
		}
	);
