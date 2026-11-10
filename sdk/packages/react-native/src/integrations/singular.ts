import { connectTrackingAndAds, settleAll } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';
import type { GoogleAdsConsent } from './google-consent-mode';

/** The Singular functions supplied by the app. No vendor dependency is loaded. */
export interface SingularClient {
	/**
	 * Call `Singular.init` with a `SingularConfig` built with
	 * `withLimitDataSharing(limitDataSharing)`. Called once, on the first grant.
	 */
	start: (limitDataSharing: boolean) => void | Promise<void>;
	/** Call `Singular.limitDataSharing`. */
	limitDataSharing: (limit: boolean) => void | Promise<void>;
	/** Call `Singular.stopAllTracking`. */
	stopAllTracking: () => void | Promise<void>;
	/** Call `Singular.resumeAllTracking`. */
	resumeAllTracking: () => void | Promise<void>;
	/** Call `Singular.trackingOptIn`. */
	trackingOptIn: () => void | Promise<void>;
}

const limitFor = (ads: GoogleAdsConsent): boolean =>
	!(ads.adUserData && ads.adPersonalization);

/**
 * Start Singular only once one category allows it, and keep its tracking and
 * data sharing in sync with native consent.
 *
 * Singular ignores its privacy calls until `Singular.init` has run, and `init`
 * starts a session at once, so the helper owns initialization. Do not call
 * `Singular.init` yourself. On the first grant, the helper calls `start` with
 * the data-sharing limit, then `resumeAllTracking` and `trackingOptIn` once per
 * grant. While the category has never been granted in this app session, the
 * helper makes no Singular call, because Singular is not running. After it has
 * started, withdrawal calls `stopAllTracking`, which Singular keeps across
 * launches, and both withdrawal calls are made even if the first fails.
 *
 * `limitDataSharing` receives `true` unless `adUserData` and
 * `adPersonalization` are both granted; Singular passes it to Google as the DMA
 * consent signals. Marketing grants both and is the default category.
 *
 * @param singular - App-owned wrapper around `singular-react-native`.
 * @param options - Category, error handler and optional native client.
 * @returns An app-lifetime connection.
 * @example
 * ```ts
 * const consent = connectSingular(singularClient, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectSingular = (
	singular: SingularClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration => {
	// Set before start runs, so a withdrawal during start stops what it began.
	let started = false;
	return connectTrackingAndAds(options, async (current, previous) => {
		const state = current();
		if (!state.tracking) {
			if (started) {
				await settleAll([
					() => singular.stopAllTracking(),
					() => singular.limitDataSharing(limitFor(state.ads)),
				]);
			}
			return state;
		}
		if (!started) {
			started = true;
			await singular.start(limitFor(state.ads));
		}
		// Each call that follows reads current consent; a withdrawal is applied next.
		const now = current();
		if (!now.tracking) {
			return state;
		}
		await singular.limitDataSharing(limitFor(now.ads));
		if (previous?.tracking !== true && current().tracking) {
			await singular.resumeAllTracking();
			if (current().tracking) {
				await singular.trackingOptIn();
			}
		}
		return now;
	});
};
