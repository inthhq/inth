/**
 * What the consent banner shows for a snapshot.
 *
 * `prompt.astro` renders this on the server. The browser renders the same
 * model when the server could not: a prerendered page in hosted or
 * manifest mode, where only the visitor's own `/init` can say which policy
 * applies. Keeping the decisions here means the two renderings cannot
 * drift apart.
 */

import {
	actionAppearanceFromTheme,
	defaultTranslationConfig,
	resolveActionLabels,
	resolveConsentPresentation,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/engine';
import type {
	ConsentPresentation,
	ConsentSnapshot,
	LegalLinks,
} from '@inth/sdk/engine';
import type { Translations } from '@inth/sdk/translations';
import { resolveActionAppearance } from '@inth/sdk/ui/theme';
import type { AllThemeKeys, Theme } from '@inth/sdk/ui/theme';
import { getTextDirection, resolveLegalLinkEntries } from '@inth/sdk/ui/utils';
import type { LegalLinkEntry } from '@inth/sdk/ui/utils';

import type { PromptClassNames } from './class-names';
import { resolveSlotBinding } from './theme-slots';

/** The `<ConsentBanner />` props that shape its markup. */
export interface PromptProps {
	/** Override the banner heading. */
	title?: string;
	/** Override the banner body copy. */
	description?: string;
	/** Override the reject button label. */
	rejectButtonText?: string;
	/** Override the accept button label. */
	acceptButtonText?: string;
	/** Override the notice acknowledgement label. */
	dismissButtonText?: string;
	/** Override the customize button label. */
	customizeButtonText?: string;
	/** Ship the DOM without the bundled stylesheet's class names. */
	noStyle?: boolean;
	/**
	 * Skip the entry animation. Defaults to the integration's
	 * `disableAnimation`.
	 */
	disableAnimation?: boolean;
	/** Extra class on the banner root. */
	class?: string;
	/** Drop the "Secured by" tag. */
	hideBranding?: boolean;
	/** Which legal links to render inline. `null` renders none. */
	legalLinks?: (keyof LegalLinks)[] | null;
}

/** Input for {@link resolvePromptModel}. */
export interface PromptModelInput {
	snapshot: ConsentSnapshot;
	props: PromptProps;
	/** The integration's `presentation` option. */
	presentation?: ConsentPresentation;
	/** The integration's `legalLinks` option. */
	legalLinks?: LegalLinks;
	/** The integration's `theme` option, for `consentActions` and `slots`. */
	theme?: Theme;
	/** The integration's `disableAnimation` option. */
	disableAnimation?: boolean;
	/** The stylesheet class names the markup uses. */
	classNames: PromptClassNames;
}

/** One banner button. */
export interface PromptAction {
	action: string;
	label: string;
	primary: boolean;
	/** The button's `data-mode`, or `undefined` with `noStyle`. */
	mode: string | undefined;
	/** The button's `data-variant`, or `undefined` with `noStyle`. */
	variant: string | undefined;
	/** The button's classes, with its `buttonPrimary` or `buttonSecondary` slot. */
	className: string;
	/** The button's inline style from that slot. */
	style: string | undefined;
}

/** Everything the banner markup needs. */
export interface PromptModel {
	blocking: boolean;
	direction: string;
	textDirection: 'ltr' | 'rtl';
	language: string | undefined;
	model: string;
	prompt: string | undefined;
	position: string;
	variant: string;
	shouldFill: boolean;
	split: boolean;
	copy: {
		title: string;
		description: string;
		securedBy: string;
	};
	legalLinks: LegalLinkEntry[];
	rights: { right: string; label: string }[];
	actionGroups: PromptAction[][];
	classes: {
		root: string;
		overlay: string;
		cardShell: string;
		card: string;
		header: string;
		title: string;
		description: string;
		footer: string;
		rights: string;
		rightLink: string;
		actionGroup: string;
		button: string;
		legalLink: string;
	};
	/** Inline styles from `theme.slots`, by the same element names. */
	styles: Partial<Record<keyof PromptModel['classes'], string>>;
}

/**
 * The first defined string, so a prop outranks the bundle and the bundle
 * outranks the English fallback.
 *
 * @param values - Candidates, most specific first.
 * @returns The first defined value, or an empty string.
 */
const firstOf = function firstOf(...values: (string | undefined)[]): string {
	return values.find((value) => value !== undefined) ?? '';
};

/**
 * Join class names, skipping empty ones.
 *
 * @param names - Class names, possibly missing.
 * @returns A space-separated class list.
 */
export const joinClasses = function joinClasses(
	...names: (string | undefined)[]
): string {
	return names.filter(Boolean).join(' ');
};

type TranslationBundle = Partial<Translations>;

/**
 * Button and rights labels: props first, then core's copy order.
 *
 * @param bundle - The snapshot's translations.
 * @returns Labels keyed by action and by right.
 */
const resolveLabels = function resolveLabels(
	bundle: TranslationBundle | undefined,
	props: PromptProps
): { actions: Record<string, string>; rights: Record<string, string> } {
	const actions = resolveActionLabels(bundle);
	return {
		actions: {
			...actions,
			accept: props.acceptButtonText ?? actions.accept,
			customize: props.customizeButtonText ?? actions.customize,
			dismiss: props.dismissButtonText ?? actions.dismiss,
			reject: props.rejectButtonText ?? actions.reject,
		},
		rights: resolvePreferenceControlLabels(bundle),
	};
};

/**
 * Heading and body copy: props first, then core's copy order. A notice
 * prompt explains and points at the opt-out, so it has copy of its own.
 *
 * @param bundle - The snapshot's translations.
 * @param fallback - The English translations.
 * @param snapshot - The snapshot, for its policy prompt.
 */
const resolveCopy = function resolveCopy(
	bundle: TranslationBundle | undefined,
	fallback: TranslationBundle,
	props: PromptProps,
	snapshot: ConsentSnapshot
): PromptModel['copy'] {
	const copy = resolvePromptCopy(bundle, snapshot.policyRule.prompt);
	return {
		description: props.description ?? copy.description,
		securedBy: firstOf(bundle?.common?.securedBy, fallback.common?.securedBy),
		title: props.title ?? copy.title,
	};
};

/** The `theme.slots` key each banner element answers to. */
const PROMPT_SLOTS = {
	actionGroup: 'consentBannerFooterSubGroup',
	card: 'consentBannerCard',
	description: 'consentBannerDescription',
	footer: 'consentBannerFooter',
	header: 'consentBannerHeader',
	overlay: 'consentBannerOverlay',
	rightLink: 'consentBannerRightLink',
	rights: 'consentBannerRights',
	root: 'consentBanner',
	title: 'consentBannerTitle',
} as const satisfies Partial<
	Record<keyof PromptModel['classes'], AllThemeKeys>
>;

/**
 * Class names and inline styles for every element: the stock classes, or
 * none with `noStyle`, then the element's `theme.slots` entry. With
 * `disableAnimation` the entering classes are left out before the slots
 * apply.
 *
 * @param classNames - The stylesheet class maps.
 * @param disableAnimation - Leave out the entering classes, which mark the
 * mount. The stylesheet fades the banner in only when the client also
 * marks a late reveal with `data-entry="late"`.
 * @returns The class list and style for each element.
 */
const resolveClasses = function resolveClasses(
	classNames: PromptClassNames,
	props: PromptProps,
	theme: Theme | undefined,
	disableAnimation: boolean
): Pick<PromptModel, 'classes' | 'styles'> {
	const { actions, banner, button, legalLinks } = classNames;
	const noStyle = props.noStyle === true;
	const cls = (...names: (string | undefined)[]): string =>
		noStyle ? '' : joinClasses(...names);
	const entering = (name: string | undefined) =>
		disableAnimation ? undefined : name;
	const stock: PromptModel['classes'] = {
		actionGroup: cls(actions.actionGroup),
		button: cls(button.button),
		card: cls(banner.card),
		cardShell: cls(banner.cardShell),
		description: cls(banner.description),
		footer: cls(actions.actionRoot, banner.footer),
		header: cls(banner.header),
		// The React, Vue and Svelte legal links take only this stock class.
		legalLink: cls(legalLinks?.legalLink),
		overlay: cls(
			banner.overlay,
			banner.overlayVisible,
			entering(banner.overlayEntering)
		),
		rightLink: cls(banner.rightLink),
		rights: cls(banner.rights),
		root: cls(
			banner.root,
			banner.bannerVisible,
			entering(banner.bannerEntering)
		),
		title: cls(banner.title),
	};
	const classes = { ...stock };
	const styles: PromptModel['styles'] = {};
	for (const [name, key] of Object.entries(PROMPT_SLOTS) as [
		keyof typeof PROMPT_SLOTS,
		AllThemeKeys,
	][]) {
		const binding = resolveSlotBinding(theme, key, stock[name]);
		classes[name] = binding.class;
		styles[name] = binding.style;
	}
	// The `class` prop goes last, as the component's own override.
	classes.root = joinClasses(classes.root, props.class);
	return { classes, styles };
};

/**
 * Resolve the banner's copy, actions, layout and class names.
 *
 * @param input - The snapshot, the component props and the site options.
 */
export const resolvePromptModel = function resolvePromptModel(
	input: PromptModelInput
): PromptModel {
	const { snapshot, props } = input;
	const fallback = defaultTranslationConfig.translations
		.en as TranslationBundle;
	const bundle = snapshot.translations?.translations as
		| TranslationBundle
		| undefined;
	const labels = resolveLabels(bundle, props);
	const textDirection = getTextDirection(snapshot.translations?.language);

	// Same policy-driven action resolution the Svelte and React banners use,
	// so an opt-out or IAB policy produces the same buttons in the same order.
	const presentation = resolveConsentPresentation({
		actionAppearance: actionAppearanceFromTheme(input.theme),
		policy: snapshot.policyRule,
		presentation: input.presentation,
		surface: 'prompt',
	});
	const {
		actionGroups,
		blocking,
		direction,
		primaryActions,
		shouldFillActions: shouldFill,
		preferenceControls,
		variant,
	} = presentation;

	const { position } = presentation;

	// A notice offers no customize, so the resolver's default primary drops
	// out. When dismiss is the only button it is the primary one, as in the
	// React and Svelte banners.
	const orderedActions = actionGroups.flat();
	const primaries =
		primaryActions.length === 0 &&
		orderedActions.length === 1 &&
		orderedActions[0] === 'dismiss'
			? orderedActions
			: primaryActions;

	const classesAndStyles = resolveClasses(
		input.classNames,
		props,
		input.theme,
		props.disableAnimation ?? input.disableAnimation ?? false
	);
	return {
		actionGroups: actionGroups.map((group) =>
			group.map((action) => {
				const primary = primaries.includes(action);
				const style = props.noStyle
					? undefined
					: resolveActionAppearance(input.theme, action, primary);
				const slot = resolveSlotBinding(
					input.theme,
					primary ? 'buttonPrimary' : 'buttonSecondary',
					classesAndStyles.classes.button
				);
				return {
					action,
					className: slot.class,
					label: labels.actions[action] ?? action,
					mode: style?.mode,
					primary,
					style: slot.style,
					variant: style?.variant,
				};
			})
		),
		blocking,
		...classesAndStyles,
		copy: resolveCopy(bundle, fallback, props, snapshot),
		direction,
		language: snapshot.translations?.language,
		legalLinks: resolveLegalLinkEntries(
			input.legalLinks,
			props.legalLinks,
			bundle?.legalLinks
		),
		model: snapshot.policyRule.model,
		position,
		prompt:
			snapshot.policyRule.prompt === 'none'
				? undefined
				: snapshot.policyRule.prompt,
		rights: preferenceControls.map((right) => ({
			label: labels.rights[right] ?? right,
			right,
		})),
		shouldFill,
		split: actionGroups.length > 1 && !shouldFill,
		textDirection,
		variant,
	};
};
