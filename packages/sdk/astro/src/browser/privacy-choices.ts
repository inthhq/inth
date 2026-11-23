/**
 * The browser half of the Privacy Choices prompt (v6).
 *
 * Its own chunk, loaded by the engine when the page's `<ConsentBanner />`
 * spot carries the Privacy Choices class names and the snapshot resolves
 * to that design. It adopts the prompt the server rendered, or renders it
 * into the spot when the server could not know the policy, and owns it
 * from there: the phone layout, Customize and the options it opens in
 * place (a chunk of their own), the commit, the page announcement and the
 * focus return, blocking, and Escape. It mirrors React's
 * `PrivacyChoicesSurface` step for step; React is the parity baseline.
 *
 * @internal
 */

import {
	commitBannerChoice,
	getSurfaceSession,
	PHONE_LAYOUT_QUERY,
} from '@inth/sdk/engine';
import type {
	BannerCommitAction,
	ConsentKernel,
	SurfaceSession,
} from '@inth/sdk/engine';
import { createPreferenceDraft } from '@inth/sdk/preference-draft';
import type { PreferenceDraft } from '@inth/sdk/preference-draft';
import { hasConsentUI } from '@inth/sdk/surface-actions';
import {
	announcementText,
	resolveBannerAllowedAnnouncement,
} from '@inth/sdk/surface-state';
import type { Translations } from '@inth/sdk/translations';
import {
	afterMotion,
	attachLiveRegion,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
} from '@inth/sdk/ui/primitives/surface';
import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
import { tabbableElements } from '@inth/sdk/ui/utils';

import type { PromptProps } from '../banner/prompt-model';
import { PROMPT_SLOT_ATTRIBUTE } from '../banner/slot';
import type { PrivacyChoicesClassNames } from '../privacy-choices/class-names';
import { resolvePrivacyChoicesModel } from '../privacy-choices/model';
import type {
	PrivacyChoicesModel,
	PrivacyChoicesOptions,
	PrivacyChoicesPresentation,
} from '../privacy-choices/model';
import type * as PanelModule from '../privacy-choices/panel';
import type { PrivacyChoicesPanel } from '../privacy-choices/panel';
import { insertSheets } from '../privacy-choices/sheets';
import type { PrivacyChoicesSheet } from '../privacy-choices/sheets';
import {
	PRIVACY_CHOICES_ID_PREFIX,
	promptIds,
	renderPageStatus,
	renderPrompt,
} from '../privacy-choices/view';
import { patchElement } from '../privacy-choices/vnode';
import type { VElement } from '../privacy-choices/vnode';

/** Exits are 160ms; the controllers add their own slack. */
const EXIT_MS = 160;

/** Where focus goes after a choice (BNR-06, ARCH-03). */
const RETURN_TARGETS = [
	'[data-testid="privacy-choices-link"]',
	'[data-testid="consent-dialog-trigger"]',
];

/** The models the stock prompt answers, as React's default `models`. */
const MODELS = ['opt-in', 'opt-out'];

/** Marks the prompt the server rendered. */
export const PRIVACY_CHOICES_ROOT_SELECTOR =
	'[data-testid="consent-banner-root"][data-design="privacy-choices"]';

const PAGE_STATUS_SELECTOR = '[data-testid="consent-banner-announcement"]';

/** What the spot carries for the Privacy Choices prompt. */
export interface PrivacyChoicesSpotData {
	props: PromptProps;
	privacyChoices: PrivacyChoicesClassNames;
}

/** What the prompt needs from the page's engine. */
export interface PrivacyChoicesHost {
	kernel: ConsentKernel;
	options: PrivacyChoicesOptions & {
		inlineStyles?: boolean;
		presentation?: PrivacyChoicesOptions['presentation'];
	};
	/** The page's CSP nonce, for the `<style>` elements it adds. */
	nonce?: string;
	/** Warm the dialog's chunks on intent, as the classic Customize does. */
	warmDialog?: () => void;
}

/** A mounted prompt. */
export interface PrivacyChoicesController {
	/** The spot it renders beside. */
	readonly spot: HTMLElement;
	dispose: () => void;
}

/** The sheets of one presentation, each a chunk of its own. */
const PRESENTATION_SHEETS: Record<
	PrivacyChoicesPresentation,
	() => Promise<PrivacyChoicesSheet>
> = {
	bar: () => import('@inth/sdk/ui/styles/sheets/bar'),
	card: () => import('@inth/sdk/ui/styles/sheets/card'),
	drawer: () => import('@inth/sdk/ui/styles/sheets/drawer'),
};

/**
 * Load the sheets a presentation renders, in cascade order: the tokens,
 * the buttons, the shell, then that presentation's rules and no other's.
 *
 * @internal
 */
export const loadPresentationSheets = async function loadPresentationSheets(
	presentation: PrivacyChoicesPresentation
): Promise<PrivacyChoicesSheet[]> {
	return await Promise.all([
		import('@inth/sdk/ui/styles/sheets/tokens'),
		import('@inth/sdk/ui/styles/sheets/button'),
		import('@inth/sdk/ui/styles/sheets/surface'),
		PRESENTATION_SHEETS[presentation](),
	]);
};

/**
 * Replaces how the options chunk loads, so a test can hold or fail it.
 *
 * @internal
 */
let loadPanel = (): Promise<typeof PanelModule> =>
	import('../privacy-choices/panel');

/**
 * Tests only.
 *
 * @internal
 */
export const setPanelLoaderForTest = function setPanelLoaderForTest(
	loader?: () => Promise<typeof PanelModule>
): void {
	loadPanel = loader ?? (() => import('../privacy-choices/panel'));
};

/** Read the spot's JSON, or `null` without the Privacy Choices class names. */
export const readPrivacyChoicesSpot = function readPrivacyChoicesSpot(
	spot: Element
): PrivacyChoicesSpotData | null {
	try {
		const parsed = JSON.parse(spot.getAttribute(PROMPT_SLOT_ATTRIBUTE) ?? '');
		if (!parsed?.privacyChoices) {
			return null;
		}
		return {
			privacyChoices: parsed.privacyChoices as PrivacyChoicesClassNames,
			props: (parsed.props ?? {}) as PromptProps,
		};
	} catch {
		return null;
	}
};

const matches = (query: string): boolean =>
	typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** Move focus to "Your Privacy Choices", or leave it where it is. */
const focusReturnTarget = function focusReturnTarget(): void {
	for (const selector of RETURN_TARGETS) {
		const target = document.querySelector<HTMLElement>(selector);
		if (target) {
			target.focus({ preventScroll: true });
			return;
		}
	}
};

/** Build a detached element from a tree node, by patching an empty one. */
const build = function build(node: VElement): HTMLElement {
	const element = document.createElement(node.tag);
	patchElement(element, node);
	return element;
};

type Phase = 'hidden' | 'shown' | 'leaving';

/**
 * Take over the prompt beside `spot`, or render it there.
 *
 * @param spot - The element `<ConsentBanner />` left, with its JSON.
 * @param host - The page's kernel and options.
 * @returns The controller, or `null` when the spot carries no Privacy
 * Choices class names.
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One controller owns the prompt's lifecycle, focus and keys so they stay in step, as React's surface does.
export const mountPrivacyChoicesBanner = function mountPrivacyChoicesBanner(
	spot: HTMLElement,
	host: PrivacyChoicesHost
): PrivacyChoicesController | null {
	const data = readPrivacyChoicesSpot(spot);
	if (!data) {
		return null;
	}
	const { kernel, options } = host;
	const { props, privacyChoices: classNames } = data;
	const session: SurfaceSession = getSurfaceSession(kernel);
	const draft: PreferenceDraft = createPreferenceDraft(kernel, {
		defaults: options.presentation?.preferences?.defaults,
	});
	const injectStyles = options.inlineStyles !== false && props.noStyle !== true;
	const ids = promptIds(PRIVACY_CHOICES_ID_PREFIX);

	let root = document.querySelector<HTMLElement>(PRIVACY_CHOICES_ROOT_SELECTOR);
	// The page's status region outlives the prompt, so a choice is read
	// after the prompt leaves (BNR-06). Like React's, it exists from the
	// first time a prompt is owed: a page that never owes one has none.
	let pageStatus = document.querySelector<HTMLElement>(PAGE_STATUS_SELECTOR);
	let pageRegion: LiveRegion | null = pageStatus
		? attachLiveRegion(pageStatus)
		: null;
	const ensurePageStatus = (): HTMLElement => {
		if (!pageStatus) {
			pageStatus = build(renderPageStatus({ classNames }));
			spot.after(pageStatus);
			pageRegion = attachLiveRegion(pageStatus);
		}
		return pageStatus;
	};

	// A server-rendered prompt arrived with its sheets; one this renders
	// waits for them, as React's surface waits for its deferred sheets.
	let sheetsReady = root !== null || !injectStyles;
	let sheetsFor: PrivacyChoicesPresentation | null = null;
	let phase: Phase = root && !root.hidden ? 'shown' : 'hidden';
	let disposed = false;
	let phone = matches(PHONE_LAYOUT_QUERY);
	let panelWanted = false;
	let panelModule: typeof PanelModule | null = null;
	let panelLoading: Promise<typeof PanelModule> | null = null;
	let panel: PrivacyChoicesPanel | null = null;
	let panelContext: PanelModule.PanelContext | null = null;
	/** A choice was made here: release, announce and return focus as the prompt leaves. */
	let committed: string | null = null;
	let pendingPanelFocus = false;
	let pendingExpandFocus = false;
	let wasExpanded = false;
	let releaseBlocking: (() => void) | null = null;
	let releaseFades: (() => void) | null = null;
	let cancelExit: (() => void) | null = null;
	let cancelPanelFocus = 0;
	let scheduled = false;
	let listenersOn: HTMLElement | null = null;
	let lastModel: PrivacyChoicesModel | null = null;

	const bundle = (): Partial<Translations> | undefined =>
		kernel.getSnapshot().translations?.translations as
			| Partial<Translations>
			| undefined;

	const invalidate = (): void => {
		if (scheduled || disposed) {
			return;
		}
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			if (!disposed) {
				// oxlint-disable-next-line no-use-before-define -- Defined below; runs a microtask later.
				render();
			}
		});
	};

	const preloadPanel = (): Promise<typeof PanelModule> => {
		panelLoading ??= (async () => {
			try {
				const module = await loadPanel();
				panelModule = module;
				invalidate();
				return module;
			} catch (error) {
				panelLoading = null;
				throw error;
			}
		})();
		return panelLoading;
	};
	const warmPanel = (): void => {
		void (async () => {
			try {
				await preloadPanel();
			} catch {
				// Customize loads it again.
			}
		})();
	};

	const ensurePanel = (model: PrivacyChoicesModel): void => {
		if (panel || !panelModule || !panelWanted) {
			return;
		}
		panelContext = {
			classNames,
			draft,
			idPrefix: ids.prefix,
			invalidate,
			kernel,
			noStyle: model.noStyle,
			session,
			theme: options.theme,
			uiSource: 'banner',
			variant: model.variant,
		};
		panel = panelModule.createPrivacyChoicesPanel(
			panelContext,
			injectStyles ? { nonce: host.nonce } : null
		);
	};

	const ensureSheets = (model: PrivacyChoicesModel): void => {
		if (sheetsReady || sheetsFor === model.presentation) {
			return;
		}
		sheetsFor = model.presentation;
		void (async () => {
			try {
				insertSheets(
					await loadPresentationSheets(model.presentation),
					host.nonce
				);
			} catch {
				// An unstyled consent prompt beats a hidden one.
			}
			sheetsReady = true;
			invalidate();
		})();
	};

	const commit = (action: BannerCommitAction): void => {
		const model = lastModel;
		if (!model) {
			return;
		}
		const { plan } = commitBannerChoice(kernel, action, {
			draft: action === 'save' ? draft : undefined,
			uiSource: 'banner',
		});
		let message = model.copy.saved;
		if (action === 'refuse') {
			message = model.copy.rejected;
		} else if (plan.keptOff !== null) {
			message = resolveBannerAllowedAnnouncement(bundle(), {
				bundle: model.bundle,
				gpc: plan.keptOff === 'gpc',
			});
		}
		committed = message;
		invalidate();
	};

	const acknowledge = (): void => {
		committed = '';
		session.commit();
		void kernel.commands.dismissNotice();
		invalidate();
	};

	const expand = (): void => {
		const model = lastModel;
		if (!model) {
			return;
		}
		warmPanel();
		panelWanted = true;
		pendingPanelFocus = true;
		session.expand();
		session.announce(model.copy.expanded);
	};

	const warm = (): void => {
		warmPanel();
		host.warmDialog?.();
	};

	const onClick = (event: MouseEvent): void => {
		const target = event.target as Element | null;
		const control = target?.closest<HTMLElement>('[data-testid]');
		switch (control?.getAttribute('data-testid')) {
			case 'consent-banner-customize-button':
			case 'consent-banner-right-link-opt-out':
				expand();
				return;
			case 'consent-banner-reject-button':
				commit('refuse');
				return;
			case 'consent-banner-accept-button':
				commit('allow');
				return;
			case 'consent-banner-save-button':
				commit('save');
				return;
			case 'consent-banner-dismiss-button':
				acknowledge();
				return;
			default:
				break;
		}
		if (panel?.click(event)) {
			invalidate();
		}
	};

	const onIntent = (event: Event): void => {
		const target = event.target as Element | null;
		if (
			target?.closest(
				'[data-testid="consent-banner-customize-button"], [data-testid="consent-banner-right-link-opt-out"]'
			)
		) {
			warm();
		}
	};

	const listen = (element: HTMLElement): void => {
		if (listenersOn === element) {
			return;
		}
		listenersOn?.removeEventListener('click', onClick);
		listenersOn?.removeEventListener('focusin', onIntent);
		listenersOn?.removeEventListener('pointerover', onIntent);
		element.addEventListener('click', onClick);
		element.addEventListener('focusin', onIntent);
		element.addEventListener('pointerover', onIntent);
		listenersOn = element;
	};

	// Escape folds the options or closes a confirmation, never the prompt
	// (PERM-03, PERM-15).
	const onKeyDown = (event: KeyboardEvent): void => {
		if (phase !== 'shown' || event.key !== 'Escape' || event.defaultPrevented) {
			return;
		}
		const model = lastModel;
		if (!model) {
			return;
		}
		const layout = phone ? model.container.phone : model.container.desktop;
		const shell = root?.querySelector('[data-testid="consent-banner-shell"]');
		const outcome = session.escape({
			blocking: layout.blocking,
			focusInside: Boolean(shell?.contains(document.activeElement)),
		});
		if (outcome === 'ignore') {
			return;
		}
		event.preventDefault();
		if (outcome === 'collapse') {
			pendingExpandFocus = true;
		}
	};
	document.addEventListener('keydown', onKeyDown);

	const media =
		typeof window.matchMedia === 'function'
			? window.matchMedia(PHONE_LAYOUT_QUERY)
			: null;
	// The server renders desktop; the browser switches, keeping every node
	// (ARCH-01).
	const onMedia = (): void => {
		phone = matches(PHONE_LAYOUT_QUERY);
		invalidate();
	};
	media?.addEventListener('change', onMedia);

	const release = (): void => {
		releaseBlocking?.();
		releaseBlocking = null;
		releaseFades?.();
		releaseFades = null;
	};

	const removeRoot = (): void => {
		release();
		cancelExit?.();
		cancelExit = null;
		if (root) {
			if (listenersOn === root) {
				root.removeEventListener('click', onClick);
				root.removeEventListener('focusin', onIntent);
				root.removeEventListener('pointerover', onIntent);
				listenersOn = null;
			}
			root.remove();
			root = null;
		}
		panel?.dispose();
		panel = null;
		panelContext = null;
	};

	/** After a choice: announce on the page and move focus (BNR-06). */
	const settleCommit = (activeUI: string, focusWasInside: boolean): void => {
		if (phase === 'shown' || committed === null) {
			return;
		}
		const message = committed;
		committed = null;
		if (activeUI === 'dialog') {
			return;
		}
		if (message) {
			pageRegion?.announce(message);
		}
		const active = document.activeElement;
		if (!active || active === document.body || focusWasInside) {
			focusReturnTarget();
		}
	};

	const focusPanel = (): void => {
		// The panel's own rules arrive with it, and its content becomes
		// visible as they apply; try again for a few frames until it can
		// take focus.
		let frames = 0;
		const focusFirst = () => {
			const area = root?.querySelector<HTMLElement>(
				'[data-testid="consent-banner-body"]'
			);
			const first = area ? tabbableElements(area)[0] : undefined;
			first?.focus({ preventScroll: true });
			if (!first || document.activeElement !== first) {
				frames += 1;
				if (frames < 20 && !disposed) {
					cancelPanelFocus = requestAnimationFrame(focusFirst);
				}
			}
		};
		focusFirst();
	};

	// oxlint-disable-next-line complexity -- The render follows React's surface, which owns the same steps.
	const render = (): void => {
		const snapshot = kernel.getSnapshot();
		const model = resolvePrivacyChoicesModel({
			classNames,
			hostname: window.location.hostname,
			options,
			props,
			snapshot,
		});
		lastModel = model;
		if (!model) {
			// The policy moved to the classic design; the classic banner owns it.
			removeRoot();
			phase = 'hidden';
			return;
		}
		ensureSheets(model);
		const layout = phone ? model.container.phone : model.container.desktop;
		const allInOne = layout.flow === 'all-in-one';
		if (allInOne && !panelWanted) {
			panelWanted = true;
			warmPanel();
		}
		const activeUI = snapshot.activeUI ?? 'none';
		const wantsShow =
			sheetsReady &&
			hasConsentUI(snapshot) &&
			activeUI === 'banner' &&
			MODELS.includes(snapshot.model ?? 'opt-in') &&
			model.variant !== 'none';
		const reducedMotion = matches('(prefers-reduced-motion: reduce)');

		// Follow the kernel. Opening the dialog removes the prompt at once,
		// even mid-exit (PERM-05); any other end plays the exit, unless there
		// is no motion to play.
		let next: Phase = phase;
		if (wantsShow) {
			next = 'shown';
		} else if (phase === 'shown') {
			next =
				activeUI === 'dialog' || model.disableAnimation || reducedMotion
					? 'hidden'
					: 'leaving';
		} else if (phase === 'leaving' && activeUI === 'dialog') {
			next = 'hidden';
		}
		const focusWasInside = Boolean(
			root?.contains(document.activeElement) &&
			document.activeElement !== document.body
		);
		phase = next;

		if (phase === 'hidden') {
			removeRoot();
			settleCommit(activeUI, focusWasInside);
			return;
		}

		const state = session.getState();
		const expanded = !allInOne && state.expanded;
		const optionsOpen = allInOne || expanded;
		ensurePanel(model);
		if (panelContext) {
			panelContext.variant = model.variant;
			panelContext.noStyle = model.noStyle;
		}
		const tree = renderPrompt(model, {
			expanded: state.expanded,
			ids,
			layout,
			panel: panel ? panel.render() : null,
			phase: phase === 'leaving' ? 'leaving' : 'shown',
			status: announcementText(state.announcement),
		});
		if (root) {
			patchElement(root, tree);
		} else {
			root = build(tree);
			ensurePageStatus().after(root);
		}
		listen(root);
		panel?.afterRender(root);

		if (phase === 'leaving') {
			release();
			cancelExit ??= afterMotion(
				root.querySelector('*') ?? root,
				() => {
					cancelExit = null;
					phase = 'hidden';
					const focusInside = Boolean(root?.contains(document.activeElement));
					removeRoot();
					settleCommit(kernel.getSnapshot().activeUI ?? 'none', focusInside);
				},
				{ duration: EXIT_MS, reducedMotion }
			);
			settleCommit(activeUI, focusWasInside);
			return;
		}

		// Blocking (BNR-13): the shell, card and tag together are the modal
		// boundary (PERM-08). Focus moves to the card and stays in the shell.
		const { blocking } = layout;
		if (blocking && !releaseBlocking) {
			const shell = root.querySelector<HTMLElement>(
				'[data-testid="consent-banner-shell"]'
			);
			const card = root.querySelector<HTMLElement>(
				'[data-testid="consent-banner-card"]'
			);
			if (shell) {
				const unblock = attachPageBlock(root);
				const untrap = attachTopLayerTrap(shell, {
					initialFocus: card ?? 'first-tabbable',
				});
				releaseBlocking = () => {
					untrap();
					unblock();
				};
			}
		} else if (!blocking && releaseBlocking) {
			releaseBlocking();
			releaseBlocking = null;
		}

		// The first control of the options takes focus once they render.
		if (expanded && panel && pendingPanelFocus) {
			pendingPanelFocus = false;
			cancelAnimationFrame(cancelPanelFocus);
			focusPanel();
		}
		if (!expanded && wasExpanded && pendingExpandFocus) {
			pendingExpandFocus = false;
			root
				.querySelector<HTMLElement>(
					'[data-testid="consent-banner-customize-button"], [data-testid="consent-banner-right-link-opt-out"]'
				)
				?.focus({ preventScroll: true });
		}
		wasExpanded = expanded;

		// Scroll-edge fades (LAY-08) on whichever scroll area shows.
		const area = root.querySelector<HTMLElement>(
			'[data-testid="consent-banner-body"]'
		);
		if (optionsOpen && panel && area) {
			releaseFades ??= attachScrollFades(area);
		} else {
			releaseFades?.();
			releaseFades = null;
		}
	};

	const unsubscribeKernel = kernel.subscribe(invalidate);
	const unsubscribeSession = session.subscribe(invalidate);
	const unsubscribeDraft = draft.subscribe(invalidate);

	// The options load with Customize; warm them at idle while the prompt
	// shows.
	const idle =
		typeof window.requestIdleCallback === 'function'
			? window.requestIdleCallback(() => warmPanel(), { timeout: 4000 })
			: window.setTimeout(warmPanel, 2000);

	render();

	return {
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			if (typeof window.cancelIdleCallback === 'function') {
				window.cancelIdleCallback(idle);
			} else {
				window.clearTimeout(idle);
			}
			cancelAnimationFrame(cancelPanelFocus);
			unsubscribeKernel();
			unsubscribeSession();
			unsubscribeDraft();
			document.removeEventListener('keydown', onKeyDown);
			media?.removeEventListener('change', onMedia);
			removeRoot();
			pageRegion?.();
		},
		spot,
	};
};
