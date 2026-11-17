import { connectConsentIntegration } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';

/** The Amplitude function supplied by the app. No vendor dependency is loaded. */
export interface AmplitudeClient {
	/** Apply Amplitude's tracking opt-out state. */
	setOptOut: (optOut: boolean) => void | Promise<void>;
}

/**
 * Keep Amplitude Analytics opt-out in sync with one native category.
 *
 * Initialize Amplitude with optOut enabled, then connect the same initialized
 * instance or its modular function. This helper does not initialize Amplitude or
 * configure session replay, advertising identifiers or other products. Configure
 * those independently before starting the vendor. Call sync after vendor reset.
 *
 * @param amplitude - App-owned Amplitude instance or modular function wrapper.
 * @param options - Category, error handler and optional native consent client.
 * @returns An app-lifetime connection. Await ready before tracking events.
 * @example
 * ```ts
 * const consent = connectAmplitude({ setOptOut }, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectAmplitude = (
	amplitude: AmplitudeClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectConsentIntegration(options, async (isAllowed) => {
		if (!isAllowed()) {
			await amplitude.setOptOut(true);
			return false;
		}
		await amplitude.setOptOut(false);
		if (!isAllowed()) {
			await amplitude.setOptOut(true);
			return false;
		}
		return true;
	});
