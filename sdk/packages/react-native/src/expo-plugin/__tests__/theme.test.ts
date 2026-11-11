import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AndroidConfig } from '@expo/config-plugins';
import { describe, expect, it } from 'vitest';

import { C15tPluginError } from '../errors';
import type { C15tPluginProps } from '../params';
import { THEME_OWNED_KEYS, resolveTheme } from '../theme';
import type { C15tThemePluginProps } from '../theme';
import { FIXTURE_DIR, applyToFixture, runInfoPlist, runMod } from './helpers';

const NATIVE_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../native'
);

const BACKEND = 'https://consent.example.com';

/** A theme that sets every field the prop accepts. */
const FULL_THEME: C15tThemePluginProps = {
	brand: { mark: 'AppMark', name: 'Acme' },
	branding: { hidden: false, mark: 'acme_provider', name: 'Acme Consent' },
	colors: {
		canvas: '#f8f4ee',
		decision: '#172554',
		primary: '#2563EB',
		surface: '#FFFFFF',
		surfaceMuted: '#EFE9DF',
		text: '#1E1B17',
		textMuted: '#6B655D',
		textOnDecision: '#FFFFFF',
		textOnPrimary: '#FFFFFF',
	},
	dark: { decision: '#DBEAFE', primary: '#60A5FA', textOnDecision: '#172554' },
	radius: { md: 16 },
	typography: { headlineFont: 'serif' },
};

const withTheme = (theme: unknown): C15tPluginProps =>
	({ backendURL: BACKEND, theme }) as C15tPluginProps;

const themedPlist = async function themedPlist(
	theme: unknown,
	infoPlist: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
	const applied = await runInfoPlist(applyToFixture(withTheme(theme)), {
		...infoPlist,
	});
	return applied.modResults as Record<string, unknown>;
};

const themedMetaData = async function themedMetaData(
	theme: unknown
): Promise<Record<string, string>> {
	const applied = await runMod(
		applyToFixture(withTheme(theme)),
		'android',
		'manifest',
		await AndroidConfig.Manifest.readAndroidManifestAsync(
			join(FIXTURE_DIR, 'AndroidManifest.xml')
		)
	);
	const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
		applied.modResults as AndroidConfig.Manifest.AndroidManifest
	);
	return Object.fromEntries(
		(application['meta-data'] ?? [])
			.filter((entry) =>
				entry.$['android:name'].startsWith('com.c15t.consent.')
			)
			.map((entry) => [entry.$['android:name'], entry.$['android:value'] ?? ''])
	);
};

describe('theme prop', () => {
	it('writes the web token names onto the native iOS keys', async () => {
		const plist = await themedPlist(FULL_THEME);

		expect(
			Object.fromEntries(
				Object.entries(plist).filter(([name]) =>
					name.startsWith('com.c15t.consent.')
				)
			)
		).toStrictEqual({
			'com.c15t.consent.accent': '#2563EB,#60A5FA',
			'com.c15t.consent.brandMark': 'AppMark',
			'com.c15t.consent.brandName': 'Acme',
			'com.c15t.consent.branding': true,
			'com.c15t.consent.brandingMark': 'acme_provider',
			'com.c15t.consent.brandingName': 'Acme Consent',
			'com.c15t.consent.canvas': '#F8F4EE',
			'com.c15t.consent.cornerRadius': 16,
			'com.c15t.consent.decision': '#172554,#DBEAFE',
			'com.c15t.consent.headlineFont': 'serif',
			'com.c15t.consent.onAccent': '#FFFFFF',
			'com.c15t.consent.onDecision': '#FFFFFF,#172554',
			'com.c15t.consent.surface': '#FFFFFF',
			'com.c15t.consent.surfaceMuted': '#EFE9DF',
			'com.c15t.consent.text': '#1E1B17',
			'com.c15t.consent.textSecondary': '#6B655D',
		});
	});

	it('writes the same values as Android meta-data', async () => {
		expect(await themedMetaData(FULL_THEME)).toStrictEqual({
			'com.c15t.consent.ACCENT': '#2563EB,#60A5FA',
			'com.c15t.consent.BRANDING': 'true',
			'com.c15t.consent.BRANDING_MARK': 'acme_provider',
			'com.c15t.consent.BRANDING_NAME': 'Acme Consent',
			'com.c15t.consent.BRAND_MARK': 'AppMark',
			'com.c15t.consent.BRAND_NAME': 'Acme',
			'com.c15t.consent.CANVAS': '#F8F4EE',
			'com.c15t.consent.CORNER_RADIUS': '16',
			'com.c15t.consent.DECISION': '#172554,#DBEAFE',
			'com.c15t.consent.HEADLINE_FONT': 'serif',
			'com.c15t.consent.ON_ACCENT': '#FFFFFF',
			'com.c15t.consent.ON_DECISION': '#FFFFFF,#172554',
			'com.c15t.consent.SURFACE': '#FFFFFF',
			'com.c15t.consent.SURFACE_MUTED': '#EFE9DF',
			'com.c15t.consent.TEXT': '#1E1B17',
			'com.c15t.consent.TEXT_SECONDARY': '#6B655D',
		});
	});

	it('writes hidden identity and attribution as false flags', async () => {
		const plist = await themedPlist({
			brand: { hidden: true },
			branding: { hidden: true, provider: 'inth' },
		});
		expect(plist['com.c15t.consent.brand']).toBe(false);
		expect(plist['com.c15t.consent.branding']).toBe(false);
		expect(plist['com.c15t.consent.brandingProvider']).toBe('inth');
	});

	it('replaces stale theme keys but keeps copy keys', async () => {
		const plist = await themedPlist(
			{ colors: { primary: '#2563EB' } },
			{
				'com.c15t.consent.cornerRadius': 4,
				'com.c15t.consent.headline': 'Host copy',
			}
		);
		expect(plist['com.c15t.consent.cornerRadius']).toBeUndefined();
		expect(plist['com.c15t.consent.headline']).toBe('Host copy');
		expect(plist['com.c15t.consent.accent']).toBe('#2563EB');
	});

	it('registers no theme write without the prop', async () => {
		const applied = await runInfoPlist(
			applyToFixture({ backendURL: BACKEND }),
			{ 'com.c15t.consent.accent': '#111111' }
		);
		expect(
			(applied.modResults as Record<string, unknown>)['com.c15t.consent.accent']
		).toBe('#111111');
	});

	it('writes a per-platform headline font to each platform only', async () => {
		const theme = {
			typography: {
				headlineFont: { android: 'inter_bold', ios: 'Inter-Bold' },
			},
		};
		expect((await themedPlist(theme))['com.c15t.consent.headlineFont']).toBe(
			'Inter-Bold'
		);
		expect(
			(await themedMetaData(theme))['com.c15t.consent.HEADLINE_FONT']
		).toBe('inter_bold');
	});

	it('writes one platform when only that one is named', async () => {
		const theme = { typography: { headlineFont: { ios: 'Inter-Bold' } } };
		expect((await themedPlist(theme))['com.c15t.consent.headlineFont']).toBe(
			'Inter-Bold'
		);
		expect(
			(await themedMetaData(theme))['com.c15t.consent.HEADLINE_FONT']
		).toBeUndefined();
	});

	it.each(['inter_bold', '@font/inter_bold', 'Serif', 'sans-serif'])(
		'writes the one-string font %s to both platforms',
		async (headlineFont) => {
			const theme = { typography: { headlineFont } };
			expect((await themedPlist(theme))['com.c15t.consent.headlineFont']).toBe(
				headlineFont
			);
			expect(
				(await themedMetaData(theme))['com.c15t.consent.HEADLINE_FONT']
			).toBe(headlineFont);
		}
	);

	it.each([
		[
			'a CSS colour',
			{ colors: { primary: 'hsl(228, 100%, 60%)' } },
			/#RRGGBB/u,
		],
		['an alpha hex', { colors: { primary: '#2563EBFF' } }, /#RRGGBB/u],
		[
			'a web-only colour',
			{ colors: { border: '#E5E5E5' } },
			/theme\.colors has no "border" field/u,
		],
		[
			'a dark value with no light value',
			{ dark: { primary: '#60A5FA' } },
			/theme\.dark\.primary needs theme\.colors\.primary/u,
		],
		['a radius string', { radius: { md: '0.5rem' } }, /theme\.radius\.md/u],
		['a negative radius', { radius: { md: -1 } }, /theme\.radius\.md/u],
		[
			'a radius the screens do not draw',
			{ radius: { lg: 12 } },
			/theme\.radius has no "lg" field/u,
		],
		[
			'a web font family',
			{ typography: { fontFamily: 'Inter' } },
			/theme\.typography has no "fontFamily" field/u,
		],
		['copy', { copy: { headline: 'Hi' } }, /theme has no "copy" field/u],
		[
			'one font string Android cannot resolve',
			{ typography: { headlineFont: 'Inter-Bold' } },
			/"Inter-Bold" is not an Android font resource name/u,
		],
		[
			'an Android font that is not a resource name',
			{
				typography: {
					headlineFont: { android: 'Inter-Bold', ios: 'Inter-Bold' },
				},
			},
			/headlineFont\.android "Inter-Bold" is not an Android font resource name/u,
		],
		[
			'a per-platform font naming neither platform',
			{ typography: { headlineFont: {} } },
			/headlineFont needs ios, android or both/u,
		],
		[
			'a per-platform font for another platform',
			{ typography: { headlineFont: { web: 'Inter' } } },
			/headlineFont has no "web" field/u,
		],
		[
			'a hidden brand with a name',
			{ brand: { hidden: true, name: 'Acme' } },
			/theme\.brand\.hidden/u,
		],
		[
			'an unknown provider',
			{ branding: { provider: 'acme' } },
			/"c15t" or "inth"/u,
		],
		[
			'a provider and a custom name',
			{ branding: { name: 'Acme', provider: 'inth' } },
			/Set one of them/u,
		],
		[
			'a provider mark without a name',
			{ branding: { mark: 'acme' } },
			/theme\.branding\.mark needs theme\.branding\.name/u,
		],
		['a non-object', 'dark', /theme must be an object/u],
	])('refuses %s at prebuild', (_label, theme, message) => {
		expect(() => applyToFixture(withTheme(theme))).toThrowError(message);
		expect(() => resolveTheme(theme)).toThrowError(C15tPluginError);
	});
});

/** `static let name = "key"` constants inside one Swift enum body. */
const swiftKeys = function swiftKeys(): Set<string> {
	const source = readFileSync(
		join(NATIVE_ROOT, 'core-swift/Sources/C15tConsentUI/consent-theme.swift'),
		'utf8'
	);
	const body = /enum InfoPlistKey\s*\{(?<body>[\S\s]*?)\n {4}\}/u.exec(source)
		?.groups?.body;
	return new Set(
		[...(body ?? '').matchAll(/static let \w+ = "(?<key>[^"]+)"/gu)].map(
			(match) => match.groups?.key ?? ''
		)
	);
};

/** `const val META_* = "key"` constants in the Android theme. */
const kotlinKeys = function kotlinKeys(): Set<string> {
	const source = readFileSync(
		join(
			NATIVE_ROOT,
			'core-android/c15t-consent-ui/src/main/kotlin/com/c15t/consentui/consent-theme.kt'
		),
		'utf8'
	);
	return new Set(
		[...source.matchAll(/const val META_\w+ = "(?<key>[^"]+)"/gu)].map(
			(match) => match.groups?.key ?? ''
		)
	);
};

describe('theme keys', () => {
	it('each has a reader in the native theme sources', () => {
		const ios = swiftKeys();
		const android = kotlinKeys();
		expect(ios.size).toBeGreaterThan(0);
		expect(android.size).toBeGreaterThan(0);
		expect(
			THEME_OWNED_KEYS.filter(
				(key) => !ios.has(key.ios) || !android.has(key.android)
			)
		).toStrictEqual([]);
	});

	it('cover every native theme key except copy', () => {
		const owned = new Set(THEME_OWNED_KEYS.map((key) => key.ios));
		expect(
			[...swiftKeys()].filter((key) => !owned.has(key)).sort()
		).toStrictEqual([
			'com.c15t.consent.headline',
			'com.c15t.consent.introduction',
		]);
	});
});
