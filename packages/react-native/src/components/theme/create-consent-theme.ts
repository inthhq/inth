/**
 * The visual tokens behind the built-in consent surfaces.
 *
 * Nothing here is a React Native stylesheet: a theme is plain data, so a host
 * app can read a token, override one part, or hand a whole theme in without
 * forking a component. Colors are literals rather than `Platform.Color` values
 * because the same object has to be comparable in a test and stable across a
 * re-render.
 *
 * The values mirror the web tokens in the `packages/sdk/ui` theme so a subject who
 * sees the web banner and then the app banner recognises one design: the same
 * accent, the same neutral steps, the same radii, and the same spacing scale.
 */

/**
 * Palette half of a {@link ConsentTheme}.
 *
 * A colour that has a web token carries that token's name: `primary` is
 * `--inth-primary`, `surfaceHover` is `--inth-surface-hover`. The rest are
 * surfaces the web components draw from a fixed value and this package exposes.
 */
export interface ConsentThemeColors {
	/** Color behind a modal sheet, dimming the app below it. Web: `--inth-overlay`. */
	readonly overlay: string;
	/** Sheet or banner background. Web: `--inth-surface`. */
	readonly surface: string;
	/**
	 * Muted surface: the banner footer band, and rows raised off the card. Web:
	 * `--inth-surface-hover`, which is the token the web footer band reads.
	 */
	readonly surfaceHover: string;
	/** Hairline separating rows from the footer. Web: `--inth-border`. */
	readonly border: string;
	/**
	 * The disclosure glyph on a collapsed category row: the plus that becomes a
	 * minus, and nothing else.
	 *
	 * Web keeps this one colour outside the palette: `.arrow` falls back to
	 * `hsl(0, 0%, 63.92%)` when `--accordion-arrow-color` is unset, which is
	 * lighter than `textMuted` on purpose so the row's own label stays the loudest
	 * thing on it while the affordance is still findable.
	 */
	readonly disclosure: string;
	/**
	 * The copy a category card reveals when it opens.
	 *
	 * `.content` in the consent accordion resolves `--accordion-content-color` to
	 * `hsl(0, 0%, 36.08%)`, a step under `textMuted`: the description is the same
	 * size as the label it explains, so tone is the only thing separating them.
	 */
	readonly contentText: string;
	/** Primary text. Web: `--inth-text`. */
	readonly text: string;
	/** Secondary text, such as a heading's supporting line. Web: `--inth-text-muted`. */
	readonly textMuted: string;
	/**
	 * Accent: the outline of the action the surface is asking for, which is
	 * `Customize` on a banner and `Save Settings` in a sheet, and the switch track
	 * when on. Its label is {@link ConsentThemeColors.primaryText}. Web:
	 * `--inth-primary`.
	 *
	 * The two decisions stay in {@link ConsentThemeColors.text} so a prompt never
	 * leans a subject either way, and the fill is never used: every consent action
	 * web ships is an outline. The branding tab is the one element that fills.
	 */
	readonly primary: string;
	/**
	 * Accent text on the surface: the label of the accent action. Web:
	 * `--inth-primary-text`, which is `primary` unless a theme sets it.
	 *
	 * It is its own colour because the dark accent is a fill and an outline, not
	 * a text colour: `#2F66DF` on the dark surface is only 3.6:1, so dark text
	 * takes the web's lighter `#8AB4FF`. A theme that sets `primary` and not
	 * this gets `primary` here, as on the web.
	 */
	readonly primaryText: string;
	/**
	 * Text on a filled {@link ConsentThemeColors.primary}, for a host that fills
	 * one. Web: `--inth-text-on-primary`.
	 */
	readonly textOnPrimary: string;
	/**
	 * The outline of a control drawn in the accent: the branding tab, whose fill is
	 * already the accent and so needs an edge darker than itself to read.
	 *
	 * Web asks for `color-mix(in srgb, var(--inth-primary), black 14%)`, which is
	 * the accent at 86% against black. React Native has no colour function to run at
	 * render, so each scheme ships the literal that mix resolves to: `#2563EB` to
	 * `#2055CA`, and the dark accent `#2F66DF` to `#2858C0`.
	 */
	readonly primaryBorder: string;
	/** Focus and selected outline. */
	readonly focus: string;
	/** Off-state switch track. Web: `--inth-switch-track`. */
	readonly switchTrack: string;
	/** On-state switch track. Web: `--inth-switch-track-active`. */
	readonly switchTrackActive: string;
	/** Switch thumb. Web: `--inth-switch-thumb`. */
	readonly switchThumb: string;
}

/**
 * Colours only the native presenter draws. The components in this package
 * ignore them, so one theme object can carry both renderers' values. Each is
 * `#RRGGBB`.
 */
export interface ConsentNativeThemeColors {
	/** Page background behind every native consent screen. */
	readonly canvas?: string;
	/** A quieter native surface for subordinate content. */
	readonly surfaceMuted?: string;
	/** Fill shared by the native Accept all and Reject all. */
	readonly decision?: string;
	/** Text on `decision`. */
	readonly textOnDecision?: string;
}

/** Colour overrides: any palette colour, plus the native-only ones. */
export type ConsentThemeColorOptions = Partial<ConsentThemeColors> &
	ConsentNativeThemeColors;

/** Spacing scale in density-independent pixels, named after `--inth-space-*`. */
export interface ConsentThemeSpacing {
	/** 4 */
	readonly xs: number;
	/** 8 */
	readonly sm: number;
	/** 16 */
	readonly md: number;
	/** 24 */
	readonly lg: number;
	/** 32 */
	readonly xl: number;
}

/** One text style a surface draws, derived from a {@link ConsentThemeTypography}. */
export interface ConsentTypeStyle {
	/** Size before the platform font scale is applied by `Text`. */
	readonly fontSize: number;
	/** Line height before the platform font scale is applied. */
	readonly lineHeight: number;
	/** React Native font weight. */
	readonly weight: '500' | '600' | '400';
}

/**
 * Type tokens, named after the web `typography` tokens and the
 * `--inth-font-*` and `--inth-line-height-*` custom properties.
 *
 * Sizes are density-independent pixels; `Text` applies the platform font scale
 * on its own. Line heights are multipliers, as on the web.
 */
export interface ConsentThemeTypography {
	/**
	 * Face for every text role. `undefined` is the platform face. Web:
	 * `--inth-font-family`. A bundled font: a PostScript name on iOS and a font
	 * resource name on Android, given once when one name serves both
	 * (`inter_bold`) or per platform as `{ ios: 'Inter-Regular', android:
	 * 'inter_regular' }`.
	 */
	readonly fontFamily?: ConsentFontName;
	/**
	 * Face of the headings, named as {@link ConsentThemeTypography.fontFamily}
	 * is. The native presenter also reads the keywords `serif`, `rounded` and
	 * `sans`; the components in this package ignore those and use a named font
	 * only.
	 */
	readonly headlineFont?: ConsentFontName;
	/** Web: `--inth-font-size-sm`, `-base` and `-lg`. */
	readonly fontSize: {
		/** 14 */
		readonly sm: number;
		/** 16 */
		readonly base: number;
		/** 18 */
		readonly lg: number;
	};
	/** Web: `--inth-font-weight-*`. */
	readonly fontWeight: {
		/** 400 */
		readonly normal: number;
		/** 500 */
		readonly medium: number;
		/** 600 */
		readonly semibold: number;
	};
	/** Web: `--inth-line-height-*`. */
	readonly lineHeight: {
		/** 1.25 */
		readonly tight: number;
		/** 1.5 */
		readonly normal: number;
		/** 1.75 */
		readonly relaxed: number;
	};
}

/**
 * The text roles the built-in surfaces draw, each derived from the type tokens.
 *
 * The banner and the sheet do not share a pairing, so there is a role for each:
 * the banner card leads with `base` medium over `sm` (`.title` and
 * `.description` in `consent-surface.module.css`), and the dialog with a
 * larger semibold heading over a smaller intro (`.title` and `.intro` in
 * `consent-dialog.module.css`). One shared pair can only be right about one
 * of them.
 */
export interface ConsentTypeRoles {
	/** Banner heading: `base` over `normal`, medium. 16/24 by default. */
	readonly bannerTitle: ConsentTypeStyle;
	/**
	 * Small copy: `sm` regular over `normal`. 14/21 by default. The banner body,
	 * and the category description inside a sheet.
	 */
	readonly bannerBody: ConsentTypeStyle;
	/**
	 * Sheet title: `base` at 17/16 of its size, semibold over `tight`. 17/21.25
	 * by default.
	 *
	 * `consent-dialog.module.css` sizes `.title` at `base * 1.0625`. Its
	 * tracking is not here: the web writes tracking in `em`, and it belongs with
	 * the surface that draws the heading, so `useConsentStyles` puts it on the
	 * part.
	 */
	readonly title: ConsentTypeStyle;
	/**
	 * Body copy of a sheet: `sm` at 13/14 of its size over `normal`. 13/19.5 by
	 * default. The dialog's `.intro`, which the web sizes at `sm * 0.9286`.
	 */
	readonly body: ConsentTypeStyle;
	/** Button label: `sm` over `tight` at medium. 14/17.5 by default. */
	readonly label: ConsentTypeStyle;
	/** Legal and status line, a step under `sm`. 13/18 by default. */
	readonly caption: ConsentTypeStyle;
}

/** Corner radii, named after `--inth-radius-*`. */
export interface ConsentThemeRadius {
	/** 4 */
	readonly sm: number;
	/** Buttons and rows. 10 */
	readonly md: number;
	/** Sheet and banner corners. 16 */
	readonly lg: number;
	/** Fully rounded. 9999 */
	readonly full: number;
}

/** Motion half of a theme, in milliseconds. */
export interface ConsentThemeMotion {
	/** Enter duration while motion is allowed. */
	readonly enterDuration: number;
	/** Exit duration while motion is allowed. */
	readonly exitDuration: number;
	/** Enter duration under `reduceMotion`, effectively a reveal. */
	readonly reducedEnterDuration: number;
	/** Exit duration under `reduceMotion`. */
	readonly reducedExitDuration: number;
	/** Distance a sheet travels on entry, in pixels. */
	readonly enterDistance: number;
}

/** A complete theme. */
export interface ConsentTheme {
	/** Palette in the light appearance. */
	readonly colors: ConsentThemeColors;
	/** Palette in the dark appearance. */
	readonly dark: ConsentThemeColors;
	/** Motion. */
	readonly motion: ConsentThemeMotion;
	/** Corner radii. */
	readonly radius: ConsentThemeRadius;
	/** Spacing scale. */
	readonly spacing: ConsentThemeSpacing;
	/** Type tokens. */
	readonly typography: ConsentThemeTypography;
}

/**
 * Parts of the native presenter a theme can restyle one at a time, named after
 * the web `slots`. The components in this package take per-part styles through
 * their `styles` prop instead.
 */
export type ConsentNativeSlot =
	| 'consentBannerTitle'
	| 'consentBannerDescription'
	| 'buttonPrimary'
	| 'buttonSecondary';

/**
 * One native part's overrides, named after the CSS properties a web slot's
 * `style` would set. Colours are `#RRGGBB`, or a light and dark pair.
 */
export interface ConsentNativeSlotStyle {
	readonly color?: string | { readonly light: string; readonly dark: string };
	readonly backgroundColor?:
		| string
		| { readonly light: string; readonly dark: string };
	readonly borderRadius?: number;
	readonly fontSize?: number;
}

/**
 * A font name, once for both platforms or per platform. iOS reads a PostScript
 * name such as `Inter-Bold` and Android a font resource name such as
 * `inter_bold`, so one string serves both only when it is a valid resource
 * name. The Expo plugin fails prebuild on a single string Android cannot read.
 */
export type ConsentFontName =
	| string
	| { readonly ios?: string; readonly android?: string };

/**
 * Partial overrides accepted by {@link createConsentTheme}, and the same shape
 * the Expo plugin's `theme` option takes, so one object styles the components
 * in this package and the native presenter.
 *
 * Its fields follow the web `Theme` from `@inth/sdk/ui`. `slots`, `brand`,
 * `branding`, `firstLayer`, `appearance` and `savePlacement` style the native
 * presenter only;
 * `motion` and the colours in
 * {@link ConsentThemeColors} that the native presenter does not draw style
 * these components only.
 */
export interface ConsentThemeOptions {
	/** Colours in the light appearance, and in the dark one unless `dark` overrides them. */
	readonly colors?: ConsentThemeColorOptions;
	/** Dark-appearance overrides. */
	readonly dark?: ConsentThemeColorOptions;
	/** Motion overrides. */
	readonly motion?: Partial<ConsentThemeMotion>;
	/** Radius overrides. */
	readonly radius?: Partial<ConsentThemeRadius>;
	/** Spacing overrides. */
	readonly spacing?: Partial<ConsentThemeSpacing>;
	/** Type overrides. */
	readonly typography?: {
		readonly fontFamily?: ConsentFontName;
		readonly headlineFont?: ConsentFontName;
		readonly fontSize?: Partial<ConsentThemeTypography['fontSize']>;
		readonly fontWeight?: Partial<ConsentThemeTypography['fontWeight']>;
		readonly lineHeight?: Partial<ConsentThemeTypography['lineHeight']>;
	};
	/** Native presenter part overrides. */
	readonly slots?: Partial<Record<ConsentNativeSlot, ConsentNativeSlotStyle>>;
	/** Native presenter: the app identity shown above the headline. */
	readonly brand?: {
		/** App name shown as an eyebrow above the headline. */
		readonly name?: string;
		/** Image for the mark: an asset-catalogue name on iOS and a drawable name on Android. */
		readonly mark?: string;
		/** `true` hides the app name and mark. */
		readonly hidden?: boolean;
	};
	/** Native presenter: the provider attribution under the first-layer actions. */
	readonly branding?: {
		/** Built-in provider mark and name. */
		readonly provider?: 'c15t' | 'inth';
		/** Custom provider name. Replaces `provider`. */
		readonly name?: string;
		/** Custom provider image, beside a custom `name`. */
		readonly mark?: string;
		/** `true` hides the attribution. */
		readonly hidden?: boolean;
	};
	/**
	 * Native presenter: how the first choice is presented. `page` is a
	 * full-screen page, `sheet` a floating sheet over the app and `prompt` a
	 * centred card like a system permission alert. Every layout shows the same
	 * text and the same equal Accept all and Reject all. Defaults to `page`.
	 */
	readonly firstLayer?: ConsentFirstLayer;
	/**
	 * Native presenter: where the stock colours come from. `system` uses the
	 * platform's backgrounds and text colours with the app's accent colour.
	 * `sheet` and `prompt` always use it. Colours set in `colors` win.
	 * Defaults to `system`.
	 */
	readonly appearance?: ConsentAppearance;
	/**
	 * Native presenter: where Save sits in Privacy Settings. `top` is a short
	 * button at the end of the navigation bar; `bottom` is a full-width Save
	 * Settings button under Reject All and Accept All. At accessibility text
	 * sizes it is always at the bottom. Defaults to `top`.
	 */
	readonly savePlacement?: ConsentSavePlacement;
}

/** The first-layer layouts of the native presenter. */
export const CONSENT_FIRST_LAYERS = ['page', 'sheet', 'prompt'] as const;

/** One of {@link CONSENT_FIRST_LAYERS}. */
export type ConsentFirstLayer = (typeof CONSENT_FIRST_LAYERS)[number];

/** The stock palettes of the native presenter. */
export const CONSENT_APPEARANCES = ['paper', 'system'] as const;

/** One of {@link CONSENT_APPEARANCES}. */
export type ConsentAppearance = (typeof CONSENT_APPEARANCES)[number];

/** Where the native presenter can place Save Settings. */
export const CONSENT_SAVE_PLACEMENTS = ['bottom', 'top'] as const;

/** One of {@link CONSENT_SAVE_PLACEMENTS}. */
export type ConsentSavePlacement = (typeof CONSENT_SAVE_PLACEMENTS)[number];

/** The two schemes the package ships defaults for. */
export const CONSENT_COLOR_SCHEMES = ['light', 'dark'] as const;

/** One of {@link CONSENT_COLOR_SCHEMES}. */
export type ConsentColorScheme = (typeof CONSENT_COLOR_SCHEMES)[number];

/**
 * Which scheme to use, given what the platform reported.
 *
 * An unspecified scheme reads `light`, which matches the default that
 * `useColorScheme` returns on a device that has not answered yet, so the first
 * frame never flashes the dark palette.
 *
 * @param scheme - Value from `useColorScheme()`.
 * @returns The scheme to build styles from.
 */
export const resolveConsentColorScheme = function resolveConsentColorScheme(
	scheme: ConsentColorScheme | 'unspecified' | null | undefined
): ConsentColorScheme {
	return scheme === 'dark' ? 'dark' : 'light';
};

const baseSpacing: ConsentThemeSpacing = {
	lg: 24,
	md: 16,
	sm: 8,
	xl: 32,
	xs: 4,
};

const baseRadius: ConsentThemeRadius = { full: 9999, lg: 16, md: 10, sm: 4 };

const baseTypography: ConsentThemeTypography = {
	fontSize: { base: 16, lg: 18, sm: 14 },
	fontWeight: { medium: 500, normal: 400, semibold: 600 },
	lineHeight: { normal: 1.5, relaxed: 1.75, tight: 1.25 },
};

const baseMotion: ConsentThemeMotion = {
	enterDistance: 24,
	enterDuration: 260,
	exitDuration: 200,
	reducedEnterDuration: 1,
	reducedExitDuration: 1,
};

const lightColors: ConsentThemeColors = {
	border: '#E6E6E6',
	contentText: '#5C5C5C',
	disclosure: '#A3A3A3',
	focus: '#2563EB',
	overlay: 'rgba(0, 0, 0, 0.5)',
	primary: '#2563EB',
	primaryBorder: '#2055CA',
	primaryText: '#2563EB',
	surface: '#FFFFFF',
	surfaceHover: '#FAFAFA',
	switchThumb: '#FFFFFF',
	switchTrack: '#D9D9D9',
	switchTrackActive: '#2563EB',
	text: '#1A1A1A',
	textMuted: '#666666',
	textOnPrimary: '#FFFFFF',
};

const darkColors: ConsentThemeColors = {
	border: '#333333',
	contentText: '#999999',
	disclosure: '#CCCCCC',
	focus: '#2F66DF',
	overlay: 'rgba(0, 0, 0, 0.7)',
	primary: '#2F66DF',
	primaryBorder: '#2858C0',
	primaryText: '#8AB4FF',
	surface: '#121212',
	surfaceHover: '#1A1A1A',
	switchThumb: '#EDEDED',
	switchTrack: '#404040',
	switchTrackActive: '#2F66DF',
	text: '#EDEDED',
	textMuted: '#999999',
	textOnPrimary: '#FFFFFF',
};

/** Keep the palette colours, dropping the native-only ones. */
const paletteOf = function paletteOf(
	colors: ConsentThemeColorOptions | undefined
): Partial<ConsentThemeColors> {
	if (colors === undefined) {
		return {};
	}
	const {
		canvas: _canvas,
		decision: _decision,
		surfaceMuted: _surfaceMuted,
		textOnDecision: _textOnDecision,
		...palette
	} = colors;
	return palette;
};

/**
 * The accent text a palette draws: its own `primaryText`, else its `primary`,
 * else the stock one. A theme that recolours the accent recolours its label
 * too, the way the web's `--inth-primary-text` falls back to `--inth-primary`.
 */
const accentText = function accentText(
	overrides: Partial<ConsentThemeColors>,
	stock: ConsentThemeColors
): string {
	return overrides.primaryText ?? overrides.primary ?? stock.primaryText;
};

const RN_WEIGHTS = { 400: '400', 500: '500', 600: '600' } as const;

/** A numeric weight as the string React Native reads, rounded to a role's set. */
const weightOf = function weightOf(weight: number): ConsentTypeStyle['weight'] {
	if (weight >= 550) {
		return RN_WEIGHTS[600];
	}
	return weight >= 450 ? RN_WEIGHTS[500] : RN_WEIGHTS[400];
};

/**
 * The text roles the built-in surfaces draw, from the type tokens.
 *
 * Each role reads the web rule that draws it. Where the web rule is a fixed
 * value rather than a token (the dialog's 17 and 13, the caption's 13),
 * the role keeps its ratio to the token it sits beside, so a host that scales
 * `sm` scales the role with it and the stock theme draws the web numbers.
 *
 * @param typography - Type tokens.
 * @returns One style per role.
 */
export const resolveConsentTypeRoles = function resolveConsentTypeRoles(
	typography: ConsentThemeTypography
): ConsentTypeRoles {
	const { fontSize, fontWeight, lineHeight } = typography;
	const caption = (fontSize.sm * 13) / 14;
	const dialogTitle = (fontSize.base * 17) / 16;
	const dialogBody = (fontSize.sm * 13) / 14;
	return {
		bannerBody: {
			fontSize: fontSize.sm,
			lineHeight: fontSize.sm * lineHeight.normal,
			weight: weightOf(fontWeight.normal),
		},
		bannerTitle: {
			fontSize: fontSize.base,
			lineHeight: fontSize.base * lineHeight.normal,
			weight: weightOf(fontWeight.medium),
		},
		body: {
			fontSize: dialogBody,
			lineHeight: dialogBody * lineHeight.normal,
			weight: weightOf(fontWeight.normal),
		},
		caption: {
			fontSize: caption,
			lineHeight: (caption * 18) / 13,
			weight: weightOf(fontWeight.normal),
		},
		label: {
			fontSize: fontSize.sm,
			lineHeight: fontSize.sm * lineHeight.tight,
			weight: weightOf(fontWeight.medium),
		},
		title: {
			fontSize: dialogTitle,
			lineHeight: dialogTitle * lineHeight.tight,
			weight: weightOf(fontWeight.semibold),
		},
	};
};

/**
 * Build a theme from partial overrides.
 *
 * Overrides are shallow per group, so `{ colors: { primary: '#7C3AED' } }`
 * changes one color and inherits the rest. A `colors` value applies in both
 * appearances unless `dark` sets its own, the same rule the Expo plugin and
 * the native presenter follow.
 *
 * @example
 * ```tsx
 * import { ConsentDialog, createConsentTheme } from '@inth/react-native';
 *
 * const theme = createConsentTheme({ colors: { primary: '#7C3AED' } });
 *
 * <ConsentDialog onRequestClose={close} theme={theme} />;
 * ```
 *
 * @param options - Groups to override.
 * @returns A complete theme.
 */
export const createConsentTheme = function createConsentTheme(
	options: ConsentThemeOptions = {}
): ConsentTheme {
	const colors = paletteOf(options.colors);
	const dark = { ...colors, ...paletteOf(options.dark) };
	const typography = options.typography ?? {};
	return {
		colors: {
			...lightColors,
			...colors,
			primaryText: accentText(colors, lightColors),
		},
		dark: { ...darkColors, ...dark, primaryText: accentText(dark, darkColors) },
		motion: { ...baseMotion, ...options.motion },
		radius: { ...baseRadius, ...options.radius },
		spacing: { ...baseSpacing, ...options.spacing },
		typography: {
			fontFamily: typography.fontFamily,
			fontSize: { ...baseTypography.fontSize, ...typography.fontSize },
			fontWeight: { ...baseTypography.fontWeight, ...typography.fontWeight },
			headlineFont: typography.headlineFont,
			lineHeight: { ...baseTypography.lineHeight, ...typography.lineHeight },
		},
	};
};

/**
 * The palette a theme draws in one appearance.
 *
 * @param theme - A complete theme.
 * @param scheme - The appearance in force.
 * @returns `theme.dark` in the dark appearance, `theme.colors` otherwise.
 */
export const consentColorsFor = function consentColorsFor(
	theme: ConsentTheme,
	scheme: ConsentColorScheme
): ConsentThemeColors {
	return scheme === 'dark' ? theme.dark : theme.colors;
};

/**
 * The stock theme. It carries both palettes and draws the one the platform
 * reports.
 */
export const defaultConsentTheme: ConsentTheme = createConsentTheme();
