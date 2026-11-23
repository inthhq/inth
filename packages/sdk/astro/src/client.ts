/**
 * `@inth/astro/client` — the page-level consent client.
 *
 * Astro is an MPA and islands do not share a component tree, so there is
 * nothing for a provider to hang off. Instead the integration injects a
 * page script that starts exactly one client per page; islands, plain
 * `<script>` tags and any framework on the page all read that one object.
 *
 * The consent engine loads after the page for a visitor the banner asks to
 * choose. Until then the client answers from the snapshot the server
 * rendered the banner with, and a banner choice is recorded at once.
 * `client.runtime` is set once `client.ready` resolves.
 *
 * ```ts
 * import { getConsentClient } from '@inth/astro/client';
 *
 * const Inth = getConsentClient();
 * Inth?.subscribe((snapshot) => console.log(snapshot.effectivePermissions));
 * ```
 *
 * Everything here is small and ships in the page's first load. The engine
 * (`boot()` and the `register*` hooks the page script calls) is re-exported
 * for compatibility; importing it statically puts it back in the first
 * load.
 */

import type { ConsentSnapshot, Unsubscribe } from '@inth/sdk/engine';
import type {
	EventDispatcher,
	RuntimeEventDispatcherOptions,
} from '@inth/sdk/events';

import { warmDialogTarget } from './browser/banner-actions';
import { preloadDialogChunks } from './browser/dialog-loading';
import { GLOBAL_KEY, getWindow, readPageNonce } from './browser/page-state';
import type { AstroConsentClient } from './client-types';
import type { ConsentDialogKind } from './ui/adapter';

/**
 * The page's consent client, once the page script has run.
 *
 * @returns The client, or `null` outside the browser, before the page
 * script ran, or, on a page that renders no Inth component, until the
 * consent engine has loaded.
 */
export const getConsentClient =
	function getConsentClient(): AstroConsentClient | null {
		return getWindow()?.[GLOBAL_KEY] ?? null;
	};

/**
 * The current consent snapshot.
 *
 * @returns The snapshot, or `null` before boot.
 */
export const getConsent = function getConsent(): ConsentSnapshot | null {
	return getConsentClient()?.getConsent() ?? null;
};

/**
 * Observe consent changes.
 *
 * @param listener - Called with every new snapshot.
 * @returns An unsubscribe function. A no-op before boot.
 */
export const subscribe = function subscribe(
	listener: (snapshot: ConsentSnapshot) => void
): Unsubscribe {
	const client = getConsentClient();
	if (!client) {
		return () => {
			/* not booted */
		};
	}
	return client.subscribe(listener);
};

/**
 * Open a consent dialog.
 *
 * @param kind - `'preferences'` (default) or `'iab'`.
 * @param tab - Which IAB preference-centre tab to open on.
 */
export const openDialog = async function openDialog(
	kind: ConsentDialogKind = 'preferences',
	tab?: 'purposes' | 'vendors'
): Promise<void> {
	await getConsentClient()?.openDialog(kind, tab);
};

/**
 * Record an opt-out in one click and open the confirmation view under an
 * opt-out rule, or open the preference dialog under other models.
 */
export const optOut = async function optOut(
	opener?: HTMLElement | null
): Promise<void> {
	await getConsentClient()?.optOut(opener);
};

/** `EVENTS_KEY` in `./client-engine`; a test keeps them equal. */
const EVENTS_KEY = Symbol.for('inth.astro.events');

type WithEvents = AstroConsentClient & {
	[EVENTS_KEY]?: (options: RuntimeEventDispatcherOptions) => EventDispatcher;
};

/**
 * The page's event dispatcher.
 *
 * It delivers to the integration's `scripts`, plus any you pass, and checks
 * consent when it sends. The pageview history lives with the page runtime,
 * so it survives ClientRouter navigation and every dispatcher shares it.
 * Calls made before the consent engine loads are sent once it has; calls
 * before the page script ran are dropped.
 *
 * @param options - Extra `scripts`, SPA `pageviews` integrations and
 * injectable `globals`.
 * @returns A dispatcher with `track` and `pageview`.
 * @example
 * ```ts
 * import { getEventDispatcher } from '@inth/astro/client';
 *
 * const events = getEventDispatcher({ pageviews: ['posthog'] });
 * // Fires on the first load and after each ClientRouter navigation.
 * document.addEventListener('astro:page-load', () =>
 * 	events.pageview(location.pathname + location.search)
 * );
 * ```
 */
export const getEventDispatcher = function getEventDispatcher(
	options: RuntimeEventDispatcherOptions = {}
): EventDispatcher {
	const current = (): EventDispatcher | undefined =>
		(getConsentClient() as WithEvents | null)?.[EVENTS_KEY]?.(options);
	const send = (run: (dispatcher: EventDispatcher) => void): void => {
		const dispatcher = current();
		if (dispatcher) {
			run(dispatcher);
			return;
		}
		const client = getConsentClient();
		if (!client) {
			return;
		}
		void (async () => {
			await client.ready;
			const loaded = current();
			if (loaded) {
				run(loaded);
			}
		})();
	};
	return {
		pageview: (path) => send((dispatcher) => dispatcher.pageview(path)),
		track: (event, properties) =>
			send((dispatcher) => dispatcher.track(event, properties)),
	};
};

/**
 * Download the dialog surface's chunks without mounting it.
 *
 * Use it from an idle callback when the first open needs to feel instant;
 * skip it when you would rather not spend the bytes on visitors who never
 * open the preference centre. It does not load the consent engine.
 */
export const preloadDialog = async function preloadDialog(): Promise<void> {
	const client = getConsentClient();
	if (!client) {
		return;
	}
	try {
		const { design, kind } = warmDialogTarget(client);
		await preloadDialogChunks(client.options.ui, kind, readPageNonce(), design);
	} catch {
		// The open reports its own failure.
	}
};

export type {
	AstroConsentClient,
	AstroConsentSaveInput,
	ConsentAction,
} from './client-types';
export {
	ACTION_ATTRIBUTE,
	attachBannerActions,
	DIALOG_ATTRIBUTE,
	DIALOG_TAB_ATTRIBUTE,
} from './browser/banner-actions';
export { startDeferredClient } from './browser/shell';
export { activateGatedScripts } from './browser/inline-scripts';
export {
	boot,
	registerIAB,
	registerRuntimeModules,
	registerTransport,
	setPromptRendererLoaderForTest,
	syncBannerVisibility,
	syncSurfaceVisibility,
} from './client-engine';
export type { PageIAB } from './client-engine';
export type { ConsentRuntime } from '@inth/sdk/runtime';
export type {
	EventDispatcher,
	EventProperties,
	RuntimeEventDispatcherOptions as GetEventDispatcherOptions,
} from '@inth/sdk/events';
export type { ResolvedVendor, VendorChoice } from '@inth/sdk/engine';
export type { ConsentDialogKind } from './ui/adapter';
export { registerDialogAdapter, registerDialogSurface } from './ui/adapter';
export { registerDialogStyles } from './browser/dialog-styles';
// The engine chunk registers one of these with `registerTransport()`.
export { hostedTransport, lazyTransport, testingTransport } from './transport';
export type {
	ConsentDialogAdapter,
	ConsentDialogContext,
	ConsentDialogHandle,
	ConsentDialogSurfaceLoader,
} from './ui/adapter';
