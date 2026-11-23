/**
 * The Privacy Choices prompt's markup: a Card, Banner or Drawer, the same
 * elements, attributes, test ids and ARIA as React's `PrivacyChoicesSurface`.
 * The server renders it collapsed, on the desktop layout; the browser
 * renders every later state from the same function.
 *
 * @internal
 */

import type { ResolvedConsentLayout } from '@inth/sdk/engine';
import { BRAND_MARKS } from '@inth/sdk/ui/utils';
import type { LegalLinkEntry } from '@inth/sdk/ui/utils';

import type { PrivacyChoicesModel, PromptButton } from './model';
import { h, raw } from './vnode';
import type { VAttributes, VChild, VElement } from './vnode';

/** The prompt's live state. */
export interface PromptViewState {
	/** The layout that applies: desktop, or phone under `PHONE_LAYOUT_QUERY`. */
	layout: ResolvedConsentLayout;
	/** `'leaving'` plays the exit and takes no input (PERM-05). */
	phase: 'shown' | 'leaving';
	/** The session's expanded flag, ignored all-in-one. */
	expanded: boolean;
	/** The card's status text. */
	status: string;
	/** The options, once loaded; rendered inside the scroll area. */
	panel: VChild;
	/** Element ids, unique per prompt (SR-05). */
	ids: PromptIds;
}

/** The prompt's element ids. */
export interface PromptIds {
	prefix: string;
	panel: string;
	title: string;
}

/** The prompt's id prefix, the same on the server and in the browser. */
export const PRIVACY_CHOICES_ID_PREFIX = 'inth-pc-banner';

/** Ids for a prefix, as React builds them from `useId`. */
export const promptIds = function promptIds(prefix: string): PromptIds {
	return {
		panel: `${prefix}-panel`,
		prefix,
		title: `${prefix}-title`,
	};
};

const bool = (value: boolean): string => (value ? 'true' : 'false');
const flag = (value: boolean): string | undefined => (value ? '' : undefined);

/** `class` and `style` from a binding, merged with other attributes. */
const bound = function bound(
	binding: { class: string | undefined; style: string | undefined },
	attrs: VAttributes
): VAttributes {
	return { class: binding.class, style: binding.style, ...attrs };
};

/** A class list, or none under `noStyle`. */
const cx = function cx(
	model: PrivacyChoicesModel,
	...names: (string | undefined)[]
): string | undefined {
	if (model.noStyle) {
		return undefined;
	}
	return names.filter(Boolean).join(' ') || undefined;
};

/** The brand mark, as React's `BrandMarkIcon` renders it. */
const brandMark = function brandMark(
	mark: 'inth' | 'c15t',
	className: string | undefined
): VElement {
	const glyph = BRAND_MARKS[mark];
	const paths = glyph.paths
		.map((path) =>
			path.evenOdd
				? `<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="${path.d}"></path>`
				: `<path fill="currentColor" d="${path.d}"></path>`
		)
		.join('');
	return raw(
		'svg',
		{
			'aria-hidden': 'true',
			class: className,
			fill: 'none',
			viewBox: glyph.viewBox,
			xmlns: 'http://www.w3.org/2000/svg',
		},
		paths
	);
};

/** The "Consent by [INTH]" tag (BNR-11). */
const consentTag = function consentTag(
	model: PrivacyChoicesModel
): VElement | null {
	const { tag } = model;
	if (!tag) {
		return null;
	}
	const { surface } = model.classNames;
	return h(
		'a',
		bound(tag.binding, {
			'data-branding': tag.brand,
			'data-testid': 'consent-banner-branding',
			href: tag.href,
			rel: 'noreferrer',
			target: '_blank',
		}),
		h('span', {}, tag.securedBy),
		brandMark(tag.brand, cx(model, surface.tagMark)),
		h(
			'span',
			{ class: cx(model, surface.visuallyHidden) },
			tag.brand === 'inth' ? 'Inth' : 'c15t'
		)
	);
};

/** The inline legal links after a description, as React's `InlineLegalLinks`. */
const legalLinks = function legalLinks(
	model: PrivacyChoicesModel,
	entries: readonly LegalLinkEntry[]
): VElement | null {
	if (entries.length === 0) {
		return null;
	}
	return h(
		'span',
		{},
		' ',
		entries.map((link) =>
			h(
				'span',
				{},
				h(
					'a',
					{
						class: model.classNames.legalLinks.legalLink,
						'data-testid': `consent-banner-legal-link-${link.key}`,
						href: link.href,
						rel: link.rel,
						target: link.target,
					},
					link.separated ? `${link.label},` : link.label
				),
				link.separated ? ' ' : null
			)
		)
	);
};

/** Which React `ConsentButton` a prompt button is. */
type ButtonAction = 'reject' | 'accept' | 'customize' | 'dismiss' | 'save';

/** A stock consent button, as `ConsentButton` renders it. */
const consentButton = function consentButton(
	model: PrivacyChoicesModel,
	action: ButtonAction,
	label: string,
	attrs: VAttributes = {}
): VElement {
	const style: PromptButton = model.buttons[action];
	return h(
		'button',
		{
			class: style.class,
			'data-action': action,
			// React marks the buttons whose clicks its pre-hydration script
			// must not replay; Save is not one of its replayed actions.
			'data-early-tap': action === 'save' ? undefined : 'off',
			'data-mode': style.mode,
			'data-size': model.noStyle ? undefined : 'small',
			'data-testid': `consent-banner-${action}-button`,
			'data-variant': style.variant,
			style: style.style,
			type: 'button',
			...attrs,
		},
		label
	);
};

/**
 * The prompt's root, overlay, shell and card for one state.
 *
 * @param model - From `resolvePrivacyChoicesModel`.
 * @param state - The layout, phase, expansion and options.
 */
// oxlint-disable-next-line complexity, max-lines-per-function -- The prompt's markup in one place, as React's surface renders it.
export const renderPrompt = function renderPrompt(
	model: PrivacyChoicesModel,
	state: PromptViewState
): VElement {
	const { layout, ids } = state;
	const { classNames, labels, parts } = model;
	const { surface } = classNames;
	const presentation = classNames[model.presentation];
	const expandClasses = classNames.expand;
	const allInOne = layout.flow === 'all-in-one';
	const bar = layout.type === 'banner';
	const expanded = !allInOne && state.expanded;
	const barCollapsed = bar && !expanded;
	const optionsOpen = allInOne || expanded;
	const notice = model.variant === 'notice';

	const expandButton = (label: string, inBar: boolean): VElement => {
		const aria = {
			'aria-controls': inBar ? undefined : ids.panel,
			'aria-expanded': bool(expanded),
		};
		if (notice) {
			// The notice's rights action reads as a link (VIS-02).
			return h(
				'button',
				{
					...aria,
					class: cx(model, surface.rightLink),
					'data-testid': 'consent-banner-right-link-opt-out',
					type: 'button',
				},
				label
			);
		}
		return consentButton(model, 'customize', label, aria);
	};
	const okButton = consentButton(model, 'dismiss', labels.ok);
	const saveButton = consentButton(model, 'save', model.copy.save);
	const actionGroup = (...children: VChild[]) =>
		h(
			'div',
			bound(parts.actionGroup, {
				'data-testid': 'consent-banner-footer-sub-group',
			}),
			...children
		);

	let footer: VChild;
	if (optionsOpen) {
		footer = notice
			? okButton
			: [
					actionGroup(
						consentButton(model, 'reject', labels.rejectExpanded),
						consentButton(model, 'accept', labels.acceptExpanded)
					),
					saveButton,
				];
	} else if (notice) {
		footer = [expandButton(labels.expand, false), okButton];
	} else {
		footer = [
			actionGroup(
				consentButton(model, 'reject', labels.reject),
				consentButton(model, 'accept', labels.accept)
			),
			expandButton(labels.expand, false),
		];
	}

	const tag = consentTag(model);
	const scroll = h(
		'div',
		{
			class: cx(model, expandClasses.scroll),
			'data-testid': 'consent-banner-body',
		},
		state.panel
	);
	const status = h(
		'output',
		{
			'aria-atomic': 'true',
			'aria-live': 'polite',
			class: cx(model, surface.visuallyHidden),
			'data-testid': 'consent-banner-status',
		},
		state.status
	);

	let body: VChild;
	if (barCollapsed) {
		body = [
			h(
				'h2',
				{
					class: cx(model, surface.visuallyHidden),
					'data-testid': 'consent-banner-title',
					id: ids.title,
				},
				labels.title
			),
			h(
				'div',
				{ class: cx(model, presentation.row) },
				h(
					'p',
					{
						class: cx(model, presentation.text),
						'data-testid': 'consent-banner-description',
					},
					labels.barDescription,
					legalLinks(model, model.barLinks)
				),
				h(
					'div',
					{
						class: cx(model, presentation.actions),
						'data-testid': 'consent-banner-footer',
					},
					notice ? null : consentButton(model, 'reject', labels.reject),
					notice ? null : consentButton(model, 'accept', labels.accept),
					expandButton(labels.expandBar, true),
					notice ? okButton : null
				)
			),
			status,
		];
	} else {
		body = [
			h(
				'div',
				bound(parts.header, { 'data-testid': 'consent-banner-header' }),
				h(
					'h2',
					bound(parts.title, {
						'data-testid': 'consent-banner-title',
						id: ids.title,
					}),
					labels.title
				),
				h(
					'p',
					bound(parts.description, {
						'data-testid': 'consent-banner-description',
					}),
					labels.description,
					legalLinks(model, model.links)
				)
			),
			allInOne
				? h(
						'div',
						bound(parts.expand, {
							'data-testid': 'consent-banner-expand-panel',
						}),
						scroll,
						tag
							? h('div', { class: cx(model, presentation.tagSlot) }, tag)
							: null
					)
				: h(
						'div',
						bound(parts.expand, {
							'data-open': bool(expanded),
							'data-testid': 'consent-banner-expand-panel',
							id: ids.panel,
							inert: flag(!expanded),
						}),
						h('div', { class: cx(model, expandClasses.inner) }, scroll)
					),
			status,
			h(
				'div',
				bound(parts.footer, { 'data-testid': 'consent-banner-footer' }),
				footer
			),
		];
	}

	return h(
		'div',
		bound(parts.root, {
			'data-blocking': layout.blocking ? 'true' : undefined,
			'data-design': 'privacy-choices',
			'data-edge-style': layout.edgeStyle,
			'data-expanded': expanded ? 'true' : undefined,
			'data-flow': layout.flow,
			'data-placement': layout.placement,
			'data-state': state.phase === 'leaving' ? 'closed' : 'open',
			'data-testid': 'consent-banner-root',
			'data-variant': model.variant,
			inert: flag(state.phase === 'leaving'),
		}),
		layout.blocking
			? h(
					'div',
					bound(parts.overlay, {
						'aria-hidden': 'true',
						'data-testid': 'consent-banner-overlay',
					})
				)
			: null,
		h(
			'div',
			bound(parts.shell, {
				'aria-labelledby': layout.blocking ? ids.title : undefined,
				'aria-modal': layout.blocking ? 'true' : undefined,
				'data-testid': 'consent-banner-shell',
				role: layout.blocking ? 'dialog' : undefined,
			}),
			allInOne ? null : tag,
			h(
				'section',
				bound(parts.card, {
					'aria-labelledby': layout.blocking ? undefined : ids.title,
					'data-testid': 'consent-banner-card',
					// Blocking moves the dialog role to the shell (PERM-08).
					role: layout.blocking ? undefined : 'region',
					tabindex: '-1',
				}),
				body
			)
		)
	);
};

/**
 * The page's status region, which outlives the prompt so a choice is read
 * after it leaves (BNR-06). Rendered once; a controller owns it after.
 */
export const renderPageStatus = function renderPageStatus(
	model: Pick<PrivacyChoicesModel, 'classNames'>
): VElement {
	return h('div', {
		class: model.classNames.surface.visuallyHidden,
		'data-testid': 'consent-banner-announcement',
	});
};
