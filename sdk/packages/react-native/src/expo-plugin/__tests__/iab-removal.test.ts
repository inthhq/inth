import { join } from 'node:path';

import { AndroidConfig } from '@expo/config-plugins';
import { expect, it } from 'vitest';

import { applyAndroidManifest } from '../android';
import { ANDROID_IAB_META_KEYS, IOS_IAB_PLIST_KEYS } from '../constants';
import { applyInfoPlist } from '../ios';
import { resolveParams } from '../params';
import { FIXTURE_DIR } from './helpers';

const backendURL = 'https://demo.inth.app';
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

it('removes the retired keys from a native project that was not regenerated', async () => {
	const plist = applyInfoPlist(resolveParams({ backendURL }), {
		CFBundleDisplayName: 'Privacy demo',
		'com.c15t.backend.initUrl': 'https://app.example.com/api/init',
		'com.c15t.backend.mode': 'selfHosted',
		'com.c15t.backend.url': 'https://consent.example.com/c15t',
	});
	expect(plist).toStrictEqual({
		CFBundleDisplayName: 'Privacy demo',
		'com.c15t.backend.url': backendURL,
	});

	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	const application =
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
	for (const [name, value] of [
		['com.c15t.MODE', 'offline'],
		['com.c15t.BACKEND_INIT_URL', 'https://app.example.com/api/init'],
		['com.c15t.BACKEND_URL', 'https://consent.example.com/c15t'],
	] as const) {
		AndroidConfig.Manifest.addMetaDataItemToMainApplication(
			application,
			name,
			value
		);
	}
	applyAndroidManifest(resolveParams({ backendURL }), manifest);
	const c15tEntries = (application['meta-data'] ?? [])
		.filter((item) => item.$['android:name'].startsWith('com.c15t.'))
		.map((item) => [item.$['android:name'], item.$['android:value']]);
	expect(c15tEntries).toStrictEqual([['com.c15t.BACKEND_URL', backendURL]]);
});

it('writes the dryRun flag on both platforms only while it is on', async () => {
	const on = resolveParams({
		backendURL: 'http://localhost:8787',
		dryRun: true,
	});
	const off = resolveParams({ backendURL });

	const plist = applyInfoPlist(on, {});
	expect(plist['com.c15t.dryRun']).toBe(true);
	expect(plist['com.c15t.backend.url']).toBe('http://localhost:8787');
	expect(applyInfoPlist(off, plist)).not.toHaveProperty('com.c15t.dryRun');

	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	const value = (name: string) =>
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)[
			'meta-data'
		]?.find((item) => item.$['android:name'] === name)?.$['android:value'];
	applyAndroidManifest(on, manifest);
	expect(value('com.c15t.DRY_RUN')).toBe('true');
	expect(value('com.c15t.BACKEND_URL')).toBe('http://localhost:8787');
	applyAndroidManifest(off, manifest);
	expect(value('com.c15t.DRY_RUN')).toBeUndefined();
	expect(value('com.c15t.BACKEND_URL')).toBe(backendURL);
});
