import { join } from 'node:path';

import { AndroidConfig } from '@expo/config-plugins';
import { expect, it } from 'vitest';

import { applyAndroidManifest } from '../android';
import { ANDROID_IAB_META_KEYS, IOS_IAB_PLIST_KEYS } from '../constants';
import { applyInfoPlist } from '../ios';
import { resolveParams } from '../params';
import { FIXTURE_DIR, OFFLINE } from './helpers';

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

it('refuses IAB, a backend URL and a bundled manifest in no-backend mode', () => {
	const iab = { cmpId: 1234, cmpVersion: 7, publisherCountryCode: 'DE' };
	for (const props of [
		{ iab },
		{ backendURL },
		{ initURL: `${backendURL}/init` },
		{ policyResource: 'c15t-policy.json' },
	]) {
		expect(() => resolveParams({ ...props, ...OFFLINE })).toThrow(
			/mode 'offline' is no-backend mode/u
		);
	}
});

it('removes the offline mode key when a build moves back to a backend', async () => {
	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	const names = () =>
		(
			AndroidConfig.Manifest.getMainApplication(manifest)?.['meta-data'] ?? []
		).map((item) => item.$['android:name']);
	applyAndroidManifest(resolveParams(OFFLINE), manifest);
	expect(names()).toContain('com.c15t.MODE');
	applyAndroidManifest(resolveParams({ backendURL }), manifest);
	expect(names()).not.toContain('com.c15t.MODE');
	expect(names()).toContain('com.c15t.BACKEND_URL');
});
