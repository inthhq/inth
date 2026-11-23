/**
 * The delegated listener behind the server-rendered banner's buttons and
 * every `<ConsentDialogLink />`. Small, for the first-load chunk: it calls
 * whichever client the page has, the first-load shell's or the engine's.
 *
 * @internal
 */

import type { AstroConsentClient } from '../astro-consent-client.model';
import { resolveAction } from './banner-actions.model';
import { getWindow } from './get-window';
import { ACTIONS_KEY } from './page-state.model';
import { readDeferredClientHooks } from './register-deferred-client';
import { warmDialog } from './warm-dialog';

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
			const hooks = readDeferredClientHooks(client);
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
			const hooks = readDeferredClientHooks(client);
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
