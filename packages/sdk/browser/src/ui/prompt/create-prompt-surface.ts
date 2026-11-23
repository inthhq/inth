// Promise chains, not async functions, as in `./prompt.ts`.
/* oxlint-disable promise/prefer-await-to-then, promise/prefer-await-to-callbacks, promise/prefer-catch */
/**
 * The consent prompt: a Card, Banner or Drawer that shows the same
 * content, copy and decisions in every container. The entry modules
 * beside this file (`card.ts`, `banner.ts`, `drawer.ts`) pass
 * the stylesheet and class names of one presentation each, so a page
 * carries only the presentation it renders. Ported from `@inth/react`'s
 * `components/prompt/surface.tsx`.
 *
 * @packageDocumentation
 * @internal
 */

import {
	announcementText,
	resolveBannerAllowedAnnouncement,
	resolveOptOutState,
	resolvePrivacyChoicesBannerCopy,
	resolvePrivacyChoicesVariant,
} from '@inth/sdk-core';
import type {
	BannerCommitAction,
	ConsentSnapshot,
	PresentationAction,
	PrivacyChoicesPromptVariant,
	ResolvedConsentLayout,
	ResolvedConsentPresentation,
} from '@inth/sdk-core';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk-core/runtime/page-globals';
import { EARLY_TAP_OPT_OUT } from '@inth/sdk-core/surface-actions';
import {
	afterMotion,
	attachLiveRegion,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
} from '@inth/sdk-ui/primitives/surface';
import type { LiveRegion, ScrollFades } from '@inth/sdk-ui/primitives/surface';
import {
	getTextDirection,
	resolveBrandingTag,
	tabbableElements,
} from '@inth/sdk-ui/utils';
import { BRAND_MARKS } from '@inth/sdk-ui/utils/branding';

import { classes as expandStyles } from '../../generated/ui/expand';
import { classes as surfaceStyles } from '../../generated/ui/surface';
import type { ConsentBannerOptions } from '../../consent-client.model';
import type { PartSheet } from '../dialog/options-sheets';
import {
	activeElementOf,
	cx,
	el,
	focusFirstIn,
	owned,
	patch,
} from '../parts/dom';
import type { PartChild, PartRef } from '../parts/dom';
import {
	commitBannerChoice,
	createPreferenceDraft,
	getOptOutReceiptData,
	hasConsentUI,
} from '../parts/engine';
import { importPanel } from '../parts/load';
import {
	consentButton,
	prefersReducedMotionNow,
	rightsBundleOf,
	surfaceBasics,
	watchPhoneLayout,
} from '../parts/shared';
import type { PartEnv } from '../parts/shared';
import { renderLegalLinks } from '../surface';
import type { SurfaceContext } from '../surface';
import type { PromptPanel } from './panel';

/** Exits are 160ms; the controllers add their own slack. */
const EXIT_MS = 160;

/** Where focus goes after a choice (BNR-06, ARCH-03). */
const RETURN_TARGETS = [
	'[data-testid="privacy-choices-link"]:not([hidden])',
	'[data-testid="consent-dialog-trigger"]',
];

const CARD_LINKS = ['privacyPolicy', 'cookiePolicy'] as const;

/** The first-layer actions the policy allows, in the host's order and groups. */
export type PromptActionGroups = readonly (readonly PresentationAction[])[];

/** Every action, in the default order, when the host passes none. */
const DEFAULT_ACTION_GROUPS: PromptActionGroups = [
	['reject', 'accept'],
	['customize'],
];

/** One presentation's stylesheets and class names. */
export interface PresentationEntry {
	/** The shell, then this presentation's rules, in cascade order. */
	sheets: readonly PartSheet[];
	classes: Readonly<Record<string, string>>;
}

/** The prompt's resolved container. */
export type PromptContainer = NonNullable<
	ResolvedConsentPresentation['container']
>;

/** A mounted prompt. */
export interface PromptSurface {
	/**
	 * Reconcile with a snapshot, the container resolved from it and the
	 * first-layer actions the policy allows. Absent, every action shows in
	 * the default order.
	 */
	sync: (
		snapshot: ConsentSnapshot,
		container: PromptContainer,
		actionGroups?: PromptActionGroups
	) => void;
	/** Leave at once, as when the policy no longer asks for a prompt. */
	hide: () => void;
	destroy: () => void;
}

type Phase = 'hidden' | 'shown' | 'leaving';

let instances = 0;

/** Draws a brand mark, as React's `BrandMarkIcon` does. */
const brandMark = function brandMark(
	mark: 'inth' | 'c15t',
	className: string | undefined
): SVGSVGElement {
	const glyph = BRAND_MARKS[mark];
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	svg.setAttribute('viewBox', glyph.viewBox);
	svg.setAttribute('fill', 'none');
	svg.setAttribute('aria-hidden', 'true');
	if (className) {
		svg.setAttribute('class', className);
	}
	for (const path of glyph.paths) {
		const node = document.createElementNS(svg.namespaceURI, 'path');
		node.setAttribute('fill', 'currentColor');
		if (path.evenOdd) {
			node.setAttribute('fill-rule', 'evenodd');
			node.setAttribute('clip-rule', 'evenodd');
		}
		node.setAttribute('d', path.d);
		svg.append(node);
	}
	return svg;
};

/** The "Consent by [INTH]" tag (BNR-11, §5). */
const consentTag = function consentTag(
	env: PartEnv,
	className: string | undefined
): HTMLElement | null {
	const tag = resolveBrandingTag({
		branding: env.snapshot.branding,
		hostname:
			typeof window === 'undefined' ? undefined : window.location.hostname,
		noStyle: true,
		styles: {},
		surface: 'banner',
	});
	if (!tag) {
		return null;
	}
	const { noStyle } = env;
	return env.ctx.slot(
		el(
			'a',
			{
				class: cx(noStyle, surfaceStyles.tag, className),
				'data-branding': tag.brand,
				'data-testid': 'consent-banner-branding',
				href: tag.href,
				rel: 'noreferrer',
				target: '_blank',
			},
			el('span', {}, env.t.common?.securedBy ?? ''),
			brandMark(
				tag.brand === 'inth' ? 'inth' : 'c15t',
				cx(noStyle, surfaceStyles.tagMark)
			),
			el(
				'span',
				{ class: cx(noStyle, surfaceStyles.visuallyHidden) },
				tag.brand === 'inth' ? 'Inth' : 'c15t'
			)
		),
		'consentBannerTag'
	);
};

/**
 * The prompt for one container. Its own draft backs the
 * category switches, so Save records exactly what the options show.
 */
// oxlint-disable-next-line max-lines-per-function, max-statements, complexity -- One controller owns the prompt's lifecycle, focus and keys so they stay in step, as the React component does.
export const createPromptSurface = function createPromptSurface(
	ctx: SurfaceContext,
	options: ConsentBannerOptions,
	presentation: PresentationEntry
): PromptSurface {
	const { kernel } = ctx.client;
	const { noStyle } = ctx;
	const styles = presentation.classes;
	const disableAnimation = options.disableAnimation ?? ctx.disableAnimation;
	instances += 1;
	const id = `inth-pc-b${instances}`;
	const ids = { panel: `${id}-panel`, title: `${id}-title` };
	const draft = createPreferenceDraft(kernel, {
		defaults: ctx.client.presentation?.preferences?.defaults,
	});
	const { session } = surfaceBasics(kernel, kernel.getSnapshot());

	let snapshot: ConsentSnapshot | null = null;
	let container: PromptContainer | null = null;
	let actionGroups: PromptActionGroups = DEFAULT_ACTION_GROUPS;
	let phase: Phase = 'hidden';
	let panelReady = false;
	let panelWanted = false;
	let panelModule: {
		createPromptPanel: () => PromptPanel;
	} | null = null;
	let panel: PromptPanel | null = null;
	/** A choice was made here: release, announce and return focus as it leaves. */
	let committed: string | null = null;
	let pendingPanelFocus = false;
	/** Folding the options returns focus to Customize once it renders again. */
	let pendingExpandFocus = false;
	let rendering = false;
	let renderAgain = false;
	let destroyed = false;
	/** Renders the surface; assigned below, called by its listeners. */
	let render = (): void => undefined;

	let rootEl: HTMLElement | null = null;
	const shellRef: PartRef = { current: null };
	const cardRef: PartRef = { current: null };
	const scrollRef: PartRef = { current: null };
	const expandRef: PartRef = { current: null };

	// The page's status region outlives the prompt, so the outcome of a
	// choice is read after the prompt leaves (BNR-06). It keeps its node.
	const pageStatus = el('div', {
		class: cx(false, surfaceStyles.visuallyHidden),
		'data-testid': 'consent-banner-announcement',
	});
	let pageRegion: LiveRegion | null = null;

	let stopLeaving: (() => void) | undefined;
	let releaseBlock: (() => void) | undefined;
	let stopFades: ScrollFades | undefined;
	let fadedArea: HTMLElement | null = null;
	let focusFrame = 0;
	let keysAttached = false;

	const phoneLayout = watchPhoneLayout(() => {
		render();
	});
	const stopSession = session.subscribe(() => {
		render();
	});
	const stopDraft = draft.subscribe(() => {
		render();
	});

	const layoutOf = (current: PromptContainer): ResolvedConsentLayout =>
		phoneLayout.matches() ? current.phone : current.desktop;

	const loadPanel = function loadPanel(): void {
		if (panelModule) {
			return;
		}
		void importPanel().then(
			(module) => {
				panelModule = module;
				render();
			},
			(error: unknown) => {
				// oxlint-disable-next-line no-console -- The options failed to load.
				console.error('@inth/sdk: the consent options failed to load.', error);
			}
		);
	};

	/** Move focus to "Your Privacy Choices", or leave it where it is. */
	const focusReturnTarget = function focusReturnTarget(): void {
		for (const selector of RETURN_TARGETS) {
			if (focusFirstIn(selector, ctx.root)) {
				return;
			}
		}
	};

	const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || event.defaultPrevented || !container) {
			return;
		}
		const shell = shellRef.current;
		const active = activeElementOf(shell);
		const outcome = session.escape({
			blocking: layoutOf(container).blocking,
			focusInside: Boolean(shell && active && shell.contains(active)),
		});
		if (outcome === 'ignore') {
			return;
		}
		event.preventDefault();
		if (outcome === 'collapse') {
			// The session re-rendered as it collapsed; focus Customize now.
			pendingExpandFocus = true;
			render();
		}
	};

	const nextPhase = function nextPhase(current: ConsentSnapshot): void {
		const model =
			current.resolution.status === 'matched' ? current.model : null;
		const variant = resolvePrivacyChoicesVariant(current.policyRule);
		const activeUI = current.activeUI ?? 'none';
		const wantsShow =
			hasConsentUI(current) &&
			activeUI === 'banner' &&
			(model ?? 'opt-in') !== 'iab' &&
			variant !== 'none';
		// Follow the kernel. Opening the dialog removes the prompt at once,
		// even mid-exit (PERM-05); any other end plays the exit, unless there
		// is no motion to play.
		if (wantsShow) {
			phase = 'shown';
		} else if (phase === 'shown') {
			phase =
				activeUI === 'dialog' || disableAnimation || prefersReducedMotionNow()
					? 'hidden'
					: 'leaving';
		} else if (phase === 'leaving' && activeUI === 'dialog') {
			phase = 'hidden';
		}
	};

	// oxlint-disable-next-line max-lines-per-function, complexity -- The tree mirrors the React component's.
	const build = function build(
		env: PartEnv,
		current: PromptContainer
	): HTMLElement {
		const layout = layoutOf(current);
		const {
			snapshot: snap,
			t,
			state,
			slot,
		} = {
			...env,
			slot: ctx.slot,
		};
		const variant: PrivacyChoicesPromptVariant = resolvePrivacyChoicesVariant(
			snap.policyRule
		);
		const model =
			(snap.resolution.status === 'matched' ? snap.model : null) ?? 'opt-in';
		const allInOne = layout.flow === 'all-in-one';
		const bar = layout.type === 'banner';
		const expanded = !allInOne && state.expanded;
		const barCollapsed = bar && !expanded;
		const optionsOpen = allInOne || expanded;
		const wantPanel = panelWanted || optionsOpen;
		const bundle = rightsBundleOf(snap, getOptOutReceiptData(kernel));
		const gpc = resolveOptOutState(snap).lock === 'gpc-active';
		const copy = resolvePrivacyChoicesBannerCopy(t, { bundle, gpc, variant });
		const notice = variant === 'notice';
		// The policy's first-layer actions, in the host's order. A notice's
		// "Your Privacy Choices" is the opt-out right, not an action, so it
		// stays.
		const summaryGroups = actionGroups
			.map((group) =>
				group.filter(
					(action) =>
						action === 'reject' || action === 'accept' || action === 'customize'
				)
			)
			.filter((group) => group.length > 0);
		const links =
			options.legalLinks === undefined ? [...CARD_LINKS] : options.legalLinks;
		const barLinks = links?.filter((key) => key === 'privacyPolicy') ?? null;
		const legal = (keys: typeof links) =>
			renderLegalLinks({
				keys,
				labels: t.legalLinks ?? {},
				legalLinks: ctx.legalLinks,
				noStyle,
				testIdPrefix: 'consent-banner-legal-link',
			});

		const commit = (action: BannerCommitAction) => {
			const { plan } = commitBannerChoice(kernel, action, {
				draft: action === 'save' ? draft : undefined,
				uiSource: 'banner',
			});
			let message = copy.saved;
			if (action === 'refuse') {
				message = copy.rejected;
			} else if (plan.keptOff !== null) {
				message = resolveBannerAllowedAnnouncement(t, {
					bundle,
					gpc: plan.keptOff === 'gpc',
				});
			}
			committed = message;
		};
		const acknowledge = () => {
			committed = '';
			session.commit();
			void kernel.commands.dismissNotice();
		};
		const expand = () => {
			loadPanel();
			panelWanted = true;
			pendingPanelFocus = true;
			session.expand();
			session.announce(copy.expanded);
		};
		const warm = () => {
			loadPanel();
		};

		const expandButton = (label: string, inBar: boolean) =>
			// The notice's rights action reads as a link, in the
			// text-on-surface blue in both palettes (VIS-02).
			notice
				? slot(
						el(
							'button',
							{
								'aria-controls': inBar ? undefined : ids.panel,
								'aria-expanded': expanded ? 'true' : 'false',
								class: cx(noStyle, surfaceStyles.rightLink),
								// What React's early-tap replay reads: a tap on it
								// expands the options in place. The script tag
								// replays no tap, so it opts out, as its stock
								// buttons do.
								'data-action': 'customize',
								'data-testid': 'consent-banner-right-link-opt-out',
								on: { click: expand, focus: warm, pointerenter: warm },
								ref: expandRef,
								type: 'button',
								[EARLY_TAP_OPT_OUT]: 'off',
							},
							label
						),
						'consentBannerRightLink'
					)
				: consentButton({
						attrs: {
							// The collapsed bar has no panel to point at (PERM-09).
							'aria-controls': inBar ? undefined : ids.panel,
							'aria-expanded': expanded ? 'true' : 'false',
							'data-testid': 'consent-banner-customize-button',
							on: { click: expand, focus: warm, pointerenter: warm },
							ref: expandRef,
						},
						children: [label],
						consentAction: 'customize',
						env,
						isPrimary: true,
					});
		const refuseButton = (label: string) =>
			consentButton({
				attrs: {
					'data-testid': 'consent-banner-reject-button',
					on: { click: () => commit('refuse') },
				},
				children: [options.rejectButtonText ?? label],
				consentAction: 'reject',
				env,
				isPrimary: false,
			});
		const allowButton = (label: string) =>
			consentButton({
				attrs: {
					'data-testid': 'consent-banner-accept-button',
					on: { click: () => commit('allow') },
				},
				children: [options.acceptButtonText ?? label],
				consentAction: 'accept',
				env,
				isPrimary: false,
			});
		const okButton = () =>
			consentButton({
				attrs: {
					'data-testid': 'consent-banner-dismiss-button',
					on: { click: acknowledge },
				},
				children: [copy.ok],
				consentAction: 'dismiss',
				env,
				isPrimary: true,
			});
		const saveButton = () =>
			consentButton({
				attrs: {
					'data-testid': 'consent-banner-save-button',
					on: { click: () => commit('save') },
				},
				children: [copy.save],
				consentAction: 'save',
				env,
				isPrimary: true,
				slotKey: 'consentBannerSaveButton',
			});
		const actionGroup = (...children: PartChild[]) =>
			slot(
				el(
					'div',
					{
						class: cx(noStyle, surfaceStyles.actionGroup, styles.actionGroup),
						'data-testid': 'consent-banner-footer-sub-group',
					},
					...children
				),
				'consentBannerFooterSubGroup'
			);

		const summaryButton = (action: PresentationAction, inBar: boolean) => {
			if (action === 'reject') {
				return refuseButton(copy.reject);
			}
			if (action === 'accept') {
				return allowButton(copy.accept);
			}
			return expandButton(
				options.customizeButtonText ?? (inBar ? copy.expandBar : copy.expand),
				inBar
			);
		};

		// Every presentation, the collapsed Banner included, keeps the host's
		// groups and their `consentBannerFooterSubGroup` slot.
		const summaryRow = (inBar: boolean) =>
			summaryGroups.map((group) => {
				const buttons = group.map((action) => summaryButton(action, inBar));
				return group.length > 1 ? actionGroup(...buttons) : buttons[0];
			});

		let footerContent: PartChild[];
		if (optionsOpen) {
			footerContent = notice
				? [okButton()]
				: [
						actionGroup(
							refuseButton(copy.rejectExpanded),
							allowButton(copy.acceptExpanded)
						),
						saveButton(),
					];
		} else if (notice) {
			footerContent = [
				expandButton(options.customizeButtonText ?? copy.expand, false),
				okButton(),
			];
		} else {
			footerContent = summaryRow(false);
		}

		const tag = options.hideBranding ? null : consentTag(env, styles.tag);
		let panelContent: PartChild[] = [];
		if (wantPanel && panelModule) {
			panel ??= panelModule.createPromptPanel();
			panelContent = panel.render(env, {
				idPrefix: id,
				uiSource: 'banner',
				variant,
			});
		}
		const scroll = el(
			'div',
			{
				class: cx(noStyle, expandStyles.scroll),
				'data-testid': 'consent-banner-body',
				ref: scrollRef,
			},
			...panelContent
		);
		const status = el(
			'output',
			{
				'aria-atomic': 'true',
				'aria-live': 'polite',
				class: cx(noStyle, surfaceStyles.visuallyHidden),
				'data-testid': 'consent-banner-status',
			},
			announcementText(state.announcement)
		);

		let body: PartChild[];
		if (barCollapsed) {
			// The collapsed bar takes the same title, description and footer
			// slots as the card.
			body = [
				slot(
					el(
						'h2',
						{
							class: cx(noStyle, surfaceStyles.visuallyHidden),
							'data-testid': 'consent-banner-title',
							id: ids.title,
						},
						options.title ?? copy.title
					),
					'consentBannerTitle'
				),
				el(
					'div',
					{ class: cx(noStyle, styles.row) },
					slot(
						el(
							'p',
							{
								class: cx(noStyle, styles.text),
								'data-testid': 'consent-banner-description',
							},
							options.description ?? copy.barDescription,
							...legal(barLinks)
						),
						'consentBannerDescription'
					),
					slot(
						el(
							'div',
							{
								class: cx(noStyle, styles.actions),
								'data-testid': 'consent-banner-footer',
							},
							...(notice
								? [
										expandButton(
											options.customizeButtonText ?? copy.expandBar,
											true
										),
										okButton(),
									]
								: summaryRow(true))
						),
						'consentBannerFooter'
					)
				),
				status,
			];
		} else {
			body = [
				slot(
					el(
						'div',
						{
							class: cx(noStyle, surfaceStyles.head, styles.head),
							'data-testid': 'consent-banner-header',
						},
						slot(
							el(
								'h2',
								{
									class: cx(noStyle, surfaceStyles.title),
									'data-testid': 'consent-banner-title',
									id: ids.title,
								},
								options.title ?? copy.title
							),
							'consentBannerTitle'
						),
						slot(
							el(
								'p',
								{
									class: cx(noStyle, surfaceStyles.description),
									'data-testid': 'consent-banner-description',
								},
								options.description ?? copy.description,
								...legal(links)
							),
							'consentBannerDescription'
						)
					),
					'consentBannerHeader'
				),
				allInOne
					? slot(
							el(
								'div',
								{
									class: cx(noStyle, styles.body),
									'data-testid': 'consent-banner-expand-panel',
								},
								scroll,
								tag
									? el('div', { class: cx(noStyle, styles.tagSlot) }, tag)
									: null
							),
							'consentBannerExpand'
						)
					: slot(
							el(
								'div',
								{
									class: cx(noStyle, expandStyles.panel),
									'data-open': expanded ? 'true' : 'false',
									'data-testid': 'consent-banner-expand-panel',
									id: ids.panel,
									inert: !expanded,
								},
								el('div', { class: cx(noStyle, expandStyles.inner) }, scroll)
							),
							'consentBannerExpand'
						),
				status,
				slot(
					el(
						'div',
						{
							class: cx(noStyle, surfaceStyles.footer, styles.footer),
							'data-testid': 'consent-banner-footer',
						},
						...footerContent
					),
					'consentBannerFooter'
				),
			];
		}

		return slot(
			el(
				'div',
				{
					class: cx(noStyle, surfaceStyles.root, styles.root),
					'data-animation': disableAnimation ? 'off' : undefined,
					'data-blocking': layout.blocking ? 'true' : undefined,
					'data-edge-style': layout.edgeStyle,
					'data-expanded': expanded ? 'true' : undefined,
					'data-flow': layout.flow,
					// The effective model and the policy's prompt, which React's
					// root carries for its early-tap replay.
					'data-model': model,
					'data-placement': layout.placement,
					'data-prompt': snap.policyRule.prompt,
					'data-state': phase === 'leaving' ? 'closed' : 'open',
					'data-testid': 'consent-banner-root',
					'data-variant': variant,
					dir: getTextDirection(snap.translations?.language),
					// A prompt on its way out takes no input (PERM-05).
					inert: phase === 'leaving',
					[SURFACE_ROOT_ATTRIBUTE]: 'banner',
				},
				layout.blocking
					? slot(
							el('div', {
								'aria-hidden': 'true',
								class: cx(noStyle, surfaceStyles.scrim),
								'data-testid': 'consent-banner-overlay',
							}),
							'consentBannerOverlay'
						)
					: null,
				el(
					'div',
					{
						'aria-labelledby': layout.blocking ? ids.title : undefined,
						'aria-modal': layout.blocking ? 'true' : undefined,
						class: cx(noStyle, surfaceStyles.shell, styles.shell),
						'data-testid': 'consent-banner-shell',
						ref: shellRef,
						role: layout.blocking ? 'dialog' : undefined,
					},
					allInOne ? null : tag,
					slot(
						el(
							'section',
							{
								// Blocking moves the dialog role to the shell (PERM-08).
								'aria-labelledby': layout.blocking ? undefined : ids.title,
								class: cx(noStyle, surfaceStyles.card, styles.card),
								'data-testid': 'consent-banner-card',
								ref: cardRef,
								role: layout.blocking ? undefined : 'region',
								tabindex: '-1',
							},
							...body
						),
						'consentBannerCard'
					)
				)
			),
			'consentBanner'
		);
	};

	// oxlint-disable-next-line max-statements, complexity -- The React component's effects, in its order.
	const effects = function effects(
		env: PartEnv,
		current: PromptContainer
	): void {
		const layout = layoutOf(current);
		const allInOne = layout.flow === 'all-in-one';
		const expanded = !allInOne && env.state.expanded;
		const optionsOpen = allInOne || expanded;
		const activeUI = env.snapshot.activeUI ?? 'none';

		// The exit plays, then the prompt leaves.
		if (phase === 'leaving' && !stopLeaving && rootEl) {
			stopLeaving = afterMotion(
				rootEl.querySelector('*') ?? rootEl,
				() => {
					stopLeaving = undefined;
					if (phase === 'leaving') {
						phase = 'hidden';
						render();
					}
				},
				{ duration: EXIT_MS, reducedMotion: prefersReducedMotionNow() }
			);
		} else if (phase !== 'leaving' && stopLeaving) {
			stopLeaving();
			stopLeaving = undefined;
		}

		// Blocking (BNR-13): the shell, card and tag together are the modal
		// boundary (PERM-08). Focus moves to the card and stays in the shell.
		const blocking = layout.blocking && phase === 'shown';
		if (blocking && !releaseBlock && rootEl && shellRef.current) {
			const release = attachPageBlock(rootEl);
			const untrap = attachTopLayerTrap(shellRef.current, {
				initialFocus: cardRef.current ?? 'first-tabbable',
			});
			releaseBlock = () => {
				untrap();
				release();
			};
		} else if (!blocking && releaseBlock) {
			releaseBlock();
			releaseBlock = undefined;
		}

		// After a choice: the page is released, the outcome is announced in
		// the page's status region, and focus moves to "Your Privacy
		// Choices" (BNR-06). Not when the dialog took over.
		if (phase !== 'shown' && committed !== null) {
			const message = committed;
			committed = null;
			if (activeUI !== 'dialog') {
				if (message) {
					pageRegion?.announce(message);
				}
				const active = activeElementOf(pageStatus);
				if (
					!active ||
					active === document.body ||
					(rootEl?.contains(active) ?? false)
				) {
					focusReturnTarget();
				}
			}
		}

		// Escape folds the options or closes a confirmation, never the
		// prompt (PERM-03, PERM-15).
		if (phase === 'shown' && !keysAttached) {
			document.addEventListener('keydown', onKeyDown);
			keysAttached = true;
		} else if (phase !== 'shown' && keysAttached) {
			document.removeEventListener('keydown', onKeyDown);
			keysAttached = false;
		}

		// The first control of the options takes focus once they render.
		if (expanded && panelReady && pendingPanelFocus) {
			pendingPanelFocus = false;
			// The panel's own rules arrive with it, and its content becomes
			// visible as they apply; try again for a few frames.
			let frames = 0;
			const focusFirst = () => {
				const area = scrollRef.current;
				const first = area ? tabbableElements(area)[0] : undefined;
				first?.focus({ preventScroll: true });
				if (!first || activeElementOf(area) !== first) {
					frames += 1;
					if (frames < 20) {
						focusFrame = requestAnimationFrame(focusFirst);
					}
				}
			};
			cancelAnimationFrame(focusFrame);
			focusFirst();
		}

		if (!expanded && pendingExpandFocus) {
			pendingExpandFocus = false;
			expandRef.current?.focus({ preventScroll: true });
		}

		// Scroll-edge fades (LAY-08) on whichever scroll area shows.
		const area = optionsOpen && panelReady ? scrollRef.current : null;
		if (area === fadedArea) {
			// The content may have changed height under the same area.
			stopFades?.update();
		} else {
			stopFades?.();
			stopFades = area ? attachScrollFades(area) : undefined;
			fadedArea = area;
		}

		panel?.after(env);
	};

	const removeRoot = function removeRoot(): void {
		releaseBlock?.();
		releaseBlock = undefined;
		stopLeaving?.();
		stopLeaving = undefined;
		stopFades?.();
		stopFades = undefined;
		fadedArea = null;
		cancelAnimationFrame(focusFrame);
		if (keysAttached) {
			document.removeEventListener('keydown', onKeyDown);
			keysAttached = false;
		}
		panel?.dispose();
		panel = null;
		panelReady = false;
		rootEl?.remove();
		rootEl = null;
	};

	render = (): void => {
		if (destroyed || !snapshot || !container) {
			return;
		}
		if (rendering) {
			// A listener fired while this render ran: render once more after.
			renderAgain = true;
			return;
		}
		rendering = true;
		try {
			nextPhase(snapshot);
			// All-in-one has nothing to fold. An expansion left from the phone
			// Drawer would reopen when the viewport narrows again, and Escape
			// would spend a press folding it with no Customize to focus
			// (PERM-13).
			if (layoutOf(container).flow === 'all-in-one') {
				pendingExpandFocus = false;
				if (session.getState().expanded) {
					session.collapse();
				}
				// All-in-one shows the options at once, whether the prompt
				// started there or a viewport change brought it there.
				panelWanted = true;
				loadPanel();
			}
			if (!pageStatus.isConnected) {
				ctx.root.append(owned(pageStatus));
				pageRegion = attachLiveRegion(pageStatus);
			}
			const { t } = surfaceBasics(kernel, snapshot);
			const env: PartEnv = {
				ctx,
				draft,
				kernel,
				noStyle,
				phone: phoneLayout.matches(),
				rerender: render,
				session,
				snapshot,
				state: session.getState(),
				t,
			};
			if (phase === 'hidden') {
				const wasShown = rootEl !== null;
				removeRoot();
				if (wasShown || committed !== null) {
					effects(env, container);
				}
				return;
			}
			ctx.addSheets?.(presentation.sheets);
			rootEl = patch(rootEl, build(env, container), ctx.root);
			// The options are ready once they rendered, as the React panel
			// reports from its layout effect.
			panelReady = panel !== null;
			effects(env, container);
		} finally {
			rendering = false;
		}
		if (renderAgain) {
			renderAgain = false;
			render();
		}
	};

	return {
		destroy() {
			destroyed = true;
			removeRoot();
			phoneLayout.stop();
			stopSession();
			stopDraft();
			pageRegion?.clear();
			pageRegion = null;
			pageStatus.remove();
		},
		hide() {
			// Until the next sync: a session, draft or viewport change must
			// not bring the prompt back from the snapshot it last had.
			snapshot = null;
			if (rootEl || phase !== 'hidden') {
				phase = 'hidden';
				removeRoot();
			}
		},
		sync(next, nextContainer, nextActionGroups) {
			snapshot = next;
			container = nextContainer;
			actionGroups = nextActionGroups ?? DEFAULT_ACTION_GROUPS;
			render();
		},
	};
};
