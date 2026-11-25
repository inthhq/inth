import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AndroidConfig } from 'expo/config-plugins';
import { describe, expect, it } from 'vite-plus/test';

import { createConsentTheme } from '../../components/theme/create-consent-theme';
import type { ConsentThemeOptions } from '../../components/theme/create-consent-theme';
import { InthPluginError } from '../inth-plugin-error';
import type { InthPluginProps } from '../params';
import {
	JS_ONLY_COLOR_NAMES,
	THEME_COLOR_KEYS,
	THEME_OWNED_KEYS,
	THEME_SLOT_FIELDS,
	THEME_SLOTS,
	resolveTheme,
} from '../with-inth-theme';
import type { InthThemePluginProps } from '../with-inth-theme';
import { FIXTURE_DIR, applyToFixture, runInfoPlist, runMod } from './helpers';

const NATIVE_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../..'
);

const BACKEND = 'https://acme.inth.app';

/** A theme that sets every field the prop accepts. */
const FULL_THEME: InthThemePluginProps = {
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

const withTheme = (theme: unknown): InthPluginProps =>
	({ projectUrl: BACKEND, theme }) as InthPluginProps;

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
				entry.$['android:name'].startsWith('com.inth.consent.')
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
					name.startsWith('com.inth.consent.')
				)
			)
		).toStrictEqual({
			'com.inth.consent.brandMark': 'AppMark',
			'com.inth.consent.brandName': 'Acme',
			'com.inth.consent.branding': true,
			'com.inth.consent.brandingMark': 'acme_provider',
			'com.inth.consent.brandingName': 'Acme Consent',
			'com.inth.consent.buttonPrimary.borderRadius': 26,
			'com.inth.consent.buttonPrimary.fontSize': 18,
			'com.inth.consent.buttonSecondary.backgroundColor': '#FFFFFF,#1E1B17',
			'com.inth.consent.buttonSecondary.color': '#172554',
			'com.inth.consent.canvas': '#F8F4EE',
			'com.inth.consent.consentBannerTitle.fontSize': 36,
			'com.inth.consent.decision': '#172554,#DBEAFE',
			'com.inth.consent.fontFamily': 'Inter-Regular',
			'com.inth.consent.fontSizeBase': 18,
			'com.inth.consent.fontSizeLg': 36,
			'com.inth.consent.fontSizeSm': 15,
			'com.inth.consent.headlineFont': 'serif',
			'com.inth.consent.primary': '#2563EB,#60A5FA',
			'com.inth.consent.radiusLg': 22,
			'com.inth.consent.radiusMd': 16,
			'com.inth.consent.radiusSm': 12,
			'com.inth.consent.spaceLg': 28,
			'com.inth.consent.spaceMd': 20,
			'com.inth.consent.spaceSm': 8,
			'com.inth.consent.spaceXl': 40,
			'com.inth.consent.spaceXs': 4,
			'com.inth.consent.surface': '#FFFFFF',
			'com.inth.consent.surfaceMuted': '#EFE9DF',
			'com.inth.consent.text': '#1E1B17',
			'com.inth.consent.textMuted': '#6B655D',
			'com.inth.consent.textOnDecision': '#FFFFFF,#172554',
			'com.inth.consent.textOnPrimary': '#FFFFFF',
		});
	});

	it('writes the same values as Android meta-data', async () => {
		expect(await themedMetaData(FULL_THEME)).toStrictEqual({
			'com.inth.consent.BRANDING': 'true',
			'com.inth.consent.BRANDING_MARK': 'acme_provider',
			'com.inth.consent.BRANDING_NAME': 'Acme Consent',
			'com.inth.consent.BRAND_MARK': 'AppMark',
			'com.inth.consent.BRAND_NAME': 'Acme',
			'com.inth.consent.BUTTON_PRIMARY_BORDER_RADIUS': '26',
			'com.inth.consent.BUTTON_PRIMARY_FONT_SIZE': '18',
			'com.inth.consent.BUTTON_SECONDARY_BACKGROUND_COLOR': '#FFFFFF,#1E1B17',
			'com.inth.consent.BUTTON_SECONDARY_COLOR': '#172554',
			'com.inth.consent.CANVAS': '#F8F4EE',
			'com.inth.consent.CONSENT_BANNER_TITLE_FONT_SIZE': '36',
			'com.inth.consent.DECISION': '#172554,#DBEAFE',
			'com.inth.consent.FONT_FAMILY': 'inter_regular',
			'com.inth.consent.FONT_SIZE_BASE': '18',
			'com.inth.consent.FONT_SIZE_LG': '36',
			'com.inth.consent.FONT_SIZE_SM': '15',
			'com.inth.consent.HEADLINE_FONT': 'serif',
			'com.inth.consent.PRIMARY': '#2563EB,#60A5FA',
			'com.inth.consent.RADIUS_LG': '22',
			'com.inth.consent.RADIUS_MD': '16',
			'com.inth.consent.RADIUS_SM': '12',
			'com.inth.consent.SPACE_LG': '28',
			'com.inth.consent.SPACE_MD': '20',
			'com.inth.consent.SPACE_SM': '8',
			'com.inth.consent.SPACE_XL': '40',
			'com.inth.consent.SPACE_XS': '4',
			'com.inth.consent.SURFACE': '#FFFFFF',
			'com.inth.consent.SURFACE_MUTED': '#EFE9DF',
			'com.inth.consent.TEXT': '#1E1B17',
			'com.inth.consent.TEXT_MUTED': '#6B655D',
			'com.inth.consent.TEXT_ON_DECISION': '#FFFFFF,#172554',
			'com.inth.consent.TEXT_ON_PRIMARY': '#FFFFFF',
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
			Object.keys(plist).filter((name) => name.startsWith('com.inth.consent.'))
		).toStrictEqual(['com.inth.consent.primary', 'com.inth.consent.radiusMd']);
	});

	it('writes hidden identity and attribution as false flags', async () => {
		const plist = await themedPlist({
			brand: { hidden: true },
			branding: { hidden: true, provider: 'inth' },
		});
		expect(plist['com.inth.consent.brand']).toBe(false);
		expect(plist['com.inth.consent.branding']).toBe(false);
		expect(plist['com.inth.consent.brandingProvider']).toBe('inth');
	});

	it('writes the first-layer layout and appearance', async () => {
		const plist = await themedPlist({
			appearance: 'system',
			firstLayer: 'sheet',
			savePlacement: 'top',
		});
		expect(plist['com.inth.consent.savePlacement']).toBe('top');
		expect(plist['com.inth.consent.firstLayer']).toBe('sheet');
		expect(plist['com.inth.consent.appearance']).toBe('system');
	});

	it('replaces stale theme keys but keeps copy keys', async () => {
		const plist = await themedPlist(
			{ colors: { primary: '#2563EB' } },
			{
				'com.inth.consent.headline': 'Host copy',
				'com.inth.consent.radiusMd': 4,
			}
		);
		expect(plist['com.inth.consent.radiusMd']).toBeUndefined();
		expect(plist['com.inth.consent.headline']).toBe('Host copy');
		expect(plist['com.inth.consent.primary']).toBe('#2563EB');
	});

	it('registers no theme write without the prop', async () => {
		const applied = await runInfoPlist(
			applyToFixture({ projectUrl: BACKEND }),
			{
				'com.inth.consent.primary': '#111111',
			}
		);
		expect(
			(applied.modResults as Record<string, unknown>)[
				'com.inth.consent.primary'
			]
		).toBe('#111111');
	});

	it('writes a per-platform headline font to each platform only', async () => {
		const theme = {
			typography: {
				headlineFont: { android: 'inter_bold', ios: 'Inter-Bold' },
			},
		};
		expect((await themedPlist(theme))['com.inth.consent.headlineFont']).toBe(
			'Inter-Bold'
		);
		expect(
			(await themedMetaData(theme))['com.inth.consent.HEADLINE_FONT']
		).toBe('inter_bold');
	});

	it('writes one platform when only that one is named', async () => {
		const theme = { typography: { headlineFont: { ios: 'Inter-Bold' } } };
		expect((await themedPlist(theme))['com.inth.consent.headlineFont']).toBe(
			'Inter-Bold'
		);
		expect(
			(await themedMetaData(theme))['com.inth.consent.HEADLINE_FONT']
		).toBeUndefined();
	});

	it('writes a per-platform body font to each platform only', async () => {
		const theme = {
			typography: {
				fontFamily: { android: 'inter_regular', ios: 'Inter-Regular' },
			},
		};
		expect((await themedPlist(theme))['com.inth.consent.fontFamily']).toBe(
			'Inter-Regular'
		);
		expect((await themedMetaData(theme))['com.inth.consent.FONT_FAMILY']).toBe(
			'inter_regular'
		);
	});

	it('writes one platform when only that one names a body font', async () => {
		const theme = { typography: { fontFamily: { android: 'inter_regular' } } };
		expect(
			(await themedPlist(theme))['com.inth.consent.fontFamily']
		).toBeUndefined();
		expect((await themedMetaData(theme))['com.inth.consent.FONT_FAMILY']).toBe(
			'inter_regular'
		);
	});

	it.each(['inter_regular', '@font/inter_regular'])(
		'writes the one-string body font %s to both platforms',
		async (fontFamily) => {
			const theme = { typography: { fontFamily } };
			expect((await themedPlist(theme))['com.inth.consent.fontFamily']).toBe(
				fontFamily
			);
			expect(
				(await themedMetaData(theme))['com.inth.consent.FONT_FAMILY']
			).toBe(fontFamily);
		}
	);

	it.each(['inter_bold', '@font/inter_bold', 'Serif', 'sans-serif'])(
		'writes the one-string font %s to both platforms',
		async (headlineFont) => {
			const theme = { typography: { headlineFont } };
			expect((await themedPlist(theme))['com.inth.consent.headlineFont']).toBe(
				headlineFont
			);
			expect(
				(await themedMetaData(theme))['com.inth.consent.HEADLINE_FONT']
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
		[
			'an unknown first-layer layout',
			{ firstLayer: 'drawer' },
			/theme\.firstLayer must be one of "page", "sheet", "prompt"/u,
		],
		[
			'an unknown appearance',
			{ appearance: 'dark' },
			/theme\.appearance must be one of "paper", "system"/u,
		],
		[
			'an unknown save placement',
			{ savePlacement: 'left' },
			/theme\.savePlacement must be one of "bottom", "top"/u,
		],
		['a non-object', 'dark', /theme must be an object/u],
	])('refuses %s at prebuild', (_label, theme, message) => {
		expect(() => applyToFixture(withTheme(theme))).toThrowError(message);
		expect(() => resolveTheme(theme)).toThrowError(InthPluginError);
	});
});

/** `static let name = "key"` constants inside one Swift enum body. */
const swiftKeys = function swiftKeys(): Set<string> {
	const source = readFileSync(
		join(NATIVE_ROOT, 'swift/Sources/InthConsentUI/consent-theme.swift'),
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
			'android/inth-consent-ui/src/main/kotlin/com/inth/consentui/consent-theme.kt'
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
			join(NATIVE_ROOT, 'swift/Sources/InthConsentUI/consent-theme.swift'),
			'utf8'
		);
		const kotlin = readFileSync(
			join(
				NATIVE_ROOT,
				'android/inth-consent-ui/src/main/kotlin/com/inth/consentui/consent-theme.kt'
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
		expect(swift).toContain('"com.inth.consent.\\(slot.rawValue).\\(field)"');
		expect(kotlin).toContain('com.inth.consent.$');
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
			'com.inth.consent.headline',
			'com.inth.consent.introduction',
		]);
	});
});
