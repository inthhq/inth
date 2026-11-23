import type { ColorTokens, Theme, ThemeCSSVariables } from './types';

interface RGBColor {
	r: number;
	g: number;
	b: number;
}

const DEFAULT_LIGHT_CONTRAST_COLOR = '#ffffff';
const DEFAULT_DARK_CONTRAST_COLOR = '#000000';

/** How much `primary` goes into `surface` for `primaryTint`, by mode. */
const PRIMARY_TINT_SHARE = { dark: '18%', light: '10%' } as const;

/** The opaque primary tint: `primary` mixed into `surface`. */
const primaryTint = function primaryTint(
	primary: string,
	surface: string,
	isDark: boolean
): string {
	return `color-mix(in srgb, ${primary} ${PRIMARY_TINT_SHARE[isDark ? 'dark' : 'light']}, ${surface})`;
};

/** Caps a radius, so a nested box never rounds more than the scale allows. */
const cappedRadius = function cappedRadius(
	radius: string,
	cap: string
): string {
	return `min(${radius}, ${cap})`;
};

const RADIUS_CONTAINER_CAP = '0.75rem';
const RADIUS_NESTED_CAP = '0.5rem';

export const defaultDarkColors: Required<ColorTokens> = {
	border: 'hsl(0, 0%, 20%)',
	borderHover: 'hsl(0, 0%, 25%)',
	borderStrong: '#3a404e',
	danger: '#f87171',
	overlay: 'hsla(0, 0%, 0%, 0.7)',
	overlayBlock: 'rgba(0, 0, 0, 0.72)',
	overlayBlockSolid: 'rgba(0, 0, 0, 0.85)',
	primary: 'hsl(228, 100%, 70%)',
	primaryHover: 'hsl(228, 100%, 65%)',
	primaryText: 'hsl(228, 100%, 70%)',
	primaryTint: primaryTint('hsl(228, 100%, 70%)', 'hsl(0, 0%, 7%)', true),
	surface: 'hsl(0, 0%, 7%)',
	surfaceHover: 'hsl(0, 0%, 10%)',
	switchThumb: 'hsl(0, 0%, 93%)',
	switchTrack: 'hsl(0, 0%, 25%)',
	switchTrackActive: 'hsl(228, 100%, 70%)',
	switchTrackOff: '#64748b',
	text: 'hsl(0, 0%, 93%)',
	textMuted: 'hsl(0, 0%, 60%)',
	textOnPrimary: 'hsl(0, 0%, 100%)',
};

export const defaultTheme: Required<Omit<Theme, 'slots'>> = {
	colors: {
		border: 'hsl(0, 0%, 90%)',
		borderHover: 'hsl(0, 0%, 85%)',
		borderStrong: 'rgba(15, 23, 42, 0.16)',
		danger: '#dc2626',
		overlay: 'hsla(0, 0%, 0%, 0.5)',
		overlayBlock: 'rgba(15, 23, 42, 0.62)',
		overlayBlockSolid: 'rgba(15, 23, 42, 0.78)',
		primary: 'hsl(228, 100%, 60%)',
		primaryHover: 'hsl(228, 100%, 55%)',
		primaryText: 'hsl(228, 100%, 60%)',
		primaryTint: primaryTint('hsl(228, 100%, 60%)', 'hsl(0, 0%, 100%)', false),
		surface: 'hsl(0, 0%, 100%)',
		surfaceHover: 'hsl(0, 0%, 98%)',
		switchThumb: 'hsl(0, 0%, 100%)',
		switchTrack: 'hsl(0, 0%, 85%)',
		switchTrackActive: 'hsl(228, 100%, 60%)',
		// 3.2:1 on white (VIS-03); `switchTrack` above is 1.4:1.
		switchTrackOff: '#8492a6',
		text: 'hsl(0, 0%, 10%)',
		textMuted: 'hsl(0, 0%, 40%)',
		textOnPrimary: 'hsl(0, 0%, 100%)',
	},
	consentActions: {},
	dark: defaultDarkColors,
	motion: {
		duration: {
			fast: '80ms',
			normal: '150ms',
			slow: '200ms',
		},
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
		// ease-in-cubic: slow start, fast end - ideal for exits
		easingIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
		// ease-in-out-cubic: smooth acceleration and deceleration - ideal for movement
		easingInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
		// ease-out-cubic: fast start, smooth end - ideal for enter/exit
		easingOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
		// A stronger ease-out (close to ease-out-quint) for the consent surfaces
		easingOutStrong: 'cubic-bezier(0.23, 1, 0.32, 1)',
		// Spring-like overshoot - ideal for playful animations
		easingSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
	},
	radius: {
		container: RADIUS_CONTAINER_CAP,
		full: '9999px',
		lg: '0.75rem',
		md: '0.5rem',
		nested: RADIUS_NESTED_CAP,
		sm: '0.25rem',
	},
	shadows: {
		lg: '0 8px 24px hsla(0, 0%, 0%, 0.12)',
		md: '0 4px 12px hsla(0, 0%, 0%, 0.08)',
		sm: '0 1px 2px hsla(0, 0%, 0%, 0.05)',
	},
	spacing: {
		lg: '1.5rem',
		md: '1rem',
		sm: '0.5rem',
		xl: '2rem',
		xs: '0.25rem',
	},
	typography: {
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: {
			base: '1rem',
			lg: '1.125rem',
			sm: '0.875rem',
		},
		fontWeight: {
			medium: 500,
			normal: 400,
			semibold: 600,
		},
		lineHeight: {
			normal: '1.5',
			relaxed: '1.75',
			tight: '1.25',
		},
	},
};

const clamp = function clamp(value: number, max = 1): number {
	return Math.min(Math.max(value, 0), max);
};

const parsePercentage = function parsePercentage(value: string): number | null {
	if (!value.trim().endsWith('%')) {
		return null;
	}

	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? clamp(parsed / 100) : null;
};

const parseRGBChannel = function parseRGBChannel(value: string): number | null {
	const percent = parsePercentage(value);
	if (percent !== null) {
		return Math.round(percent * 255);
	}

	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? clamp(parsed, 255) : null;
};

const parseHue = function parseHue(value: string): number | null {
	const trimmedValue = value.trim().toLowerCase();
	const parsed = Number.parseFloat(trimmedValue);

	if (!Number.isFinite(parsed)) {
		return null;
	}

	if (trimmedValue.endsWith('turn')) {
		return parsed * 360;
	}

	if (trimmedValue.endsWith('rad')) {
		return (parsed * 180) / Math.PI;
	}

	if (trimmedValue.endsWith('grad')) {
		return parsed * 0.9;
	}

	return parsed;
};

const parseColorChannels = function parseColorChannels(
	value: string
): string[] {
	const channels = value.split('/')[0] ?? '';
	return channels.includes(',')
		? channels.split(',')
		: channels.trim().split(/\s+/u);
};

const hslToRgb = function hslToRgb(h: number, s: number, l: number): RGBColor {
	const normalizedHue = ((h % 360) + 360) % 360;
	const saturation = clamp(s);
	const lightness = clamp(l);

	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const huePrime = normalizedHue / 60;
	const secondary = saturation && chroma * (1 - Math.abs((huePrime % 2) - 1));
	let red = 0;
	let green = 0;
	let blue = 0;

	if (huePrime < 1) {
		red = chroma;
		green = secondary;
	} else if (huePrime < 2) {
		red = secondary;
		green = chroma;
	} else if (huePrime < 3) {
		green = chroma;
		blue = secondary;
	} else if (huePrime < 4) {
		green = secondary;
		blue = chroma;
	} else if (huePrime < 5) {
		red = secondary;
		blue = chroma;
	} else {
		red = chroma;
		blue = secondary;
	}

	const match = lightness - chroma / 2;

	return {
		b: Math.round((blue + match) * 255),
		g: Math.round((green + match) * 255),
		r: Math.round((red + match) * 255),
	};
};

const parseHexColor = function parseHexColor(value: string): RGBColor | null {
	const hex = value.trim().replace(/^#/u, '');

	if (!/^[\da-f]{3,4}$|^[\da-f]{6}$|^[\da-f]{8}$/iu.test(hex)) {
		return null;
	}

	const normalizedHex =
		hex.length <= 4 ? hex.slice(0, 3).replace(/./gu, '$&$&') : hex.slice(0, 6);
	const rgb = Number.parseInt(normalizedHex, 16);

	/* oxlint-disable no-bitwise -- Extract validated 24-bit RGB channels. */
	return {
		b: rgb & 255,
		g: (rgb >>> 8) & 255,
		r: rgb >>> 16,
	};
	/* oxlint-enable no-bitwise */
};

const parseRGBColor = function parseRGBColor(value: string): RGBColor | null {
	const match = value.trim().match(/^rgba?\((?<capture1>.+)\)$/iu);

	if (!match) {
		return null;
	}

	const channels = parseColorChannels(match[1] ?? '').slice(0, 3);

	if (channels.length !== 3) {
		return null;
	}

	const [red, green, blue] = channels.map(parseRGBChannel);

	if ([red, green, blue].includes(null)) {
		return null;
	}

	return {
		b: blue ?? 0,
		g: green ?? 0,
		r: red ?? 0,
	};
};

const parseHSLColor = function parseHSLColor(value: string): RGBColor | null {
	const match = value.trim().match(/^hsla?\((?<capture1>.+)\)$/iu);

	if (!match) {
		return null;
	}

	const channels = parseColorChannels(match[1] ?? '').slice(0, 3);

	if (channels.length !== 3) {
		return null;
	}

	const hue = parseHue(channels[0] ?? '');
	const saturation = parsePercentage(channels[1] ?? '');
	const lightness = parsePercentage(channels[2] ?? '');

	if (hue === null || saturation === null || lightness === null) {
		return null;
	}

	return hslToRgb(hue, saturation, lightness);
};

const parseColor = function parseColor(value: string): RGBColor | null {
	return parseHexColor(value) ?? parseRGBColor(value) ?? parseHSLColor(value);
};

const srgbToLinear = function srgbToLinear(channel: number): number {
	const normalizedChannel = channel / 255;
	return normalizedChannel <= 0.04045
		? normalizedChannel / 12.92
		: ((normalizedChannel + 0.055) / 1.055) ** 2.4;
};

const getRelativeLuminance = function getRelativeLuminance(
	value: string
): number | undefined {
	const color = parseColor(value);
	if (!color) {
		return undefined;
	}
	return (
		0.2126 * srgbToLinear(color.r) +
		0.7152 * srgbToLinear(color.g) +
		0.0722 * srgbToLinear(color.b)
	);
};

const getContrastRatio = function getContrastRatio(
	foregroundLuminance: number,
	backgroundLuminance: number
): number {
	const lighterColor = Math.max(foregroundLuminance, backgroundLuminance);
	const darkerColor = Math.min(foregroundLuminance, backgroundLuminance);

	return (lighterColor + 0.05) / (darkerColor + 0.05);
};

/**
 * Resolves a readable foreground color for a given background color.
 *
 * Supports `#rgb`, `#rrggbb`, `rgb()`, and `hsl()` input formats.
 * Falls back to white when the background color cannot be parsed.
 */
export const getContrastColor = function getContrastColor(
	backgroundColor: string,
	{
		light = DEFAULT_LIGHT_CONTRAST_COLOR,
		dark = DEFAULT_DARK_CONTRAST_COLOR,
	}: {
		light?: string;
		dark?: string;
	} = {}
): string {
	const background = getRelativeLuminance(backgroundColor);
	const lightColor = getRelativeLuminance(light);
	const darkColor = getRelativeLuminance(dark);

	if (
		background === undefined ||
		lightColor === undefined ||
		darkColor === undefined
	) {
		return light;
	}

	return getContrastRatio(darkColor, background) >=
		getContrastRatio(lightColor, background)
		? dark
		: light;
};

type ThemeCSSVariableResolver = (
	theme: Theme,
	colors: ColorTokens | undefined,
	isDark: boolean
) => string | undefined;

const fontWeightToString = (weight?: number): string | undefined =>
	weight ? String(weight) : undefined;

type ThemeCSSVariableSuffix =
	keyof ThemeCSSVariables extends `--inth-${infer Suffix}` ? Suffix : never;

const themeCSSVariableResolvers: Record<
	ThemeCSSVariableSuffix,
	ThemeCSSVariableResolver
> = {
	border: (_theme, colors) => colors?.border,
	'border-hover': (_theme, colors) => colors?.borderHover,
	'border-strong': (_theme, colors) => colors?.borderStrong,
	danger: (_theme, colors) => colors?.danger,
	'duration-fast': (theme) => theme.motion?.duration?.fast,
	'duration-normal': (theme) => theme.motion?.duration?.normal,
	'duration-slow': (theme) => theme.motion?.duration?.slow,
	easing: (theme) => theme.motion?.easing,
	'easing-in': (theme) => theme.motion?.easingIn,
	'easing-in-out': (theme) => theme.motion?.easingInOut,
	'easing-out': (theme) => theme.motion?.easingOut,
	'easing-out-strong': (theme) => theme.motion?.easingOutStrong,
	'easing-spring': (theme) => theme.motion?.easingSpring,
	'font-family': (theme) => theme.typography?.fontFamily,
	'font-size-base': (theme) => theme.typography?.fontSize?.base,
	'font-size-lg': (theme) => theme.typography?.fontSize?.lg,
	'font-size-sm': (theme) => theme.typography?.fontSize?.sm,
	'font-weight-medium': (theme) =>
		fontWeightToString(theme.typography?.fontWeight?.medium),
	'font-weight-normal': (theme) =>
		fontWeightToString(theme.typography?.fontWeight?.normal),
	'font-weight-semibold': (theme) =>
		fontWeightToString(theme.typography?.fontWeight?.semibold),
	'line-height-normal': (theme) => theme.typography?.lineHeight?.normal,
	'line-height-relaxed': (theme) => theme.typography?.lineHeight?.relaxed,
	'line-height-tight': (theme) => theme.typography?.lineHeight?.tight,
	overlay: (_theme, colors) => colors?.overlay,
	'overlay-block': (_theme, colors) => colors?.overlayBlock,
	'overlay-block-solid': (_theme, colors) => colors?.overlayBlockSolid,
	primary: (_theme, colors) => colors?.primary,
	'primary-hover': (_theme, colors) => colors?.primaryHover,
	// The tokens below fall back to the ones they derive from, so a theme
	// written before they existed still reads as one palette.
	'primary-text': (_theme, colors) => colors?.primaryText ?? colors?.primary,
	'primary-tint': (_theme, colors, isDark) => {
		if (colors?.primaryTint) {
			return colors.primaryTint;
		}
		if (!colors?.primary && !colors?.surface) {
			return undefined;
		}
		return primaryTint(
			colors.primary ?? 'var(--inth-primary)',
			colors.surface ?? 'var(--inth-surface)',
			isDark
		);
	},
	'radius-container': (theme) =>
		theme.radius?.container ??
		(theme.radius?.lg
			? cappedRadius(theme.radius.lg, RADIUS_CONTAINER_CAP)
			: undefined),
	'radius-full': (theme) => theme.radius?.full,
	'radius-lg': (theme) => theme.radius?.lg,
	'radius-md': (theme) => theme.radius?.md,
	'radius-nested': (theme) =>
		theme.radius?.nested ??
		(theme.radius?.md
			? cappedRadius(theme.radius.md, RADIUS_NESTED_CAP)
			: undefined),
	'radius-sm': (theme) => theme.radius?.sm,
	'shadow-lg': (theme) => theme.shadows?.lg,
	'shadow-md': (theme) => theme.shadows?.md,
	'shadow-sm': (theme) => theme.shadows?.sm,
	'space-lg': (theme) => theme.spacing?.lg,
	'space-md': (theme) => theme.spacing?.md,
	'space-sm': (theme) => theme.spacing?.sm,
	'space-xl': (theme) => theme.spacing?.xl,
	'space-xs': (theme) => theme.spacing?.xs,
	surface: (_theme, colors) => colors?.surface,
	'surface-hover': (_theme, colors) => colors?.surfaceHover,
	'switch-thumb': (_theme, colors) => colors?.switchThumb,
	'switch-track': (_theme, colors) => colors?.switchTrack,
	'switch-track-active': (_theme, colors) =>
		colors?.switchTrackActive ?? colors?.primary,
	'switch-track-off': (_theme, colors) =>
		colors?.switchTrackOff ?? colors?.switchTrack,
	text: (_theme, colors) => colors?.text,
	'text-muted': (_theme, colors) => colors?.textMuted,
	'text-on-primary': (_theme, colors) =>
		colors?.textOnPrimary ??
		(colors?.primary ? getContrastColor(colors.primary) : undefined),
};

/**
 * Maps theme tokens to CSS variables.
 */
export const themeToVars = function themeToVars(
	theme: Theme,
	isDark = false
): ThemeCSSVariables {
	const vars: ThemeCSSVariables = {};
	const colors = isDark ? { ...theme.colors, ...theme.dark } : theme.colors;

	for (const [key, resolve] of Object.entries(themeCSSVariableResolvers) as [
		ThemeCSSVariableSuffix,
		ThemeCSSVariableResolver,
	][]) {
		const value = resolve(theme, colors, isDark);
		if (value) {
			vars[`--inth-${key}`] = value;
		}
	}

	return vars;
};

const serializeThemeVars = function serializeThemeVars(
	theme: Theme,
	isDark: boolean
): string {
	return Object.entries(themeToVars(theme, isDark))
		.map(([key, value]) => `${key}: ${value};`)
		.join('');
};

type ThemeColorScheme = 'light' | 'dark' | 'system' | null;

interface ThemeSelectors {
	root: string;
	dark: string;
}

// `:host` is the shadow-DOM counterpart of `:root`: custom properties set
// there inherit into a shadow tree, which `:root` never reaches. Outside a
// shadow root it matches nothing, so light-DOM hosts are unaffected.
const DEFAULT_THEME_SELECTORS: ThemeSelectors = {
	dark: ':root.dark,:host(.dark),.dark .inth-theme-root,:root.inth-dark,:host(.inth-dark),.inth-dark .inth-theme-root',
	root: ':root,:host,.inth-theme-root',
};

// The same elements, each light-DOM selector repeated once so it carries
// one more class-level specificity point than the package defaults. A theme
// then overrides the defaults wherever it lands in the document: SvelteKit,
// for one, writes `<svelte:head>` before its stylesheet links. `:host` stays
// single: a shadow root gets the stylesheet and the theme from the script
// tag's mount, which writes the theme last, so order already decides there.
const THEME_OVERRIDE_SELECTORS: ThemeSelectors = {
	dark: ':root:root.dark,:host(.dark),.dark .inth-theme-root.inth-theme-root,:root:root.inth-dark,:host(.inth-dark),.inth-dark .inth-theme-root.inth-theme-root',
	root: ':root:root,:host,.inth-theme-root.inth-theme-root',
};

const buildThemeCSS = function buildThemeCSS(
	theme: Theme,
	colorScheme: ThemeColorScheme | undefined,
	selectors: ThemeSelectors
): string {
	const { root } = selectors;
	const dark =
		(colorScheme
			? serializeThemeVars({ colors: defaultDarkColors }, true)
			: '') + serializeThemeVars(theme, true);
	// A CSS escape keeps token values intact without letting one close the
	// surrounding `<style>` element.
	return `${root}{${colorScheme === 'dark' ? dark : serializeThemeVars(theme, false)}}
${colorScheme === 'system' ? `@media(prefers-color-scheme:dark){${root}{${dark}}}` : ''}
${selectors.dark}{${dark}}
.inth-no-transitions,.inth-no-transitions *,.inth-no-transitions *::before,.inth-no-transitions *::after{transition: none !important;animation: none !important;}`.replace(
		/</gu,
		'\\3c '
	);
};

/**
 * Generates a CSS string for the theme variables.
 *
 * Call it where your app renders on the server or at build time, and put
 * the result in a `<style>` element or a stylesheet. The browser runtime does
 * not generate theme CSS. `<` is written as a CSS escape, so the result
 * is safe inside a `<style>` element.
 *
 * The light-DOM selectors (`:root`, `.inth-theme-root`) are one
 * specificity step above the default tokens in `styles.css`, so in the
 * document the result overrides them whether it lands before or after the
 * package stylesheet. `:host` keeps the defaults' specificity, so inside a
 * shadow root put the result after the package stylesheet.
 * Apply `inth-no-transitions` while switching themes to suppress animations.
 * @param colorScheme - Select a scheme before hydration; defaults to root classes.
 * @returns Theme CSS, including system preference rules when requested.
 */
export const generateThemeCSS = function generateThemeCSS(
	theme: Theme,
	colorScheme?: ThemeColorScheme
): string {
	return buildThemeCSS(theme, colorScheme, THEME_OVERRIDE_SELECTORS);
};

/**
 * Generates the package's default token block: the same declarations as
 * {@link generateThemeCSS}, on the base `:root` selectors that the theme's
 * selectors outrank. The build writes `defaultTheme` through it into
 * `styles.css`.
 *
 * @internal
 */
export const generateDefaultThemeCSS = function generateDefaultThemeCSS(
	theme: Theme
): string {
	return buildThemeCSS(theme, undefined, DEFAULT_THEME_SELECTORS);
};
