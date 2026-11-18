/**
 * The browser-rendered consent banner.
 *
 * Loaded only when a page owes a banner the server did not render: a
 * prerendered page in hosted or manifest mode, where the policy comes from
 * the visitor's own init. It builds the markup `prompt.astro` would have
 * produced, from the same model, into the spot `<ConsentBanner />` marked.
 * The spot also carries the stylesheet class names, so this chunk imports
 * no stylesheet of its own.
 */

import {
	applyExperimentAssignment,
	applyExperimentTheme,
} from '@inth/sdk/engine';
import type {
	ConsentExperiment,
	ConsentPresentation,
	ConsentSnapshot,
	LegalLinks,
} from '@inth/sdk/engine';
import type { Theme } from '@inth/sdk/ui/theme';

import type { PromptClassNames } from '../banner/class-names';
import { resolvePromptModel } from '../banner/prompt-model';
import type { PromptModel, PromptProps } from '../banner/prompt-model';
import { PROMPT_SLOT_ATTRIBUTE } from '../banner/slot';
import { element, hiddenBanner, readSpot, renderBrandingTag } from './dom';

/** Site options the banner reads. */
export interface RenderPromptOptions {
	/** The integration's `experiment`, whose assigned arm is merged in. */
	experiment?: ConsentExperiment;
	presentation?: ConsentPresentation;
	legalLinks?: LegalLinks;
	/** The integration's `theme`, for `consentActions` and `slots`. */
	theme?: Theme;
	/** The integration's `disableAnimation`. */
	disableAnimation?: boolean;
}

/** What `<ConsentBanner />` leaves in its spot. */
export interface PromptSlotData {
	props: PromptProps;
	classNames: PromptClassNames;
}

const EMPTY_CLASS_NAMES: PromptClassNames = {
	actions: {},
	banner: {},
	branding: {},
	button: {},
};

const readSlot = function readSlot(slot: HTMLElement): PromptSlotData {
	const parsed = readSpot(
		slot,
		PROMPT_SLOT_ATTRIBUTE
	) as Partial<PromptSlotData> | null;
	return {
		classNames: { ...EMPTY_CLASS_NAMES, ...parsed?.classNames },
		props: parsed?.props ?? {},
	};
};

const renderFooter = function renderFooter(
	model: PromptModel,
	props: PromptProps
): HTMLElement {
	const children: HTMLElement[] = [];
	if (model.rights.length > 0) {
		children.push(
			element(
				'div',
				{
					class: model.classes.rights,
					'data-testid': 'consent-banner-rights',
					style: model.styles.rights,
				},
				model.rights.map(({ right, label }) =>
					element(
						'button',
						{
							class: model.classes.rightLink,
							'data-action': 'right',
							'data-inth-action': 'customize',
							'data-right': right,
							'data-testid': `consent-banner-right-link-${right}`,
							style: model.styles.rightLink,
							type: 'button',
						},
						[label]
					)
				)
			)
		);
	}
	for (const group of model.actionGroups) {
		children.push(
			element(
				'div',
				{
					class: model.classes.actionGroup,
					'data-direction': model.direction,
					'data-fill': model.shouldFill ? 'true' : undefined,
					'data-testid': 'consent-banner-footer-sub-group',
					style: model.styles.actionGroup,
				},
				group.map(({ action, className, label, mode, style, variant }) =>
					element(
						'button',
						{
							class: className,
							'data-action': action,
							'data-inth-action': action,
							'data-mode': mode,
							'data-size': props.noStyle ? undefined : 'small',
							'data-testid': `consent-banner-${action}-button`,
							'data-variant': variant,
							style,
							type: 'button',
						},
						[label]
					)
				)
			)
		);
	}
	return element(
		'div',
		{
			class: model.classes.footer,
			'data-direction': model.direction,
			'data-fill': model.shouldFill ? 'true' : undefined,
			'data-split': model.split ? 'true' : undefined,
			'data-testid': 'consent-banner-footer',
			style: model.styles.footer,
		},
		children
	);
};

/**
 * The legal links after the description, in the shape of the React
 * banner's `InlineLegalLinks`: a space first, and a comma inside every link
 * but the last, followed by a space outside it.
 */
const renderLegalLinks = function renderLegalLinks(
	model: PromptModel
): HTMLElement {
	return element('span', {}, [
		' ',
		...model.legalLinks.map((link) =>
			element('span', {}, [
				element(
					'a',
					{
						class: model.classes.legalLink || undefined,
						'data-testid': `consent-banner-legal-link-${link.key}`,
						href: link.href,
						rel: link.rel,
						target: link.target,
					},
					[link.separated ? `${link.label},` : link.label]
				),
				...(link.separated ? [' '] : []),
			])
		),
	]);
};

/**
 * Build the banner for a snapshot, without inserting it.
 *
 * @param slot - The props and class names `<ConsentBanner />` left.
 * @param options - The site options the banner reads.
 * @returns The overlay (blocking banners only) followed by the banner root.
 */
export const buildPrompt = function buildPrompt(
	snapshot: ConsentSnapshot,
	slot: PromptSlotData,
	options: RenderPromptOptions
): HTMLElement[] {
	const { props } = slot;
	// The assigned arm rides on the host presentation and theme, as in
	// `prompt.astro`.
	const theme = applyExperimentTheme(
		options.theme,
		options.experiment,
		snapshot.experiment
	);
	const model = resolvePromptModel({
		classNames: slot.classNames,
		disableAnimation: options.disableAnimation,
		legalLinks: options.legalLinks,
		presentation: applyExperimentAssignment(
			options.presentation,
			options.experiment,
			snapshot.experiment
		),
		props,
		snapshot,
		theme,
	});
	const description = element(
		'div',
		{
			class: model.classes.description,
			'data-context': 'banner',
			'data-testid': 'consent-banner-description',
			style: model.styles.description,
		},
		[
			model.copy.description,
			...(model.legalLinks.length > 0 ? [renderLegalLinks(model)] : []),
		]
	);
	const card = element(
		'div',
		{
			'aria-label': model.copy.title,
			'aria-modal': model.blocking ? 'true' : undefined,
			class: model.classes.card,
			'data-testid': 'consent-banner-card',
			role: model.blocking ? 'dialog' : 'region',
			style: model.styles.card,
			tabindex: '-1',
		},
		[
			element(
				'div',
				{
					class: model.classes.header,
					'data-testid': 'consent-banner-header',
					style: model.styles.header,
				},
				[
					element(
						'h2',
						{
							class: model.classes.title,
							'data-testid': 'consent-banner-title',
							style: model.styles.title,
						},
						[model.copy.title]
					),
					description,
				]
			),
			renderFooter(model, props),
		]
	);
	const branding = renderBrandingTag(
		{
			branding: snapshot.branding,
			hide: props.hideBranding,
			noStyle: props.noStyle,
			styles: slot.classNames.branding,
			surface: 'banner',
			theme,
		},
		model.copy.securedBy
	);
	const root = element(
		'div',
		{
			class: model.classes.root,
			'data-blocking': model.blocking ? 'true' : undefined,
			'data-model': model.model,
			'data-position': model.position,
			'data-prompt': model.prompt,
			'data-testid': 'consent-banner-root',
			'data-variant': model.variant,
			dir: model.textDirection,
			lang: model.language,
			style: model.styles.root,
		},
		[
			element(
				'div',
				{ class: model.classes.cardShell },
				branding ? [branding, card] : [card]
			),
		]
	);
	return hiddenBanner(
		root,
		model.blocking
			? element('div', {
					'aria-hidden': 'true',
					class: model.classes.overlay,
					'data-testid': 'consent-banner-overlay',
					style: model.styles.overlay,
				})
			: null
	);
};

/**
 * Render the banner into the first spot `<ConsentBanner />` left for it.
 *
 * @param options - The site options the banner reads.
 * @returns `true` when a banner was inserted.
 */
export const renderPromptIntoSlot = function renderPromptIntoSlot(
	snapshot: ConsentSnapshot,
	options: RenderPromptOptions
): boolean {
	const slot = document.querySelector<HTMLElement>(
		`[${PROMPT_SLOT_ATTRIBUTE}]`
	);
	if (!slot) {
		return false;
	}
	slot.replaceWith(...buildPrompt(snapshot, readSlot(slot), options));
	return true;
};
