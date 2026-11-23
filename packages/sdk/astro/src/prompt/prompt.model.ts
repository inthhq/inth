/**
 * What the consent prompt shows for a snapshot.
 *
 * The server renders this into the page, and the browser renders the same
 * model after every change, so the two cannot drift. Everything here
 * follows the React prompt (`@inth/react`'s `components/prompt`),
 * which is the parity baseline.
 *
 * @internal
 */

import { resolveOptOutReceipt, resolveOptOutState } from '@inth/sdk/engine';
import type {
	ConsentExperiment,
	ConsentPresentation,
	ConsentSnapshot,
	LegalLinks,
	PresentationAction,
} from '@inth/sdk/engine';
import {
	resolvePrivacyChoicesBannerCopy,
	resolvePrivacyChoicesVariant,
	resolveRightsBundle,
} from '@inth/sdk/surface-state';
import type {
	OptOutReceiptData,
	PrivacyChoicesBannerCopy,
	PrivacyChoicesPromptVariant,
	RightsBundle,
} from '@inth/sdk/surface-state';
import type { Translations } from '@inth/sdk/translations';
import { resolveActionAppearance } from '@inth/sdk/ui/theme';
import type { AllThemeKeys, ConsentActionKey, Theme } from '@inth/sdk/ui/theme';
import {
	getTextDirection,
	resolveBrandingTag,
	resolveLegalLinkEntries,
} from '@inth/sdk/ui/utils';
import type { LegalLinkEntry } from '@inth/sdk/ui/utils';

import { resolveSlotBinding } from '../banner/theme-slots.model';
import type { PromptClassNames } from './prompt-class-names';
import { containerTypeOf, resolvePromptPresentation } from './prompt-presentation.model';
import type { PromptContainerType, PromptLayouts } from './prompt-presentation.model';

export type { PromptContainerType, PromptLayouts } from './prompt-presentation.model';

/** The `<ConsentBanner />` props that shape its markup. */
export interface PromptProps {
	/** Override the prompt's heading. */
	title?: string;
	/** Override the prompt's body copy. */
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
	/** Extra class on the prompt's root. */
	class?: string;
	/** Drop the "Consent by" tag. */
	hideBranding?: boolean;
	/**
	 * Which legal links the prompt shows: the Privacy Policy and the Cookie
	 * Policy by default. `null` shows none.
	 */
	legalLinks?: (keyof LegalLinks)[] | null;
}

type TranslationBundle = Partial<Translations>;

/** A class list and inline style for one element. */
export interface PartBinding {
	class: string | undefined;
	style: string | undefined;
}

/** One stock consent button. */
export interface PromptButton extends PartBinding {
	/** `data-variant`, left out with `noStyle`. */
	variant: string | undefined;
	/** `data-mode`, left out with `noStyle`. */
	mode: string | undefined;
}

/** A first-layer action the collapsed prompt can show. */
export type SummaryAction = 'reject' | 'accept' | 'customize';

/** Everything the prompt markup needs, besides its live state. */
export interface PromptModel {
	container: PromptLayouts;
	presentation: PromptContainerType;
	variant: PrivacyChoicesPromptVariant;
	/** The policy rule's model and prompt, for the root's data attributes. */
	rule: { model: string; prompt: string };
	copy: PrivacyChoicesBannerCopy;
	/**
	 * The policy's first-layer actions, in the host's order and groups,
	 * for the collapsed prompt. A notice's opt-out link and OK are not
	 * among them.
	 */
	summaryGroups: SummaryAction[][];
	/** `dir` for the root, from the banner's language. */
	textDirection: 'ltr' | 'rtl';
	/** The props' overrides, else the copy. */
	labels: {
		title: string;
		description: string;
		barDescription: string;
		expand: string;
		expandBar: string;
		reject: string;
		rejectExpanded: string;
		accept: string;
		acceptExpanded: string;
		ok: string;
	};
	links: LegalLinkEntry[];
	barLinks: LegalLinkEntry[];
	bundle: RightsBundle;
	gpc: boolean;
	noStyle: boolean;
	disableAnimation: boolean;
	tag: {
		brand: 'inth' | 'c15t';
		href: string;
		securedBy: string;
		binding: PartBinding;
	} | null;
	/** Stock classes plus `theme.slots`, by element. */
	parts: Record<PartName, PartBinding>;
	buttons: Record<
		'reject' | 'accept' | 'customize' | 'dismiss' | 'save',
		PromptButton
	>;
	classNames: PromptClassNames;
}

/** Elements a `theme.slots` key can style. */
export type PartName =
	| 'actionGroup'
	| 'barActions'
	| 'barText'
	| 'barTitle'
	| 'body'
	| 'card'
	| 'description'
	| 'expand'
	| 'footer'
	| 'header'
	| 'overlay'
	| 'rightLink'
	| 'root'
	| 'shell'
	| 'title';

/** The `theme.slots` key each element answers to, as `THEME_SLOT_COMPONENT_KEYS` maps them. */
const PART_SLOTS: Partial<Record<PartName, AllThemeKeys>> = {
	actionGroup: 'consentBannerFooterSubGroup',
	// The collapsed bar's heading, text and buttons answer to the same keys
	// as the card's, as React's bar reads them.
	barActions: 'consentBannerFooter',
	barText: 'consentBannerDescription',
	barTitle: 'consentBannerTitle',
	// The side Drawer's body and the in-place panel are the same element
	// for a theme, as React's `banner.expand` slot reads them.
	body: 'consentBannerExpand',
	card: 'consentBannerCard',
	description: 'consentBannerDescription',
	expand: 'consentBannerExpand',
	footer: 'consentBannerFooter',
	header: 'consentBannerHeader',
	overlay: 'consentBannerOverlay',
	// The notice's opt-out link, in the card and in the bar.
	rightLink: 'consentBannerRightLink',
	root: 'consentBanner',
	title: 'consentBannerTitle',
};

const CARD_LINKS: (keyof LegalLinks)[] = ['privacyPolicy', 'cookiePolicy'];

const join = (...names: (string | undefined)[]): string =>
	names.filter(Boolean).join(' ');

/** Site options the prompt reads. */
export interface PromptOptions {
	presentation?: ConsentPresentation;
	experiment?: ConsentExperiment;
	legalLinks?: LegalLinks;
	theme?: Theme;
	disableAnimation?: boolean;
}

/**
 * The rights bundle the sale row names (COPY-01, SR-04): the confirmed
 * rights of a held opt-out, else every right. The rights count as
 * confirmed only through this browser's local receipt data, so it must be
 * passed; the server has none.
 */
export const rightsBundleOf = function rightsBundleOf(
	snapshot: Pick<ConsentSnapshot, 'optOut'>,
	local: Partial<OptOutReceiptData> | null
): RightsBundle {
	return (
		resolveRightsBundle(resolveOptOutReceipt(snapshot, local).rights) ?? 'all'
	);
};

/** Every action shows in this order when the policy names none. */
const DEFAULT_ACTION_GROUPS: readonly (readonly PresentationAction[])[] = [
	['reject', 'accept'],
	['customize'],
];

const isSummaryAction = (action: PresentationAction): action is SummaryAction =>
	action === 'reject' || action === 'accept' || action === 'customize';

/**
 * The policy's first-layer actions the collapsed prompt shows, in the
 * host's groups, as React's surface filters them.
 */
export const summaryGroupsOf = function summaryGroupsOf(
	actionGroups: readonly (readonly PresentationAction[])[] | undefined
): SummaryAction[][] {
	return (actionGroups ?? DEFAULT_ACTION_GROUPS)
		.map((group) => group.filter(isSummaryAction))
		.filter((group) => group.length > 0);
};

/** Input for {@link resolvePromptModel}. */
export interface PromptModelInput {
	snapshot: ConsentSnapshot;
	props: PromptProps;
	options: PromptOptions;
	classNames: PromptClassNames;
	/** The page's host name, for the tag's `?ref=`. */
	hostname?: string;
	/**
	 * This browser's local opt-out receipt data, which confirms a held
	 * record's rights (SR-04). The server passes none.
	 */
	receiptData?: Partial<OptOutReceiptData> | null;
}

const button = function button(
	theme: Theme | undefined,
	classNames: PromptClassNames,
	noStyle: boolean,
	action: ConsentActionKey,
	primary: boolean,
	slot?: AllThemeKeys
): PromptButton {
	const appearance = resolveActionAppearance(theme, action, primary);
	const binding = resolveSlotBinding(
		theme,
		slot ??
			(appearance.variant === 'primary' ? 'buttonPrimary' : 'buttonSecondary'),
		noStyle ? '' : join(classNames.button.button)
	);
	return {
		class: binding.class || undefined,
		mode: noStyle ? undefined : appearance.mode,
		style: binding.style,
		variant: noStyle ? undefined : appearance.variant,
	};
};

/**
 * Resolve the prompt's container, copy, links and classes.
 *
 * @throws {Error} When the policy resolves no prompt container, which
 * the prompt surface always does.
 */
// oxlint-disable-next-line complexity -- One resolution per element, as React's surface reads them inline.
export const resolvePromptModel = function resolvePromptModel(
	input: PromptModelInput
): PromptModel {
	const { snapshot, props, options, classNames } = input;
	const resolved = resolvePromptPresentation(snapshot, options);
	const { container } = resolved;
	if (!container) {
		throw new Error('@inth/astro: the consent prompt resolved no container.');
	}
	const presentation = containerTypeOf(container);
	const presentationClasses = classNames[presentation];
	const bundle = snapshot.translations?.translations as
		| TranslationBundle
		| undefined;
	const variant = resolvePrivacyChoicesVariant(snapshot.policyRule);
	const rights = rightsBundleOf(snapshot, input.receiptData ?? null);
	const gpc = resolveOptOutState(snapshot).lock === 'gpc-active';
	const copy = resolvePrivacyChoicesBannerCopy(bundle, {
		bundle: rights,
		gpc,
		variant,
	});
	const noStyle = props.noStyle === true;
	const { theme } = options;
	const { surface } = classNames;
	const stock: Record<PartName, string> = {
		actionGroup: join(surface.actionGroup, presentationClasses.actionGroup),
		barActions: join(presentationClasses.actions),
		barText: join(presentationClasses.text),
		barTitle: join(surface.visuallyHidden),
		// The side Drawer's body holds the options from the start; the view
		// picks it or the in-place panel by the layout in force, since the
		// phone Drawer expands in place.
		body: join(presentationClasses.body),
		card: join(surface.card, presentationClasses.card),
		description: join(surface.description),
		expand: join(classNames.expand.panel),
		footer: join(surface.footer, presentationClasses.footer),
		header: join(surface.head, presentationClasses.head),
		overlay: join(surface.scrim),
		rightLink: join(surface.rightLink),
		root: join(surface.root, presentationClasses.root),
		shell: join(surface.shell, presentationClasses.shell),
		title: join(surface.title),
	};
	const parts = {} as Record<PartName, PartBinding>;
	for (const name of Object.keys(stock) as PartName[]) {
		const slot = PART_SLOTS[name];
		const base = noStyle ? '' : stock[name];
		const binding = slot
			? resolveSlotBinding(theme, slot, base)
			: { class: base, style: undefined };
		parts[name] = {
			class: binding.class || undefined,
			style: binding.style,
		};
	}
	if (props.class) {
		parts.root = {
			...parts.root,
			class: join(parts.root.class, props.class),
		};
	}

	const linkKeys =
		props.legalLinks === undefined ? CARD_LINKS : props.legalLinks;
	const links = resolveLegalLinkEntries(
		options.legalLinks,
		linkKeys,
		bundle?.legalLinks
	);
	const barLinks = resolveLegalLinkEntries(
		options.legalLinks,
		linkKeys?.filter((key) => key === 'privacyPolicy') ?? null,
		bundle?.legalLinks
	);

	const branding = props.hideBranding
		? null
		: resolveBrandingTag({
				branding: snapshot.branding,
				hostname: input.hostname,
				noStyle: true,
				styles: {},
				surface: 'banner',
			});
	const tagBinding = resolveSlotBinding(
		theme,
		'consentBannerTag',
		noStyle ? '' : join(surface.tag, presentationClasses.tag)
	);
	const common = bundle?.common;
	const securedBy = common?.securedBy ?? 'Consent by';

	return {
		barLinks,
		bundle: rights,
		buttons: {
			accept: button(theme, classNames, noStyle, 'accept', false),
			customize: button(theme, classNames, noStyle, 'customize', true),
			dismiss: button(theme, classNames, noStyle, 'dismiss', true),
			reject: button(theme, classNames, noStyle, 'reject', false),
			save: button(
				theme,
				classNames,
				noStyle,
				'save',
				true,
				'consentBannerSaveButton'
			),
		},
		classNames,
		container,
		copy,
		disableAnimation:
			props.disableAnimation ?? options.disableAnimation ?? false,
		gpc,
		labels: {
			accept: props.acceptButtonText ?? copy.accept,
			acceptExpanded: props.acceptButtonText ?? copy.acceptExpanded,
			barDescription: props.description ?? copy.barDescription,
			description: props.description ?? copy.description,
			expand: props.customizeButtonText ?? copy.expand,
			expandBar: props.customizeButtonText ?? copy.expandBar,
			ok: props.dismissButtonText ?? copy.ok,
			reject: props.rejectButtonText ?? copy.reject,
			rejectExpanded: props.rejectButtonText ?? copy.rejectExpanded,
			title: props.title ?? copy.title,
		},
		links,
		noStyle,
		parts,
		presentation,
		rule: {
			model: snapshot.policyRule.model,
			prompt: snapshot.policyRule.prompt,
		},
		summaryGroups: summaryGroupsOf(resolved.actionGroups),
		tag: branding
			? {
					binding: {
						class: tagBinding.class || undefined,
						style: tagBinding.style,
					},
					brand: branding.brand,
					href: branding.href,
					securedBy,
				}
			: null,
		textDirection: getTextDirection(snapshot.translations?.language),
		variant,
	};
};
