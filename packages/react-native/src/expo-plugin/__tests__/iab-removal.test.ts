import { join } from 'node:path';

import { AndroidConfig } from 'expo/config-plugins';
import { expect, it } from 'vitest';

import { applyAndroidManifest } from '../android';
import { ANDROID_IAB_META_KEYS, IOS_IAB_PLIST_KEYS } from '../constants';
import { applyInfoPlist } from '../ios';
import { resolveParams } from '../params';
import { FIXTURE_DIR } from './helpers';

const projectUrl = 'https://demo.inth.app';
const withIab = resolveParams({
	iab: {
		cmpId: 1234,
		cmpVersion: 7,
		consentScreen: 3,
		publisherCountryCode: 'DE',
	},
	projectUrl,
});
const withoutConsentScreen = resolveParams({
	iab: { cmpId: 1234, cmpVersion: 7, publisherCountryCode: 'DE' },
	projectUrl,
});
const withoutIab = resolveParams({ projectUrl });

it('removing iab on incremental prebuild clears the earlier CMP identity', async () => {
	const firstPlist = applyInfoPlist(withIab, {
		CFBundleDisplayName: 'Privacy demo',
	});
	for (const key of IOS_IAB_PLIST_KEYS) {
		expect(firstPlist).toHaveProperty(key);
	}
	const partialPlist = applyInfoPlist(withoutConsentScreen, firstPlist);
	expect(partialPlist).not.toHaveProperty('com.inth.iab.consentScreen');
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
	expect(names()).not.toContain('com.inth.IAB_CONSENT_SCREEN');
	applyAndroidManifest(withoutIab, manifest);
	for (const key of ANDROID_IAB_META_KEYS) {
		expect(names()).not.toContain(key);
	}
});

it('removes the retired keys from a native project that was not regenerated', async () => {
	const plist = applyInfoPlist(resolveParams({ projectUrl }), {
		CFBundleDisplayName: 'Privacy demo',
		'com.inth.backend.domain': 'app.example.com',
		'com.inth.backend.initUrl': 'https://app.example.com/api/init',
		'com.inth.backend.mode': 'selfHosted',
		'com.inth.backend.url': 'https://consent.example.com/inth',
	});
	expect(plist).toStrictEqual({
		CFBundleDisplayName: 'Privacy demo',
		'com.inth.backend.url': projectUrl,
	});

	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	const application =
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
	for (const [name, value] of [
		['com.inth.MODE', 'offline'],
		['com.inth.BACKEND_INIT_URL', 'https://app.example.com/api/init'],
		['com.inth.BACKEND_DOMAIN', 'app.example.com'],
		['com.inth.BACKEND_URL', 'https://consent.example.com/inth'],
	] as const) {
		AndroidConfig.Manifest.addMetaDataItemToMainApplication(
			application,
			name,
			value
		);
	}
	applyAndroidManifest(resolveParams({ projectUrl }), manifest);
	const entries = (application['meta-data'] ?? [])
		.filter((item) => item.$['android:name'].startsWith('com.inth.'))
		.map((item) => [item.$['android:name'], item.$['android:value']]);
	expect(entries).toStrictEqual([['com.inth.BACKEND_URL', projectUrl]]);
});

it('writes the dryRun flag on both platforms only while it is on', async () => {
	const on = resolveParams({
		dryRun: true,
		projectUrl: 'http://localhost:8787',
	});
	const off = resolveParams({ projectUrl });

	const plist = applyInfoPlist(on, {});
	expect(plist['com.inth.dryRun']).toBe(true);
	expect(plist['com.inth.backend.url']).toBe('http://localhost:8787');
	expect(applyInfoPlist(off, plist)).not.toHaveProperty('com.inth.dryRun');

	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	const value = (name: string) =>
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)[
			'meta-data'
		]?.find((item) => item.$['android:name'] === name)?.$['android:value'];
	applyAndroidManifest(on, manifest);
	expect(value('com.inth.DRY_RUN')).toBe('true');
	expect(value('com.inth.BACKEND_URL')).toBe('http://localhost:8787');
	applyAndroidManifest(off, manifest);
	expect(value('com.inth.DRY_RUN')).toBeUndefined();
	expect(value('com.inth.BACKEND_URL')).toBe(projectUrl);
});
