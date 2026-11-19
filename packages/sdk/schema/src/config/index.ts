import type { PolicyRuleModel } from '../shared/policy-rule';

export type ButtonVariant = 'primary' | 'neutral';

export type ButtonMode = 'filled' | 'stroke' | 'lighter' | 'ghost';

export type ConsentActiveUI = 'banner' | 'manager' | null;

export type ConsentBannerPosition =
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right';

export type ConsentManagerMode = 'dialog' | 'sidebar-left' | 'sidebar-right';

export type ConsentLegalLinkKey =
	| 'privacyPolicy'
	| 'cookiePolicy'
	| 'termsOfService';

export interface ConsentLegalLink {
	href: string;
	target?: '_blank' | '_self';
	rel?: string;
	label?: string;
}

export type ConsentLegalLinks = Partial<
	Record<ConsentLegalLinkKey, ConsentLegalLink>
>;

/**
 * Consent model a host component can be scoped to. Equal to the policy
 * rule model list so a `none` rule is a model too, never `null`.
 */
export type PolicyModel = PolicyRuleModel;

export type ConsentDialogTriggerPosition =
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right';

export type ConsentDialogTriggerVisibility =
	| 'always'
	| 'after-consent'
	| 'never';

export type ConsentDialogTriggerSize = 'sm' | 'md' | 'lg';

export type ConsentDialogTriggerIcon = 'fingerprint' | 'settings' | 'branding';

/** Standard consent category keys aligned with GDPR purpose groups. */
export type ConsentCategory =
	| 'necessary'
	| 'functionality'
	| 'experience'
	| 'measurement'
	| 'marketing';

export interface ConsentComponentSlots<T = Record<string, unknown>> {
	banner?: {
		root?: T;
		cardShell?: T;
		card?: T;
		header?: T;
		title?: T;
		footer?: T;
		actions?: T;
		actionGroup?: T;
		rights?: T;
		rightLink?: T;
		overlay?: T;
	};
	dialog?: {
		root?: T;
		container?: T;
		card?: T;
		header?: T;
		title?: T;
		content?: T;
		overlay?: T;
	};
	manager?: {
		root?: T;
		footer?: T;
		actions?: T;
		actionGroup?: T;
	};
	/** The placeholder `ConsentGate` renders while its category is denied. */
	'consent-gate'?: {
		/** Placeholder card, `ConsentGate.Root` in React. */
		root?: T;
		/** Placeholder title, `ConsentGate.Title` in React. */
		title?: T;
		/** Button that opens the preferences, `ConsentGate.Button` in React. */
		button?: T;
	};
	button?: {
		primary?: T;
		secondary?: T;
	};
	switch?: {
		root?: T;
		track?: T;
		thumb?: T;
	};
	trigger?: {
		root?: T;
		icon?: T;
		text?: T;
		/** Toolbar group rendered by `ConsentDialogTriggerToolbar`. */
		toolbar?: T;
		/** One action button inside the trigger toolbar. */
		toolbarItem?: T;
		/** Icon wrapper inside a trigger toolbar action. */
		toolbarIcon?: T;
	};
	accordion?: {
		root?: T;
		triggerRow?: T;
		arrow?: T;
		header?: T;
		title?: T;
		control?: T;
		contentViewport?: T;
		contentInner?: T;
	};
	'accordion-item'?: {
		root?: T;
		trigger?: T;
		content?: T;
	};
	/** Vendor rows nested under a category in the preference center. */
	'vendor-list'?: {
		root?: T;
		trigger?: T;
		content?: T;
		item?: T;
		header?: T;
		name?: T;
		description?: T;
		link?: T;
		control?: T;
	};
	description?: {
		banner?: T;
		dialog?: T;
		manager?: T;
	};
	tag?: {
		banner?: T;
		dialog?: T;
		manager?: T;
		'iab-banner'?: T;
		'iab-dialog'?: T;
		content?: T;
	};
	link?: {
		banner?: T;
		dialog?: T;
		manager?: T;
	};
	'legal-links'?: {
		root?: T;
	};
	'iab-banner'?: {
		root?: T;
		cardShell?: T;
		card?: T;
		header?: T;
		title?: T;
		description?: T;
		partnersLink?: T;
		purposeList?: T;
		purposeMore?: T;
		legitimateInterestNotice?: T;
		footer?: T;
		actions?: T;
		actionGroup?: T;
		overlay?: T;
	};
	'iab-dialog'?: {
		root?: T;
		card?: T;
		header?: T;
		headerContent?: T;
		title?: T;
		description?: T;
		closeButton?: T;
		body?: T;
		content?: T;
		loading?: T;
		footer?: T;
		tabs?: T;
		tabsList?: T;
		tabTrigger?: T;
		tabIndicator?: T;
		tabPanel?: T;
		specialPurposes?: T;
		consentNotice?: T;
		actions?: T;
		actionGroup?: T;
		overlay?: T;
	};
	'iab-purpose-item'?: {
		root?: T;
		header?: T;
		trigger?: T;
		content?: T;
		legitimateInterest?: T;
		examples?: T;
		vendors?: T;
	};
	'iab-stack-item'?: {
		root?: T;
		header?: T;
		trigger?: T;
		content?: T;
	};
	'iab-vendor-list'?: {
		root?: T;
		header?: T;
		search?: T;
		selectedVendor?: T;
		row?: T;
		rowHeader?: T;
		rowContent?: T;
	};
}

type ConsentComponentSlotKeyMap = {
	[Group in keyof ConsentComponentSlots]-?: {
		[Slot in keyof NonNullable<ConsentComponentSlots[Group]>]-?: true;
	};
};

export type ConsentComponentSlotKey = {
	[
		Group in keyof ConsentComponentSlots & string
	]-?: `${Group}.${keyof NonNullable<ConsentComponentSlots[Group]> & string}`;
}[keyof ConsentComponentSlots & string];

export const CONSENT_COMPONENT_SLOT_KEY_MAP = {
	accordion: {
		arrow: true,
		contentInner: true,
		contentViewport: true,
		control: true,
		header: true,
		root: true,
		title: true,
		triggerRow: true,
	},
	'accordion-item': {
		content: true,
		root: true,
		trigger: true,
	},
	banner: {
		actionGroup: true,
		actions: true,
		card: true,
		cardShell: true,
		footer: true,
		header: true,
		overlay: true,
		rightLink: true,
		rights: true,
		root: true,
		title: true,
	},
	button: {
		primary: true,
		secondary: true,
	},
	'consent-gate': {
		button: true,
		root: true,
		title: true,
	},
	description: {
		banner: true,
		dialog: true,
		manager: true,
	},
	dialog: {
		card: true,
		container: true,
		content: true,
		header: true,
		overlay: true,
		root: true,
		title: true,
	},
	'iab-banner': {
		actionGroup: true,
		actions: true,
		card: true,
		cardShell: true,
		description: true,
		footer: true,
		header: true,
		legitimateInterestNotice: true,
		overlay: true,
		partnersLink: true,
		purposeList: true,
		purposeMore: true,
		root: true,
		title: true,
	},
	'iab-dialog': {
		actionGroup: true,
		actions: true,
		body: true,
		card: true,
		closeButton: true,
		consentNotice: true,
		content: true,
		description: true,
		footer: true,
		header: true,
		headerContent: true,
		loading: true,
		overlay: true,
		root: true,
		specialPurposes: true,
		tabIndicator: true,
		tabPanel: true,
		tabTrigger: true,
		tabs: true,
		tabsList: true,
		title: true,
	},
	'iab-purpose-item': {
		content: true,
		examples: true,
		header: true,
		legitimateInterest: true,
		root: true,
		trigger: true,
		vendors: true,
	},
	'iab-stack-item': {
		content: true,
		header: true,
		root: true,
		trigger: true,
	},
	'iab-vendor-list': {
		header: true,
		root: true,
		row: true,
		rowContent: true,
		rowHeader: true,
		search: true,
		selectedVendor: true,
	},
	'legal-links': {
		root: true,
	},
	link: {
		banner: true,
		dialog: true,
		manager: true,
	},
	manager: {
		actionGroup: true,
		actions: true,
		footer: true,
		root: true,
	},
	switch: {
		root: true,
		thumb: true,
		track: true,
	},
	tag: {
		banner: true,
		content: true,
		dialog: true,
		'iab-banner': true,
		'iab-dialog': true,
		manager: true,
	},
	trigger: {
		icon: true,
		root: true,
		text: true,
		toolbar: true,
		toolbarIcon: true,
		toolbarItem: true,
	},
	'vendor-list': {
		content: true,
		control: true,
		description: true,
		header: true,
		item: true,
		link: true,
		name: true,
		root: true,
		trigger: true,
	},
} as const satisfies ConsentComponentSlotKeyMap;

export const CONSENT_COMPONENT_SLOT_KEYS = Object.entries(
	CONSENT_COMPONENT_SLOT_KEY_MAP
).flatMap(([group, slots]) =>
	Object.keys(slots).map(
		(slot) => `${group}.${slot}` as ConsentComponentSlotKey
	)
);

/**
 * Central consent configuration contract shared across framework packages.
 *
 * @typeParam T - Framework attribute type bound to theme slot overrides.
 */
export interface ConsentConfig<T = Record<string, unknown>> {
	projectUrl?: string;
	/**
	 * Consent categories shown in the UI. Backend policy allowlists that include
	 * optional categories narrow this set. A policy allowlist of only `necessary`
	 * does not restrict optional categories. `necessary` is always included.
	 */
	consentCategories?: ConsentCategory[];
	/** Overrides parsed request headers for `/v1/consent/init` (custom SSR, tests). */
	location?: {
		countryCode?: string | null;
		regionCode?: string | null;
	};
	disableAnimation?: boolean;
	trapFocus?: boolean;
	/** Provider-level legal link URLs (labels come from init translations). */
	legalLinks?: ConsentLegalLinks;
	/** Which legal links render per surface (`undefined` = none). */
	bannerLegalLinks?: ConsentLegalLinkKey[] | null;
	dialogLegalLinks?: ConsentLegalLinkKey[] | null;
	hideBranding?: boolean;
	bannerHideBranding?: boolean;
	dialogHideBranding?: boolean;
	iabBannerHideBranding?: boolean;
	iabDialogHideBranding?: boolean;
	showTrigger?: boolean;
	dialogShowTrigger?: boolean;
	iabDialogShowTrigger?: boolean;
	models?: PolicyModel[];
	bannerModels?: PolicyModel[];
	dialogModels?: PolicyModel[];
	iabBannerModels?: PolicyModel[];
	iabDialogModels?: PolicyModel[];
	bannerUiSource?: string;
	dialogUiSource?: string;
	/**
	 * Viewport corner for the consent banner root.
	 * @default 'bottom-left'
	 */
	bannerPosition?: ConsentBannerPosition;
	/**
	 * How the preference manager is presented when `activeUI` is `manager`.
	 * @default 'dialog'
	 */
	managerMode?: ConsentManagerMode;
	triggerDefaultPosition?: ConsentDialogTriggerPosition;
	triggerPersistPosition?: boolean;
	triggerShowWhen?: ConsentDialogTriggerVisibility;
	/**
	 * The trigger's accessible name. Defaults to the active language's
	 * `trigger.label` translation.
	 */
	triggerAriaLabel?: string;
	triggerSize?: ConsentDialogTriggerSize;
	triggerIcon?: ConsentDialogTriggerIcon;
	/** CSS custom property values applied as `--{key}` on `:root`. */
	tokens?: Partial<
		Record<
			| 'inth-primary'
			| 'inth-primary-hover'
			| 'inth-surface'
			| 'inth-surface-hover'
			| 'inth-border'
			| 'inth-border-hover'
			| 'inth-text'
			| 'inth-text-muted'
			| 'inth-text-on-primary'
			| 'inth-overlay'
			| 'inth-switch-track'
			| 'inth-switch-track-active'
			| 'inth-switch-thumb'
			| 'inth-font-family'
			| 'inth-font-size-sm'
			| 'inth-font-size-base'
			| 'inth-font-size-lg'
			| 'inth-font-weight-normal'
			| 'inth-font-weight-medium'
			| 'inth-font-weight-semibold'
			| 'inth-line-height-tight'
			| 'inth-line-height-normal'
			| 'inth-line-height-relaxed'
			| 'inth-space-xs'
			| 'inth-space-sm'
			| 'inth-space-md'
			| 'inth-space-lg'
			| 'inth-space-xl'
			| 'inth-radius-sm'
			| 'inth-radius-md'
			| 'inth-radius-lg'
			| 'inth-radius-full'
			| 'inth-shadow-sm'
			| 'inth-shadow-md'
			| 'inth-shadow-lg'
			| 'inth-duration-fast'
			| 'inth-duration-normal'
			| 'inth-duration-slow'
			| 'inth-easing'
			| 'inth-easing-out'
			| 'inth-easing-in'
			| 'inth-easing-in-out'
			| 'inth-easing-spring',
			string | number
		>
	>;
	/** Per-component slot attribute overrides. */
	components?: ConsentComponentSlots<T>;
}

export { DEFAULT_BANNER_POSITION, defaultConsentConfig } from './defaults';
