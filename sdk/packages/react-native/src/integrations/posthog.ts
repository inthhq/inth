import { connectConsentIntegration } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';

/** PostHog's native opt-in/out methods, supplied by the app's existing client. */
export interface PostHogClient {
	/** Enable event capture. */
	optIn: () => void | Promise<void>;
	/** Disable event capture. */
	optOut: () => void | Promise<void>;
}

/**
 * Keep PostHog event capture in sync with native category permission.
 * Configure the client before connecting it. Opt-out controls capture and does
 * not guarantee that PostHog stops configuration or feature-flag requests.
 *
 * @param posthog - The app's PostHog client, initialized with capture disabled.
 * @param options - Category, error handler and optional native client.
 * @returns An app-lifetime subscription. Await `ready` before capturing events.
 */
export const connectPostHog = (
	posthog: PostHogClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectConsentIntegration(options, async (isAllowed) => {
		if (!isAllowed()) {
			await posthog.optOut();
			return false;
		}
		await posthog.optIn();
		// An async opt-in may finish after permission was withdrawn.
		if (!isAllowed()) {
			await posthog.optOut();
			return false;
		}
		return true;
	});
