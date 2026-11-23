/**
 * The browser half of the consent prompt.
 *
 * Its own chunk, loaded by the engine when the page's `<ConsentBanner />`
 * spot is on the page and the snapshot shows the prompt. It adopts the
 * prompt the server rendered, or renders it
 * into the spot when the server could not know the policy, and owns it
 * from there: the phone layout, Customize and the options it opens in
 * place (a chunk of their own), the commit, the page announcement and the
 * focus return, blocking, and Escape. It mirrors React's
 * prompt surface step for step; React is the parity baseline.
 *
 * @internal
 */

import {
	applyExperimentTheme,
	commitBannerChoice,
	getSurfaceSession,
	PHONE_LAYOUT_QUERY,
} from '@inth/sdk/engine';
import type {
	BannerCommitAction,
	ConsentKernel,
	ConsentSnapshot,
	SurfaceSession,
} from '@inth/sdk/engine';
import { createPreferenceDraft } from '@inth/sdk/preference-draft';
import type { PreferenceDraft } from '@inth/sdk/preference-draft';
import type { EarlyConsentTap } from '@inth/sdk/runtime/page-globals';
import {
	getOptOutReceiptData,
	hasConsentUI,
	replayEarlyConsentTaps,
	subscribeOptOutReceiptData,
} from '@inth/sdk/surface-actions';
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

import { PROMPT_SLOT_ATTRIBUTE } from '../banner/prompt-slot.model';
import { containerSheetsPresent, insertSheets } from '../parts/insert-sheets';
import type { StyleSheet } from '../parts/insert-sheets';
import { patchElement } from '../parts/vnode';
import type { VElement } from '../parts/vnode';
import type * as PanelModule from '../prompt/create-prompt-panel';
import type { PromptPanel } from '../prompt/create-prompt-panel';
import type { PromptClassNames } from '../prompt/prompt-class-names';
import { resolvePromptModel } from '../prompt/prompt.model';
import type {
	PromptContainerType,
	PromptModel,
	PromptOptions,
	PromptProps,
} from '../prompt/prompt.model';
import {
	PROMPT_ID_PREFIX,
	promptIds,
	renderPageStatus,
	renderPrompt,
} from '../prompt/render-prompt';

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
export const PROMPT_ROOT_SELECTOR = '[data-testid="consent-banner-root"]';

const PAGE_STATUS_SELECTOR = '[data-testid="consent-banner-announcement"]';

/** What the spot carries for the prompt. */
export interface PromptSpotData {
	props: PromptProps;
	classNames: PromptClassNames;
}

/** What the prompt needs from the page's engine. */
export interface PromptHost {
	kernel: ConsentKernel;
	options: PromptOptions & {
		inlineStyles?: boolean;
		presentation?: PromptOptions['presentation'];
	};
	/** The page's CSP nonce, for the `<style>` elements it adds. */
	nonce?: string;
	/** Warm the dialog's chunks on intent. */
	warmDialog?: () => void;
}

/** A mounted prompt. */
export interface PromptController {
	/** The spot it renders beside. */
	readonly spot: HTMLElement;
	dispose: () => void;
}

/**
 * The sheets of one container, each a chunk of its own. The Banner's loads
 * through `./strip-sheet`, so its chunk has a name content blockers leave
 * alone.
 */
const CONTAINER_SHEETS: Record<PromptContainerType, () => Promise<StyleSheet>> =
	{
		banner: () => import('./strip-sheet'),
		card: () => import('@inth/sdk/ui/styles/sheets/card'),
		drawer: () => import('@inth/sdk/ui/styles/sheets/drawer'),
	};

/**
 * Load the sheets a container renders, in cascade order: the tokens, the
 * buttons, the shell, then that container's rules and no other's.
 *
 * @internal
 */
export const loadContainerSheets = async function loadContainerSheets(
	presentation: PromptContainerType
): Promise<StyleSheet[]> {
	return await Promise.all([
		import('@inth/sdk/ui/styles/sheets/tokens'),
		import('@inth/sdk/ui/styles/sheets/button'),
		import('@inth/sdk/ui/styles/sheets/surface'),
		CONTAINER_SHEETS[presentation](),
	]);
};

/**
 * Replaces how the options chunk loads, so a test can hold or fail it.
 *
 * @internal
 */
let loadPanel = (): Promise<typeof PanelModule> =>
	import('../prompt/create-prompt-panel');

/**
 * Tests only.
 *
 * @internal
 */
export const setPanelLoaderForTest = function setPanelLoaderForTest(
	loader?: () => Promise<typeof PanelModule>
): void {
	loadPanel = loader ?? (() => import('../prompt/create-prompt-panel'));
};

/** Read the spot's JSON, or `null` without the prompt's class names. */
export const readPromptSpot = function readPromptSpot(
	spot: Element
): PromptSpotData | null {
	try {
		const parsed = JSON.parse(spot.getAttribute(PROMPT_SLOT_ATTRIBUTE) ?? '');
		if (!parsed?.classNames) {
			return null;
		}
		return {
			classNames: parsed.classNames as PromptClassNames,
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
 * @returns The controller, or `null` when the spot carries no class
 * names.
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One controller owns the prompt's lifecycle, focus and keys so they stay in step, as React's surface does.
export const mountPrompt = function mountPrompt(
	spot: HTMLElement,
	host: PromptHost
): PromptController | null {
	const data = readPromptSpot(spot);
	if (!data) {
		return null;
	}
	const { kernel, options } = host;
	const { props, classNames } = data;
	const session: SurfaceSession = getSurfaceSession(kernel);
	const draft: PreferenceDraft = createPreferenceDraft(kernel, {
		defaults: options.presentation?.preferences?.defaults,
	});
	const injectStyles = options.inlineStyles !== false && props.noStyle !== true;
	const ids = promptIds(PROMPT_ID_PREFIX);

	let root = document.querySelector<HTMLElement>(PROMPT_ROOT_SELECTOR);
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

	// A prompt waits for its presentation's sheets, as React's surface
	// waits for its deferred sheets. A server-rendered prompt usually
	// arrived with them, but a deferred or swapped-in one may not have.
	const sheetsReady = new Set<PromptContainerType>();
	let sheetsLoading: PromptContainerType | null = null;
	let phase: Phase = root && !root.hidden ? 'shown' : 'hidden';
	let disposed = false;
	let phone = matches(PHONE_LAYOUT_QUERY);
	let panelWanted = false;
	let panelModule: typeof PanelModule | null = null;
	let panelLoading: Promise<typeof PanelModule> | null = null;
	let panel: PromptPanel | null = null;
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
	let lastModel: PromptModel | null = null;
	let idle: number | null = null;

	/** The host theme with the visitor's experiment arm over it, as the server renders it. */
	const themeFor = (snapshot: ConsentSnapshot) =>
		applyExperimentTheme(
			options.theme,
			options.experiment,
			snapshot.experiment
		);

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

	// The options load with Customize; warm them at idle once the prompt
	// shows, never for a visitor it is not shown to.
	const warmAtIdle = (): void => {
		if (idle !== null) {
			return;
		}
		idle =
			typeof window.requestIdleCallback === 'function'
				? window.requestIdleCallback(() => warmPanel(), { timeout: 4000 })
				: window.setTimeout(warmPanel, 2000);
	};

	const ensurePanel = (model: PromptModel): void => {
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
			theme: themeFor(kernel.getSnapshot()),
			uiSource: 'banner',
			variant: model.variant,
		};
		panel = panelModule.createPromptPanel(
			panelContext,
			injectStyles ? { nonce: host.nonce } : null
		);
	};

	/** Whether the presentation's sheets are in; starts loading them if not. */
	const ensureSheets = (presentation: PromptContainerType): boolean => {
		if (!injectStyles || sheetsReady.has(presentation)) {
			return true;
		}
		if (containerSheetsPresent(presentation)) {
			sheetsReady.add(presentation);
			return true;
		}
		if (sheetsLoading === presentation) {
			return false;
		}
		sheetsLoading = presentation;
		void (async () => {
			try {
				insertSheets(await loadContainerSheets(presentation), host.nonce);
			} catch {
				// An unstyled consent prompt beats a hidden one.
			}
			if (sheetsLoading === presentation) {
				sheetsLoading = null;
			}
			sheetsReady.add(presentation);
			invalidate();
		})();
		return false;
	};

	const commit = (action: BannerCommitAction, actionAt?: number): void => {
		const model = lastModel;
		if (!model) {
			return;
		}
		const { plan } = commitBannerChoice(kernel, action, {
			actionAt,
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

	const acknowledge = (actionAt?: number): void => {
		committed = '';
		session.commit();
		void kernel.commands.dismissNotice(
			actionAt === undefined ? undefined : { actionAt }
		);
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
		// The arm's theme overrides ride on the host theme, as on the server.
		const theme = themeFor(snapshot);
		const model = resolvePromptModel({
			classNames,
			hostname: window.location.hostname,
			options: { ...options, theme },
			props,
			receiptData: getOptOutReceiptData(kernel),
			snapshot,
		});
		lastModel = model;
		const activeUI = snapshot.activeUI ?? 'none';
		const owed =
			hasConsentUI(snapshot) &&
			activeUI === 'banner' &&
			MODELS.includes(snapshot.model ?? 'opt-in') &&
			model.variant !== 'none';
		// Only a prompt that shows loads its sheets and options.
		const styled = owed && ensureSheets(model.presentation);
		const layout = phone ? model.container.phone : model.container.desktop;
		const allInOne = layout.flow === 'all-in-one';
		if (owed && allInOne) {
			panelWanted = true;
		}
		// A failed options download is forgotten; the next render tries
		// again, so a side Drawer is never left empty.
		if (owed && panelWanted && !panelModule) {
			warmPanel();
		}
		// All-in-one has nothing to fold. An expansion left from the phone
		// Drawer would reopen when the viewport narrows again, and Escape
		// would spend a press folding it with no Customize to focus (PERM-13).
		if (allInOne) {
			pendingExpandFocus = false;
			if (session.getState().expanded) {
				session.collapse();
			}
		}
		// A prompt already on screen stays while a sheet it lacked loads.
		const wantsShow = owed && (styled || phase === 'shown');
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
			panelContext.theme = theme;
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
		if (phase === 'shown') {
			warmAtIdle();
		}

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
	// The rights bundle reads the local receipt data (COPY-01, SR-04).
	const unsubscribeReceipt = subscribeOptOutReceiptData(kernel, invalidate);

	render();

	// A tap on the server-rendered prompt before this chunk mounted it is
	// held by the inline early-tap script. From here the prompt's own
	// handlers work: stop the script and replay the tap through them, so a
	// choice commits through the prompt's plan and Customize opens the
	// options in place. The engine started the runtime before it mounted
	// the prompt; the replay still waits for the policy. A choice records
	// the time of the tap, not of the replay.
	const replayTap = (tap: EarlyConsentTap): void => {
		if (tap.action === 'accept') {
			commit('allow', tap.at);
		} else if (tap.action === 'reject') {
			commit('refuse', tap.at);
		} else if (tap.action === 'dismiss') {
			acknowledge(tap.at);
		} else if (lastModel) {
			const layout = phone
				? lastModel.container.phone
				: lastModel.container.desktop;
			if (layout.flow !== 'all-in-one') {
				expand();
			}
		}
	};
	const stopEarlyTaps = replayEarlyConsentTaps(kernel, {
		act: replayTap,
		started: () => true,
	});

	return {
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			if (idle !== null) {
				if (typeof window.cancelIdleCallback === 'function') {
					window.cancelIdleCallback(idle);
				} else {
					window.clearTimeout(idle);
				}
			}
			cancelAnimationFrame(cancelPanelFocus);
			stopEarlyTaps();
			unsubscribeKernel();
			unsubscribeSession();
			unsubscribeDraft();
			unsubscribeReceipt();
			document.removeEventListener('keydown', onKeyDown);
			media?.removeEventListener('change', onMedia);
			removeRoot();
			pageRegion?.();
		},
		spot,
	};
};
