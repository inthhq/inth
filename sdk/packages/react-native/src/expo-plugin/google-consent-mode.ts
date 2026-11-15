import type { AndroidConfig, InfoPlist } from 'expo/config-plugins';

/**
 * Google Analytics for Firebase's Consent Mode v2 default keys in `Info.plist`.
 *
 * Firebase reads these at launch, before c15t's helper sends the first
 * `setConsent`. Each one is `false`, so nothing is granted before consent is
 * read.
 */
export const IOS_GOOGLE_CONSENT_DEFAULT_KEYS = [
	'GOOGLE_ANALYTICS_DEFAULT_ALLOW_ANALYTICS_STORAGE',
	'GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_STORAGE',
	'GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_USER_DATA',
	'GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_PERSONALIZATION_SIGNALS',
] as const;

/** The same defaults as `<meta-data>` names in `AndroidManifest.xml`. */
export const ANDROID_GOOGLE_CONSENT_DEFAULT_KEYS = [
	'google_analytics_default_allow_analytics_storage',
	'google_analytics_default_allow_ad_storage',
	'google_analytics_default_allow_ad_user_data',
	'google_analytics_default_allow_ad_personalization_signals',
] as const;

/**
 * Deny every Consent Mode v2 type by default in `Info.plist`.
 *
 * @param infoPlist - The parsed `Info.plist`.
 * @returns A copy with each default key set to `false`.
 */
export const applyGoogleConsentDefaultsToInfoPlist =
	function applyGoogleConsentDefaultsToInfoPlist(
		infoPlist: InfoPlist
	): InfoPlist {
		const next: InfoPlist = { ...infoPlist };
		for (const key of IOS_GOOGLE_CONSENT_DEFAULT_KEYS) {
			next[key] = false;
		}
		return next;
	};

/**
 * Deny every Consent Mode v2 type by default in the main application.
 *
 * React Native Firebase's analytics library declares the same `<meta-data>`
 * from `firebase.json`, with `true` when a key is absent there. Each entry
 * carries `tools:replace="android:value"` so the app's `false` wins the
 * manifest merge instead of failing it.
 *
 * @param application - The main `<application>` element. The manifest must
 * already declare the `tools` namespace.
 */
export const applyGoogleConsentDefaultsToApplication =
	function applyGoogleConsentDefaultsToApplication(
		application: AndroidConfig.Manifest.ManifestApplication
	): void {
		const kept = (application['meta-data'] ?? []).filter(
			(item) =>
				!(ANDROID_GOOGLE_CONSENT_DEFAULT_KEYS as readonly string[]).includes(
					item.$['android:name']
				)
		);
		application['meta-data'] = [
			...kept,
			...ANDROID_GOOGLE_CONSENT_DEFAULT_KEYS.map((name) => ({
				$: {
					'android:name': name,
					'android:value': 'false',
					'tools:replace': 'android:value',
				},
			})),
		];
	};
