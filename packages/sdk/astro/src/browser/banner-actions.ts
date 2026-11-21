/**
 * The delegated listener behind the server-rendered banner's buttons and
 * every `<ConsentDialogLink />`. Small, for the first-load chunk: it calls
 * whichever client the page has, the first-load shell's or the engine's.
 *
 * @internal
 */

import type {
	AstroConsentClient,
	AstroEngineClient,
	ConsentAction,
} from '../client-types';
import type { ConsentDialogKind } from '../ui/adapter';
import { preloadDialogChunks } from './dialog-loading';
import { ACTIONS_KEY, getWindow, readPageNonce } from './page-state';

/** Attribute the server-rendered banner puts on its action buttons. */
export const ACTION_ATTRIBUTE = 'data-inth-action';

/** Attribute selecting which dialog a `customize` action opens. */
export const DIALOG_ATTRIBUTE = 'data-inth-dialog';

/**
 * Attribute selecting which tab the IAB preference centre opens on.
 *
 * The IAB banner's "N partners" link is a `customize` action that should
 * land on the vendors tab rather than purposes, the way the React, Svelte
 * and Vue banners do.
 */
export const DIALOG_TAB_ATTRIBUTE = 'data-inth-tab';

/** A banner action and what it opens. @internal */
export interface ResolvedAction {
	action: ConsentAction;
	dialog: ConsentDialogKind;
	element: HTMLElement | null;
	tab?: 'purposes' | 'vendors';
}

/**
 * The action a click or press on `target` asks for.
 *
 * @returns The action, or `null` when the target is not an action control.
 * @internal
 */
export const resolveAction = function resolveAction(
	target: EventTarget | null
): ResolvedAction | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const element = target.closest(`[${ACTION_ATTRIBUTE}]`);
	const action = element?.getAttribute(ACTION_ATTRIBUTE);
	if (
		action !== 'accept' &&
		action !== 'reject' &&
		action !== 'customize' &&
		action !== 'opt-out' &&
		action !== 'dismiss' &&
		action !== 'close'
	) {
		return null;
	}
	const dialog = element?.getAttribute(DIALOG_ATTRIBUTE);
	const tab = element?.getAttribute(DIALOG_TAB_ATTRIBUTE);
	return {
		action,
		dialog: dialog === 'iab' ? 'iab' : 'preferences',
		element: element instanceof HTMLElement ? element : null,
		tab: tab === 'vendors' || tab === 'purposes' ? tab : undefined,
	};
};

/** What the first-load shell's client adds to the listener. @internal */
export interface DeferredClientHooks {
	/** Called on dialog intent: starts the engine with the dialog. */
	warm: () => void;
	/** Loads the engine and resolves with its client. */
	engine: () => Promise<AstroEngineClient>;
}

const deferredHooks = new WeakMap<AstroConsentClient, DeferredClientHooks>();

type OptOutLinkHandler = (opener: HTMLElement | null) => Promise<void>;

const optOutLinkHandlers = new WeakMap<AstroConsentClient, OptOutLinkHandler>();

/**
 * Register the handler that activates a `data-inth-action="opt-out"` element
 * according to the resolved `optOutLink` variant, keeping `client.optOut()`
 * programmatic.
 *
 * @internal
 */
export const registerOptOutLinkHandler = function registerOptOutLinkHandler(
	client: AstroConsentClient,
	handler: OptOutLinkHandler
): void {
	optOutLinkHandlers.set(client, handler);
};

/**
 * Register what the listener does for the first-load shell's client, which
 * has no runtime until its engine loads.
 *
 * @internal
 */
export const registerDeferredClient = function registerDeferredClient(
	client: AstroConsentClient,
	hooks: DeferredClientHooks
): void {
	deferredHooks.set(client, hooks);
};

/** A dialog warm-up in flight or done, so repeated hovers cost nothing. */
let warming: Promise<void> | null = null;

/** Forget the warm-up, so the next intent downloads again. @internal */
export const resetDialogWarming = function resetDialogWarming(): void {
	warming = null;
};

/**
 * Download the dialog for `client` without mounting it. A failed download
 * is forgotten, so the next hover, focus or open tries again.
 *
 * @returns Resolves once the download settles.
 * @internal
 */
export const warmDialog = function warmDialog(
	client: AstroConsentClient
): Promise<void> {
	deferredHooks.get(client)?.warm();
	if (!warming) {
		const attempt = (async () => {
			try {
				await preloadDialogChunks(
					client.options.ui,
					client.getConsent().model === 'iab' ? 'iab' : 'preferences',
					readPageNonce()
				);
			} catch {
				// The open reports its own failure.
				warming = null;
			}
		})();
		warming = attempt;
	}
	return warming;
};

/**
 * Start downloading the preference dialog when a visitor points at or
 * focuses a control that opens it.
 *
 * The island loads on first open, so a click used to wait for the framework
 * runtime and the surface to download. Hover and focus usually come a few
 * hundred milliseconds before the click, and on touch `pointerover` fires
 * on the tap's `pointerdown`.
 *
 * @param event - A `pointerover` or `focusin` event from the document.
 */
const warmDialogOnIntent = function warmDialogOnIntent(event: Event): void {
	const resolved = resolveAction(event.target);
	const client = getWindow()?.__inthAstro;
	if (
		!client ||
		(resolved?.action !== 'customize' && resolved?.action !== 'opt-out') ||
		resolved.dialog !== 'preferences'
	) {
		return;
	}
	void warmDialog(client);
};

/**
 * Wire the delegated handler for the server-rendered banner's buttons.
 *
 * The banner ships zero framework JavaScript: the buttons carry
 * `data-inth-action` and one document-level listener turns them into
 * client calls. Hovering or focusing a control that opens the preference
 * dialog starts downloading it. Calling this more than once is a no-op.
 */
export const attachBannerActions = function attachBannerActions(): void {
	const browserWindow = getWindow();
	if (!browserWindow || browserWindow[ACTIONS_KEY]) {
		return;
	}
	browserWindow[ACTIONS_KEY] = true;

	document.addEventListener('pointerover', warmDialogOnIntent, {
		passive: true,
	});
	document.addEventListener('focusin', warmDialogOnIntent);

	document.addEventListener('click', (event) => {
		const resolved = resolveAction(event.target);
		if (!resolved) {
			return;
		}
		const client = browserWindow.__inthAstro;
		if (!client) {
			return;
		}
		event.preventDefault();
		if (resolved.action === 'dismiss') {
			const hooks = deferredHooks.get(client);
			if (hooks) {
				void (async () => {
					const engine = await hooks.engine();
					await engine.runtime.kernel.commands.dismissNotice();
				})();
			} else {
				// The engine's own client, whose runtime is set.
				void client.runtime?.kernel.commands.dismissNotice();
			}
			return;
		}
		if (resolved.action === 'accept') {
			void client.acceptAll();
			return;
		}
		if (resolved.action === 'reject') {
			void client.rejectAll();
			return;
		}
		if (resolved.action === 'opt-out') {
			const handler = optOutLinkHandlers.get(client);
			if (handler) {
				void handler(resolved.element);
				return;
			}
			const hooks = deferredHooks.get(client);
			if (hooks) {
				void (async () => {
					const engine = await hooks.engine();
					const engineHandler = optOutLinkHandlers.get(engine);
					if (engineHandler) {
						await engineHandler(resolved.element);
					} else {
						await engine.optOut(resolved.element);
					}
				})();
				return;
			}
			void client.optOut(resolved.element);
			return;
		}
		if (resolved.action === 'customize') {
			void client.openDialog(resolved.dialog, resolved.tab);
			return;
		}
		client.closeDialog();
	});
};
