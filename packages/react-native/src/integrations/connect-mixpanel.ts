import { connectConsentIntegration } from './connect-consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './connect-consent-integration';

/** App-owned Mixpanel client. No Mixpanel dependency is loaded by Inth. */
export interface MixpanelClient {
	/** Enable tracking. Mixpanel emits an opt-in event. */
	optInTracking: () => void | Promise<void>;
	/** Disable tracking through Mixpanel's supported API. */
	optOutTracking: () => void | Promise<void>;
}

/**
 * Keep Mixpanel tracking in sync with one native category.
 *
 * Initialize Mixpanel opted out before connecting. Its persisted runtime state
 * can override a disabled startup default. Unchanged native permission does not
 * submit another command. Construction with a grant, a later grant and explicit
 * sync can submit optInTracking, which emits Mixpanel's opt-in event. Native
 * opt-out can clear data or flush earlier queued data, depending on platform.
 * Inth submits no extra flush before withdrawal.
 *
 * Mixpanel's RN setters return void and discard their native promises. The helper
 * serializes command submission, but ready, sync and disconnect cannot confirm
 * native completion or report asynchronous native errors from those methods.
 * Keep app-side event calls behind current permission too.
 *
 * @param mixpanel - The configured Mixpanel client used by the app.
 * @param options - Category, error handler and optional native consent client.
 * @returns An app-lifetime connection. Ready confirms initial command submission.
 * @example
 * ```ts
 * const consent = connectMixpanel(mixpanel, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectMixpanel = (
	mixpanel: MixpanelClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectConsentIntegration(options, async (isAllowed) => {
		if (!isAllowed()) {
			await mixpanel.optOutTracking();
			return false;
		}
		await mixpanel.optInTracking();
		if (!isAllowed()) {
			await mixpanel.optOutTracking();
			return false;
		}
		return true;
	});
