import { withAndroidManifest, withInfoPlist } from '@expo/config-plugins';
import type {
	AndroidConfig,
	ConfigPlugin,
	InfoPlist,
} from '@expo/config-plugins';

import type {
	ConsentNativeSlot,
	ConsentThemeOptions,
} from '../components/theme/create-consent-theme';
import { androidConfig } from './config-plugins';
import { C15tPluginError } from './errors';

/**
 * Colour fields of the `theme` prop that the native consent screens draw.
 *
 * Fields that have a web counterpart take its name from `Theme['colors']` in
 * `@c15t/ui`, which is also the `--c15t-*` custom property the web components
 * read: `primary` is `--c15t-primary`, `textMuted` is `--c15t-text-muted`. The
 * remaining fields are surfaces the native screens draw and the web components
 * do not, so they keep the native name. Each value is `#RRGGBB`.
 */
export interface C15tThemeColors {
	/** Links, switches, the Save button and the brand eyebrow. Web: `--c15t-primary`. */
	primary?: string;
	/** Text on `primary`. Web: `--c15t-text-on-primary`. */
	textOnPrimary?: string;
	/** Cards and list rows that sit on `canvas`. Web: `--c15t-surface`. */
	surface?: string;
	/** Primary text. Web: `--c15t-text`. */
	text?: string;
	/** Supporting text and section labels. Web: `--c15t-text-muted`. */
	textMuted?: string;
	/** Page background behind every consent screen. No web token. */
	canvas?: string;
	/** A quieter surface for subordinate content. No web token. */
	surfaceMuted?: string;
	/** Fill shared by Accept all and Reject all. No web token. */
	decision?: string;
	/** Text on `decision`. No web token. */
	textOnDecision?: string;
}

/** Name of one {@link C15tThemeColors} field. */
export type C15tThemeColorName = keyof C15tThemeColors;

/**
 * The `theme` prop of `@c15t/react-native/expo-plugin`.
 *
 * It is the same type `createConsentTheme` takes, so one object can style the
 * native consent screens here and the React Native components at runtime. Its
 * shape follows the web `Theme` from `@c15t/ui`: `colors` holds the light
 * values and `dark` overrides them in the dark appearance. The plugin writes
 * the values the native screens draw into the native theme keys at prebuild.
 * Values only the React Native components draw, such as `motion`,
 * `colors.border` and `typography.lineHeight`, are checked and left out of the
 * native keys.
 */
export type C15tThemePluginProps = ConsentThemeOptions;

/** Native key pair for one theme value. */
interface ThemeKey {
	readonly ios: string;
	readonly android: string;
}

const key = (ios: string, android: string): ThemeKey => ({
	android: `com.c15t.consent.${android}`,
	ios: `com.c15t.consent.${ios}`,
});

/**
 * Prop colour field to native key.
 *
 * Transcribed from `ConsentTheme.InfoPlistKey` in `consent-theme.swift` and
 * `ConsentTheme.Meta` in `consent-theme.kt`; `__tests__/theme.test.ts` checks
 * every key against those sources.
 */
export const THEME_COLOR_KEYS: Readonly<Record<C15tThemeColorName, ThemeKey>> =
	{
		canvas: key('canvas', 'CANVAS'),
		decision: key('decision', 'DECISION'),
		primary: key('primary', 'PRIMARY'),
		surface: key('surface', 'SURFACE'),
		surfaceMuted: key('surfaceMuted', 'SURFACE_MUTED'),
		text: key('text', 'TEXT'),
		textMuted: key('textMuted', 'TEXT_MUTED'),
		textOnDecision: key('textOnDecision', 'TEXT_ON_DECISION'),
		textOnPrimary: key('textOnPrimary', 'TEXT_ON_PRIMARY'),
	};

/**
 * Colours only the React Native components draw. The prop accepts them so the
 * object `createConsentTheme` takes passes here too, and writes none of them.
 * `__tests__/theme.test.ts` checks the list against the components' palette.
 */
export const JS_ONLY_COLOR_NAMES = [
	'border',
	'contentText',
	'disclosure',
	'focus',
	'overlay',
	'primaryBorder',
	'surfaceHover',
	'switchThumb',
	'switchTrack',
	'switchTrackActive',
] as const;

/** Native keys for the non-colour theme values. */
export const THEME_KEYS = {
	brand: key('brand', 'BRAND'),
	brandMark: key('brandMark', 'BRAND_MARK'),
	brandName: key('brandName', 'BRAND_NAME'),
	branding: key('branding', 'BRANDING'),
	brandingMark: key('brandingMark', 'BRANDING_MARK'),
	brandingName: key('brandingName', 'BRANDING_NAME'),
	brandingProvider: key('brandingProvider', 'BRANDING_PROVIDER'),
	fontFamily: key('fontFamily', 'FONT_FAMILY'),
	fontSizeBase: key('fontSizeBase', 'FONT_SIZE_BASE'),
	fontSizeLg: key('fontSizeLg', 'FONT_SIZE_LG'),
	fontSizeSm: key('fontSizeSm', 'FONT_SIZE_SM'),
	headlineFont: key('headlineFont', 'HEADLINE_FONT'),
	radiusLg: key('radiusLg', 'RADIUS_LG'),
	radiusMd: key('radiusMd', 'RADIUS_MD'),
	radiusSm: key('radiusSm', 'RADIUS_SM'),
	spaceLg: key('spaceLg', 'SPACE_LG'),
	spaceMd: key('spaceMd', 'SPACE_MD'),
	spaceSm: key('spaceSm', 'SPACE_SM'),
	spaceXl: key('spaceXl', 'SPACE_XL'),
	spaceXs: key('spaceXs', 'SPACE_XS'),
} as const satisfies Record<string, ThemeKey>;

/** The native parts a theme can restyle, named after the web `slots`. */
export const THEME_SLOTS: readonly ConsentNativeSlot[] = [
	'consentBannerTitle',
	'consentBannerDescription',
	'buttonPrimary',
	'buttonSecondary',
];

/** The fields of one slot, named after the CSS properties a web slot sets. */
export const THEME_SLOT_FIELDS = [
	'color',
	'backgroundColor',
	'borderRadius',
	'fontSize',
] as const;

/** One {@link THEME_SLOT_FIELDS} entry. */
type SlotField = (typeof THEME_SLOT_FIELDS)[number];

/** `buttonPrimary` to `BUTTON_PRIMARY`. */
const constantCase = (name: string): string =>
	name.replace(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase();

/**
 * Native key for one slot field: `com.c15t.consent.buttonPrimary.backgroundColor`
 * on iOS and `com.c15t.consent.BUTTON_PRIMARY_BACKGROUND_COLOR` on Android,
 * which is the format `InfoPlistKey.slot` and `Meta.slot` build.
 */
export const slotKey = (slot: ConsentNativeSlot, field: SlotField): ThemeKey =>
	key(`${slot}.${field}`, `${constantCase(slot)}_${constantCase(field)}`);

/**
 * Every native key the `theme` prop owns.
 *
 * The first-layer copy keys (`headline`, `introduction`) are theme keys too, but
 * the prop does not set copy, so it never clears them either.
 */
export const THEME_OWNED_KEYS: readonly ThemeKey[] = [
	...Object.values(THEME_COLOR_KEYS),
	...Object.values(THEME_KEYS),
	...THEME_SLOTS.flatMap((slot) =>
		THEME_SLOT_FIELDS.map((field) => slotKey(slot, field))
	),
];

/** One native value: plist keeps the type, the manifest gets its string. */
type ThemeValue = string | number | boolean;

/** Validated theme, as native key and value pairs. */
export interface ResolvedC15tTheme {
	readonly entries: readonly {
		readonly key: ThemeKey;
		readonly value: ThemeValue;
		/** Write to one platform only; absent writes both. */
		readonly platform?: 'ios' | 'android';
	}[];
}

const COLOR_NAMES = Object.keys(THEME_COLOR_KEYS) as C15tThemeColorName[];
const HEX_COLOR = /^#[\dA-Fa-f]{6}$/u;

const quote = (value: unknown): string => JSON.stringify(value) ?? 'undefined';

const asObject = function asObject(
	value: unknown,
	label: string
): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new C15tPluginError(
			`${label} must be an object. Got ${quote(value)}.`
		);
	}
	return value as Record<string, unknown>;
};

/** Refuse fields neither renderer draws, so a web theme pasted in fails loudly. */
const assertKnownFields = function assertKnownFields(
	value: Record<string, unknown>,
	label: string,
	known: readonly string[],
	hint: string
): void {
	const unknown = Object.keys(value).filter((name) => !known.includes(name));
	if (unknown.length > 0) {
		const names = unknown.map((name) => JSON.stringify(name)).join(', ');
		throw new C15tPluginError(
			`${label} has no ${names} field. It accepts ${known.join(', ')}. ${hint}`.trim()
		);
	}
};

const UNSUPPORTED =
	'Neither the native consent screens nor the React Native components draw ' +
	'the rest; set it in the web theme.';

const readHex = function readHex(value: unknown, label: string): string {
	if (typeof value !== 'string' || !HEX_COLOR.test(value.trim())) {
		throw new C15tPluginError(
			`${label} must be a hex colour such as "#2563EB". The native ` +
				`screens read #RRGGBB only, without alpha or CSS functions. Got ` +
				`${quote(value)}.`
		);
	}
	return value.trim().toUpperCase();
};

const readColors = function readColors(
	value: unknown,
	label: string
): Partial<Record<C15tThemeColorName, string>> {
	if (value === undefined) {
		return {};
	}
	const fields = asObject(value, label);
	assertKnownFields(
		fields,
		label,
		[...COLOR_NAMES, ...JS_ONLY_COLOR_NAMES],
		UNSUPPORTED
	);
	for (const name of JS_ONLY_COLOR_NAMES) {
		const color = fields[name];
		if (color !== undefined && (typeof color !== 'string' || color === '')) {
			throw new C15tPluginError(
				`${label}.${name} must be a colour string. Got ${quote(color)}.`
			);
		}
	}
	const colors: Partial<Record<C15tThemeColorName, string>> = {};
	for (const name of COLOR_NAMES) {
		const color = fields[name];
		if (color !== undefined) {
			colors[name] = readHex(color, `${label}.${name}`);
		}
	}
	return colors;
};

/** A light colour, or a light and dark pair, as the native value. */
const readSlotColor = function readSlotColor(
	value: unknown,
	label: string
): string | null {
	if (value === undefined) {
		return null;
	}
	if (typeof value === 'string') {
		return readHex(value, label);
	}
	const pair = asObject(value, label);
	assertKnownFields(pair, label, ['light', 'dark'], '');
	return `${readHex(pair.light, `${label}.light`)},${readHex(pair.dark, `${label}.dark`)}`;
};

const readText = function readText(
	value: unknown,
	label: string
): string | null {
	if (value === undefined) {
		return null;
	}
	if (typeof value !== 'string' || value.trim() === '') {
		throw new C15tPluginError(
			`${label} must be a non-empty string. Got ${quote(value)}.`
		);
	}
	return value.trim();
};

const readFlag = function readFlag(
	value: unknown,
	label: string
): boolean | null {
	if (value === undefined) {
		return null;
	}
	if (typeof value !== 'boolean') {
		throw new C15tPluginError(
			`${label} must be true or false. Got ${quote(value)}.`
		);
	}
	return value;
};

/**
 * A finite number, 0 or more, or above 0 when `positive`. `unit` names what the
 * native screens read it as.
 */
const readNumber = function readNumber(
	value: unknown,
	label: string,
	unit: string,
	positive = false
): number | null {
	if (value === undefined) {
		return null;
	}
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		(positive ? value <= 0 : value < 0)
	) {
		throw new C15tPluginError(
			`${label} must be a number of ${unit}, ${positive ? 'above 0' : '0 or more'}. ` +
				`Got ${quote(value)}.`
		);
	}
	return value;
};

/** An object of numbers with known keys, for groups only the components read. */
const checkNumbers = function checkNumbers(
	value: unknown,
	label: string,
	known: readonly string[]
): void {
	if (value === undefined) {
		return;
	}
	const fields = asObject(value, label);
	assertKnownFields(fields, label, known, '');
	for (const name of known) {
		readNumber(fields[name], `${label}.${name}`, 'pixels');
	}
};

const POINTS = 'points (dp on Android)';

/** Native entries one part of the theme resolves to. */
type ThemeEntries = ResolvedC15tTheme['entries'][number][];

/** Keep only the values that were set. */
const entriesOf = (
	pairs: readonly (readonly [ThemeKey, ThemeValue | null])[]
): ThemeEntries =>
	pairs.flatMap(([themeKey, value]) =>
		value === null ? [] : [{ key: themeKey, value }]
	);

const resolveColors = function resolveColors(
	theme: Record<string, unknown>
): ThemeEntries {
	const light = readColors(theme.colors, 'theme.colors');
	const dark = readColors(theme.dark, 'theme.dark');
	return entriesOf(
		COLOR_NAMES.map((name) => {
			const lightValue = light[name];
			const darkValue = dark[name];
			if (lightValue === undefined) {
				if (darkValue !== undefined) {
					// The native value is one colour, or a light and dark pair. A dark
					// value alone has no light half to pair with.
					throw new C15tPluginError(
						`theme.dark.${name} needs theme.colors.${name} as its light value.`
					);
				}
				return [THEME_COLOR_KEYS[name], null] as const;
			}
			return [
				THEME_COLOR_KEYS[name],
				darkValue === undefined ? lightValue : `${lightValue},${darkValue}`,
			] as const;
		})
	);
};

const resolveRadius = function resolveRadius(value: unknown): ThemeEntries {
	if (value === undefined) {
		return [];
	}
	const radius = asObject(value, 'theme.radius');
	assertKnownFields(
		radius,
		'theme.radius',
		['sm', 'md', 'lg', 'full'],
		UNSUPPORTED
	);
	// `full` is the components' pill radius. The native screens draw none.
	readNumber(radius.full, 'theme.radius.full', POINTS);
	return entriesOf([
		[THEME_KEYS.radiusSm, readNumber(radius.sm, 'theme.radius.sm', POINTS)],
		[THEME_KEYS.radiusMd, readNumber(radius.md, 'theme.radius.md', POINTS)],
		[THEME_KEYS.radiusLg, readNumber(radius.lg, 'theme.radius.lg', POINTS)],
	]);
};

const resolveSpacing = function resolveSpacing(value: unknown): ThemeEntries {
	if (value === undefined) {
		return [];
	}
	const spacing = asObject(value, 'theme.spacing');
	assertKnownFields(
		spacing,
		'theme.spacing',
		['xs', 'sm', 'md', 'lg', 'xl'],
		UNSUPPORTED
	);
	const step = (name: 'xs' | 'sm' | 'md' | 'lg' | 'xl') =>
		readNumber(spacing[name], `theme.spacing.${name}`, POINTS);
	return entriesOf([
		[THEME_KEYS.spaceXs, step('xs')],
		[THEME_KEYS.spaceSm, step('sm')],
		[THEME_KEYS.spaceMd, step('md')],
		[THEME_KEYS.spaceLg, step('lg')],
		[THEME_KEYS.spaceXl, step('xl')],
	]);
};

/** Names both native headline readers take as a built-in face. */
const HEADLINE_FONT_KEYWORDS = [
	'serif',
	'rounded',
	'sans',
	'sans-serif',
	'sansserif',
	'system',
];

/** What Android's `getIdentifier(name, "font", ...)` can resolve. */
const ANDROID_FONT_RESOURCE = /^(?:@font\/)?[a-z][\d_a-z]*$/u;

const isKeyword = (name: string): boolean =>
	HEADLINE_FONT_KEYWORDS.includes(name.toLowerCase());

/**
 * Resolve `headlineFont` or `fontFamily`, per platform when the names differ.
 *
 * iOS takes a PostScript name such as `Inter-Bold`; Android takes a font
 * resource name, which is lowercase letters, digits and `_`. A string that is
 * not a resource name would leave Android on its default face without a word,
 * so it fails here and asks for the `{ ios, android }` form.
 *
 * Only the headline readers know the keywords. The body readers look a name
 * up as a bundled font and fall back to the system face, so a keyword there
 * would do nothing on either platform and fails too.
 */
const resolveFont = function resolveFont(
	value: unknown,
	field: 'fontFamily' | 'headlineFont'
): ThemeEntries {
	const label = `theme.typography.${field}`;
	const fontKey = THEME_KEYS[field];
	const keywords = field === 'headlineFont';
	const checked = (name: string, at: string): string => {
		if (!keywords && isKeyword(name)) {
			throw new C15tPluginError(
				`${at} ${quote(name)} names a built-in face, which the native body ` +
					`text cannot use: it takes a font the app bundles. Leave ${field} ` +
					`out for the system face.`
			);
		}
		return name;
	};
	const androidName = (name: string, at: string): string => {
		if (!isKeyword(name) && !ANDROID_FONT_RESOURCE.test(name)) {
			throw new C15tPluginError(
				`${at} ${quote(name)} is not an Android font resource name ` +
					`(lowercase letters, digits and _), so Android would keep its ` +
					`default face. Use { "ios": ${quote(name)}, "android": ` +
					`"<res/font name>" }.`
			);
		}
		return checked(name, at);
	};
	if (value === undefined || typeof value === 'string') {
		const name = readText(value, label);
		return name === null
			? []
			: [{ key: fontKey, value: androidName(name, label) }];
	}
	const fonts = asObject(value, label);
	assertKnownFields(fonts, label, ['ios', 'android'], '');
	const ios = readText(fonts.ios, `${label}.ios`);
	const android = readText(fonts.android, `${label}.android`);
	if (ios === null && android === null) {
		throw new C15tPluginError(`${label} needs ios, android or both.`);
	}
	return [
		...(ios === null
			? []
			: [
					{
						key: fontKey,
						platform: 'ios' as const,
						value: checked(ios, `${label}.ios`),
					},
				]),
		...(android === null
			? []
			: [
					{
						key: fontKey,
						platform: 'android' as const,
						value: androidName(android, `${label}.android`),
					},
				]),
	];
};

const resolveTypography = function resolveTypography(
	value: unknown
): ThemeEntries {
	if (value === undefined) {
		return [];
	}
	const typography = asObject(value, 'theme.typography');
	assertKnownFields(
		typography,
		'theme.typography',
		['fontFamily', 'headlineFont', 'fontSize', 'fontWeight', 'lineHeight'],
		UNSUPPORTED
	);
	// Weights and line heights shape the React Native components only: the
	// native screens keep the platform's per-role weights and line spacing.
	checkNumbers(typography.fontWeight, 'theme.typography.fontWeight', [
		'normal',
		'medium',
		'semibold',
	]);
	checkNumbers(typography.lineHeight, 'theme.typography.lineHeight', [
		'tight',
		'normal',
		'relaxed',
	]);
	const sizes =
		typography.fontSize === undefined
			? {}
			: asObject(typography.fontSize, 'theme.typography.fontSize');
	assertKnownFields(
		sizes,
		'theme.typography.fontSize',
		['sm', 'base', 'lg'],
		''
	);
	const size = (name: 'sm' | 'base' | 'lg') =>
		readNumber(
			sizes[name],
			`theme.typography.fontSize.${name}`,
			'points (sp on Android)',
			true
		);
	return [
		...resolveFont(typography.fontFamily, 'fontFamily'),
		...resolveFont(typography.headlineFont, 'headlineFont'),
		...entriesOf([
			[THEME_KEYS.fontSizeSm, size('sm')],
			[THEME_KEYS.fontSizeBase, size('base')],
			[THEME_KEYS.fontSizeLg, size('lg')],
		]),
	];
};

const resolveSlots = function resolveSlots(value: unknown): ThemeEntries {
	if (value === undefined) {
		return [];
	}
	const slots = asObject(value, 'theme.slots');
	assertKnownFields(
		slots,
		'theme.slots',
		THEME_SLOTS,
		'The native consent screens restyle only these parts; the React Native ' +
			'components take per-part styles through their `styles` prop.'
	);
	return THEME_SLOTS.flatMap((slot) => {
		if (slots[slot] === undefined) {
			return [];
		}
		const label = `theme.slots.${slot}`;
		const style = asObject(slots[slot], label);
		assertKnownFields(style, label, THEME_SLOT_FIELDS, '');
		return entriesOf([
			[slotKey(slot, 'color'), readSlotColor(style.color, `${label}.color`)],
			[
				slotKey(slot, 'backgroundColor'),
				readSlotColor(style.backgroundColor, `${label}.backgroundColor`),
			],
			[
				slotKey(slot, 'borderRadius'),
				readNumber(style.borderRadius, `${label}.borderRadius`, POINTS),
			],
			[
				slotKey(slot, 'fontSize'),
				readNumber(
					style.fontSize,
					`${label}.fontSize`,
					'points (sp on Android)',
					true
				),
			],
		]);
	});
};

const resolveBrand = function resolveBrand(value: unknown): ThemeEntries {
	if (value === undefined) {
		return [];
	}
	const brand = asObject(value, 'theme.brand');
	assertKnownFields(brand, 'theme.brand', ['name', 'mark', 'hidden'], '');
	const name = readText(brand.name, 'theme.brand.name');
	const mark = readText(brand.mark, 'theme.brand.mark');
	const hidden = readFlag(brand.hidden, 'theme.brand.hidden');
	if (hidden === true && (name !== null || mark !== null)) {
		throw new C15tPluginError(
			'theme.brand.hidden hides the app name and mark, so theme.brand.name ' +
				'and theme.brand.mark would never show. Remove one or the other.'
		);
	}
	return entriesOf([
		[THEME_KEYS.brandName, name],
		[THEME_KEYS.brandMark, mark],
		[THEME_KEYS.brand, hidden === null ? null : !hidden],
	]);
};

const resolveBranding = function resolveBranding(value: unknown): ThemeEntries {
	if (value === undefined) {
		return [];
	}
	const branding = asObject(value, 'theme.branding');
	assertKnownFields(
		branding,
		'theme.branding',
		['provider', 'name', 'mark', 'hidden'],
		''
	);
	const { provider } = branding;
	if (provider !== undefined && provider !== 'c15t' && provider !== 'inth') {
		throw new C15tPluginError(
			`theme.branding.provider must be "c15t" or "inth". Got ${quote(provider)}.`
		);
	}
	const name = readText(branding.name, 'theme.branding.name');
	const mark = readText(branding.mark, 'theme.branding.mark');
	const hidden = readFlag(branding.hidden, 'theme.branding.hidden');
	if (provider !== undefined && name !== null) {
		throw new C15tPluginError(
			'theme.branding.name sets a custom provider and replaces ' +
				'theme.branding.provider. Set one of them.'
		);
	}
	if (mark !== null && name === null) {
		throw new C15tPluginError(
			'theme.branding.mark needs theme.branding.name: the built-in ' +
				'providers use their own marks.'
		);
	}
	return entriesOf([
		[THEME_KEYS.brandingProvider, provider ?? null],
		[THEME_KEYS.brandingName, name],
		[THEME_KEYS.brandingMark, mark],
		[THEME_KEYS.branding, hidden === null ? null : !hidden],
	]);
};

/**
 * Validate the `theme` prop and translate it into native keys.
 *
 * @param input - The `theme` value from the plugin props.
 * @returns The native entries to write, or `null` when no theme was given.
 * @throws {C15tPluginError} When a value would not render as written.
 */
export const resolveTheme = function resolveTheme(
	input: unknown
): ResolvedC15tTheme | null {
	if (input === undefined) {
		return null;
	}
	const theme = asObject(input, 'theme');
	assertKnownFields(
		theme,
		'theme',
		[
			'colors',
			'dark',
			'radius',
			'spacing',
			'typography',
			'motion',
			'slots',
			'brand',
			'branding',
		],
		UNSUPPORTED
	);
	// Motion shapes the React Native components only.
	checkNumbers(theme.motion, 'theme.motion', [
		'enterDistance',
		'enterDuration',
		'exitDuration',
		'reducedEnterDuration',
		'reducedExitDuration',
	]);
	return {
		entries: [
			...resolveColors(theme),
			...resolveRadius(theme.radius),
			...resolveSpacing(theme.spacing),
			...resolveTypography(theme.typography),
			...resolveSlots(theme.slots),
			...resolveBrand(theme.brand),
			...resolveBranding(theme.branding),
		],
	};
};

/**
 * Write the theme into `Info.plist`.
 *
 * The plugin owns every theme key except the copy keys once `theme` is set, so
 * a field removed from `app.config.ts` leaves no stale value behind.
 *
 * @param theme - Resolved theme.
 * @param infoPlist - The plist the mod was given.
 * @returns The plist to write back.
 */
export const applyThemeInfoPlist = function applyThemeInfoPlist(
	theme: ResolvedC15tTheme,
	infoPlist: InfoPlist
): InfoPlist {
	const next: InfoPlist = { ...infoPlist };
	for (const owned of THEME_OWNED_KEYS) {
		Reflect.deleteProperty(next, owned.ios);
	}
	for (const entry of theme.entries.filter((e) => e.platform !== 'android')) {
		next[entry.key.ios] = entry.value;
	}
	return next;
};

/**
 * Write the theme into the main application's `<meta-data>`.
 *
 * Manifest values are strings. AAPT stores `#RRGGBB`, numbers and `true` or
 * `false` as typed values, and the Android theme reader accepts both forms.
 *
 * @param theme - Resolved theme.
 * @param manifest - The parsed `AndroidManifest.xml`.
 * @returns The same manifest with the theme entries replaced.
 */
export const applyThemeAndroidManifest = function applyThemeAndroidManifest(
	theme: ResolvedC15tTheme,
	manifest: AndroidConfig.Manifest.AndroidManifest
): AndroidConfig.Manifest.AndroidManifest {
	const application =
		androidConfig.Manifest.getMainApplicationOrThrow(manifest);
	const owned = new Set(THEME_OWNED_KEYS.map((entry) => entry.android));
	if (application['meta-data']) {
		application['meta-data'] = application['meta-data'].filter(
			(item) => !owned.has(item.$['android:name'])
		);
	}
	for (const entry of theme.entries.filter((e) => e.platform !== 'ios')) {
		androidConfig.Manifest.addMetaDataItemToMainApplication(
			application,
			entry.key.android,
			String(entry.value)
		);
	}
	return manifest;
};

/**
 * Register the theme mods. With no `theme` prop nothing is registered, so an
 * app that themes the screens through its own config plugin keeps its values.
 */
export const withC15tTheme: ConfigPlugin<ResolvedC15tTheme | null> = (
	config,
	theme
) => {
	if (theme === null) {
		return config;
	}
	const next = withInfoPlist(config, (cfg) => ({
		...cfg,
		modResults: applyThemeInfoPlist(theme, cfg.modResults),
	}));
	return withAndroidManifest(next, (cfg) => ({
		...cfg,
		modResults: applyThemeAndroidManifest(theme, cfg.modResults),
	}));
};
