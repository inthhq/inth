import { join } from 'node:path';

import { AndroidConfig, XML } from 'expo/config-plugins';
import { describe, expect, it } from 'vitest';

import { applyAndroidManifest } from '../apply-android-manifest';
import { resolveParams } from '../params';
import {
	FIXTURE_DIR,
	applyToFixture,
	gradleFile,
	readFixture,
	runInfoPlist,
	runMod,
	GOOGLE_CONSENT_META_DATA,
	GOOGLE_CONSENT_PLIST_DEFAULTS,
} from './helpers';

const BACKEND = 'https://acme.inth.app';

/**
 * Android's manifest placeholder for the application id, expanded when the
 * manifest is merged. The dollar sign comes from an expression so the source
 * never holds a bare `${` sequence.
 */
const APPLICATION_ID_PLACEHOLDER = `${'$'}{applicationId}`;

const STANDARD_PROPS = { projectUrl: BACKEND };

const readFixtureManifest = function readFixtureManifest() {
	return AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
};

const applicationOf = function applicationOf(
	manifest: AndroidConfig.Manifest.AndroidManifest
) {
	return AndroidConfig.Manifest.getMainApplicationOrThrow(
		manifest
	) as AndroidConfig.Manifest.ManifestApplication & {
		provider?: { $: Record<string, string> }[];
	};
};

describe('withInth standard install', () => {
	it('writes the exact Info.plist a hosted install needs', async () => {
		const config = applyToFixture(STANDARD_PROPS);
		const applied = await runInfoPlist(config);

		expect(applied.ios?.infoPlist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			'com.inth.backend.url': BACKEND,
		});
	});

	it('publishes the same values to JavaScript through extra', () => {
		const config = applyToFixture(STANDARD_PROPS);

		expect(config.extra).toStrictEqual({
			inth: {
				consentCategories: null,
				dryRun: false,
				enableAppTrackingTransparency: false,
				forceGPC: false,
				projectUrl: BACKEND,
				property: null,
				protocol: {
					maxSupportedProtocolVersion: 1,
					minSupportedProtocolVersion: 1,
					protocolVersion: 1,
				},
			},
			keepMe: true,
		});
	});

	it('declares no tracking in the privacy manifest without ATT', () => {
		const config = applyToFixture(STANDARD_PROPS);

		expect(config.ios?.privacyManifests).toStrictEqual({
			NSPrivacyTracking: false,
			NSPrivacyTrackingDomains: [],
		});
	});

	it('writes the exact Android INTERNET permission and meta-data', async () => {
		const config = applyToFixture(STANDARD_PROPS);
		const applied = await runMod(
			config,
			'android',
			'manifest',
			await readFixtureManifest()
		);
		const manifest =
			applied.modResults as AndroidConfig.Manifest.AndroidManifest;

		expect(manifest.manifest.$['xmlns:tools']).toBe(
			'http://schemas.android.com/tools'
		);
		expect(manifest.manifest['uses-permission']).toStrictEqual([
			{ $: { 'android:name': 'android.permission.SYSTEM_ALERT_WINDOW' } },
			{ $: { 'android:name': 'android.permission.INTERNET' } },
		]);
		expect(applicationOf(manifest)['meta-data']).toStrictEqual([
			{
				$: {
					'android:name': 'expo.modules.updates.ENABLED',
					'android:value': 'true',
				},
			},
			{
				$: {
					'android:name': 'com.inth.BACKEND_URL',
					'android:value': BACKEND,
				},
			},
			...GOOGLE_CONSENT_META_DATA,
		]);
	});

	it('writes a declared vendor scope to both platforms', async () => {
		// One comma-separated string on both platforms, which is the shape each
		// reader parses: InthAndroid.declaredVendors on Android, the bridge's
		// declaredVendors on iOS. Categories get a plist array because that reader
		// takes names; ids do not need one.
		const config = applyToFixture({
			...STANDARD_PROPS,
			vendors: [755, 42, 8],
		});

		const applied = await runInfoPlist(config);
		expect(applied.ios?.infoPlist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			'com.inth.backend.url': BACKEND,
			'com.inth.vendors': '755,42,8',
		});

		const manifestApplied = await runMod(
			config,
			'android',
			'manifest',
			await readFixtureManifest()
		);
		const manifest =
			manifestApplied.modResults as AndroidConfig.Manifest.AndroidManifest;
		expect(applicationOf(manifest)['meta-data']).toContainEqual({
			$: {
				'android:name': 'com.inth.VENDORS',
				'android:value': '755,42,8',
			},
		});
	});

	it('writes IAB settings to both platforms', async () => {
		const config = applyToFixture({
			...STANDARD_PROPS,
			iab: {
				cmpId: 1234,
				cmpVersion: 7,
				consentScreen: 3,
				publisherCountryCode: 'de',
			},
		});

		const applied = await runInfoPlist(config);
		// Plist integers, so the bridge reads them as numbers.
		expect(applied.ios?.infoPlist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			'com.inth.backend.url': BACKEND,
			'com.inth.iab.cmpId': 1234,
			'com.inth.iab.cmpVersion': 7,
			'com.inth.iab.consentScreen': 3,
			'com.inth.iab.publisherCountryCode': 'DE',
		});

		const manifestApplied = await runMod(
			config,
			'android',
			'manifest',
			await readFixtureManifest()
		);
		const metaData = applicationOf(
			manifestApplied.modResults as AndroidConfig.Manifest.AndroidManifest
		)['meta-data'];
		for (const [name, value] of [
			['com.inth.IAB_CMP_ID', '1234'],
			['com.inth.IAB_CMP_VERSION', '7'],
			['com.inth.IAB_CONSENT_SCREEN', '3'],
			['com.inth.IAB_PUBLISHER_COUNTRY_CODE', 'DE'],
		]) {
			expect(metaData).toContainEqual({
				$: { 'android:name': name, 'android:value': value },
			});
		}
	});

	it('writes no consent screen key when the core default applies', async () => {
		const config = applyToFixture({
			...STANDARD_PROPS,
			iab: { cmpId: 1234, cmpVersion: 7, publisherCountryCode: 'DE' },
		});
		const plist = (await runInfoPlist(config)).ios?.infoPlist ?? {};
		expect(plist['com.inth.iab.cmpId']).toBe(1234);
		expect(plist).not.toHaveProperty('com.inth.iab.consentScreen');
	});

	it('writes a declared category scope to both platforms', async () => {
		// The same declaration, spelled the way each reader wants it: a plist
		// array on iOS, a comma-separated meta-data value on Android. The
		// strict-equality tests above already pin that nothing is written when
		// the host declares no scope.
		const config = applyToFixture({
			...STANDARD_PROPS,
			consentCategories: [
				'necessary',
				'functionality',
				'measurement',
				'marketing',
			],
		});

		const applied = await runInfoPlist(config);
		expect(applied.ios?.infoPlist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			'com.inth.backend.url': BACKEND,
			'com.inth.categories': [
				'necessary',
				'functionality',
				'measurement',
				'marketing',
			],
		});

		const manifestApplied = await runMod(
			config,
			'android',
			'manifest',
			await readFixtureManifest()
		);
		const manifest =
			manifestApplied.modResults as AndroidConfig.Manifest.AndroidManifest;
		expect(applicationOf(manifest)['meta-data']).toStrictEqual([
			{
				$: {
					'android:name': 'expo.modules.updates.ENABLED',
					'android:value': 'true',
				},
			},
			{
				$: {
					'android:name': 'com.inth.BACKEND_URL',
					'android:value': BACKEND,
				},
			},
			{
				$: {
					'android:name': 'com.inth.CATEGORIES',
					'android:value': 'necessary,functionality,measurement,marketing',
				},
			},
			...GOOGLE_CONSENT_META_DATA,
		]);
	});

	it('registers the Inth initializer through androidx.startup', async () => {
		const config = applyToFixture(STANDARD_PROPS);
		const applied = await runMod(
			config,
			'android',
			'manifest',
			await readFixtureManifest()
		);
		const manifest =
			applied.modResults as AndroidConfig.Manifest.AndroidManifest;

		expect(applicationOf(manifest).provider).toStrictEqual([
			{
				$: {
					'android:authorities': `${APPLICATION_ID_PLACEHOLDER}.androidx-startup`,
					'android:exported': 'false',
					'android:name': 'androidx.startup.InitializationProvider',
					'tools:node': 'merge',
				},
				'meta-data': [
					{
						$: {
							'android:name': 'com.inth.reactnative.InthReactNativeInitializer',
							'android:value': 'androidx.startup',
						},
					},
				],
			},
		]);
	});

	it('serialises to the manifest text Android reads', async () => {
		const config = applyToFixture(STANDARD_PROPS);
		const applied = await runMod(
			config,
			'android',
			'manifest',
			await readFixtureManifest()
		);
		const xml = XML.format(
			applied.modResults as AndroidConfig.Manifest.AndroidManifest
		);

		expect(xml).toContain(
			'<meta-data android:name="com.inth.BACKEND_URL" android:value="https://acme.inth.app"/>'
		);
		expect(xml).toContain(
			'<uses-permission android:name="android.permission.INTERNET"/>'
		);
		expect(xml).toContain(
			`<provider android:authorities="${APPLICATION_ID_PLACEHOLDER}.androidx-startup"`
		);
	});

	it('leaves gradle SDK levels to the host', async () => {
		// The floor is checked after prebuild (with-android-sdk-floor.test.ts), never
		// rewritten: a level below it was set on purpose and fails loudly.
		const config = applyToFixture(STANDARD_PROPS);
		const files = [
			['projectBuildGradle', 'project-build.gradle'],
			['appBuildGradle', 'app-build.gradle'],
		] as const;
		const applied = await Promise.all(
			files.map(([modName, name]) =>
				runMod(config, 'android', modName, gradleFile(name))
			)
		);
		expect(applied.map((result) => result.modResults.contents)).toStrictEqual(
			files.map(([, name]) => readFixture(name))
		);
	});

	it('is a no-op the second time it runs', async () => {
		const params = resolveParams({
			...STANDARD_PROPS,
			property: 'com.acme.app',
		});
		const once = applyAndroidManifest(params, await readFixtureManifest());
		const twice = applyAndroidManifest(params, once);

		expect(twice).toStrictEqual(once);
	});
});
