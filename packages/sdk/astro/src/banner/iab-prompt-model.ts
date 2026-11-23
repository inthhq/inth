/**
 * What the IAB TCF banner shows for a snapshot.
 *
 * `iab-prompt.astro` renders this on the server. The browser renders the
 * same model when the server could not: a prerendered page in hosted or
 * manifest mode, or a render without a vendor list yet.
 */

import {
	defaultTranslationConfig,
	resolveLegacyConsentPresentation,
	resolveIABBannerCopy,
	resolveIABBannerSummary,
	resolveIABCopy,
} from '@inth/sdk/engine';
import type {
	ConsentPresentation,
	ConsentSnapshot,
	IABTranslations,
} from '@inth/sdk/engine';
import type { Translations } from '@inth/sdk/translations';
import type { AllThemeKeys, Theme } from '@inth/sdk/ui/theme';
import { getTextDirection } from '@inth/sdk/ui/utils';

import type { IABPromptClassNames } from './class-names';
import { joinClasses } from './prompt-model';
import { resolveSlotBinding } from './theme-slots';

/** An action on the IAB banner. */
export type IABAction = 'reject' | 'accept' | 'customize';

/** The `<IABConsentBanner />` props that shape its markup. */
export interface IABPromptProps {
	/** Which action gets the filled treatment. */
	primaryButton?: IABAction;
	/**
	 * Which consent models this banner responds to. Matches the `models`
	 * prop on the React, Svelte and Vue IAB banners.
	 */
	models?: string[];
	/** Ship the DOM without the bundled stylesheet's class names. */
	noStyle?: boolean;
	/**
	 * Skip the entry animation. Defaults to the integration's
	 * `disableAnimation`.
	 */
	disableAnimation?: boolean;
	/** Extra class on the banner root. */
	class?: string;
	/** Drop the "Consent by" tag. */
	hideBranding?: boolean;
	/** Paint the backdrop that goes with the banner's `aria-modal`. */
	scrollLock?: boolean;
}

/** Input for {@link resolveIABPromptModel}. */
export interface IABPromptModelInput {
	snapshot: ConsentSnapshot;
	props: IABPromptProps;
	/** The integration's `presentation` option. */
	presentation?: ConsentPresentation;
	/** The integration's `disableAnimation` option. */
	disableAnimation?: boolean;
	/** The stylesheet class names the markup uses. */
	classNames: IABPromptClassNames;
	/** The integration's `theme`, for `slots`. */
	theme?: Theme;
}

/** One banner button. */
export interface IABPromptButton {
	action: IABAction;
	label: string;
	mode: string | undefined;
	variant: string | undefined;
	/** The button's classes, with its `buttonPrimary` or `buttonSecondary` slot. */
	className: string;
	/** The button's inline style from that slot. */
	style: string | undefined;
}

/** Everything the IAB banner markup needs. */
export interface IABPromptModel {
	/**
	 * Whether this banner answers the snapshot's policy and has the vendor
	 * list its copy counts from.
	 */
	canRender: boolean;
	/** Whether the snapshot has the vendor list the copy counts from. */
	vendorListReady: boolean;
	blocking: boolean;
	textDirection: 'ltr' | 'rtl';
	language: string | undefined;
	position: string;
	/** The resolved banner shape, the arm's when an experiment runs. */
	variant: string;
	copy: {
		title: string;
		descriptionBefore: string;
		partnersLink: string;
		descriptionAfter: string;
		andMore: string | undefined;
		notice: string;
		securedBy: string;
	};
	displayItems: string[];
	/** Reject and accept, in that order. */
	choiceButtons: IABPromptButton[];
	customizeButton: IABPromptButton;
	classes: {
		root: string;
		overlay: string;
		cardShell: string;
		card: string;
		header: string;
		title: string;
		description: string;
		partnersLink: string;
		purposeList: string;
		purposeMore: string;
		notice: string;
		footer: string;
		actionGroup: string;
		button: string;
	};
	/** Inline styles from `theme.slots`, by the same element names. */
	styles: Partial<Record<keyof IABPromptModel['classes'], string>>;
}

type IABSummary = ReturnType<typeof resolveIABBannerSummary>;

/** The IAB copy, every key filled, and the branding line. */
interface IABBannerCopy {
	iab: IABTranslations;
	securedBy: string;
}

const resolveBannerTranslations = function resolveBannerTranslations(
	snapshot: ConsentSnapshot
): IABBannerCopy {
	const bundle = snapshot.translations?.translations as
		| Partial<Translations>
		| undefined;
	return {
		iab: resolveIABCopy(bundle),
		securedBy:
			bundle?.common?.securedBy ??
			defaultTranslationConfig.translations.en?.common?.securedBy ??
			'',
	};
};

/**
 * Heading, description, partners link and notice, with the counts the
 * summary derived from the vendor list filled in.
 */
const resolveBannerCopy = function resolveBannerCopy(
	{ iab, securedBy }: IABBannerCopy,
	summary: IABSummary
): IABPromptModel['copy'] {
	const { banner } = iab;
	return {
		...resolveIABBannerCopy(iab, summary),
		notice: `${banner.legitimateInterestNotice} ${banner.scopeServiceSpecific}`,
		securedBy,
		title: banner.title,
	};
};

/** The `theme.slots` key each IAB banner element answers to. */
const IAB_PROMPT_SLOTS = {
	card: 'iabConsentBannerCard',
	footer: 'iabConsentBannerFooter',
	header: 'iabConsentBannerHeader',
	overlay: 'iabConsentBannerOverlay',
	root: 'iabConsentBanner',
} as const satisfies Partial<
	Record<keyof IABPromptModel['classes'], AllThemeKeys>
>;

/**
 * Class names and inline styles for every element: the stock classes, or
 * none with `noStyle`, then the element's `theme.slots` entry. With
 * `disableAnimation` the entering classes, which mark the mount, are left
 * out before the slots apply.
 */
const resolveIABClasses = function resolveIABClasses(
	classNames: IABPromptClassNames,
	props: IABPromptProps,
	theme: Theme | undefined,
	disableAnimation: boolean
): Pick<IABPromptModel, 'classes' | 'styles'> {
	const { actions, button, iabBanner } = classNames;
	const noStyle = props.noStyle === true;
	const cls = (...names: (string | undefined)[]): string =>
		noStyle ? '' : joinClasses(...names);
	const entering = (name: string | undefined) =>
		disableAnimation ? undefined : name;
	const classes: IABPromptModel['classes'] = {
		actionGroup: cls(actions.actionGroup),
		button: cls(button.button),
		card: cls(iabBanner.card),
		cardShell: cls(iabBanner.cardShell),
		description: cls(iabBanner.description),
		footer: cls(actions.actionRoot, iabBanner.footer),
		header: cls(iabBanner.header),
		notice: cls(iabBanner.legitimateInterestNotice),
		overlay: cls(
			iabBanner.overlay,
			iabBanner.overlayVisible,
			entering(iabBanner.overlayEntering)
		),
		partnersLink: cls(iabBanner.partnersLink),
		purposeList: cls(iabBanner.purposeList),
		purposeMore: cls(iabBanner.purposeMore),
		root: cls(
			iabBanner.root,
			iabBanner.bannerVisible,
			entering(iabBanner.bannerEntering)
		),
		title: cls(iabBanner.title),
	};
	const styles: IABPromptModel['styles'] = {};
	for (const [name, key] of Object.entries(IAB_PROMPT_SLOTS) as [
		keyof typeof IAB_PROMPT_SLOTS,
		AllThemeKeys,
	][]) {
		const binding = resolveSlotBinding(theme, key, classes[name]);
		classes[name] = binding.class;
		styles[name] = binding.style;
	}
	// The `class` prop goes last, as the component's own override.
	classes.root = joinClasses(classes.root, props.class);
	return { classes, styles };
};

/**
 * The three buttons. The shared button stylesheet keys its variants off
 * `data-*`. `reject` is never filled even when it is the primary action,
 * which is what the React and Svelte banners do too.
 */
const resolveIABButton = function resolveIABButton(
	action: IABAction,
	{ iab }: IABBannerCopy,
	props: IABPromptProps,
	buttonClass: string,
	theme: Theme | undefined
): IABPromptButton {
	const labels: Record<IABAction, string> = {
		accept: iab.common.acceptAll,
		customize: iab.common.customize,
		reject: iab.common.rejectAll,
	};
	const label = labels[action];
	const primary = action === (props.primaryButton ?? 'customize');
	const slot = resolveSlotBinding(
		theme,
		primary ? 'buttonPrimary' : 'buttonSecondary',
		buttonClass
	);
	if (props.noStyle) {
		return {
			action,
			className: slot.class,
			label,
			mode: undefined,
			style: slot.style,
			variant: undefined,
		};
	}
	return {
		action,
		className: slot.class,
		label,
		mode: primary && action !== 'reject' ? 'filled' : 'stroke',
		style: slot.style,
		variant: primary ? 'primary' : 'neutral',
	};
};

/**
 * Resolve the IAB banner's copy, summary, buttons and class names.
 *
 * @param input - The snapshot, the component props and the site options.
 */
export const resolveIABPromptModel = function resolveIABPromptModel(
	input: IABPromptModelInput
): IABPromptModel {
	const { snapshot, props } = input;
	const models = props.models ?? ['iab'];
	const presentation = resolveLegacyConsentPresentation({
		override: { scrollLock: props.scrollLock },
		policy: snapshot.policyRule,
		presentation: input.presentation,
		surface: 'prompt',
	});
	const summary = resolveIABBannerSummary(
		snapshot.iab?.enabled === false ? null : (snapshot.iab ?? null)
	);
	const translations = resolveBannerTranslations(snapshot);
	const textDirection = getTextDirection(snapshot.translations?.language);
	const { position } = presentation;
	const classesAndStyles = resolveIABClasses(
		input.classNames,
		props,
		input.theme,
		props.disableAnimation ?? input.disableAnimation ?? false
	);
	const button = (action: IABAction) =>
		resolveIABButton(
			action,
			translations,
			props,
			classesAndStyles.classes.button,
			input.theme
		);

	return {
		blocking: presentation.blocking,
		canRender: summary.isReady && models.includes(snapshot.policyRule.model),
		choiceButtons: (['reject', 'accept'] as const).map(button),
		...classesAndStyles,
		copy: resolveBannerCopy(translations, summary),
		customizeButton: button('customize'),
		displayItems: [...summary.displayItems],
		language: snapshot.translations?.language,
		position,
		textDirection,
		variant: presentation.variant,
		vendorListReady: summary.isReady,
	};
};
