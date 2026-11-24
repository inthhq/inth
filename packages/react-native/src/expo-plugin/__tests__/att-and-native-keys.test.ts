import { join } from 'node:path';

import { AndroidConfig } from 'expo/config-plugins';
import { describe, expect, it, vi } from 'vite-plus/test';

import { applyParamsOnConfig } from '../with-inth';
import {
	FIXTURE_DIR,
	PREBUILD_ARGV,
	WITH_POLICY,
	applyToFixture,
	fixtureConfig,
	runInfoPlist,
	runMod,
	GOOGLE_CONSENT_META_DATA_NAMES,
	GOOGLE_CONSENT_PLIST_DEFAULTS,
} from './helpers';

const BACKEND = 'https://acme.inth.app';
const ATT_PROPS = {
	enableAppTrackingTransparency: true,
	projectUrl: BACKEND,
	skAdNetworkIdentifiers: ['cstr6suwn9.skadnetwork', '4f3dc5j5db.skadnetwork'],
	trackingUsageDescription: 'We use your activity to pick the ads you see.',
} as const;

const readFixtureManifest = function readFixtureManifest() {
	return AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
};

const metaNamesOf = function metaNamesOf(
	manifest: AndroidConfig.Manifest.AndroidManifest
): string[] {
	const application =
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
	return (application['meta-data'] ?? []).map(
		(entry) => entry.$['android:name'] as string
	);
};

const providerOf = function providerOf(
	manifest: AndroidConfig.Manifest.AndroidManifest
) {
	return (
		AndroidConfig.Manifest.getMainApplicationOrThrow(
			manifest
		) as AndroidConfig.Manifest.ManifestApplication & {
			provider?: unknown[];
		}
	).provider;
};

describe('App Tracking Transparency', () => {
	it('writes the exact prompt and SKAdNetwork items when opted in', async () => {
		const applied = await runInfoPlist(applyToFixture(ATT_PROPS));

		expect(applied.ios?.infoPlist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			NSUserTrackingUsageDescription:
				'We use your activity to pick the ads you see.',
			SKAdNetworkItems: [
				{ SKAdNetworkIdentifier: 'cstr6suwn9.skadnetwork' },
				{ SKAdNetworkIdentifier: '4f3dc5j5db.skadnetwork' },
			],
			'com.inth.backend.url': BACKEND,
		});
	});

	it('declares tracking and the backend host once opted in', () => {
		const config = applyToFixture(ATT_PROPS);

		expect(config.ios?.privacyManifests).toStrictEqual({
			NSPrivacyTracking: true,
			NSPrivacyTrackingDomains: ['acme.inth.app'],
		});
	});

	it('writes neither prompt nor SKAdNetwork items when opted out', async () => {
		const applied = await runInfoPlist(
			applyToFixture({
				...ATT_PROPS,
				enableAppTrackingTransparency: false,
			})
		);

		expect(applied.ios?.infoPlist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			'com.inth.backend.url': BACKEND,
		});
	});

	it('treats consent configuration as nothing to do with ATT', async () => {
		// The opt-out above is the whole point: identifiers were offered, and with
		// the flag off the binary must not carry the prompt they belong to.
		const applied = await runInfoPlist(
			applyToFixture({
				forceGPC: true,
				projectUrl: BACKEND,
				skAdNetworkIdentifiers: ['cstr6suwn9.skadnetwork'],
			})
		);

		expect(applied.ios?.infoPlist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			'com.inth.backend.url': BACKEND,
			'com.inth.forceGPC': true,
		});
	});

	it('keeps a prompt the host wrote and unions the identifiers', async () => {
		const applied = await runMod(
			applyToFixture(ATT_PROPS),
			'ios',
			'infoPlist',
			{
				NSUserTrackingUsageDescription: 'Host copy, reviewed by legal.',
				SKAdNetworkItems: [
					{ SKAdNetworkIdentifier: 'l9udre998ab.skadnetwork' },
				],
			}
		);

		expect(applied.ios?.infoPlist).toMatchObject({
			NSUserTrackingUsageDescription: 'Host copy, reviewed by legal.',
			SKAdNetworkItems: [
				{ SKAdNetworkIdentifier: 'l9udre998ab.skadnetwork' },
				{ SKAdNetworkIdentifier: 'cstr6suwn9.skadnetwork' },
				{ SKAdNetworkIdentifier: '4f3dc5j5db.skadnetwork' },
			],
		});
	});

	it('unions domains the host already declared for its own trackers', () => {
		const config = applyParamsOnConfig(
			{
				...fixtureConfig(),
				ios: {
					bundleIdentifier: 'com.example.consentdemo',
					privacyManifests: {
						NSPrivacyAccessedAPITypes: [
							{
								NSPrivacyAccessedAPIType:
									'NSPrivacyAccessedAPICategoryFileTimestamp',
								NSPrivacyAccessedAPITypeReasons: ['C617.1'],
							},
						],
						NSPrivacyTrackingDomains: ['ads.example.com'],
					},
				},
			},
			ATT_PROPS,
			{ argv: PREBUILD_ARGV, env: {}, projectRoot: FIXTURE_DIR }
		);

		expect(config.ios?.privacyManifests).toStrictEqual({
			NSPrivacyAccessedAPITypes: [
				{
					NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
					NSPrivacyAccessedAPITypeReasons: ['C617.1'],
				},
			],
			NSPrivacyTracking: true,
			NSPrivacyTrackingDomains: ['ads.example.com', 'acme.inth.app'],
		});
	});

	it('refuses a prompt string it would have to invent', () => {
		expect(() =>
			applyToFixture({
				enableAppTrackingTransparency: true,
				projectUrl: BACKEND,
			})
		).toThrowError(/needs trackingUsageDescription/u);
	});

	it('refuses an identifier that is not an SKAdNetwork identifier', () => {
		expect(() =>
			applyToFixture({
				...ATT_PROPS,
				skAdNetworkIdentifiers: ['https://cstr6suwn9.skadnetwork'],
			})
		).toThrowError(/must look like/u);
	});

	it('refuses tracking domains with no tracking prompt to back them', () => {
		expect(() =>
			applyToFixture({
				privacyTrackingDomains: ['ads.example.com'],
				projectUrl: BACKEND,
			})
		).toThrowError(/without\s+enableAppTrackingTransparency/u);
	});

	it('refuses a tracking domain list that leaves the backend out', () => {
		expect(() =>
			applyToFixture({
				...ATT_PROPS,
				privacyTrackingDomains: ['ads.example.com'],
			})
		).toThrowError(/must list acme\.inth\.app/u);
	});
});

describe('the native keys', () => {
	it('writes the project URL and no mode key', async () => {
		const config = applyToFixture({ projectUrl: ' Acme.Inth.App/ ' });
		const plist = (await runInfoPlist(config)).ios?.infoPlist;
		const manifest = (
			await runMod(config, 'android', 'manifest', await readFixtureManifest())
		).modResults as AndroidConfig.Manifest.AndroidManifest;

		expect(plist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			'com.inth.backend.url': BACKEND,
		});
		expect(config.extra?.inth).toMatchObject({
			dryRun: false,
			projectUrl: BACKEND,
		});
		expect(config.extra?.inth).not.toHaveProperty('mode');
		expect(metaNamesOf(manifest)).toStrictEqual([
			'expo.modules.updates.ENABLED',
			'com.inth.BACKEND_URL',
			...GOOGLE_CONSENT_META_DATA_NAMES,
		]);
		expect(providerOf(manifest)).toHaveLength(1);
	});

	it('keeps the in-code policy beside the project URL', async () => {
		const config = applyToFixture(WITH_POLICY);
		const plist = (await runInfoPlist(config)).ios?.infoPlist;
		const manifest = (
			await runMod(config, 'android', 'manifest', await readFixtureManifest())
		).modResults as AndroidConfig.Manifest.AndroidManifest;

		expect(plist).toStrictEqual({
			...GOOGLE_CONSENT_PLIST_DEFAULTS,
			ITSAppUsesNonExemptEncryption: false,
			'com.inth.backend.url': BACKEND,
			'com.inth.policy.rules': 'inth-policy-rules.json',
		});
		expect(metaNamesOf(manifest)).toStrictEqual([
			'expo.modules.updates.ENABLED',
			'com.inth.POLICY_RULES',
			'com.inth.BACKEND_URL',
			...GOOGLE_CONSENT_META_DATA_NAMES,
		]);
	});

	it('writes the dryRun flag, takes a loopback URL and warns once', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const props = {
				dryRun: true,
				projectUrl: 'http://localhost:8787/api/self-host/',
			};
			const config = applyToFixture(props);
			applyToFixture(props);
			const plist = (await runInfoPlist(config)).ios?.infoPlist;
			const manifest = (
				await runMod(config, 'android', 'manifest', await readFixtureManifest())
			).modResults as AndroidConfig.Manifest.AndroidManifest;

			expect(plist).toStrictEqual({
				...GOOGLE_CONSENT_PLIST_DEFAULTS,
				ITSAppUsesNonExemptEncryption: false,
				'com.inth.backend.url': 'http://localhost:8787/api/self-host',
				'com.inth.dryRun': true,
			});
			expect(
				AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)['meta-data']
			).toContainEqual({
				$: { 'android:name': 'com.inth.DRY_RUN', 'android:value': 'true' },
			});
			expect(config.extra?.inth).toMatchObject({
				dryRun: true,
				projectUrl: 'http://localhost:8787/api/self-host',
			});
			const warnings = warn.mock.calls.filter(([message]) =>
				String(message).includes('dryRun is on')
			);
			expect(warnings).toHaveLength(1);
			expect(String(warnings[0]?.[0])).toContain(
				'a release build will refuse to start Inth'
			);
		} finally {
			warn.mockRestore();
		}
	});

	it('refuses the same loopback URL without dryRun', () => {
		expect(() =>
			applyToFixture({ projectUrl: 'http://localhost:8787/api/self-host' })
		).toThrowError(
			/projectUrl must be the project URL from your Inth dashboard/u
		);
	});

	it('leaves the core unstarted when the native app installs it', async () => {
		const config = applyToFixture({
			autoBootstrap: false,
			projectUrl: BACKEND,
		});
		const plist = (await runInfoPlist(config)).ios?.infoPlist;
		const manifest = (
			await runMod(config, 'android', 'manifest', await readFixtureManifest())
		).modResults as AndroidConfig.Manifest.AndroidManifest;

		expect(plist).toMatchObject({
			'com.inth.backend.url': BACKEND,
			'com.inth.reactnative.AutoBootstrap': false,
		});
		expect(metaNamesOf(manifest)).toStrictEqual([
			'expo.modules.updates.ENABLED',
			'com.inth.BACKEND_URL',
			'com.inth.reactnative.AUTO_BOOTSTRAP',
			...GOOGLE_CONSENT_META_DATA_NAMES,
		]);
		expect(providerOf(manifest)).toBeUndefined();
	});

	it('writes the force-GPC switch in each platform spelling', async () => {
		const config = applyToFixture({ forceGPC: true, projectUrl: BACKEND });
		const manifest = (
			await runMod(config, 'android', 'manifest', await readFixtureManifest())
		).modResults as AndroidConfig.Manifest.AndroidManifest;
		const application =
			AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

		expect((await runInfoPlist(config)).ios?.infoPlist).toMatchObject({
			'com.inth.forceGPC': true,
		});
		expect(application['meta-data']).toContainEqual({
			$: {
				'android:name': 'com.inth.FORCE_GPC',
				'android:value': 'true',
			},
		});
	});

	it('keeps the property on both platforms', async () => {
		const config = applyToFixture({
			projectUrl: BACKEND,
			property: 'com.acme.app',
		});
		const manifest = (
			await runMod(config, 'android', 'manifest', await readFixtureManifest())
		).modResults as AndroidConfig.Manifest.AndroidManifest;

		expect((await runInfoPlist(config)).ios?.infoPlist).toMatchObject({
			'com.inth.backend.property': 'com.acme.app',
		});
		expect(
			AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)['meta-data']
		).toContainEqual({
			$: {
				'android:name': 'com.inth.BACKEND_PROPERTY',
				'android:value': 'com.acme.app',
			},
		});
	});

	it.each(['hosted', 'selfHosted', 'offline', 'custom'])(
		'refuses the retired mode %s before anything is written',
		(mode) => {
			expect(() =>
				applyToFixture({ mode, projectUrl: BACKEND } as never)
			).toThrowError(new RegExp(`mode '${mode}' was removed`, 'u'));
		}
	);
});
