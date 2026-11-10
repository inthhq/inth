import { connectTrackingAndAds } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';

/** The Singular functions supplied by the app. No vendor dependency is loaded. */
export interface SingularClient {
	/** Call `Singular.limitDataSharing`. */
	limitDataSharing: (limit: boolean) => void | Promise<void>;
	/** Call `Singular.stopAllTracking`. */
	stopAllTracking: () => void | Promise<void>;
	/** Call `Singular.resumeAllTracking`. */
	resumeAllTracking: () => void | Promise<void>;
	/** Call `Singular.trackingOptIn`. */
	trackingOptIn: () => void | Promise<void>;
}

/**
 * Keep Singular tracking and data sharing in sync with native consent.
 *
 * While the category is denied or pending, the helper calls `stopAllTracking`,
 * which Singular keeps across launches. When it is granted, it calls
 * `resumeAllTracking` and `trackingOptIn` once per grant. `limitDataSharing`
 * receives `true` unless `adUserData` and `adPersonalization` are both granted;
 * Singular passes it to Google as the DMA consent signals. Marketing grants
 * both and is the default category.
 *
 * @param singular - App-owned wrapper around `singular-react-native`.
 * @param options - Category, error handler and optional native client.
 * @returns An app-lifetime connection.
 * @example
 * ```ts
 * const consent = connectSingular(Singular, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectSingular = (
	singular: SingularClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectTrackingAndAds(options, async (current, previous) => {
		const state = current();
		const limit = !(state.ads.adUserData && state.ads.adPersonalization);
		if (!state.tracking) {
			await singular.stopAllTracking();
			await singular.limitDataSharing(limit);
			return state;
		}
		await singular.limitDataSharing(limit);
		// A withdrawal during these calls queues the next apply, which stops.
		if (previous?.tracking !== true && current().tracking) {
			await singular.resumeAllTracking();
			await singular.trackingOptIn();
		}
		return state;
	});
