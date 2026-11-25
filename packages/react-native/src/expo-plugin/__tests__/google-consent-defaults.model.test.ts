import type { AndroidConfig } from 'expo/config-plugins';
import { describe, expect, it } from 'vite-plus/test';

import {
	applyGoogleConsentDefaultsToApplication,
	applyGoogleConsentDefaultsToInfoPlist,
} from '../google-consent-defaults.model';
import {
	GOOGLE_CONSENT_META_DATA,
	GOOGLE_CONSENT_PLIST_DEFAULTS,
} from './helpers';

describe('Consent Mode v2 defaults', () => {
	it('denies a type the host granted by default in Info.plist', () => {
		const plist = applyGoogleConsentDefaultsToInfoPlist({
			CFBundleName: 'Demo',
			GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_STORAGE: true,
		});

		expect(plist).toStrictEqual({
			CFBundleName: 'Demo',
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
		});
	});

	it('replaces a host default once and keeps other meta-data', () => {
		const application: AndroidConfig.Manifest.ManifestApplication = {
			$: { 'android:name': '.MainApplication' },
			'meta-data': [
				{
					$: {
						'android:name': 'google_analytics_default_allow_ad_storage',
						'android:value': 'true',
					},
				},
				{ $: { 'android:name': 'other', 'android:value': 'kept' } },
			],
		};

		applyGoogleConsentDefaultsToApplication(application);
		applyGoogleConsentDefaultsToApplication(application);

		expect(application['meta-data']).toStrictEqual([
			{ $: { 'android:name': 'other', 'android:value': 'kept' } },
			...GOOGLE_CONSENT_META_DATA,
		]);
	});
});
