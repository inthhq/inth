import { connectConsentIntegration, settleAll } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';

/** The Meta SDK functions supplied by the app. No vendor dependency is loaded. */
export interface MetaAppEventsClient {
	/** Call `Settings.setAutoLogAppEventsEnabled`. */
	setAutoLogAppEventsEnabled: (enabled: boolean) => void | Promise<void>;
	/** Call `Settings.setAdvertiserIDCollectionEnabled`. */
	setAdvertiserIDCollectionEnabled: (enabled: boolean) => void | Promise<void>;
	/** Turn Limited Data Use on or off with `Settings.setDataProcessingOptions`. */
	setLimitedDataUse: (limited: boolean) => void | Promise<void>;
}

/**
 * Keep the Meta (Facebook) SDK's automatic App Events, advertiser ID collection
 * and Limited Data Use in sync with one native category.
 *
 * While the category is denied or pending, the helper turns off automatic App
 * Events and advertiser ID collection and turns on Limited Data Use. When it is
 * granted, it turns Limited Data Use off and both settings on. For
 * `setLimitedDataUse`, call `Settings.setDataProcessingOptions(['LDU'], 0, 0)`
 * when it is `true` and `Settings.setDataProcessingOptions([])` when it is
 * `false`. Marketing is the default, as for the web's Meta Pixel. On
 * withdrawal all three calls are made even if one fails.
 *
 * Turn both settings off in the native projects so nothing runs before
 * JavaScript connects. Events the app logs itself need their own consent check.
 *
 * @param meta - App-owned wrapper around `react-native-fbsdk-next`.
 * @param options - Category, error handler and optional native client.
 * @returns An app-lifetime connection.
 * @example
 * ```ts
 * const consent = connectMetaAppEvents(metaClient, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectMetaAppEvents = (
	meta: MetaAppEventsClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration => {
	const deny = async () => {
		await settleAll([
			() => meta.setAutoLogAppEventsEnabled(false),
			() => meta.setAdvertiserIDCollectionEnabled(false),
			() => meta.setLimitedDataUse(true),
		]);
		return false;
	};
	return connectConsentIntegration(
		options,
		async (isAllowed) => {
			if (!isAllowed()) {
				return deny();
			}
			await meta.setLimitedDataUse(false);
			if (!isAllowed()) {
				return deny();
			}
			await meta.setAdvertiserIDCollectionEnabled(true);
			if (!isAllowed()) {
				return deny();
			}
			await meta.setAutoLogAppEventsEnabled(true);
			if (!isAllowed()) {
				return deny();
			}
			return true;
		},
		'marketing'
	);
};
