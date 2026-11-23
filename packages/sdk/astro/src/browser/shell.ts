/**
 * The first-load half of the page's consent client.
 *
 * The consent engine (kernel, persistence, runtime, transports and the
 * script loader) is not in the page's first-load JavaScript. The page
 * script starts this shell instead, and it loads the engine with
 * `import()`:
 *
 * - The server leaves the snapshot it rendered from in a
 *   `<script type="application/json" data-inth-boot>` block beside the
 *   config. The shell puts a client on `window` that reads that snapshot,
 *   so `getConsentClient()`, `getConsent()` and `subscribe()` work as soon
 *   as the page script has run, as they did when it booted the engine.
 * - For a visitor the banner asks to choose, with nothing optional granted
 *   and nothing that needs the engine, the engine loads after the page's
 *   `img[fetchpriority=high]` images, at the first input or scroll outside
 *   the banner, on dialog intent, after a banner tap, or after 10 seconds.
 * - An accept, reject or save before then is committed in the tap's own
 *   task (`planInstantCommit`): the snapshot changes, listeners hear it,
 *   the banner hides and the plain `scripts` the choice allows start. The
 *   commit chunk (`./commit`) stores the record and queues the save a task
 *   later, and the engine starts from that record without recording it
 *   again.
 * - Customize opens the preference dialog against a stand-in runtime
 *   (`./stand-in`) that reads the same snapshot, without the engine: only
 *   the dialog's chunks share the connection with the page. The engine
 *   loads once the dialog is on screen and takes the dialog over; a save
 *   from the dialog waits for it. That needs an island whose provider
 *   renders a borrowed runtime without creating one, which the Svelte
 *   island does. The other islands start the engine with the dialog.
 * - Anything else (stored consent, a page every visitor shares, a notice or
 *   opt-out prompt, IAB, an experiment, GPP, a network blocker, declared
 *   vendors, a `consentSource`, a blocking banner, or a script that may run
 *   now) loads the engine as the page script runs. A page with no boot
 *   block at all, which rendered no Inth component, gets the engine's
 *   client once it has loaded.
 *
 * @internal
 */

import type { ConsentSnapshot, ResolvedVendor } from '@inth/sdk/engine';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import { EARLY_TAP_ROOT } from '@inth/sdk/runtime/page-globals';
import {
	generateUuidV7,
	hasStoredClearEpoch,
	planInstantCommit,
} from '@inth/sdk/surface-actions/instant-commit';
import {
	isRunnableNow,
	startPlainScripts,
} from '@inth/sdk/surface-actions/plain-scripts';

import type {
	AstroConsentClient,
	AstroEngineClient,
	AstroConsentSaveInput,
} from '../client-types';
import type { InthClientOptionsExtension, InthResolvedOptions } from '../types';
import type { ConsentDialogHandle, ConsentDialogKind } from '../ui/adapter';
import {
	attachBannerActions,
	registerDeferredClient,
	warmDialog,
} from './banner-actions';
import type { CompleteCommitInput, DeferredCommitted } from './commit';
import { declaresVendor } from './deferred-scripts';
import {
	ensureDialogHost,
	readDialogDisableAnimation,
	readDialogLegalLinks,
} from './dialog-host';
import { loadDialog, resolveDialogDesign } from './dialog-loading';
import {
	BANNER_OVERLAY_SELECTOR,
	BANNER_ROOT_SELECTOR,
	GLOBAL_KEY,
	getWindow,
	readPageNonce,
} from './page-state';
import type * as StandInModule from './stand-in';
import type { DialogStandIn } from './stand-in';
import {
	scheduleDeferredEngine,
	takeEarlyTaps,
	unhideEarlyTap,
} from './trigger';

/** Attribute on the boot data block. @internal */
export const CONSENT_BOOT_ATTRIBUTE = 'data-inth-boot';

/** What the server leaves in the boot data block. @internal */
export interface ConsentBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
	/**
	 * Whether the engine may load after the page, as far as the server can
	 * tell (see `canDeferEngine` in `../banner/deferred-boot`).
	 */
	d: boolean;
}

/** A preference dialog the shell mounted before the engine. @internal */
export interface EarlyDialog {
	handle: ConsentDialogHandle;
	/** The element it mounted into. */
	target: HTMLElement;
}

/** What the engine hands over to, from the shell. @internal */
export interface EngineHandoff {
	/** A choice the shell recorded before the engine loaded. */
	committed?: DeferredCommitted;
	/** A preference dialog the shell opened, now the engine's. */
	dialog?: EarlyDialog;
}

/** What the engine chunk exports. @internal */
export interface EngineModule {
	boot: (
		options: InthResolvedOptions,
		extension: InthClientOptionsExtension,
		handoff: EngineHandoff
	) => AstroEngineClient;
}

/**
 * Reads the boot data block.
 *
 * @param root - Where to look. Defaults to `document`.
 * @returns The boot data, or `null` without a parseable block.
 * @internal
 */
export const readConsentBoot = function readConsentBoot(
	root: ParentNode = document
): ConsentBoot | null {
	const text = root.querySelector(
		`script[${CONSENT_BOOT_ATTRIBUTE}]`
	)?.textContent;
	if (!text) {
		return null;
	}
	try {
		const boot = JSON.parse(text) as ConsentBoot;
		return boot?.s ? boot : null;
	} catch {
		return null;
	}
};

/**
 * Whether this page can wait for the engine, given what only the browser
 * knows: the `clientEntrypoint` additions and the page's inline gated
 * scripts.
 */
const canWait = function canWait(
	boot: ConsentBoot,
	extension: InthClientOptionsExtension,
	scripts: NonNullable<InthClientOptionsExtension['scripts']>
): boolean {
	const snapshot = boot.s;
	const blocker = extension.networkBlocker;
	return (
		boot.d &&
		!scripts.some(declaresVendor) &&
		// An iframe naming a vendor declares it.
		!document.querySelector('iframe[data-vendor]') &&
		// A blocking banner's focus trap is the engine's.
		!document.querySelector('[data-blocking="true"]') &&
		snapshot.activeUI === 'banner' &&
		!extension.consentSource &&
		!(blocker && blocker.enabled !== false) &&
		!scripts.some((script) => isRunnableNow(script, snapshot)) &&
		// An inline tag gated on `necessary` runs at once under the engine.
		!document.querySelector('script[data-inth-category="necessary"]') &&
		document.querySelectorAll(EARLY_TAP_ROOT).length === 1 &&
		window.location.hash !== '#inth-preferences'
	);
};

/** Hide the server-rendered banner and its overlay after a choice. */
const hideBanner = function hideBanner(): void {
	for (const element of document.querySelectorAll<HTMLElement>(
		`${BANNER_ROOT_SELECTOR}, ${BANNER_OVERLAY_SELECTOR}`
	)) {
		element.hidden = true;
		if (element.matches(BANNER_ROOT_SELECTOR)) {
			element.setAttribute('data-inth-visible', 'false');
		}
	}
};

/** Marks the first-paint `<style>` the components inline. */
const FIRST_PAINT_SELECTOR = 'style[data-inth-styles="inth-first-paint"]';

/** The preference dialog's root, once its island has rendered it. */
const DIALOG_ROOT = '[data-testid="consent-dialog-root"]';

/** How long an early dialog may take to render before the engine loads anyway. */
const DIALOG_SHOWN_MS = 3000;

/** Show the server-rendered banner only while it is the active surface. */
const showBannerFor = function showBannerFor(
	activeUI: ConsentSnapshot['activeUI']
): void {
	for (const element of document.querySelectorAll<HTMLElement>(
		BANNER_ROOT_SELECTOR
	)) {
		element.hidden = activeUI !== 'banner';
		element.setAttribute(
			'data-inth-visible',
			activeUI === 'banner' ? 'true' : 'false'
		);
	}
};

/** Runs `run` when the browser is idle, or soon where it cannot say. */
const whenIdle = function whenIdle(run: () => unknown): void {
	if (typeof window.requestIdleCallback === 'function') {
		window.requestIdleCallback(run, { timeout: 2000 });
		return;
	}
	setTimeout(run, 200);
};

/** Resolves in a later task. */
const nextTask = (): Promise<void> =>
	// oxlint-disable-next-line promise/avoid-new -- A macrotask boundary.
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

type Choice = CompleteCommitInput['choice'];

/**
 * Start the page's consent client: the shell this module describes, or,
 * without boot data, the engine at once.
 *
 * The integration's page script calls this; application code uses
 * `getConsentClient()` instead.
 *
 * @param options - The serialized integration options.
 * @param loadEngine - Imports the engine chunk.
 * @param extension - Non-serializable additions from `clientEntrypoint`.
 * @returns The page's client, or `null` when it is the engine's and has
 * not loaded yet.
 * @throws {Error} Outside the browser.
 * @internal
 */
export const startDeferredClient = function startDeferredClient(
	options: InthResolvedOptions,
	loadEngine: () => Promise<EngineModule>,
	extension: InthClientOptionsExtension = {}
): AstroConsentClient | null {
	const browserWindow = getWindow();
	if (!browserWindow) {
		throw new Error(
			'@inth/astro: the consent client requires a browser environment.'
		);
	}
	const existing = browserWindow[GLOBAL_KEY];
	if (existing) {
		return existing;
	}
	attachBannerActions();
	const boot = readConsentBoot();

	let engine: AstroEngineClient | null = null;
	let loading: Promise<AstroEngineClient> | null = null;
	let disposed = false;
	let stopTrigger = (): void => undefined;

	if (!boot) {
		// Nothing to stand in with: the engine's client is the page's.
		void (async () => {
			try {
				const module = await loadEngine();
				if (!getWindow()?.[GLOBAL_KEY]) {
					module.boot(options, extension, {});
				}
			} catch (error) {
				console.warn('@inth/astro: the consent engine failed to load.', error);
			}
		})();
		return null;
	}

	const nonce = readPageNonce();
	const scripts = [...(options.scripts ?? []), ...(extension.scripts ?? [])];
	// Read ahead of a tap, so the tap's task does not wait on storage. A
	// clear stored after this is caught by the commit chunk.
	const ahead = {
		clearEpoch: hasStoredClearEpoch(options.storageConfig),
		subjectId: generateUuidV7(),
	};
	let snapshot = boot.s;
	let committed: DeferredCommitted | undefined;
	let completing: Promise<void> = Promise.resolve();
	/** Choices the commit chunk left to the engine, in order. */
	const replays: Choice[] = [];
	const listeners = new Set<(next: ConsentSnapshot) => void>();
	let resolveReady: () => void = () => undefined;
	// oxlint-disable-next-line promise/avoid-new -- Settles when the engine attaches.
	const ready = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});

	/** A preference dialog opened before the engine, and its stand-in. */
	let earlyDialog: (EarlyDialog & { standIn: DialogStandIn }) | undefined;
	let earlyOpening: Promise<void> | null = null;

	const currentSnapshot = (): ConsentSnapshot => {
		if (engine) {
			return engine.getConsent();
		}
		return earlyDialog
			? earlyDialog.standIn.runtime.kernel.getSnapshot()
			: snapshot;
	};

	const notify = (): void => {
		const next = currentSnapshot();
		for (const listener of [...listeners]) {
			listener(next);
		}
	};

	/** The shell's own snapshot changed. */
	const changed = (): void => {
		earlyDialog?.standIn.changed();
		notify();
	};

	const replay = async (
		real: AstroEngineClient,
		choice: Choice
	): Promise<void> => {
		if (choice === 'all') {
			await real.acceptAll();
		} else if (choice === 'none') {
			await real.rejectAll();
		} else {
			await real.save(choice);
		}
	};

	const attach = (real: AstroEngineClient): void => {
		engine = real;
		earlyDialog?.standIn.attach(real.runtime);
		real.subscribe(notify);
		unhideEarlyTap();
		for (const choice of replays.splice(0)) {
			void replay(real, choice);
		}
		resolveReady();
		notify();
	};

	const start = (): Promise<AstroEngineClient> => {
		stopTrigger();
		loading ??= (async () => {
			try {
				const module = await loadEngine();
				// The engine starts from what a commit in flight stores, and
				// takes over a dialog that is still mounting.
				let settled: Promise<void>;
				do {
					settled = completing;
					// oxlint-disable-next-line no-await-in-loop -- Each commit waits for the one before.
					await settled;
					// oxlint-disable-next-line no-await-in-loop -- The mount settles once.
					await earlyOpening;
				} while (settled !== completing);
				if (disposed) {
					throw new Error('@inth/astro: the consent client was disposed.');
				}
				const real = module.boot(options, extension, {
					committed,
					dialog: earlyDialog && {
						handle: earlyDialog.handle,
						target: earlyDialog.target,
					},
				});
				attach(real);
				return real;
			} catch (error) {
				loading = null;
				throw error;
			}
		})();
		return loading;
	};

	const request = (): void => {
		void (async () => {
			try {
				await start();
			} catch (error) {
				if (!disposed) {
					console.warn(
						'@inth/astro: the consent engine failed to load.',
						error
					);
				}
			}
		})();
	};

	const loadCommit = () => import('./commit');

	// Whether a choice may be recorded without the engine: the server found
	// it a short case (see `canDeferEngine`) and nothing the browser adds,
	// such as a consent source or a script naming a vendor, takes it away.
	const commitsEarly =
		boot.d && !extension.consentSource && !scripts.some(declaresVendor);

	/**
	 * Commit a choice before the engine, in this task. `null` when only the
	 * engine can record it: the engine has attached, the page cannot commit
	 * early, a clear was stored, or it is not `planInstantCommit`'s short
	 * case.
	 */
	const commitEarly = (
		choice: Choice,
		actionAt: number
	): Promise<void> | null => {
		if (engine || disposed || ahead.clearEpoch || !commitsEarly) {
			return null;
		}
		const plan = planInstantCommit({
			actionAt,
			choice,
			snapshot,
			subjectId: ahead.subjectId,
		});
		if (!plan) {
			return null;
		}
		startPlainScripts(scripts, plan.snapshot, nonce);
		({ snapshot } = plan);
		hideBanner();
		changed();
		const task = (async () => {
			try {
				// The scripts above asked for their files in this task. The
				// chunk waits a task, so on HTTP/1.1, where a host gets six
				// connections, the scripts take one before the chunk does.
				await nextTask();
				const { completeCommit } = await loadCommit();
				const result = await completeCommit({
					actionAt,
					callbacks: extension.callbacks,
					choice,
					instant: plan,
					nonce,
					storageConfig: options.storageConfig,
				});
				if (!result) {
					replays.push(choice);
					return;
				}
				({ committed } = result);
				if (!engine && result.snapshot !== snapshot) {
					({ snapshot } = result);
					changed();
				}
			} catch (error) {
				console.warn('@inth/astro: the consent choice was not stored.', error);
				replays.push(choice);
			}
		})();
		completing = task;
		// The engine loads next, from the stored record.
		void (async () => {
			await task;
			request();
		})();
		return task;
	};

	const choose = async (
		choice: Choice,
		onEngine: (real: AstroEngineClient) => Promise<void>
	): Promise<void> => {
		const early = commitEarly(choice, Date.now());
		if (early) {
			await early;
			return;
		}
		await onEngine(engine ?? (await start()));
	};

	// The engine may wait for the page, and the island renders a borrowed
	// runtime without creating one: a Customize tap opens the dialog on the
	// stand-in and downloads only the dialog.
	const waits = canWait(boot, extension, scripts);
	const opensEarly =
		waits &&
		commitsEarly &&
		options.ui === 'svelte' &&
		(!options.inlineStyles ||
			Boolean(document.querySelector(FIRST_PAINT_SELECTOR)));

	/** Download the dialog an open would mount, in the design it renders. */
	const loadDesignDialog = (kind: ConsentDialogKind): Promise<unknown> =>
		loadDialog(
			options.ui,
			kind,
			nonce,
			resolveDialogDesign(options.ui, kind, snapshot, options)
		);

	let standInModule: Promise<typeof StandInModule> | undefined;
	const loadStandIn = (): Promise<typeof StandInModule> => {
		standInModule ??= import('./stand-in');
		return standInModule;
	};

	/** Load the engine once the early dialog is on screen. */
	const requestOnceShown = (): void => {
		const deadline = Date.now() + DIALOG_SHOWN_MS;
		const check = (): void => {
			if (disposed || engine) {
				return;
			}
			if (document.querySelector(DIALOG_ROOT) || Date.now() > deadline) {
				// One more frame, so the dialog paints before the engine's
				// chunks take the connection.
				requestAnimationFrame(() => request());
				return;
			}
			requestAnimationFrame(check);
		};
		requestAnimationFrame(check);
	};

	/**
	 * Mount the preference dialog on a stand-in runtime and show it.
	 * Resolves `false` when the engine took over first.
	 */
	const openEarly = async (): Promise<boolean> => {
		earlyOpening ??= (async () => {
			try {
				const [adapter, { createDialogStandIn }] = await Promise.all([
					loadDialog(options.ui, 'preferences', nonce),
					loadStandIn(),
				]);
				if (engine || disposed || earlyDialog) {
					return;
				}
				const standIn = createDialogStandIn({
					onSurface(activeUI) {
						showBannerFor(activeUI);
						notify();
					},
					read: () => snapshot,
					requestEngine: async () => (await start()).runtime,
				});
				const target = ensureDialogHost();
				const handle = await adapter.mount({
					kind: 'preferences',
					legalLinks: readDialogLegalLinks(),
					options: {
						...options,
						disableAnimation:
							readDialogDisableAnimation('preferences') ??
							options.disableAnimation,
					},
					runtime: standIn.runtime,
					target,
				});
				if (engine || disposed) {
					await handle.destroy();
					return;
				}
				earlyDialog = { handle, standIn, target };
			} finally {
				earlyOpening = null;
			}
		})();
		await earlyOpening;
		if (!earlyDialog || engine || disposed) {
			return false;
		}
		earlyDialog.standIn.runtime.kernel.set.activeUI('dialog');
		requestOnceShown();
		return true;
	};

	const client: AstroConsentClient = {
		async acceptAll() {
			await choose('all', (real) => real.acceptAll());
		},
		closeDialog() {
			if (engine) {
				engine.closeDialog();
				return;
			}
			// Back to the surface the shell's snapshot shows.
			earlyDialog?.standIn.changed();
			showBannerFor(snapshot.activeUI);
			notify();
		},
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			stopTrigger();
			listeners.clear();
			if (earlyDialog && !engine) {
				void earlyDialog.handle.destroy();
			}
			earlyDialog?.standIn.dispose();
			engine?.dispose();
			const current = getWindow();
			if (current?.[GLOBAL_KEY] === client) {
				current[GLOBAL_KEY] = undefined;
			}
		},
		getConsent() {
			return currentSnapshot();
		},
		getDeclaredVendors() {
			if (engine) {
				return engine.getDeclaredVendors();
			}
			const declared: readonly ResolvedVendor[] =
				snapshot.model === 'iab' ? [] : (snapshot.vendors?.declared ?? []);
			return declared;
		},
		getVendorChoice() {
			return engine ? engine.getVendorChoice() : snapshot.vendorChoice;
		},
		async identify(user) {
			await (engine ?? (await start())).identify(user);
		},
		isVendorAllowed(vendorId) {
			// The shell stands in only for a page with no declared vendors.
			return engine ? engine.isVendorAllowed(vendorId) : false;
		},
		async openDialog(kind = 'preferences', tab?: 'purposes' | 'vendors') {
			if (engine) {
				await engine.openDialog(kind, tab);
				return;
			}
			if (disposed) {
				return;
			}
			if (opensEarly && !loading && kind === 'preferences') {
				try {
					if (await openEarly()) {
						return;
					}
				} catch {
					// The engine's open below loads it again and reports it.
				}
			}
			if (engine) {
				await (engine as AstroEngineClient).openDialog(kind, tab);
				return;
			}
			// Every dialog chunk downloads beside the engine: the one design's
			// dialog the open will mount, never the other.
			void (async () => {
				try {
					await loadDesignDialog(kind);
				} catch {
					// The open reports its own failure.
				}
			})();
			await (await start()).openDialog(kind, tab);
		},
		async optOut(opener?: HTMLElement | null) {
			if (engine) {
				await engine.optOut(opener);
				return;
			}
			if (disposed) {
				return;
			}
			// Download the dialog island beside the engine so confirmation opens
			// as soon as the engine attaches.
			void (async () => {
				try {
					await loadDesignDialog('preferences');
				} catch {
					// The engine's optOut reports its own failure.
				}
			})();
			await (await start()).optOut(opener);
		},
		options,
		ready,
		async rejectAll() {
			await choose('none', (real) => real.rejectAll());
		},
		get runtime(): ConsentRuntime | undefined {
			return engine?.runtime;
		},
		async save(consents: AstroConsentSaveInput) {
			if (consents.vendors !== undefined) {
				await (engine ?? (await start())).save(consents);
				return;
			}
			await choose(consents as Choice, (real) => real.save(consents));
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};

	browserWindow[GLOBAL_KEY] = client;
	registerDeferredClient(client, {
		engine: start,
		// Intent to open the dialog downloads the stand-in with it, or else
		// starts the engine beside it.
		warm: () => {
			if (opensEarly && !loading) {
				void (async () => {
					try {
						await loadStandIn();
					} catch {
						// The open loads it again.
					}
				})();
				return;
			}
			request();
		},
	});

	// Taps the banner's inline script held before this ran: the last
	// choice wins, else the last Customize.
	const replayEarlyTap = (): void => {
		const taps = takeEarlyTaps();
		const choices = taps.filter((entry) => entry.action !== 'customize');
		const tap = choices.at(-1) ?? taps.at(-1);
		if (tap?.action === 'accept' || tap?.action === 'reject') {
			const choice = tap.action === 'accept' ? 'all' : 'none';
			if (!commitEarly(choice, tap.at)) {
				replays.push(choice);
				request();
			}
		} else if (tap?.action === 'opt-out') {
			void client.optOut();
		} else if (tap?.action === 'customize') {
			void client.openDialog();
		} else if (tap?.action === 'dismiss') {
			void (async () => {
				const real = await start();
				await real.runtime.kernel.commands.dismissNotice();
			})();
		}
	};
	replayEarlyTap();

	if (waits) {
		// An accept or reject loads nothing on the press: the click commits
		// in its own task, and the scripts it allows ask for their files
		// before the commit chunk does. Once the page's priority images are
		// in, the engine loads and the commit chunk follows at idle, so a tap
		// before the engine attaches usually finds it cached.
		const startEngine = (): void => {
			request();
			whenIdle(async () => {
				try {
					await loadCommit();
				} catch {
					// A tap loads it again.
				}
			});
		};
		stopTrigger = scheduleDeferredEngine(startEngine, (action) => {
			if (action === 'customize' || action === 'opt-out') {
				void warmDialog(client);
			}
		});
	} else {
		request();
	}
	return client;
};
