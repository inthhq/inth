/**
 * The page's consent engine: the runtime behind `@inth/astro/client`.
 *
 * Astro is an MPA and islands do not share a component tree, so there is
 * nothing for a provider to hang off. Instead the integration injects a
 * page script that starts one client per page; islands, plain `<script>`
 * tags and any framework on the page all read that one object.
 *
 * The page script starts the first-load shell (`./browser/shell`), which
 * loads this module with `import()`, after the page for a visitor the
 * banner asks to choose and at once for everyone else. `boot()` then
 * builds the runtime and takes over from the shell.
 *
 * The runtime survives ClientRouter navigation: the module is evaluated
 * once and re-attaches to the swapped DOM on `astro:page-load` and
 * `astro:after-swap`, so consent state does not reset when a visitor moves
 * between pages.
 *
 * @internal
 */

import { isVendorAllowed, watchRevocationReload } from '@inth/sdk/engine';
import type {
	ConsentKernel,
	ConsentSnapshot,
	KernelConfig,
	KernelUser,
	ResolvedVendor,
} from '@inth/sdk/engine';
import { getEventDispatcher as getRuntimeEventDispatcher } from '@inth/sdk/events';
import type { RuntimeEventDispatcherOptions } from '@inth/sdk/events';
import { createIframeBlocker } from '@inth/sdk/modules/iframe-blocker';
import { createPersistence } from '@inth/sdk/modules/persistence';
import { createWindowDebug } from '@inth/sdk/modules/window-debug';
import { isIABConfigured } from '@inth/sdk/runtime';
import type {
	ConsentRuntimeIABFactory,
	ConsentRuntimeOptions,
	RuntimeIABOptions,
} from '@inth/sdk/runtime';
import { createConsentRuntimeWith } from '@inth/sdk/runtime/on-demand';
import { clearOnRevocationOnDemand } from '@inth/sdk/runtime/on-demand-factories';
import type { ConsentRuntimeModules } from '@inth/sdk/runtime/provider';
import {
	closeOptOutConfirmation,
	hasConsentPreferences,
	hasConsentUI,
	isOptOutConfirmationOpen,
	optOutConsentSurface,
	readFocusedElement,
	saveConsentBlanket,
	saveConsentSurface,
	showConsentSurface,
} from '@inth/sdk/surface-actions';
import { THEME_STYLE_ELEMENT_ID } from '@inth/sdk/ui/theme';
import { setupColorScheme } from '@inth/sdk/ui/utils/color-scheme';
import { setupFocusTrap, setupScrollLock } from '@inth/sdk/ui/utils/dom';
import { isLateEntry } from '@inth/sdk/ui/utils/late-entry';

import {
	IAB_PROMPT_SLOT_ATTRIBUTE,
	PROMPT_SLOT_ATTRIBUTE,
	readIABSpotModels,
} from './banner/slot';
import {
	attachBannerActions,
	resetDialogWarming,
} from './browser/banner-actions';
import type { DeferredCommitted } from './browser/commit';
import { reportUnhashedScripts } from './browser/csp-report';
import {
	ensureDialogHost,
	readDialogDisableAnimation,
	readDialogLegalLinks,
} from './browser/dialog-host';
import { loadDialog } from './browser/dialog-loading';
import { keepDialogStylesOnSwap } from './browser/dialog-styles';
import { activateGatedScripts } from './browser/inline-scripts';
import {
	BANNER_OVERLAY_SELECTOR,
	BANNER_ROOT_SELECTOR,
	COLOR_SCHEME_KEY,
	CONFIG_KEY,
	GLOBAL_KEY,
	configScripts,
	getWindow,
	nonceOf,
	readPageNonce,
} from './browser/page-state';
import type * as PromptRenderer from './browser/render-prompt';
import type { EarlyDialog, EngineHandoff } from './browser/shell';
import type {
	AstroConsentClient,
	AstroConsentSaveInput,
	AstroEngineClient,
} from './client-types';
import { assertIABAvailable, isIABUnavailable } from './libs/iab-unavailable';
import type { ResolveTransport } from './transport';
import type { InthClientOptionsExtension, InthResolvedOptions } from './types';
import type { ConsentDialogHandle, ConsentDialogKind } from './ui/adapter';

/**
 * Property of the engine's client that makes an event dispatcher for its
 * runtime. `getEventDispatcher()` in `./client` reads it, so the first-load
 * chunk does not import the dispatcher.
 *
 * @internal
 */
export const EVENTS_KEY = Symbol.for('inth.astro.events');

/**
 * Removes the page-swap listeners `boot()` installed, if any.
 *
 * A module-level slot rather than client state: there is one client per page
 * (`GLOBAL_KEY`), and `dispose()` is defined before `boot()` registers them.
 */
const NO_PAGE_SWAP_LISTENERS = (): void => {
	// Nothing booted, so nothing to remove.
};

let detachPageSwapListeners: () => void = NO_PAGE_SWAP_LISTENERS;

/**
 * The boot payload the server rendered.
 *
 * The components write it as a JSON data block. A page that sets
 * `window.__inthAstroConfig` itself, with `buildConfigScript()`, still
 * wins, as before the data block existed.
 *
 * @returns The payload, or an empty config when the page has none.
 */
const readInlinedConfig = function readInlinedConfig(): KernelConfig {
	const assigned = getWindow()?.[CONFIG_KEY];
	if (assigned) {
		return assigned;
	}
	const block = document.querySelector(
		'script[type="application/json"][data-inth-config]'
	);
	if (!block?.textContent) {
		return {};
	}
	try {
		return JSON.parse(block.textContent) as KernelConfig;
	} catch {
		return {};
	}
};

/**
 * The page's Content Security Policy nonce, read once at boot.
 *
 * Module state because the gated-script and stylesheet passes run from
 * document listeners that only see the client. A ClientRouter swap keeps
 * the first document's policy, so the first page's nonce stays the right
 * one for the rest of the visit; {@link adoptPageNonce} moves each incoming
 * page onto it.
 */
let pageNonce: string | undefined;

/**
 * The elements Inth renders with the page's nonce, and the gated tags it
 * activates with it. Nothing else on an incoming page is Inth's to change.
 */
const NONCE_BEARING_SELECTOR = [
	'script[data-inth-config]',
	'script[data-inth-boot]',
	'script[data-inth-inline]',
	`style#${THEME_STYLE_ELEMENT_ID}`,
	'style[data-inth-styles="inth-first-paint"]',
	'style[data-inth-styles="inth-iab-first-paint"]',
	'script[data-inth-category]',
].join(', ');

/**
 * Move a page the ClientRouter is about to swap in onto the live nonce.
 *
 * With a nonce generated per request, the next page arrives with a new
 * nonce while the browser keeps enforcing the first response's policy.
 * Its Inth styles and scripts would be blocked, and its gated tags would
 * fail the nonce check in {@link activateGatedScripts}. The server issued
 * both nonces, so Inth's own elements and the gated tags carrying the
 * incoming one are given the live one.
 *
 * The incoming nonce is read from the page's config scripts, which an
 * HTML-injection hole on that page could also write. A planted config
 * script ahead of Inth's would otherwise name the attacker's nonce, and
 * the attacker's own elements would be handed the live one. So every config
 * script on the page has to agree, and only Inth's elements and gated tags
 * are rewritten: an arbitrary `<script nonce>` never is. A page whose only
 * config script is planted, because Inth rendered none, is not covered.
 *
 * @param incoming - The parsed next page from `astro:before-swap`.
 */
const adoptPageNonce = function adoptPageNonce(incoming: Document): void {
	if (!pageNonce) {
		return;
	}
	const nonces = new Set(configScripts(incoming).map(nonceOf));
	if (nonces.size > 1) {
		console.warn(
			'@inth/astro: the next page has config scripts with different CSP nonces, so Inth did not move it onto the live nonce. Look for markup injected into that page.'
		);
		return;
	}
	const [incomingNonce] = nonces;
	if (!incomingNonce || incomingNonce === pageNonce) {
		return;
	}
	const elements = [
		...incoming.querySelectorAll<HTMLElement>(NONCE_BEARING_SELECTOR),
		...configScripts(incoming),
	];
	for (const element of new Set(elements)) {
		if (nonceOf(element) === incomingNonce) {
			element.setAttribute('nonce', pageNonce);
			element.nonce = pageNonce;
		}
	}
};

/**
 * Apply the configured colour scheme, replacing any previous application.
 *
 * `setupColorScheme` is what toggles `inth-dark` on `<html>` — the
 * stylesheet has no `prefers-color-scheme` block, so nothing is dark until
 * something sets that class. The inline `<head>` script gets the first
 * paint right; this keeps it right afterwards, following the system
 * setting as the visitor changes it.
 *
 * The disposer lives on `window` rather than in a module variable because
 * ClientRouter re-runs `boot()` against a document whose `<html>` class
 * list the swap may have replaced: re-applying needs to drop the previous
 * listener first, or every navigation leaks one.
 *
 * `'none'` drops any previous listener and stops there: the site owns the
 * class, so whatever it has put on `<html>` stays.
 */
const applyColorScheme = function applyColorScheme(
	colorScheme: InthResolvedOptions['colorScheme']
): void {
	const browserWindow = getWindow();
	if (!browserWindow) {
		return;
	}
	browserWindow[COLOR_SCHEME_KEY]?.();
	browserWindow[COLOR_SCHEME_KEY] = undefined;
	if (colorScheme === 'none') {
		return;
	}

	browserWindow[COLOR_SCHEME_KEY] = setupColorScheme(colorScheme);
};

/**
 * Undo the scroll lock and focus trap of a blocking banner, if one is
 * active. Module-level because the banner element can be replaced by a
 * ClientRouter swap while the lock is still held.
 */
let releaseBlocking: (() => void) | null = null;

/**
 * Remounts a dialog that a ClientRouter navigation took off the page.
 * Keyed by client so it stays off the public {@link AstroConsentClient}.
 */
const dialogRecovery = new WeakMap<AstroConsentClient, () => Promise<void>>();

/**
 * Takes over a dialog the first-load shell mounted before the engine.
 * Keyed by client so it stays off the public {@link AstroConsentClient}.
 */
const dialogAdoption = new WeakMap<
	AstroConsentClient,
	(handed: EarlyDialog) => void
>();

/**
 * Resolve once the initial policy resolution has settled.
 *
 * A page whose server did not inline a resolution boots with the init still
 * in flight, so a synchronous read of the snapshot would report "no policy"
 * for a policy that arrives a moment later. Waiting here lets `openDialog()`
 * calls made on page load (a `#inth-preferences` link, a storybook, a host
 * script) decide against the settled answer instead of the pending one.
 */
const whenPolicySettled = function whenPolicySettled(
	kernel: ConsentKernel
): Promise<void> {
	if (!kernel.getSnapshot().policyPending) {
		return Promise.resolve();
	}
	// oxlint-disable-next-line promise/avoid-new -- Bridges the kernel's subscription into one awaitable.
	return new Promise<void>((resolve) => {
		const unsubscribe = kernel.subscribe((snapshot) => {
			if (!snapshot.policyPending) {
				unsubscribe();
				resolve();
			}
		});
	});
};

/**
 * Show or hide the persistent consent controls the page rendered on the
 * server (`<ConsentDialogLink />`) as the policy resolution changes.
 *
 * With nothing to manage the controls stay hidden: before a rule resolves,
 * and under a `none` rule that owes no rights. They appear on their own once
 * a later init supplies a rule that does.
 */
export const syncSurfaceVisibility = function syncSurfaceVisibility(
	snapshot: ConsentSnapshot
): void {
	const owesUi = hasConsentPreferences(snapshot);
	for (const control of document.querySelectorAll<HTMLElement>(
		'[data-inth-surface="trigger"]'
	)) {
		control.hidden = !owesUi;
	}
};

/**
 * Show or hide the server-rendered banner to match the kernel.
 *
 * The server already decided the initial state, so this only has to keep
 * the DOM honest afterwards — after a save, or after a ClientRouter
 * navigation replaced the markup. A banner revealed after the page has
 * painted is marked `data-entry="late"`, which the stylesheet fades in when
 * the entering class is present, so `disableAnimation` still turns it off.
 * A banner the server resolved as blocking (`data-blocking="true"`) also
 * locks scroll and traps focus in its card while it is shown.
 */
export const syncBannerVisibility = function syncBannerVisibility(
	snapshot: ConsentSnapshot
): void {
	const banner = document.querySelector<HTMLElement>(BANNER_ROOT_SELECTOR);
	if (!banner) {
		releaseBlocking?.();
		return;
	}
	const shouldShow = snapshot.activeUI === 'banner';
	const entry = shouldShow && banner.hidden && isLateEntry() ? 'late' : null;
	const reveal = function reveal(element: HTMLElement): void {
		if (!element.hidden) {
			return;
		}
		if (entry) {
			element.setAttribute('data-entry', entry);
		} else {
			element.removeAttribute('data-entry');
		}
	};
	if (shouldShow) {
		reveal(banner);
	}
	banner.hidden = !shouldShow;
	banner.setAttribute('data-inth-visible', shouldShow ? 'true' : 'false');

	const blocking = shouldShow && banner.dataset.blocking === 'true';
	for (const overlay of document.querySelectorAll<HTMLElement>(
		BANNER_OVERLAY_SELECTOR
	)) {
		if (blocking) {
			reveal(overlay);
		}
		overlay.hidden = !blocking;
	}
	if (!blocking) {
		releaseBlocking?.();
		return;
	}
	if (releaseBlocking) {
		return;
	}
	const card =
		banner.querySelector<HTMLElement>(
			'[data-testid="consent-banner-card"], [data-testid="iab-consent-banner-card"]'
		) ?? banner;
	const unlockScroll = setupScrollLock();
	const releaseFocus = setupFocusTrap(card);
	releaseBlocking = () => {
		releaseFocus();
		unlockScroll();
		releaseBlocking = null;
	};
};

const NO_VENDORS: readonly ResolvedVendor[] = [];

/**
 * Stands in for a module the engine module did not register.
 *
 * The integration's engine module registers the script loader, the network
 * blocker and the `consentSource` connection whenever the site can
 * configure them, so this only runs under `boot()` without the
 * integration, which then fails loudly instead of dropping the option. A
 * fallback `import()` of these modules here would keep a site's
 * statically imported script loader in a chunk of its own.
 *
 * @param option - The option that needs the module.
 * @throws {Error} Always.
 */
const notRegistered = function notRegistered(option: string): never {
	throw new Error(
		`@inth/astro: \`${option}\` needs the module the integration's engine module registers.`
	);
};

/**
 * The runtime modules the page mounts. Data clearing loads on demand;
 * persistence and the iframe blocker load with the engine. The engine
 * module (`virtual:inth/engine`) registers the script loader, the network blocker and a `consentSource`
 * connection for a site that can configure them, and the IAB mount
 * through {@link registerIAB} for a site that sets `iab`.
 */
let pageRuntimeModules: ConsentRuntimeModules = {
	connectConsentSource: () => notRegistered('consentSource'),
	createClearOnRevocation: clearOnRevocationOnDemand,
	createIframeBlocker,
	createNetworkBlocker: ({ hold }) => {
		// Nothing will decide the held requests: fail them closed.
		hold?.block();
		return notRegistered('networkBlocker');
	},
	createPersistence,
	createScriptLoader: () => notRegistered('scripts'),
	createWindowDebug,
	watchRevocationReload,
};

/**
 * What a page needs to run the IAB CMP: a lazy `createIAB` (from
 * `createLazyIABFactory`), its readiness signal, and the runtime mount.
 *
 * @internal
 */
export interface PageIAB {
	/** The `createIAB` the runtime calls synchronously. */
	create: ConsentRuntimeIABFactory;
	/** Resolves once every pending `@inth/sdk/iab` load has settled. */
	whenReady: () => Promise<void>;
	/** `mountRuntimeIAB` from `@inth/sdk/runtime`. */
	mount: NonNullable<ConsentRuntimeModules['mountIAB']>;
}

/** Set by the engine module of a site that sets `iab`; `null` everywhere else. */
let pageIAB: PageIAB | null = null;

/**
 * Wire the IAB CMP into the page runtime.
 *
 * The integration's engine module calls this only when the site sets `iab`,
 * so a site without IAB ships neither the mount nor the lazy factory, and
 * never fetches `@inth/sdk/iab`. Call before {@link boot}.
 *
 * @param iab - The lazy factory and the mount.
 * @internal
 */
export const registerIAB = function registerIAB(iab: PageIAB): void {
	pageIAB = iab;
};

/** Set by the engine module; see {@link registerTransport}. */
let pageTransport: ResolveTransport | null = null;

/**
 * Pick how the page turns the serialized mode into a transport.
 *
 * The engine module registers the variant that fits the site, so the page
 * ships only that one: a site that renders on demand loads the init path
 * when a page inits again, and a site with no adapter, whose every page
 * inits in the browser, ships the hosted transport with the page. Call
 * before {@link boot}.
 *
 * @param resolve - Turns the resolved options into a transport factory.
 * @internal
 */
export const registerTransport = function registerTransport(
	resolve: ResolveTransport
): void {
	pageTransport = resolve;
};

/**
 * Mount these module factories.
 *
 * The integration's engine module imports the script loader statically
 * when the site configures `scripts` (or a `clientEntrypoint` that may add
 * some), and the network blocker when it configures rules, so those ship
 * with the engine instead of one round trip after it. A `clientEntrypoint`
 * that may add blocker rules gets the on-demand blocker. Call before
 * {@link boot}.
 *
 * @param modules - The module factories to mount.
 * @internal
 */
export const registerRuntimeModules = function registerRuntimeModules(
	modules: Partial<ConsentRuntimeModules>
): void {
	pageRuntimeModules = { ...pageRuntimeModules, ...modules };
};

type Permissions = DeferredCommitted['permissions'];

const samePermissions = (left: Permissions, right: Permissions): boolean =>
	Object.keys({ ...left, ...right }).every(
		(category) =>
			left[category as keyof Permissions] ===
			right[category as keyof Permissions]
	);

/**
 * The callbacks after a shell commit. The site heard the commit's
 * `onPermissionsChanged`; a change reaches it again only when it differs
 * from what it last heard, with that as its `previous`.
 */
const committedCallbacks = function committedCallbacks(
	callbacks: InthClientOptionsExtension['callbacks'],
	committed: DeferredCommitted
): InthClientOptionsExtension['callbacks'] {
	const onPermissionsChanged = callbacks?.onPermissionsChanged;
	if (!onPermissionsChanged) {
		return callbacks;
	}
	let heard = committed.permissions;
	return {
		...callbacks,
		onPermissionsChanged: (event) => {
			const next = event.snapshot.effectivePermissions;
			if (samePermissions(next, heard)) {
				return;
			}
			const previous = heard;
			heard = next;
			onPermissionsChanged({ ...event, previous });
		},
	};
};

/**
 * The boot payload, with a choice the shell recorded before the engine
 * loaded. The server read the visitor's records before the choice, so the
 * committed ones replace them, and the clock moves to now: the kernel takes
 * a record newer than its clock for an invalid one.
 */
const engineConfig = function engineConfig(
	committed: DeferredCommitted | undefined
): KernelConfig {
	const inlined = readInlinedConfig();
	if (committed) {
		return {
			...inlined,
			initialRecords: { ...inlined.initialRecords, ...committed.records },
			now: Date.now(),
		};
	}
	// A prerendered page inlines no clock: the build's would age every
	// stored record against the day the site was built.
	return inlined.now === undefined ? { ...inlined, now: Date.now() } : inlined;
};

/** Marks the first-paint `<style>` the components inline. */
const FIRST_PAINT_SELECTOR = 'style[data-inth-styles="inth-first-paint"]';

/**
 * Add the first-paint rules a page left out. The server inlines them only
 * where the banner may show, so on a returning visitor's page the dialog,
 * which builds on their tokens and button rules, brings them along.
 *
 * @param nonce - The page's CSP nonce.
 */
const ensureFirstPaintStyles = async function ensureFirstPaintStyles(
	options: InthResolvedOptions,
	nonce: string | undefined
): Promise<void> {
	if (!options.inlineStyles || document.querySelector(FIRST_PAINT_SELECTOR)) {
		return;
	}
	const { INLINE_STYLES_CSS, INLINE_STYLES_ID } =
		await import('./browser/first-paint-styles');
	if (document.querySelector(FIRST_PAINT_SELECTOR)) {
		return;
	}
	const style = document.createElement('style');
	style.setAttribute('data-inth-styles', INLINE_STYLES_ID);
	if (nonce) {
		style.nonce = nonce;
	}
	style.textContent = INLINE_STYLES_CSS;
	document.head.append(style);
};

const createClient = function createClient(
	options: InthResolvedOptions,
	extension: InthClientOptionsExtension = {},
	committed?: DeferredCommitted
): AstroEngineClient {
	pageNonce = readPageNonce();
	const config = engineConfig(committed);
	const callbacks = committed
		? committedCallbacks(extension.callbacks, committed)
		: extension.callbacks;
	const scripts = [...(options.scripts ?? []), ...(extension.scripts ?? [])];
	// Under Astro's CSP the config could not hash these, so say which ones
	// the policy will block. A page with a nonce runs under the site's own
	// policy, which the loader's nonce satisfies.
	if (options.csp && !pageNonce && extension.scripts?.length) {
		void reportUnhashedScripts(extension.scripts, options.csp);
	}

	// Only a site that sets `iab` gets the IAB wiring from its engine module.
	const iab = isIABConfigured(options.iab)
		? (pageIAB ?? notRegistered('iab'))
		: null;

	// The server already resolved translations into `prefetch`, which the
	// runtime prefers over anything it would derive from `i18n`.
	const runtime = createConsentRuntimeWith(
		{
			callbacks,
			clearOnRevocation:
				extension.clearOnRevocation ?? options.clearOnRevocation,
			consentCategories: options.consentCategories,
			consentSource: extension.consentSource,
			createIAB: iab?.create,
			// The server resolved this request's arm into the prefetch. Without
			// one, no experiment runs: browser assignment would hold a banner
			// the server already rendered.
			experiment: config.initialExperiment ? options.experiment : undefined,
			experimentalScriptRegistry: options.experimentalScriptRegistry,
			gpp: options.gpp,
			i18n: options.i18n as ConsentRuntimeOptions['i18n'],
			// `RuntimeIABOptions` is the runtime's open-ended shape; the
			// integration option is the closed, documented subset of it.
			iab:
				options.iab === false
					? false
					: (options.iab as RuntimeIABOptions | undefined),
			// Called only when `gpp` is set, so other sites never fetch the chunk.
			loadGPP: () => import('@inth/sdk/iab/gpp'),
			mode: (pageTransport ?? notRegistered('mode'))(options),
			networkBlocker: extension.networkBlocker ?? options.networkBlocker,
			nonce: pageNonce,
			pkg: '@inth/astro',
			prefetch: config,
			presentation: options.presentation,
			reloadOnConsentRevoked: options.reloadOnConsentRevoked,
			scripts,
			storageConfig: options.storageConfig,
			theme: options.theme,
			vendors: options.vendors,
		},
		iab ? { ...pageRuntimeModules, mountIAB: iab.mount } : pageRuntimeModules
	);

	let dialog: ConsentDialogHandle | null = null;
	let dialogKind: ConsentDialogKind | null = null;
	let dialogTab: 'purposes' | 'vendors' | undefined;
	let dialogTarget: HTMLElement | null = null;
	let opening: Promise<void> | null = null;
	// `openDialog()` awaits an adapter import, IAB readiness and the mount
	// itself. `dispose()` can land in any of those gaps, and only destroys
	// the handle it can already see — so the open path checks this after
	// every await and cleans up anything it mounted too late.
	let disposed = false;

	// The ClientRouter replaces `<body>`, and the dialog host with it. A
	// surface mounted into the old one is off the page, so reusing its
	// handle would open a dialog nobody can see.
	const releaseDetachedDialog = function releaseDetachedDialog(): boolean {
		if (!dialog || dialogTarget?.isConnected) {
			return false;
		}
		// Not awaited: an outro running on a detached node may never end.
		void dialog.destroy();
		dialog = null;
		dialogKind = null;
		dialogTarget = null;
		return true;
	};

	const ensureDialogMounted = async (
		kind: ConsentDialogKind,
		tab?: 'purposes' | 'vendors'
	): Promise<boolean> => {
		if (opening) {
			await opening;
		}
		if (disposed) {
			return false;
		}
		releaseDetachedDialog();
		// The tab lives in the island's own component state, so asking
		// for a different one on an already-mounted surface means
		// remounting it. Checked after any pending mount has settled, so
		// a "N partners" click that lands while "Customize" is still
		// loading the island is honoured rather than dropped.
		if (
			dialog &&
			(dialogKind !== kind || (tab !== undefined && tab !== dialogTab))
		) {
			await dialog.destroy();
			dialog = null;
		}
		if (!dialog) {
			opening = (async () => {
				// The island and the stylesheets load beside the adapter, and
				// the mount waits for them so the dialog never paints without
				// its rules.
				const [adapter] = await Promise.all([
					loadDialog(options.ui, kind, pageNonce),
					ensureFirstPaintStyles(options, pageNonce),
				]);
				if (disposed) {
					return;
				}
				if (kind === 'iab') {
					// The IAB surface renders against `runtime.iab`, which is
					// a lazy proxy until `@inth/sdk/iab` lands.
					await iab?.whenReady();
					if (disposed) {
						return;
					}
				}
				const target = ensureDialogHost();
				const handle = await adapter.mount({
					kind,
					legalLinks:
						kind === 'preferences' ? readDialogLegalLinks() : undefined,
					options: {
						...options,
						disableAnimation:
							readDialogDisableAnimation(kind) ?? options.disableAnimation,
					},
					runtime,
					tab,
					target,
				});
				if (disposed) {
					// Disposal happened during the mount, so nothing will
					// ever ask for this handle again — tear it down here.
					await handle.destroy();
					return;
				}
				dialog = handle;
				dialogKind = kind;
				dialogTab = tab;
				dialogTarget = target;
			})();
			try {
				await opening;
			} finally {
				opening = null;
			}
		}
		return !disposed;
	};

	const client: AstroEngineClient = {
		// Under an IAB policy the blanket goes through the CMP handle, so the
		// TC string records it. Any surface closes on the local record.
		async acceptAll() {
			await saveConsentBlanket(runtime.kernel, 'all', runtime.iab);
		},
		closeDialog() {
			closeOptOutConfirmation(runtime.kernel);
			showConsentSurface(runtime.kernel, 'none');
			dialog?.close();
		},
		dispose() {
			if (disposed) {
				// A retained reference to a disposed client must not tear down
				// the replacement that booted after it: the colour-scheme
				// disposer and the page-swap listeners are window-owned, and
				// the second call would be running the new client's.
				return;
			}
			disposed = true;
			resetDialogWarming();
			detachPageSwapListeners();
			releaseBlocking?.();
			closeOptOutConfirmation(runtime.kernel);
			void dialog?.destroy();
			dialog = null;
			dialogKind = null;
			runtime.dispose();
			const browserWindow = getWindow();
			if (browserWindow) {
				browserWindow[COLOR_SCHEME_KEY]?.();
				browserWindow[COLOR_SCHEME_KEY] = undefined;
				browserWindow[GLOBAL_KEY] = undefined;
			}
		},
		getConsent() {
			return runtime.kernel.getSnapshot();
		},
		getDeclaredVendors() {
			const snapshot = runtime.kernel.getSnapshot();
			return snapshot.model === 'iab'
				? NO_VENDORS
				: (snapshot.vendors?.declared ?? NO_VENDORS);
		},
		getVendorChoice() {
			return runtime.kernel.getSnapshot().vendorChoice;
		},
		async identify(user: KernelUser) {
			await runtime.identify(user);
		},
		isVendorAllowed(vendorId: string) {
			return isVendorAllowed(runtime.kernel.getSnapshot(), vendorId);
		},
		async openDialog(
			kind: ConsentDialogKind = 'preferences',
			tab?: 'purposes' | 'vendors'
		) {
			if (disposed) {
				return;
			}
			if (extension.consentSource) {
				showConsentSurface(runtime.kernel, 'dialog');
				return;
			}
			// Decide against the settled resolution: an init still in flight is
			// not "no policy". Nothing to open without a rule that owes UI, which
			// excludes a `none` rule with no rights.
			await whenPolicySettled(runtime.kernel);
			if (disposed || !hasConsentUI(runtime.kernel.getSnapshot())) {
				return;
			}
			if (!(await ensureDialogMounted(kind, tab))) {
				return;
			}
			showConsentSurface(runtime.kernel, 'dialog');
		},
		async optOut(opener?: HTMLElement | null) {
			const resolvedOpener = opener ?? readFocusedElement();
			if (disposed) {
				return;
			}
			if (extension.consentSource) {
				await optOutConsentSurface(runtime.kernel, { opener: resolvedOpener });
				return;
			}
			await whenPolicySettled(runtime.kernel);
			if (disposed || !hasConsentUI(runtime.kernel.getSnapshot())) {
				return;
			}
			if (runtime.kernel.getSnapshot().policyRule.model !== 'opt-out') {
				await client.openDialog('preferences');
				return;
			}
			const optOutTask = optOutConsentSurface(runtime.kernel, {
				opener: resolvedOpener,
			});
			await Promise.all([optOutTask, ensureDialogMounted('preferences')]);
		},
		options,
		ready: Promise.resolve(),
		async rejectAll() {
			await saveConsentBlanket(runtime.kernel, 'none', runtime.iab);
		},
		runtime,
		async save(consents: AstroConsentSaveInput) {
			await saveConsentSurface(runtime.kernel, () =>
				runtime.kernel.commands.save(consents)
			);
		},
		subscribe(listener) {
			return runtime.kernel.subscribe(listener);
		},
	};

	Object.defineProperty(client, EVENTS_KEY, {
		configurable: true,
		value: (dispatcherOptions: RuntimeEventDispatcherOptions) =>
			getRuntimeEventDispatcher(runtime, dispatcherOptions),
	});

	// A preference dialog the shell opened before the engine loaded is this
	// client's from here: its island renders against this runtime's kernel
	// through the shell's stand-in.
	dialogAdoption.set(client, (handed) => {
		dialog = handed.handle;
		dialogKind = 'preferences';
		dialogTarget = handed.target;
	});

	// A dialog that was open when the page swapped stays open on the new
	// page, as it does under the React, Svelte and Vue providers.
	dialogRecovery.set(client, async () => {
		await opening?.catch(() => undefined);
		const kind = dialogKind ?? 'preferences';
		const tab = dialogTab;
		const dialogOpen = runtime.kernel.getSnapshot().activeUI === 'dialog';
		const confirmationOpen = isOptOutConfirmationOpen(runtime.kernel);
		if (
			disposed ||
			!releaseDetachedDialog() ||
			!(dialogOpen || confirmationOpen)
		) {
			return;
		}
		if (dialogOpen) {
			await client.openDialog(kind, tab);
		} else {
			await ensureDialogMounted('preferences');
		}
	});

	return client;
};

/** The page's client: the engine's once it booted. */
const currentClient = function currentClient(): AstroConsentClient | null {
	return getWindow()?.[GLOBAL_KEY] ?? null;
};

/** A banner render in flight, and the client and page it started for. */
interface PendingPromptRender {
	client: AstroConsentClient;
	body: HTMLElement;
}

let promptRender: PendingPromptRender | null = null;

type PromptRendererModule = typeof PromptRenderer;

const loadDefaultPromptRenderer = (): Promise<PromptRendererModule> =>
	import('./browser/render-prompt');

let loadPromptRenderer = loadDefaultPromptRenderer;

/**
 * Replaces how the banner renderer chunk is loaded, so a test can make it
 * fail. Call with no argument to restore the real one.
 *
 * Tests only.
 *
 * @internal
 */
export const setPromptRendererLoaderForTest =
	function setPromptRendererLoaderForTest(
		loader?: () => Promise<PromptRendererModule>
	): void {
		loadPromptRenderer = loader ?? loadDefaultPromptRenderer;
	};

/** How often a client tries to load the banner renderer before giving up. */
const MAX_PROMPT_LOAD_ATTEMPTS = 3;

/** Failed renderer loads per client, for the retry back-off. */
const promptLoadFailures = new WeakMap<AstroConsentClient, number>();

const SPOT_SELECTOR = `[${PROMPT_SLOT_ATTRIBUTE}], [${IAB_PROMPT_SLOT_ATTRIBUTE}]`;

/** Whether the banner is still owed and nothing has rendered one yet. */
const owesBanner = function owesBanner(client: AstroConsentClient): boolean {
	return (
		currentClient() === client &&
		client.getConsent().activeUI === 'banner' &&
		document.querySelector(BANNER_ROOT_SELECTOR) === null
	);
};

/**
 * Whether the IAB banner's spot answers the snapshot.
 *
 * An IAB policy goes to the IAB spot while its IAB state loads. Once that
 * state is definitively disabled (no usable vendor list) the policy runs as
 * opt-in, and the standard banner answers it instead.
 */
const iabSpotAnswers = function iabSpotAnswers(
	snapshot: ConsentSnapshot
): boolean {
	const iabSpot = document.querySelector(`[${IAB_PROMPT_SLOT_ATTRIBUTE}]`);
	return (
		iabSpot !== null &&
		snapshot.iab?.enabled !== false &&
		readIABSpotModels(iabSpot).includes(snapshot.policyRule.model)
	);
};

/**
 * Load the renderer for whichever spot answers the snapshot, and render.
 *
 * @returns `false` when the answer changed while the renderer loaded, so
 * the caller should choose again.
 */
const renderIntoAnsweringSpot = async function renderIntoAnsweringSpot(
	client: AstroConsentClient
): Promise<boolean> {
	if (iabSpotAnswers(client.getConsent())) {
		const { renderIABPromptIntoSlot } =
			await import('./browser/render-iab-prompt');
		if (!iabSpotAnswers(client.getConsent())) {
			return false;
		}
		if (owesBanner(client)) {
			renderIABPromptIntoSlot(client.getConsent(), client.options);
		}
		return true;
	}
	if (!document.querySelector(`[${PROMPT_SLOT_ATTRIBUTE}]`)) {
		return true;
	}
	const { renderPromptIntoSlot } = await loadPromptRenderer();
	if (iabSpotAnswers(client.getConsent())) {
		return false;
	}
	if (owesBanner(client)) {
		renderPromptIntoSlot(client.getConsent(), client.options);
	}
	return true;
};

/**
 * Fill whichever spot answers the current policy. An IAB policy goes to the
 * IAB banner's spot, and waits there until the vendor list arrives rather
 * than falling back to the standard banner; the next snapshot retries.
 *
 * @returns `false` when a renderer chunk failed to load.
 */
const renderPrompt = async function renderPrompt(
	client: AstroConsentClient
): Promise<boolean> {
	try {
		// A policy refresh during the import can change the answer; choose once
		// more. A second change in one render is left to the next snapshot.
		if (!(await renderIntoAnsweringSpot(client))) {
			await renderIntoAnsweringSpot(client);
		}
		if (currentClient() === client) {
			syncBannerVisibility(client.getConsent());
		}
		return true;
	} catch (error) {
		// Usually a network failure. The caller retries with a back-off.
		console.warn('@inth/astro: the consent banner failed to load.', error);
		return false;
	}
};

/**
 * Run one render and release the in-flight marker it owns.
 *
 * @returns What to do next: `'again'` when a `ClientRouter` swap replaced
 * the page during the chunk import (the swap's own `attach()` found this
 * render in flight and stood down, so the new page still needs a look),
 * `'later'` when the renderer failed to load, and `'done'` otherwise.
 */
const runPromptRender = async function runPromptRender(
	pending: PendingPromptRender
): Promise<'again' | 'later' | 'done'> {
	const loaded = await renderPrompt(pending.client);
	if (promptRender !== pending) {
		return 'done';
	}
	promptRender = null;
	if (!loaded) {
		return 'later';
	}
	return document.body !== pending.body && currentClient() === pending.client
		? 'again'
		: 'done';
};

/**
 * Render a banner in the browser when the page owes one it does not have.
 *
 * `<ConsentBanner />` and `<IABConsentBanner />` leave a marked spot
 * wherever the server could not know the policy — a prerendered page in
 * hosted or manifest mode, or a server render whose init failed — and the
 * IAB banner also when there was no vendor list yet. Each renderer is its
 * own chunk, so a page that never needs one never downloads it.
 */
const ensurePromptRendered = function ensurePromptRendered(
	client: AstroConsentClient,
	snapshot: ConsentSnapshot
): void {
	// A render for this client is already under way. One left over from a
	// disposed client does not count: its result is discarded.
	if (
		promptRender?.client === client ||
		snapshot.activeUI !== 'banner' ||
		document.querySelector(BANNER_ROOT_SELECTOR) ||
		!document.querySelector(SPOT_SELECTOR)
	) {
		return;
	}
	const pending = { body: document.body, client };
	promptRender = pending;
	void (async () => {
		const next = await runPromptRender(pending);
		if (next === 'again') {
			ensurePromptRendered(client, client.getConsent());
			return;
		}
		if (next !== 'later') {
			return;
		}
		// Without the renderer the visitor has no way to choose, so try again
		// after 1 s and 2 s before giving up.
		const failures = (promptLoadFailures.get(client) ?? 0) + 1;
		promptLoadFailures.set(client, failures);
		if (failures < MAX_PROMPT_LOAD_ATTEMPTS) {
			setTimeout(
				() => {
					if (currentClient() === client) {
						ensurePromptRendered(client, client.getConsent());
					}
				},
				1000 * 2 ** (failures - 1)
			);
		}
	})();
};

const attach = function attach(client: AstroConsentClient): void {
	const snapshot = client.getConsent();
	ensurePromptRendered(client, snapshot);
	syncBannerVisibility(snapshot);
	syncSurfaceVisibility(snapshot);
	activateGatedScripts(snapshot, document, pageNonce);
};

/**
 * Create the page's consent runtime, or return the existing one.
 *
 * The first-load shell calls this once it has loaded the engine;
 * application code uses `getConsentClient()` instead.
 *
 * @param options - The serialized integration options.
 * @param extension - Non-serializable additions from `clientEntrypoint`.
 * @param handoff - From the shell: takes over its place on `window`, with
 * any choice it recorded.
 * @throws {Error} Outside the browser.
 */
export const boot = function boot(
	options: InthResolvedOptions,
	extension: InthClientOptionsExtension = {},
	handoff?: EngineHandoff
): AstroEngineClient {
	const browserWindow = getWindow();
	if (!browserWindow) {
		throw new Error('@inth/astro: boot() requires a browser environment.');
	}
	const existing = browserWindow[GLOBAL_KEY];
	if (existing && !handoff) {
		// A second `boot()` returns the page's client. The shell always
		// hands off, so without a handoff this is the engine's own.
		return existing as AstroEngineClient;
	}

	const client = createClient(options, extension, handoff?.committed);
	if (handoff?.dialog) {
		dialogAdoption.get(client)?.(handoff.dialog);
	}
	// A server config for an `iab` policy on a site without `iab` fails the
	// server render first; this covers a page the browser resolves itself.
	assertIABAvailable(client.getConsent(), options.iab);
	browserWindow[GLOBAL_KEY] = client;
	client.runtime.start();
	if (handoff?.committed) {
		// The shell's commit queued its save; send it from the started
		// runtime. A server-resolved page starts without an init, which is
		// what would otherwise replay it.
		(client.runtime.kernel as { replaySaves?: () => void }).replaySaves?.();
	}
	applyColorScheme(options.colorScheme);
	attachBannerActions();

	let iabReported = false;
	client.subscribe((snapshot) => {
		if (isIABUnavailable(snapshot, options.iab)) {
			// Thrown outside the kernel's listener loop, so it reaches the
			// console and the dev overlay as an uncaught error.
			if (!iabReported) {
				iabReported = true;
				queueMicrotask(() => assertIABAvailable(snapshot, options.iab));
			}
			return;
		}
		ensurePromptRendered(client, snapshot);
		syncBannerVisibility(snapshot);
		syncSurfaceVisibility(snapshot);
		activateGatedScripts(snapshot, document, pageNonce);
	});

	// The ClientRouter replaces the document without re-evaluating modules,
	// so the runtime survives but its DOM does not. Re-attach to the new
	// markup instead of rebuilding consent state. The swap also replaces the
	// `<html>` attributes, taking `inth-dark` with them, so the colour
	// scheme is applied again against the new document.
	const onAfterSwap = function onAfterSwap(): void {
		applyColorScheme(options.colorScheme);
		attach(client);
		void dialogRecovery.get(client)?.();
	};
	const onPageLoad = function onPageLoad(): void {
		attach(client);
	};
	// The swap also drops every `<head>` element the next page lacks,
	// including the dialog stylesheets the client linked.
	const onBeforeSwap = function onBeforeSwap(event: Event): void {
		const incoming = (event as Event & { newDocument?: Document }).newDocument;
		if (incoming) {
			adoptPageNonce(incoming);
			keepDialogStylesOnSwap(incoming);
		}
	};
	document.addEventListener('astro:before-swap', onBeforeSwap);
	document.addEventListener('astro:after-swap', onAfterSwap);
	document.addEventListener('astro:page-load', onPageLoad);
	// Without this, a dispose-then-boot leaves the old handlers on the
	// document, and the next swap reattaches a client that is already gone.
	detachPageSwapListeners = (): void => {
		document.removeEventListener('astro:before-swap', onBeforeSwap);
		document.removeEventListener('astro:after-swap', onAfterSwap);
		document.removeEventListener('astro:page-load', onPageLoad);
		detachPageSwapListeners = NO_PAGE_SWAP_LISTENERS;
	};

	attach(client);
	return client;
};

export { activateGatedScripts } from './browser/inline-scripts';
