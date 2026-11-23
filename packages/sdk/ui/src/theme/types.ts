import type { ClassValue } from '../utils/cn';

/**
 * Generic CSS properties record.
 * @public
 */
export type CSSProperties = Record<string, string | number | undefined>;

/**
 * Represents CSS properties with optional CSS variables.
 *
 * @typeParam VariableMap - A record of CSS variable names and their values for inline styles.
 * @public
 */
export type CSSPropertiesWithVars<
	VariableMap = Record<string, string | number>,
> = CSSProperties & Partial<VariableMap>;

/**
 * Represents a style configuration that can include both inline styles and class names.
 *
 * @typeParam VariableMap - A record of CSS variable names and their values for inline styles.
 * @public
 */
export interface ClassNameStyle<VariableMap = Record<string, string | number>> {
	/** CSS properties to be applied inline to the component. */
	style?: CSSPropertiesWithVars<VariableMap>;
	/** CSS class names to be applied to the component. */
	className?: string;
	/** If true, the component will not apply its default internal styles. */
	noStyle?: boolean;
	/**
	 * Used to pass default class names to the component.
	 *
	 * @internal
	 */
	baseClassName?: ClassValue;
}

/**
 * Represents a style value that can be either a class name string or a {@link ClassNameStyle} object.
 *
 * @typeParam VariableMap - A record of CSS variable names and their values for inline styles.
 * @public
 */
export type ThemeValue<VariableMap = Record<string, string | number>> =
	| string
	| ClassNameStyle<VariableMap>;

/**
 * Map of CSS variable names to their values.
 * @public
 */
export interface CSSVariables {
	[key: string]: string | number;
}

/**
 * Color tokens for the theme.
 * @public
 */
export interface ColorTokens {
	/** Primary brand/accent color for interactive elements. */
	primary?: string;
	/** Hover/active state for primary elements. */
	primaryHover?: string;
	/**
	 * Primary-coloured text and links on a surface. Follows `primary` when
	 * omitted. Set it separately when `primary` is too dark or too light to
	 * read as text on `surface`, as a dark theme's button colour often is.
	 */
	primaryText?: string;
	/**
	 * Opaque primary tint for hover backgrounds, such as the attribution tag.
	 * When omitted, `primary` is mixed into `surface`: 10% in light mode and
	 * 18% in dark mode. It stays opaque so it never shows through over the
	 * blocking overlay.
	 */
	primaryTint?: string;
	/** Error and warning colour, such as the ring on a nudged confirmation. */
	danger?: string;
	/** Main background color for panels and containers. */
	surface?: string;
	/** Hover state for surface elements. */
	surfaceHover?: string;
	/** Border color for containers and inputs. */
	border?: string;
	/** Hover state for bordered elements. */
	borderHover?: string;
	/** Stronger border for groups of rows, such as the category box. */
	borderStrong?: string;
	/** Primary text color for headings and body. */
	text?: string;
	/** Muted text color for secondary content. */
	textMuted?: string;
	/** Text color for content on primary background. Auto-derived from `primary` when omitted. */
	textOnPrimary?: string;
	/** Overlay color for modal backdrops. */
	overlay?: string;
	/** Overlay behind a consent prompt that blocks the page until a choice. */
	overlayBlock?: string;
	/**
	 * Opaque version of `overlayBlock`, for visitors who ask for reduced
	 * transparency.
	 */
	overlayBlockSolid?: string;
	/** Toggle track color (off state). */
	switchTrack?: string;
	/**
	 * Off-state toggle track with at least 3:1 contrast against `surface`
	 * (WCAG 1.4.11). Follows `switchTrack` when a theme sets only that.
	 */
	switchTrackOff?: string;
	/** Toggle track color (on state). Follows `primary` when omitted. */
	switchTrackActive?: string;
	/** Toggle thumb color. */
	switchThumb?: string;
}

/**
 * Typography tokens for consistent text styling.
 * @public
 */
export interface TypographyTokens {
	/** Font family for all components. */
	fontFamily?: string;

	/** Font sizes for text hierarchy. */
	fontSize?: {
		/** @default '0.875rem' */
		sm?: string;
		/** @default '1rem' */
		base?: string;
		/** @default '1.125rem' */
		lg?: string;
	};

	/** Font weights for emphasis. */
	fontWeight?: {
		/** @default 400 */
		normal?: number;
		/** @default 500 */
		medium?: number;
		/** @default 600 */
		semibold?: number;
	};

	/** Line heights for readability. */
	lineHeight?: {
		/** @default '1.25' */
		tight?: string;
		/** @default '1.5' */
		normal?: string;
		/** @default '1.75' */
		relaxed?: string;
	};
}

/**
 * Spacing tokens for consistent padding, margins, and gaps.
 * @public
 */
export interface SpacingTokens {
	/** @default '0.25rem' (4px) */
	xs?: string;
	/** @default '0.5rem' (8px) */
	sm?: string;
	/** @default '1rem' (16px) */
	md?: string;
	/** @default '1.5rem' (24px) */
	lg?: string;
	/** @default '2rem' (32px) */
	xl?: string;
}

/**
 * Border radius tokens for corner rounding.
 * @public
 */
export interface RadiusTokens {
	/** @default '0.25rem' (4px) */
	sm?: string;
	/** @default '0.5rem' (8px) */
	md?: string;
	/** @default '0.75rem' (12px) */
	lg?: string;
	/** @default '9999px' */
	full?: string;
	/**
	 * Large containers inside a surface, such as the category box. When
	 * omitted it follows `lg`, capped at 12px, so a container never matches
	 * the surface around it and a square theme stays square.
	 * @default '0.75rem' (12px)
	 */
	container?: string;
	/**
	 * Containers inside containers, such as the vendor box, and the
	 * attribution tag. When omitted it follows `md`, capped at 8px.
	 * @default '0.5rem' (8px)
	 */
	nested?: string;
}

/**
 * Shadow tokens for depth and elevation effects.
 * @public
 */
export interface ShadowTokens {
	/** @default '0 1px 2px hsla(0, 0%, 0%, 0.05)' */
	sm?: string;
	/** @default '0 4px 12px hsla(0, 0%, 0%, 0.08)' */
	md?: string;
	/** @default '0 8px 24px hsla(0, 0%, 0%, 0.12)' */
	lg?: string;
}

/**
 * Motion tokens for animations and transitions.
 * @public
 */
export interface MotionTokens {
	/**
	 * Duration presets for transitions.
	 */
	duration?: {
		/** @default '80ms' */
		fast?: string;
		/** @default '150ms' */
		normal?: string;
		/** @default '200ms' */
		slow?: string;
	};
	/**
	 * Default CSS easing function for general animation curves.
	 * @default 'cubic-bezier(0.4, 0, 0.2, 1)'
	 */
	easing?: string;
	/**
	 * CSS easing function for enter/exit animations.
	 * Use for modals, tooltips, dropdowns, and any element entering or exiting.
	 * @default 'cubic-bezier(0.215, 0.61, 0.355, 1)'
	 */
	easingOut?: string;
	/**
	 * Stronger ease-out curve: a fast start that settles gently. The
	 * consent surfaces use it for entrances, disclosures and the segmented
	 * control's thumb.
	 * @default 'cubic-bezier(0.23, 1, 0.32, 1)'
	 */
	easingOutStrong?: string;
	/**
	 * CSS easing function for exits.
	 * Use for elements leaving the screen, so they speed up as they go.
	 * @default 'cubic-bezier(0.55, 0.055, 0.675, 0.19)'
	 */
	easingIn?: string;
	/**
	 * CSS easing function for on-screen movement.
	 * Use when elements already on screen need to move or morph.
	 * @default 'cubic-bezier(0.645, 0.045, 0.355, 1)'
	 */
	easingInOut?: string;
	/**
	 * CSS easing function with spring-like overshoot.
	 * Use for playful, bouncy animations.
	 * @default 'cubic-bezier(0.34, 1.56, 0.64, 1)'
	 */
	easingSpring?: string;
}

export interface ConsentActionStyle {
	variant?: 'primary' | 'neutral';
	mode?: 'filled' | 'stroke' | 'lighter' | 'ghost';
}

/**
 * CSS custom properties generated from theme tokens.
 *
 * This interface is the source of truth for documented `--inth-*` variables.
 * Runtime generation in `themeToVars()` is typed against these keys.
 *
 * @public
 */
export interface ThemeCSSVariables {
	/** `colors.primary` (default: `hsl(228, 100%, 60%)`) */
	'--inth-primary'?: string;
	/** `colors.primaryHover` (default: `hsl(228, 100%, 55%)`) */
	'--inth-primary-hover'?: string;
	/** `colors.primaryText` (default: `colors.primary`) */
	'--inth-primary-text'?: string;
	/** `colors.primaryTint` (default: `colors.primary` mixed into `colors.surface`, 10% light and 18% dark) */
	'--inth-primary-tint'?: string;
	/** `colors.danger` (default: `#dc2626`) */
	'--inth-danger'?: string;
	/** `colors.surface` (default: `hsl(0, 0%, 100%)`) */
	'--inth-surface'?: string;
	/** `colors.surfaceHover` (default: `hsl(0, 0%, 98%)`) */
	'--inth-surface-hover'?: string;
	/** `colors.border` (default: `hsl(0, 0%, 90%)`) */
	'--inth-border'?: string;
	/** `colors.borderHover` (default: `hsl(0, 0%, 85%)`) */
	'--inth-border-hover'?: string;
	/** `colors.borderStrong` (default: `rgba(15, 23, 42, 0.16)`) */
	'--inth-border-strong'?: string;
	/** `colors.text` (default: `hsl(0, 0%, 10%)`) */
	'--inth-text'?: string;
	/** `colors.textMuted` (default: `hsl(0, 0%, 40%)`) */
	'--inth-text-muted'?: string;
	/** `colors.textOnPrimary` (auto-derived from `colors.primary` when omitted) */
	'--inth-text-on-primary'?: string;
	/** `colors.overlay` (default: `hsla(0, 0%, 0%, 0.5)`) */
	'--inth-overlay'?: string;
	/** `colors.overlayBlock` (default: `rgba(15, 23, 42, 0.62)`) */
	'--inth-overlay-block'?: string;
	/** `colors.overlayBlockSolid` (default: `rgba(15, 23, 42, 0.78)`) */
	'--inth-overlay-block-solid'?: string;
	/** `colors.switchTrack` (default: `hsl(0, 0%, 85%)`) */
	'--inth-switch-track'?: string;
	/** `colors.switchTrackOff` (default: `#8492a6`, or `colors.switchTrack` when a theme sets only that) */
	'--inth-switch-track-off'?: string;
	/** `colors.switchTrackActive` (default: `colors.primary`) */
	'--inth-switch-track-active'?: string;
	/** `colors.switchThumb` (default: `hsl(0, 0%, 100%)`) */
	'--inth-switch-thumb'?: string;

	/** `typography.fontFamily` (default: `system-ui, -apple-system, sans-serif`) */
	'--inth-font-family'?: string;
	/** `typography.fontSize.sm` (default: `0.875rem`) */
	'--inth-font-size-sm'?: string;
	/** `typography.fontSize.base` (default: `1rem`) */
	'--inth-font-size-base'?: string;
	/** `typography.fontSize.lg` (default: `1.125rem`) */
	'--inth-font-size-lg'?: string;
	/** `typography.fontWeight.normal` (default: `400`) */
	'--inth-font-weight-normal'?: string;
	/** `typography.fontWeight.medium` (default: `500`) */
	'--inth-font-weight-medium'?: string;
	/** `typography.fontWeight.semibold` (default: `600`) */
	'--inth-font-weight-semibold'?: string;
	/** `typography.lineHeight.tight` (default: `1.25`) */
	'--inth-line-height-tight'?: string;
	/** `typography.lineHeight.normal` (default: `1.5`) */
	'--inth-line-height-normal'?: string;
	/** `typography.lineHeight.relaxed` (default: `1.75`) */
	'--inth-line-height-relaxed'?: string;

	/** `spacing.xs` (default: `0.25rem`) */
	'--inth-space-xs'?: string;
	/** `spacing.sm` (default: `0.5rem`) */
	'--inth-space-sm'?: string;
	/** `spacing.md` (default: `1rem`) */
	'--inth-space-md'?: string;
	/** `spacing.lg` (default: `1.5rem`) */
	'--inth-space-lg'?: string;
	/** `spacing.xl` (default: `2rem`) */
	'--inth-space-xl'?: string;

	/** `radius.sm` (default: `0.25rem`) */
	'--inth-radius-sm'?: string;
	/** `radius.md` (default: `0.5rem`) */
	'--inth-radius-md'?: string;
	/** `radius.lg` (default: `0.75rem`) */
	'--inth-radius-lg'?: string;
	/** `radius.full` (default: `9999px`) */
	'--inth-radius-full'?: string;
	/** `radius.container` (default: `radius.lg`, capped at `0.75rem`) */
	'--inth-radius-container'?: string;
	/** `radius.nested` (default: `radius.md`, capped at `0.5rem`) */
	'--inth-radius-nested'?: string;

	/** `shadows.sm` (default: `0 1px 2px hsla(0, 0%, 0%, 0.05)`) */
	'--inth-shadow-sm'?: string;
	/** `shadows.md` (default: `0 4px 12px hsla(0, 0%, 0%, 0.08)`) */
	'--inth-shadow-md'?: string;
	/** `shadows.lg` (default: `0 8px 24px hsla(0, 0%, 0%, 0.12)`) */
	'--inth-shadow-lg'?: string;

	/** `motion.duration.fast` (default: `80ms`) */
	'--inth-duration-fast'?: string;
	/** `motion.duration.normal` (default: `150ms`) */
	'--inth-duration-normal'?: string;
	/** `motion.duration.slow` (default: `200ms`) */
	'--inth-duration-slow'?: string;
	/** `motion.easing` (default: `cubic-bezier(0.4, 0, 0.2, 1)`) */
	'--inth-easing'?: string;
	/** `motion.easingOut` (default: `cubic-bezier(0.215, 0.61, 0.355, 1)`) */
	'--inth-easing-out'?: string;
	/** `motion.easingOutStrong` (default: `cubic-bezier(0.23, 1, 0.32, 1)`) */
	'--inth-easing-out-strong'?: string;
	/** `motion.easingIn` (default: `cubic-bezier(0.55, 0.055, 0.675, 0.19)`) */
	'--inth-easing-in'?: string;
	/** `motion.easingInOut` (default: `cubic-bezier(0.645, 0.045, 0.355, 1)`) */
	'--inth-easing-in-out'?: string;
	/** `motion.easingSpring` (default: `cubic-bezier(0.34, 1.56, 0.64, 1)`) */
	'--inth-easing-spring'?: string;
}

/**
 * Style value for a component slot.
 * @public
 */
export type SlotStyle = string | ClassNameStyle;

/**
 * Component slots for specific styling overrides.
 *
 * Every adapter reads these: the script tag, Svelte and Astro directly, and
 * React and Vue through the same parts of their `components` option. The
 * dialog footer has no slot: the stock dialog's footer is the widget's
 * (`consentWidgetFooter`). The `consentGate` slots style the stock
 * `ConsentGate` placeholder in React, Vue and Svelte, the adapters that
 * render one.
 * @public
 */
export interface ComponentSlots {
	/** Root wrapper for the consent banner portal content. */
	consentBanner?: SlotStyle;
	/** Main card container for banner content and actions. */
	consentBannerCard?: SlotStyle;
	/** Header region containing title and description. */
	consentBannerHeader?: SlotStyle;
	/** Banner title text element. */
	consentBannerTitle?: SlotStyle;
	/** Banner description text element. */
	consentBannerDescription?: SlotStyle;
	/** Footer container for banner action buttons. */
	consentBannerFooter?: SlotStyle;
	/** Nested button group inside the banner footer. */
	consentBannerFooterSubGroup?: SlotStyle;
	/** Group of persistent-right links (opt-out, preferences) in the banner footer. */
	consentBannerRights?: SlotStyle;
	/** One persistent-right link inside the banner rights group. */
	consentBannerRightLink?: SlotStyle;
	/** Branding tag rendered above the consent banner card. */
	consentBannerTag?: SlotStyle;
	/** Backdrop overlay rendered behind the banner when enabled. */
	consentBannerOverlay?: SlotStyle;

	/** Root wrapper for the consent dialog modal. */
	consentDialog?: SlotStyle;
	/** Main dialog card container. */
	consentDialogCard?: SlotStyle;
	/** Dialog header region containing title and description. */
	consentDialogHeader?: SlotStyle;
	/** Dialog title text element. */
	consentDialogTitle?: SlotStyle;
	/** Dialog description text element. */
	consentDialogDescription?: SlotStyle;
	/** Dialog content region (typically holds ConsentWidget). */
	consentDialogContent?: SlotStyle;
	/** Branding tag rendered below the stock consent dialog card. */
	consentDialogTag?: SlotStyle;
	/** Backdrop overlay rendered behind the dialog. */
	consentDialogOverlay?: SlotStyle;

	/** Root wrapper for the opt-out confirmation view. */
	optOutConfirmation?: SlotStyle;
	/** Card container for the opt-out confirmation view. */
	optOutConfirmationCard?: SlotStyle;
	/** Header region of the opt-out confirmation view. */
	optOutConfirmationHeader?: SlotStyle;
	/** Heading text element of the opt-out confirmation view. */
	optOutConfirmationTitle?: SlotStyle;
	/** Status element announcing the honored opt-out. */
	optOutConfirmationStatus?: SlotStyle;
	/** Confirmation body text element. */
	optOutConfirmationDescription?: SlotStyle;
	/** Footer region holding the Done action and preferences link. */
	optOutConfirmationFooter?: SlotStyle;
	/** Done button that closes the opt-out confirmation view. */
	optOutConfirmationDoneButton?: SlotStyle;
	/** Text link that opens the full preference center. */
	optOutConfirmationPreferencesLink?: SlotStyle;
	/** Backdrop overlay rendered behind the opt-out confirmation view. */
	optOutConfirmationOverlay?: SlotStyle;

	/**
	 * Floating button that reopens the preference center. The same part
	 * React and Vue style through `components.trigger.root`.
	 */
	consentDialogTrigger?: SlotStyle;
	/**
	 * Icon wrapper inside the floating trigger, `components.trigger.icon`
	 * in React and Vue.
	 */
	consentDialogTriggerIcon?: SlotStyle;

	/** Floating consent dialog trigger toolbar. */
	consentDialogTriggerToolbar?: SlotStyle;
	/** Individual action button inside the trigger toolbar. */
	consentDialogTriggerToolbarItem?: SlotStyle;
	/** Icon wrapper used by trigger toolbar actions. */
	consentDialogTriggerToolbarIcon?: SlotStyle;

	/** Root wrapper for the consent widget/preferences panel. */
	consentWidget?: SlotStyle;
	/** Sale-and-sharing opt-out block at the top of the preference panel. */
	consentWidgetOptOut?: SlotStyle;
	/** Status banner announcing an honored opt-out in the preference panel. */
	consentWidgetOptOutStatus?: SlotStyle;
	/** Accordion region listing consent categories. */
	consentWidgetAccordion?: SlotStyle;
	/** Footer area for widget actions and links. */
	consentWidgetFooter?: SlotStyle;
	/** Nested button group inside the widget footer. */
	consentWidgetFooterSubGroup?: SlotStyle;
	/** Branding tag rendered below the standalone consent widget. */
	consentWidgetTag?: SlotStyle;

	/**
	 * Placeholder card `ConsentGate` renders while its category is denied,
	 * `ConsentGate.Root` in React and `components['consent-gate'].root` in
	 * React and Vue.
	 */
	consentGate?: SlotStyle;
	/** Placeholder title, `components['consent-gate'].title`. */
	consentGateTitle?: SlotStyle;
	/**
	 * Placeholder button that opens the preferences,
	 * `components['consent-gate'].button`. Applies on top of `buttonPrimary`.
	 */
	consentGateButton?: SlotStyle;

	/** Root wrapper for the IAB consent banner. */
	iabConsentBanner?: SlotStyle;
	/** Main card container for IAB banner content. */
	iabConsentBannerCard?: SlotStyle;
	/** Header region for IAB banner title/description. */
	iabConsentBannerHeader?: SlotStyle;
	/** Footer container for IAB banner actions. */
	iabConsentBannerFooter?: SlotStyle;
	/** Branding tag rendered above the IAB banner card. */
	iabConsentBannerTag?: SlotStyle;
	/** Backdrop overlay rendered behind the IAB banner. */
	iabConsentBannerOverlay?: SlotStyle;

	/** Root wrapper for the IAB consent dialog. */
	iabConsentDialog?: SlotStyle;
	/** Main card container for IAB dialog content. */
	iabConsentDialogCard?: SlotStyle;
	/** Header region for IAB dialog title/description. */
	iabConsentDialogHeader?: SlotStyle;
	/** Footer container for IAB dialog actions. */
	iabConsentDialogFooter?: SlotStyle;
	/** Branding tag rendered below the IAB dialog card. */
	iabConsentDialogTag?: SlotStyle;
	/** Backdrop overlay rendered behind the IAB dialog. */
	iabConsentDialogOverlay?: SlotStyle;

	/** Shared primary button style used across consent components. */
	buttonPrimary?: SlotStyle;
	/** Shared secondary button style used across consent components. */
	buttonSecondary?: SlotStyle;
	/** Shared toggle/switch style used for category controls. */
	toggle?: SlotStyle;
}

/** The slot names of {@link ComponentSlots}. */
export type AllThemeKeys = keyof ComponentSlots;

/**
 * Common UI configuration options across all framework implementations.
 * @public
 */
export interface UIOptions {
	/**
	 * Visual theme to apply.
	 *
	 * @see https://c15t.com/docs/customization/tokens
	 * @see {@link Theme} for token structure
	 */
	theme?: Theme;
	/**
	 * Whether to disable animations.
	 * @default false
	 */
	disableAnimation?: boolean;

	/**
	 * Whether to lock scroll when dialogs are open.
	 * @default false
	 */
	scrollLock?: boolean;

	/**
	 * Whether to trap focus within dialogs.
	 * @default true
	 */
	trapFocus?: boolean;

	/**
	 * Color scheme preference.
	 * With this option, you can force the theme to be light, dark or system.
	 * Otherwise, the theme will be detected if you have '.dark' classname in your document.
	 * `null` leaves the `inth-dark` class on `<html>` to something else.
	 *
	 * @see https://c15t.com/docs/customization/tokens
	 */
	colorScheme?: 'light' | 'dark' | 'system' | null;

	/**
	 * Whether to disable default styles.
	 * @default false
	 *
	 * @see https://c15t.com/docs/frameworks/react/headless
	 */
	noStyle?: boolean;
}

/**
 * Complete theme configuration for Inth consent components (v2).
 * @public
 */
export interface Theme {
	/** Color palette for light mode. */
	colors?: ColorTokens;
	/** Dark mode color overrides. */
	dark?: ColorTokens;
	/** Typography settings for text elements. */
	typography?: TypographyTokens;
	/** Spacing scale for internal padding and margins. */
	spacing?: SpacingTokens;
	/** Border radius scale for rounded corners. */
	radius?: RadiusTokens;
	/** Box shadow scale for depth and elevation. */
	shadows?: ShadowTokens;
	/** Animation and transition timing. */
	motion?: MotionTokens;
	/** Semantic button styling for consent actions. */
	consentActions?: {
		/** Base treatment for every action button. */
		default?: ConsentActionStyle;
		/**
		 * Treatment for whichever action(s) the active policy marks as
		 * primary (`ui.banner.primaryActions`). Lets a theme decide how a
		 * primary action looks while the policy decides which action that
		 * is. Overrides `default`; per-action keys override this.
		 */
		primary?: ConsentActionStyle;
		accept?: ConsentActionStyle;
		reject?: ConsentActionStyle;
		customize?: ConsentActionStyle;
		/** Treatment for the notice dismissal action. */
		dismiss?: ConsentActionStyle;
	};
	/** Component-specific style overrides. */
	slots?: ComponentSlots;
}

/**
 * Helper function to define a theme with full TypeScript autocompletion and validation.
 * @public
 */
export const defineTheme = function defineTheme<ThemeType extends Theme>(
	theme: ThemeType
): ThemeType {
	return theme;
};
