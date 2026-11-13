import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AndroidConfig } from '@expo/config-plugins';
import { describe, expect, it } from 'vitest';

import { createConsentTheme } from '../../components/theme/create-consent-theme';
import type { ConsentThemeOptions } from '../../components/theme/create-consent-theme';
import { C15tPluginError } from '../errors';
import type { C15tPluginProps } from '../params';
import {
	JS_ONLY_COLOR_NAMES,
	THEME_COLOR_KEYS,
	THEME_OWNED_KEYS,
	THEME_SLOT_FIELDS,
	THEME_SLOTS,
	resolveTheme,
} from '../theme';
import type { C15tThemePluginProps } from '../theme';
import { FIXTURE_DIR, applyToFixture, runInfoPlist, runMod } from './helpers';

const NATIVE_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../native'
);

const BACKEND = 'https://acme.inth.app';

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
	radius: { lg: 22, md: 16, sm: 12 },
	slots: {
		buttonPrimary: { borderRadius: 26, fontSize: 18 },
		buttonSecondary: {
			backgroundColor: { dark: '#1E1B17', light: '#FFFFFF' },
			color: '#172554',
		},
		consentBannerTitle: { fontSize: 36 },
	},
	spacing: { lg: 28, md: 20, sm: 8, xl: 40, xs: 4 },
	typography: {
		fontFamily: { android: 'inter_regular', ios: 'Inter-Regular' },
		fontSize: { base: 18, lg: 36, sm: 15 },
		headlineFont: 'serif',
	},
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
			'com.c15t.consent.brandMark': 'AppMark',
			'com.c15t.consent.brandName': 'Acme',
			'com.c15t.consent.branding': true,
			'com.c15t.consent.brandingMark': 'acme_provider',
			'com.c15t.consent.brandingName': 'Acme Consent',
			'com.c15t.consent.buttonPrimary.borderRadius': 26,
			'com.c15t.consent.buttonPrimary.fontSize': 18,
			'com.c15t.consent.buttonSecondary.backgroundColor': '#FFFFFF,#1E1B17',
			'com.c15t.consent.buttonSecondary.color': '#172554',
			'com.c15t.consent.canvas': '#F8F4EE',
			'com.c15t.consent.consentBannerTitle.fontSize': 36,
			'com.c15t.consent.decision': '#172554,#DBEAFE',
			'com.c15t.consent.fontFamily': 'Inter-Regular',
			'com.c15t.consent.fontSizeBase': 18,
			'com.c15t.consent.fontSizeLg': 36,
			'com.c15t.consent.fontSizeSm': 15,
			'com.c15t.consent.headlineFont': 'serif',
			'com.c15t.consent.primary': '#2563EB,#60A5FA',
			'com.c15t.consent.radiusLg': 22,
			'com.c15t.consent.radiusMd': 16,
			'com.c15t.consent.radiusSm': 12,
			'com.c15t.consent.spaceLg': 28,
			'com.c15t.consent.spaceMd': 20,
			'com.c15t.consent.spaceSm': 8,
			'com.c15t.consent.spaceXl': 40,
			'com.c15t.consent.spaceXs': 4,
			'com.c15t.consent.surface': '#FFFFFF',
			'com.c15t.consent.surfaceMuted': '#EFE9DF',
			'com.c15t.consent.text': '#1E1B17',
			'com.c15t.consent.textMuted': '#6B655D',
			'com.c15t.consent.textOnDecision': '#FFFFFF,#172554',
			'com.c15t.consent.textOnPrimary': '#FFFFFF',
		});
	});

	it('writes the same values as Android meta-data', async () => {
		expect(await themedMetaData(FULL_THEME)).toStrictEqual({
			'com.c15t.consent.BRANDING': 'true',
			'com.c15t.consent.BRANDING_MARK': 'acme_provider',
			'com.c15t.consent.BRANDING_NAME': 'Acme Consent',
			'com.c15t.consent.BRAND_MARK': 'AppMark',
			'com.c15t.consent.BRAND_NAME': 'Acme',
			'com.c15t.consent.BUTTON_PRIMARY_BORDER_RADIUS': '26',
			'com.c15t.consent.BUTTON_PRIMARY_FONT_SIZE': '18',
			'com.c15t.consent.BUTTON_SECONDARY_BACKGROUND_COLOR': '#FFFFFF,#1E1B17',
			'com.c15t.consent.BUTTON_SECONDARY_COLOR': '#172554',
			'com.c15t.consent.CANVAS': '#F8F4EE',
			'com.c15t.consent.CONSENT_BANNER_TITLE_FONT_SIZE': '36',
			'com.c15t.consent.DECISION': '#172554,#DBEAFE',
			'com.c15t.consent.FONT_FAMILY': 'inter_regular',
			'com.c15t.consent.FONT_SIZE_BASE': '18',
			'com.c15t.consent.FONT_SIZE_LG': '36',
			'com.c15t.consent.FONT_SIZE_SM': '15',
			'com.c15t.consent.HEADLINE_FONT': 'serif',
			'com.c15t.consent.PRIMARY': '#2563EB,#60A5FA',
			'com.c15t.consent.RADIUS_LG': '22',
			'com.c15t.consent.RADIUS_MD': '16',
			'com.c15t.consent.RADIUS_SM': '12',
			'com.c15t.consent.SPACE_LG': '28',
			'com.c15t.consent.SPACE_MD': '20',
			'com.c15t.consent.SPACE_SM': '8',
			'com.c15t.consent.SPACE_XL': '40',
			'com.c15t.consent.SPACE_XS': '4',
			'com.c15t.consent.SURFACE': '#FFFFFF',
			'com.c15t.consent.SURFACE_MUTED': '#EFE9DF',
			'com.c15t.consent.TEXT': '#1E1B17',
			'com.c15t.consent.TEXT_MUTED': '#6B655D',
			'com.c15t.consent.TEXT_ON_DECISION': '#FFFFFF,#172554',
			'com.c15t.consent.TEXT_ON_PRIMARY': '#FFFFFF',
		});
	});

	it('takes the object createConsentTheme takes, and writes only what the native screens draw', async () => {
		const shared: ConsentThemeOptions = {
			colors: {
				border: '#E5E5E5',
				overlay: 'rgba(0, 0, 0, 0.5)',
				primary: '#7C3AED',
			},
			dark: { switchTrackActive: '#A78BFA' },
			motion: { enterDuration: 200 },
			radius: { full: 9999, md: 12 },
			typography: { fontWeight: { medium: 600 }, lineHeight: { normal: 1.4 } },
		};
		// The same object styles the React Native components.
		expect(createConsentTheme(shared).colors.border).toBe('#E5E5E5');
		const plist = await themedPlist(shared);
		expect(
			Object.keys(plist).filter((name) => name.startsWith('com.c15t.consent.'))
		).toStrictEqual(['com.c15t.consent.primary', 'com.c15t.consent.radiusMd']);
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
				'com.c15t.consent.headline': 'Host copy',
				'com.c15t.consent.radiusMd': 4,
			}
		);
		expect(plist['com.c15t.consent.radiusMd']).toBeUndefined();
		expect(plist['com.c15t.consent.headline']).toBe('Host copy');
		expect(plist['com.c15t.consent.primary']).toBe('#2563EB');
	});

	it('registers no theme write without the prop', async () => {
		const applied = await runInfoPlist(
			applyToFixture({ backendURL: BACKEND }),
			{ 'com.c15t.consent.primary': '#111111' }
		);
		expect(
			(applied.modResults as Record<string, unknown>)[
				'com.c15t.consent.primary'
			]
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

	it('writes a per-platform body font to each platform only', async () => {
		const theme = {
			typography: {
				fontFamily: { android: 'inter_regular', ios: 'Inter-Regular' },
			},
		};
		expect((await themedPlist(theme))['com.c15t.consent.fontFamily']).toBe(
			'Inter-Regular'
		);
		expect((await themedMetaData(theme))['com.c15t.consent.FONT_FAMILY']).toBe(
			'inter_regular'
		);
	});

	it('writes one platform when only that one names a body font', async () => {
		const theme = { typography: { fontFamily: { android: 'inter_regular' } } };
		expect(
			(await themedPlist(theme))['com.c15t.consent.fontFamily']
		).toBeUndefined();
		expect((await themedMetaData(theme))['com.c15t.consent.FONT_FAMILY']).toBe(
			'inter_regular'
		);
	});

	it.each(['inter_regular', '@font/inter_regular'])(
		'writes the one-string body font %s to both platforms',
		async (fontFamily) => {
			const theme = { typography: { fontFamily } };
			expect((await themedPlist(theme))['com.c15t.consent.fontFamily']).toBe(
				fontFamily
			);
			expect(
				(await themedMetaData(theme))['com.c15t.consent.FONT_FAMILY']
			).toBe(fontFamily);
		}
	);

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
			'a colour neither renderer draws',
			{ colors: { primaryHover: '#E5E5E5' } },
			/theme\.colors has no "primaryHover" field/u,
		],
		[
			'a non-string component colour',
			{ colors: { border: 3 } },
			/theme\.colors\.border must be a colour string/u,
		],
		[
			'a dark value with no light value',
			{ dark: { primary: '#60A5FA' } },
			/theme\.dark\.primary needs theme\.colors\.primary/u,
		],
		['a radius string', { radius: { md: '0.5rem' } }, /theme\.radius\.md/u],
		['a negative radius', { radius: { md: -1 } }, /theme\.radius\.md/u],
		[
			'a radius step neither renderer draws',
			{ radius: { xl: 12 } },
			/theme\.radius has no "xl" field/u,
		],
		['a spacing string', { spacing: { md: '1rem' } }, /theme\.spacing\.md/u],
		[
			'a zero font size',
			{ typography: { fontSize: { base: 0 } } },
			/theme\.typography\.fontSize\.base must be a number of points \(sp on Android\), above 0/u,
		],
		[
			'a web font weight name',
			{ typography: { fontWeight: { bold: 700 } } },
			/theme\.typography\.fontWeight has no "bold" field/u,
		],
		[
			'a web shadow',
			{ shadows: { sm: '0 1px 2px black' } },
			/theme has no "shadows" field/u,
		],
		[
			'a slot the native screens do not restyle',
			{ slots: { consentDialogCard: { color: '#000000' } } },
			/theme\.slots has no "consentDialogCard" field/u,
		],
		[
			'a slot class name',
			{ slots: { buttonPrimary: { className: 'pill' } } },
			/theme\.slots\.buttonPrimary has no "className" field/u,
		],
		[
			'a slot colour pair missing its dark half',
			{ slots: { buttonSecondary: { color: { light: '#000000' } } } },
			/theme\.slots\.buttonSecondary\.color\.dark must be a hex colour/u,
		],
		['copy', { copy: { headline: 'Hi' } }, /theme has no "copy" field/u],
		[
			'one font string Android cannot resolve',
			{ typography: { headlineFont: 'Inter-Bold' } },
			/"Inter-Bold" is not an Android font resource name/u,
		],
		[
			'one body font string Android cannot resolve',
			{ typography: { fontFamily: 'Inter-Regular' } },
			/fontFamily "Inter-Regular" is not an Android font resource name/u,
		],
		[
			'an Android body font that is not a resource name',
			{
				typography: {
					fontFamily: { android: 'Inter-Regular', ios: 'Inter-Regular' },
				},
			},
			/fontFamily\.android "Inter-Regular" is not an Android font resource name/u,
		],
		[
			'a per-platform body font naming neither platform',
			{ typography: { fontFamily: {} } },
			/fontFamily needs ios, android or both/u,
		],
		[
			'a per-platform body font for another platform',
			{ typography: { fontFamily: { web: 'Inter' } } },
			/fontFamily has no "web" field/u,
		],
		[
			'a built-in face as the body font, which native body text cannot use',
			{ typography: { fontFamily: 'serif' } },
			/fontFamily "serif" names a built-in face/u,
		],
		[
			'a built-in face as one platform body font',
			{ typography: { fontFamily: { ios: 'rounded' } } },
			/fontFamily\.ios "rounded" names a built-in face/u,
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

/** Slot keys carry a dot on iOS; the constants list only the flat ones. */
const flatKeys = THEME_OWNED_KEYS.filter(
	(key) => !key.ios.slice(17).includes('.')
);

describe('theme keys', () => {
	it('each has a reader in the native theme sources', () => {
		const ios = swiftKeys();
		const android = kotlinKeys();
		expect(ios.size).toBeGreaterThan(0);
		expect(android.size).toBeGreaterThan(0);
		expect(
			flatKeys.filter((key) => !ios.has(key.ios) || !android.has(key.android))
		).toStrictEqual([]);
	});

	it('name the slots and slot fields the native theme sources read', () => {
		const swift = readFileSync(
			join(NATIVE_ROOT, 'core-swift/Sources/C15tConsentUI/consent-theme.swift'),
			'utf8'
		);
		const kotlin = readFileSync(
			join(
				NATIVE_ROOT,
				'core-android/c15t-consent-ui/src/main/kotlin/com/c15t/consentui/consent-theme.kt'
			),
			'utf8'
		);
		const swiftSlots =
			/enum Slot: String[^{]*\{(?<body>[\S\s]*?)\n {4}\}/u.exec(swift)?.groups
				?.body;
		expect(
			[...(swiftSlots ?? '').matchAll(/case (?<name>\w+)/gu)].map(
				(match) => match.groups?.name
			)
		).toStrictEqual(THEME_SLOTS);
		expect(
			[...kotlin.matchAll(/\w+\("(?<name>\w+)", "(?<meta>[A-Z_]+)"\)/gu)].map(
				(match) => [match.groups?.name, match.groups?.meta]
			)
		).toStrictEqual(
			THEME_SLOTS.map((slot) => [
				slot,
				slot.replace(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase(),
			])
		);
		expect(swift).toContain('"com.c15t.consent.\\(slot.rawValue).\\(field)"');
		expect(kotlin).toContain('com.c15t.consent.$');
		expect(kotlin).toContain('slot.meta}_$field"');
		for (const field of THEME_SLOT_FIELDS) {
			expect(swift).toContain(`InfoPlistKey.slot(slot, "${field}")`);
			expect(kotlin).toContain(
				`Meta.slot(slot, "${field.replace(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase()}")`
			);
		}
	});

	it('accept every colour the React Native components draw', () => {
		const native = Object.keys(THEME_COLOR_KEYS);
		expect(
			Object.keys(createConsentTheme().colors)
				.filter((name) => !native.includes(name))
				.sort()
		).toStrictEqual([...JS_ONLY_COLOR_NAMES].sort());
	});

	it('cover every native theme key except copy', () => {
		const owned = new Set(flatKeys.map((key) => key.ios));
		expect(
			[...swiftKeys()].filter((key) => !owned.has(key)).sort()
		).toStrictEqual([
			'com.c15t.consent.headline',
			'com.c15t.consent.introduction',
		]);
	});
});
