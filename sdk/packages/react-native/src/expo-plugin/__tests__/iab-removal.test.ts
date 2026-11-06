import { join } from 'node:path';

import { AndroidConfig } from '@expo/config-plugins';
import { expect, it } from 'vitest';

import { applyAndroidManifest } from '../android';
import { ANDROID_IAB_META_KEYS, IOS_IAB_PLIST_KEYS } from '../constants';
import { applyInfoPlist } from '../ios';
import { resolveParams } from '../params';
import { FIXTURE_DIR } from './helpers';

const backendURL = 'https://demo.example.test';
const withIab = resolveParams({
	backendURL,
	iab: {
		cmpId: 1234,
		cmpVersion: 7,
		consentScreen: 3,
		publisherCountryCode: 'DE',
	},
});
const withoutConsentScreen = resolveParams({
	backendURL,
	iab: { cmpId: 1234, cmpVersion: 7, publisherCountryCode: 'DE' },
});
const withoutIab = resolveParams({ backendURL });

it('removing iab on incremental prebuild clears the earlier CMP identity', async () => {
	const firstPlist = applyInfoPlist(withIab, {
		CFBundleDisplayName: 'Privacy demo',
	});
	for (const key of IOS_IAB_PLIST_KEYS) {
		expect(firstPlist).toHaveProperty(key);
	}
	const partialPlist = applyInfoPlist(withoutConsentScreen, firstPlist);
	expect(partialPlist).not.toHaveProperty('com.c15t.iab.consentScreen');
	const nextPlist = applyInfoPlist(withoutIab, firstPlist);
	for (const key of IOS_IAB_PLIST_KEYS) {
		expect(nextPlist).not.toHaveProperty(key);
	}
	expect(nextPlist.CFBundleDisplayName).toBe('Privacy demo');

	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	const application =
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
	const names = () =>
		(application['meta-data'] ?? []).map((item) => item.$['android:name']);
	applyAndroidManifest(withIab, manifest);
	expect(names()).toEqual(expect.arrayContaining([...ANDROID_IAB_META_KEYS]));
	applyAndroidManifest(withoutConsentScreen, manifest);
	expect(names()).not.toContain('com.c15t.IAB_CONSENT_SCREEN');
	applyAndroidManifest(withoutIab, manifest);
	for (const key of ANDROID_IAB_META_KEYS) {
		expect(names()).not.toContain(key);
	}
});

it('refuses an offline Android IAB build, which would start no core', async () => {
	const offline = resolveParams({
		iab: { cmpId: 1234, cmpVersion: 7, publisherCountryCode: 'DE' },
		mode: 'offline',
	});
	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	expect(() => applyAndroidManifest(offline, manifest)).toThrow(
		/iab can't use mode 'offline' on Android/u
	);
	// A backend URL doesn't make it offline on Android: it would go online instead.
	const offlineWithBackend = resolveParams({
		backendURL,
		iab: { cmpId: 1234, cmpVersion: 7, publisherCountryCode: 'DE' },
		mode: 'offline',
	});
	expect(() => applyAndroidManifest(offlineWithBackend, manifest)).toThrow(
		/iab can't use mode 'offline' on Android/u
	);
	// iOS supports offline IAB, so its keys are still written.
	expect(Object.keys(applyInfoPlist(offline, {}))).toContain(
		IOS_IAB_PLIST_KEYS[0]
	);
});
