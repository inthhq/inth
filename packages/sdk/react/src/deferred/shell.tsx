'use client';

/**
 * A consent root whose engine loads after the page.
 *
 * The page under it hydrates at once. Until the engine loads, Inth's hooks
 * read the snapshots the server rendered with, and their actions ask for
 * the engine and run on it when it attaches (see `deferred-kernel.ts`).
 * The stock banner keeps its server HTML until then; its inline script
 * records taps and hides it.
 *
 * Used by adapters whose server render leaves `ConsentBootData` in the
 * HTML, such as `ConsentRoot` in `@inth/nextjs`.
 *
 * @packageDocumentation
 * @internal
 */

import type { SaveResult, SaveUISource } from '@inth/sdk/engine';
import type { Script } from '@inth/sdk/modules/script-loader';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import {
	EARLY_TAP_HOLD_PRESSES_KEY,
	EARLY_TAP_ROOT,
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
	earlyTapQueue,
} from '@inth/sdk/runtime/page-globals';
import {
	changedPlainScripts,
	obsoletePlainScripts,
	plainDeclarations,
	claimPlainScripts,
	releasePlainScripts,
	releaseServerStartedScripts,
} from '@inth/sdk/surface-actions/plain-scripts';
import { applyThemeSlots } from '@inth/sdk/ui/utils/theme-slots';
import type { ReactNode } from 'react';
import {
	Suspense,
	useEffect,
	useInsertionEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';

import {
	KernelContext,
	ProviderServicesContext,
	StreamedPrefetchContext,
} from '../context';
import { useColorScheme } from '../hooks/use-color-scheme';
import type { ConsentProviderOptions } from '../provider';
import { V3ThemeProvider } from '../theme-provider';
import type { V3UIConfigValue } from '../ui-config-context';
import {
	endPageRender,
	pageRender,
	storedChoiceCurrent,
	watchStoredChoice,
} from './boot';
import type { ConsentBoot } from './boot';
import type * as CommitModule from './commit';
import type { CommitTapInput, CommitTapResult } from './commit';
import type { DeferredCommitConfig, DeferredCommitted } from './committed';
import { createDeferredKernel } from './deferred-kernel';
import type {
	DeferredKernelHandle,
	DeferredKernelOptions,
} from './deferred-kernel';
import {
	canCommitInstantly,
	commitInstantly,
	readAheadOfTap,
	startPlainScripts,
} from './instant';
import type { InstantCommitAhead } from './instant';
import {
	deferredScripts,
	loadDeferredScriptLoader,
	setDeferredScriptStarter,
} from './registry';
import { acceptedPermissions, isPlainScript, isRunnableNow } from './runnable';
import { DeferredSessionContext, read, record, recordOnce } from './session';
import type { DeferredSession, Recorded } from './session';
import { importDialog, scheduleDeferredEngine } from './trigger';

/** The provider options the shell itself reads. @internal */
export type DeferredShellOptions = Pick<
	ConsentProviderOptions,
	| 'colorScheme'
	| 'components'
	| 'consentCategories'
	| 'disableAnimation'
	| 'legalLinks'
	| 'noStyle'
	| 'nonce'
	| 'preloadDialog'
	| 'presentation'
	| 'scrollLock'
	| 'streamBanner'
	| 'styles'
	| 'theme'
	| 'trapFocus'
>;

/** @internal */
export interface DeferredConsentShellProps<EngineModule> {
	/** What the server left in the HTML. */
	boot: ConsentBoot;
	/** Wait for the page's priority images (or input) before loading. */
	defer: boolean;
	/**
	 * The root's live options (`liveRootKey`): a change while the engine
	 * waits loads it at once, since the plan the root made at mount, and
	 * the commit path's scripts, no longer describe what it must do.
	 */
	live?: string;
	/**
	 * The visitor's stored choice already allows scripts: `useScriptLoader`
	 * starts on the stand-in, and the plain scripts the snapshot grants
	 * start without the engine (`startPlainScripts`), so the engine can
	 * wait with `defer`.
	 */
	startScripts?: boolean;
	/**
	 * When a deferred engine starts. Defaults to `scheduleDeferredEngine`.
	 * Gets the stand-in's handle, to replace its snapshot before the engine
	 * attaches, and calls `onTap` for a banner tap the root routes. Returns
	 * a cleanup.
	 */
	schedule?: (
		start: () => void,
		handle: DeferredKernelHandle,
		onTap?: (pressed?: string) => void,
		renderId?: string
	) => () => void;
	/**
	 * Lets a banner accept or reject tapped before the engine loaded be
	 * recorded without it (`commit.ts`), from these options. Omit when the
	 * engine must record it.
	 */
	commit?: DeferredCommitConfig;
	options: DeferredShellOptions;
	/**
	 * Render the engine's slot only after mount: a root hydrating HTML the
	 * provider rendered on the server, which has no boundary there.
	 */
	slotAfterMount?: boolean;
	/** The root's `prefetch`, a promise when the server streams it. */
	prefetch: unknown;
	/**
	 * Imports the engine. Use `import()` so it stays out of first load.
	 * Return the same promise until a failed import is tried again, as
	 * `recordOnce` does.
	 */
	loadEngine: () => Promise<EngineModule>;
	/** Imports the commit path (`commit.ts`). Defaults to `import()`. */
	loadCommit?: () => Promise<typeof CommitModule>;
	/**
	 * Renders the loaded engine: a provider that calls `attach` with its
	 * kernel once it started, followed by the same elements the server
	 * rendered after the page (`ConsentBootData`, script starts).
	 */
	renderEngine: (
		engine: EngineModule,
		attach: DeferredKernelHandle['attach'],
		committed: DeferredCommitted | undefined
	) => ReactNode;
	children?: ReactNode;
}

/**
 * Before hydration, when this chunk has run but no root routes taps yet:
 * a banner tap starts fetching what will handle it (the commit's chunk, or
 * the dialog's), so the root that mounts finds it loaded. The root's tap
 * router replaces this once it is scheduled.
 */
const warmForEarlyTaps = function warmForEarlyTaps(): void {
	const queue = earlyTapQueue();
	if (!queue?.taps || queue.n) {
		return;
	}
	const warm = (): void => {
		const actions = (earlyTapQueue()?.taps ?? []).map((tap) => tap.action);
		if (actions.includes('accept') || actions.includes('reject')) {
			void import('./commit');
		} else if (actions.includes('customize')) {
			void importDialog();
		}
	};
	queue.n = warm;
	warm();
};

if (typeof document !== 'undefined') {
	warmForEarlyTaps();
}

const isPromiseLike = function isPromiseLike(
	value: unknown
): value is PromiseLike<unknown> {
	return (
		typeof (value as PromiseLike<unknown> | undefined)?.then === 'function'
	);
};

/** `prefetch` settled, with a rejection as `undefined`, as the runtime does. */
const settle = async function settle(
	prefetch: PromiseLike<unknown>
): Promise<RuntimePrefetch | undefined> {
	try {
		return (await prefetch) as RuntimePrefetch | undefined;
	} catch {
		return undefined;
	}
};

/** The same `<style>` once the root handles the tap. */
const COMMITTED_STYLE_ID = 'inth-early-commit';

/** The stock dialog's root. */
const DIALOG_ROOT = '[data-testid="consent-dialog-root"]';

/** Load the engine anyway this long after an early dialog's code arrived. */
const DIALOG_SHOWN_MS = 3000;

/**
 * Hides the stock banner the way the early-tap script does for an accept,
 * for a Customize tap the engine replays: the replay removes the style
 * once it opened the dialog, or when the tap no longer applies.
 */
const hideBanner = function hideBanner(nonce: string | undefined): void {
	if (document.getElementById(EARLY_TAP_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = EARLY_TAP_STYLE_ID;
	if (nonce) {
		style.nonce = nonce;
	}
	style.textContent = `${EARLY_TAP_ROOT},[data-testid="consent-banner-overlay"]{display:none!important}`;
	document.head.append(style);
};

/** Longest wait for the engine to replace the tapped banner's markup. */
const BANNER_LEAVE_MS = 10_000;

/**
 * Keeps the tapped banner hidden while the root handles the tap, and shows
 * it again when the state asks for the banner (a dialog closed without a
 * choice), once the engine removed its markup, or a while after the engine
 * attached.
 */
const unhideWhenGone = function unhideWhenGone(
	handle: DeferredKernelHandle
): void {
	const roots = [...document.querySelectorAll(EARLY_TAP_ROOT)];
	let deadline = Number.POSITIVE_INFINITY;
	// oxlint-disable-next-line promise/prefer-await-to-then -- Starts the clock once the engine is in.
	void handle.ready.then(() => {
		deadline = Date.now() + BANNER_LEAVE_MS;
	});
	const check = (): void => {
		if (
			handle.kernel.getSnapshot().activeUI === 'banner' ||
			roots.every((root) => !root.isConnected) ||
			Date.now() > deadline
		) {
			document.getElementById(COMMITTED_STYLE_ID)?.remove();
			return;
		}
		requestAnimationFrame(check);
	};
	requestAnimationFrame(check);
};

/** A deferred session, with the root's commit path. */
interface ShellSession extends DeferredSession {
	/** The render whose boot data the session was created from. */
	renderId: string | undefined;
	/**
	 * Routes the banner tap the early-tap script recorded. With `pressed`,
	 * the `data-action` of a banner button a pointer went down on: fetch
	 * ahead of the tap.
	 */
	routeTap: (pressed?: string) => void;
	/** Set once a commit recorded a banner choice. */
	committed: () => DeferredCommitted | undefined;
	/**
	 * Reads what a commit needs from storage now, so a later tap's task
	 * does not (`readAheadOfTap`).
	 */
	aheadOfTaps: () => void;
	/**
	 * For a returning visitor who chose (`startScripts`): starts what their
	 * stored choice allows, or the engine when the browser's records no
	 * longer agree with it.
	 */
	startStoredChoice: () => void;
	/** Stops watching the stored choice, as the effect that started it ends. */
	stopStoredChoice: () => void;
	/**
	 * Records the root's live options as this render reads them
	 * (`liveRootKey`), before any effect of the render runs.
	 */
	setLive: (live: string | undefined) => void;
	/**
	 * Records the root's commit config as this render passes it, so a tap
	 * records with the latest callbacks: an inline callback rebuilt each
	 * render does not change the live key.
	 */
	setCommit: (config: DeferredCommitConfig | undefined) => void;
	/**
	 * Releases the root scripts the session started early that the root's
	 * latest `scripts` dropped, unless a hook still passes them.
	 */
	releaseDropped: (config: DeferredCommitConfig | undefined) => void;
	dispose: () => void;
	/** Undoes a `dispose` the same mount follows at once (StrictMode). */
	resume: () => void;
}

const createSession = function createSession<EngineModule>(
	boot: ConsentBoot,
	options: DeferredShellOptions,
	prefetch: unknown,
	loadEngine: () => Promise<EngineModule>,
	commitConfig: DeferredCommitConfig | undefined,
	importCommit: () => Promise<typeof CommitModule> = () => import('./commit'),
	startScripts = false,
	live: string | undefined = undefined
): ShellSession {
	let start: () => void = () => undefined;
	/** Set once something asked for the engine. */
	let requested = false;
	const started = new Promise<void>((resolve) => {
		start = () => {
			requested = true;
			resolve();
		};
	});
	// Filled below, once the commit path and the engine load are defined.
	const hooks: { early?: DeferredKernelOptions['early'] } = {};
	let requestEngine: () => void = () => start();
	let claimed = false;
	const handle = createDeferredKernel({
		consentCategories: options.consentCategories,
		early: (name, args, onEngine) => hooks.early?.(name, args, onEngine),
		localSurfaces: Boolean(commitConfig),
		presentation: options.presentation,
		requestEngine: () => requestEngine(),
		serverSnapshot: boot.s,
		settled:
			isPromiseLike(prefetch) && options.streamBanner !== false
				? record(settle(prefetch))
				: undefined,
		snapshot: boot.r ?? boot.s,
	});
	const scriptNonce = commitConfig?.nonce ?? options.nonce;
	/**
	 * The render whose boot data this session was created from. Its cleanup
	 * acts on this render only, never on whichever the page names now: a
	 * navigation may have replaced the boot element since the root read it.
	 */
	const renderId = boot.i;
	/** What this render's server start marked, as last read. */
	let serverStarted: Record<string, unknown> = {};
	/**
	 * The root's scripts as the server start saw them: a live change keeps
	 * an element of one still declared this way for the loader to adopt.
	 * Empty without a commit config, so every element goes then.
	 */
	const declaredAtMount = plainDeclarations(commitConfig?.scripts ?? []);
	/**
	 * This render's page object, while it is the page's. Each read keeps
	 * what its server start marked, so the root can still release those
	 * elements after the render ended.
	 */
	const thisRender = () => {
		const render = pageRender(renderId);
		if (render) {
			serverStarted = { ...render.starts };
		}
		return render;
	};
	thisRender();
	/** The root's live options as the latest render read them. */
	let liveNow = live;
	/** The pending end of the page's render, after a dispose. */
	let ending: ReturnType<typeof setTimeout> | undefined;
	/** The root's commit config as the latest render passed it. */
	let commitNow = commitConfig;
	/**
	 * The early-started elements the root's own `scripts` name, which the
	 * session holds until a loader adopts them (`claimPlainScripts`): they
	 * leave with the root, or when it drops them, unless a hook still
	 * holds them too.
	 */
	const rootOwned = new Map<string, string>();
	const claimRoot = (): void => {
		// One started for another declaration of the resource is not what the
		// root runs, and is left to its owners: the engine loads the root's.
		if (claimPlainScripts(commitNow?.scripts ?? [], rootOwned).length > 0) {
			start();
		}
	};
	const own = (keys: readonly string[]): readonly string[] => {
		claimRoot();
		return keys;
	};
	/** The config a tap records with: the latest, with this render's reservations. */
	const tapConfig = (): DeferredCommitConfig =>
		({
			...(commitNow ?? commitConfig),
			reserved: thisRender()?.starts,
		}) as DeferredCommitConfig;
	/**
	 * Whether the root's live options are still the ones the session was
	 * made with. A child's effect can run before the shell's, in the
	 * render that changed them (a navigation to a denial that also mounts
	 * a route's `useScriptLoader`), so every start asks here, and the
	 * engine loads at once when they changed.
	 */
	const liveStillHolds = (): boolean => {
		if (liveNow === live) {
			return true;
		}
		start();
		return false;
	};
	/**
	 * The one gate for a returning visitor's stored choice while the engine
	 * waits: every script the root inserts without the engine passes here,
	 * and so does every wake-up of the watcher below. When the browser no
	 * longer agrees with the stored choice, the engine loads at once and
	 * applies what changed; nothing is inserted.
	 */
	const storedStillHolds = (): boolean => {
		if (storedChoiceCurrent(renderId)) {
			return true;
		}
		start();
		return false;
	};
	/**
	 * Inserts the plain scripts the stored choice allows. The script loader
	 * never runs on the stand-in in this mode, so this is the only way a
	 * script starts before the engine; the loader adopts what it inserted.
	 */
	const startStored = (scripts: readonly Script[]): readonly string[] => {
		if (
			handle.attached() ||
			requested ||
			!liveStillHolds() ||
			!storedStillHolds()
		) {
			return [];
		}
		return own(
			startPlainScripts(
				scripts,
				handle.kernel.getSnapshot(),
				scriptNonce,
				thisRender()?.starts
			)
		);
	};
	if (startScripts) {
		setDeferredScriptStarter(handle.kernel, startStored);
	}
	let stopWatching: () => void = () => undefined;
	/**
	 * After hydration: starts the root's own plain `scripts`, then watches
	 * the stored choice until the engine loads.
	 */
	const startStoredChoice = (): void => {
		if (!startScripts || handle.attached() || requested) {
			return;
		}
		startStored(commitConfig?.scripts ?? []);
		if (!requested) {
			// The effect that calls this runs again when its inputs change.
			stopWatching();
			stopWatching = watchStoredChoice(
				() => {
					if (!handle.attached() && !requested) {
						storedStillHolds();
					}
				},
				(boot.r ?? boot.s).nextDeadline
			);
			// oxlint-disable-next-line promise/prefer-await-to-then -- Stops once the engine is asked for.
			void started.then(() => stopWatching());
		}
	};
	const surfaces = new Map<string, Recorded<unknown>>();
	// A commit in flight; the engine renders after it, from its records.
	let commitSettled: Promise<void> = Promise.resolve();
	let routing = false;
	let engineRendering = false;
	/**
	 * Until the engine renders, the banner cannot hydrate: its inline
	 * script stops presses on its buttons, so React does not try at each
	 * one. Once it renders, React may hydrate the banner at a press.
	 */
	const holdPresses = (hold: boolean): void => {
		const queue = earlyTapQueue();
		if (queue) {
			queue[EARLY_TAP_HOLD_PRESSES_KEY] = hold ? 1 : 0;
		}
	};
	if (typeof document !== 'undefined') {
		holdPresses(true);
	}
	let result: CommitTapResult | null = null;
	// The engine's load. `loadEngine` retries its own import; after a
	// failure this starts over only when it began a new attempt, so the
	// backoff and the cap stay `loadEngine`'s.
	let engineAttempt: Promise<EngineModule> | undefined;
	let engineLoad: Recorded<EngineModule> | undefined;
	const engine = (): Recorded<EngineModule> => {
		if (
			!engineLoad ||
			(engineLoad.status === 'rejected' && loadEngine() !== engineAttempt)
		) {
			engineLoad = record(
				(async () => {
					await started;
					engineAttempt = loadEngine();
					const loaded = await engineAttempt;
					await commitSettled;
					engineRendering = true;
					holdPresses(false);
					return loaded;
				})()
			);
			// Commands waiting for the engine reject, so a surface an answer
			// hid shows again; the next one asks for a new attempt.
			// oxlint-disable-next-line promise/prefer-await-to-then -- Settles the waiting commands.
			engineLoad.catch(handle.fail);
		}
		return engineLoad;
	};
	engine();
	requestEngine = () => {
		start();
		const load = engine();
		if (load.status === 'rejected') {
			handle.fail(load.reason);
		}
	};

	const loadCommit = recordOnce(importCommit);
	/** Starts `load` in the next task: a tap's own task stays short. */
	const soon = (load: () => unknown): void => {
		setTimeout(load, 0);
	};
	let ahead: InstantCommitAhead | undefined;
	const preloaded = new Set<string>();
	/**
	 * Fetches what an accept or reject needs before it is recorded: the
	 * commit's chunk, the loader's chunk when a script needs the loader,
	 * and, for an accept, the plain scripts it would allow, so their
	 * download overlaps the commit's. Nothing runs before the commit.
	 */
	const prepare = (action: string, pressed = false): void => {
		if (!commitConfig || handle.attached() || engineRendering) {
			return;
		}
		// The click commits instantly and inserts the scripts itself: a
		// press needs nothing ahead of it.
		if (pressed && canCommitInstantly(handle, ahead)) {
			return;
		}
		soon(loadCommit);
		const scripts = [
			...deferredScripts(handle.kernel),
			...(commitConfig.scripts ?? []),
		];
		// Plain scripts start from the commit; the rest need the loader.
		if (scripts.some((script) => !isPlainScript(script))) {
			soon(loadDeferredScriptLoader);
		}
		const snapshot = handle.kernel.getSnapshot();
		const granted = action === 'accept' && acceptedPermissions(snapshot);
		if (!granted) {
			return;
		}
		const allowed = { ...snapshot, effectivePermissions: granted };
		for (const script of scripts) {
			const src = script.src as string;
			if (
				!isPlainScript(script) ||
				preloaded.has(src) ||
				!isRunnableNow(script, allowed)
			) {
				continue;
			}
			preloaded.add(src);
			const link = document.createElement('link');
			link.rel = 'preload';
			link.as = 'script';
			link.href = src;
			const nonce = script.nonce ?? commitConfig.nonce;
			if (nonce) {
				link.nonce = nonce;
			}
			const crossOrigin = script.attributes?.crossorigin;
			if (crossOrigin !== undefined) {
				link.crossOrigin = crossOrigin;
			}
			document.head.append(link);
		}
	};

	/**
	 * Keeps the banner hidden by the root rather than by the early-tap
	 * script: a replay with no tap would show it again.
	 */
	const keepHidden = (): void => {
		if (claimed) {
			return;
		}
		claimed = true;
		const style = document.getElementById(EARLY_TAP_STYLE_ID);
		if (style) {
			style.id = COMMITTED_STYLE_ID;
		}
		unhideWhenGone(handle);
	};

	/**
	 * Takes the early-tap script's taps, so the engine's banner replays
	 * none. A recorded choice also stops the script.
	 */
	const claimTaps = (stop: boolean): void => {
		const queue = earlyTapQueue();
		queue?.taps?.splice(0);
		if (stop) {
			queue?.stop?.();
			if (queue) {
				queue[EARLY_TAP_HOLD_PRESSES_KEY] = 0;
			}
			(window as unknown as Record<string, unknown>)[EARLY_TAPS_WINDOW_KEY] =
				{};
		}
		keepHidden();
	};

	const loadDialog = recordOnce(importDialog);
	let resolveEarlyDialog: (surfaces: unknown) => void = () => undefined;
	const earlyDialog = new Promise<unknown>((resolve) => {
		resolveEarlyDialog = resolve;
	});
	let dialogOpening = false;
	/**
	 * Renders the stock dialog before the engine, from its own module, and
	 * loads the engine once the dialog is on screen: before, its chunks
	 * would share the connection with the dialog's.
	 */
	const openDialog = (): void => {
		if (dialogOpening || handle.attached() || engineRendering) {
			return;
		}
		dialogOpening = true;
		void (async () => {
			try {
				const module = await loadDialog();
				resolveEarlyDialog({ ConsentDialog: module.ConsentDialog });
			} catch {
				start();
				return;
			}
			const deadline = Date.now() + DIALOG_SHOWN_MS;
			const check = (): void => {
				if (document.querySelector(DIALOG_ROOT) || Date.now() > deadline) {
					// A save from the dialog goes through the commit path
					// until the engine is in.
					if (commitConfig) {
						void loadCommit();
					}
					start();
					return;
				}
				requestAnimationFrame(check);
			};
			requestAnimationFrame(check);
		})();
	};
	if (commitConfig) {
		handle.kernel.subscribe((snapshot) => {
			if (snapshot.activeUI === 'dialog' && !handle.attached()) {
				openDialog();
			}
		});
	}

	const canCommit = (): boolean =>
		Boolean(commitConfig) &&
		!routing &&
		!engineRendering &&
		!handle.attached() &&
		// A root whose live options changed commits through the engine: its
		// mount-time config may no longer hold (persistence turned off, a
		// consent source added). This also asks for the engine.
		liveStillHolds();

	/**
	 * Records an accept, reject or selection without the engine, then loads
	 * the engine. In the short case (`instant.ts`) the stand-in commits in
	 * this task and the commit chunk completes it; otherwise the commit
	 * chunk records it. Resolves `null` when neither can, and the engine
	 * records it.
	 */
	const commitChoice = (
		choice: CommitTapInput['choice'],
		actionAt: number,
		uiSource?: SaveUISource
	): Promise<SaveResult | null> => {
		routing = true;
		// One config for the whole tap, so both paths record with the same.
		const config = tapConfig();
		const before = handle.kernel.getSnapshot();
		const instant =
			commitInstantly(handle, config, choice, actionAt, ahead) ?? undefined;
		if (instant) {
			// It started the root's plain scripts in this task.
			claimRoot();
			// The banner is hidden; nothing replays the tap. The tap script
			// keeps listening until something stores the choice, so the
			// banner still answers a press if neither path can.
			claimTaps(false);
			// A loader that registers its scripts after this starts them
			// from the choice too.
			setDeferredScriptStarter(handle.kernel, (scripts) =>
				!handle.attached() && liveStillHolds()
					? own(
							startPlainScripts(
								scripts,
								handle.kernel.getSnapshot(),
								commitConfig?.nonce,
								thisRender()?.starts
							)
						)
					: []
			);
		} else {
			prepare(choice === 'all' ? 'accept' : 'reject');
		}
		const attempt = (async () => {
			try {
				if (instant) {
					// The rest waits for the next task: the tap's task ends
					// with the page showing the choice.
					await new Promise<void>((resolve) => {
						soon(() => resolve());
					});
				}
				const { commitEarlyTap } = await loadCommit();
				return await commitEarlyTap({
					actionAt,
					choice,
					config,
					handle,
					instant,
					uiSource,
				});
			} catch {
				return null;
			}
		})();
		commitSettled = (async () => {
			result = await attempt;
			if (result) {
				claimTaps(true);
			} else if (instant) {
				// The stand-in shows the choice, but nothing stored it: the
				// engine records it (`routing` keeps this path closed). When the
				// engine can't load either, the visitor is asked again; scripts
				// the tap already started keep running. Not awaited: the engine
				// starts once this settles.
				void (async () => {
					try {
						const saved = await handle.kernel.commands.save(choice, {
							actionAt,
							uiSource,
						});
						// Issues mean the engine refused the input and stored
						// nothing; a refusal from the backend comes after the
						// local record.
						if (saved?.ok === false && saved.issues) {
							throw new Error('The engine did not record the choice.');
						}
						claimTaps(true);
					} catch {
						handle.commit(before, []);
						routing = false;
					}
				})();
			}
		})();
		// oxlint-disable-next-line promise/prefer-await-to-then -- Never rejects.
		void commitSettled.then(start);
		if (instant) {
			return Promise.resolve({
				confirmed: Object.keys(
					instant.snapshot.explicitChoice?.categories ?? {}
				) as SaveResult['confirmed'],
				ok: true,
				subjectId: instant.subjectId,
			});
		}
		// oxlint-disable-next-line promise/prefer-await-to-then -- The commit's own result.
		return attempt.then((committed) => committed?.result ?? null);
	};

	// A save called on the stand-in before the engine attached, such as a
	// client-rendered banner's accept, goes through the commit path when it
	// is a stock accept or reject over the whole choice.
	hooks.early = (name, args, onEngine) => {
		const [input, context] = args as [
			unknown,
			(
				| {
						actionAt?: number;
						categories?: readonly string[];
						iabAuthority?: unknown;
						uiSource?: SaveUISource;
						vendors?: unknown;
				  }
				| undefined
			),
		];
		const snapshot = handle.kernel.getSnapshot();
		const scope =
			snapshot.evaluationPolicy?.choiceScope ?? snapshot.policyRule.scope;
		const bulk = input === 'all' || input === 'none';
		// A form's selection, as the dialog saves it; vendor grants in it
		// are the kernel's to record.
		const selection =
			typeof input === 'object' && input !== null && !('vendors' in input);
		if (
			name !== 'save' ||
			!(bulk || selection) ||
			context?.vendors !== undefined ||
			context?.iabAuthority !== undefined ||
			(bulk &&
				!scope.every(
					(category) => context?.categories?.includes(category) ?? true
				)) ||
			!canCommit()
		) {
			return undefined;
		}
		// oxlint-disable-next-line promise/prefer-await-to-then -- The command's own promise.
		return commitChoice(
			input as CommitTapInput['choice'],
			context?.actionAt ?? Date.now(),
			context?.uiSource
		).then((saved) => saved ?? onEngine());
	};

	/**
	 * A Customize tap before the engine: hides the banner and opens the
	 * dialog from the stand-in. `false` when only the engine can open it.
	 */
	const customize = (): boolean => {
		hideBanner(commitConfig?.nonce ?? options.nonce);
		if (commitConfig && !engineRendering) {
			claimTaps(false);
			handle.kernel.set.activeUI('dialog');
			return true;
		}
		// The engine's banner replays it and opens the dialog.
		return false;
	};

	const routeTap = (pressed?: string): void => {
		if (pressed !== undefined) {
			if (pressed === 'accept' || pressed === 'reject') {
				prepare(pressed, true);
			} else if (pressed === 'customize') {
				// Once the engine is on its way, it opens the dialog: an
				// early one's chunks would only share the connection with it.
				if (commitConfig && !requested) {
					void loadDialog();
				} else {
					// Only the engine opens the dialog.
					start();
				}
			}
			return;
		}
		const taps = earlyTapQueue()?.taps ?? [];
		// The last accept or reject is what the visitor decided.
		const decided = taps.filter((entry) => entry.action !== 'customize');
		const tap = decided[decided.length - 1] ?? taps[taps.length - 1];
		if (!tap || routing) {
			return;
		}
		if (
			tap.action === 'customize' &&
			!handle.attached() &&
			!requested &&
			customize()
		) {
			return;
		}
		if ((tap.action !== 'accept' && tap.action !== 'reject') || !canCommit()) {
			// The engine's banner replays the tap.
			start();
			return;
		}
		void commitChoice(tap.action === 'accept' ? 'all' : 'none', tap.at);
	};

	return {
		aheadOfTaps: () => {
			if (commitConfig && !ahead) {
				ahead = readAheadOfTap(commitConfig);
			}
		},
		committed: () => result?.committed,
		dispose: () => {
			stopWatching();
			holdPresses(false);
			// A server start still waiting for the page's priority images
			// inserts nothing for a root that is gone; the engine's loader
			// cancels those itself. After a task, so StrictMode's remount of
			// the same root can take it back (`resume`).
			if (!handle.attached()) {
				ending = setTimeout(() => {
					// What the server start already inserted has no loader to
					// take it over either.
					thisRender();
					if (renderId !== undefined) {
						releaseServerStartedScripts(Object.keys(serverStarted), renderId);
					}
					endPageRender(renderId);
				}, 0);
			}
			// What a loader did not adopt leaves with the root, unless a hook
			// still holds it.
			claimRoot();
			releasePlainScripts(rootOwned.keys());
			// So a resumed session (StrictMode) holds them again.
			rootOwned.clear();
			// oxlint-disable-next-line promise/prefer-await-to-then -- Disposes once created.
			void result?.loader?.then((loader) => loader.dispose());
		},
		engine,
		handle,
		releaseDropped: (config) => {
			// A root script it started early that the root now declares
			// otherwise (a new src, a denied category) is no longer what the
			// page runs: release it, and leave it to the engine.
			const changed = changedPlainScripts(config?.scripts ?? [], rootOwned);
			if (changed.length > 0) {
				releasePlainScripts(changed);
				for (const key of changed) {
					rootOwned.delete(key);
				}
				start();
			}
			// Holds what a commit started since, then lets go of what the
			// root no longer passes.
			claimRoot();
			const next = new Set(
				(config?.scripts ?? []).map((script) => script.resourceKey ?? script.id)
			);
			const dropped = [...rootOwned.keys()].filter((key) => !next.has(key));
			releasePlainScripts(dropped);
			for (const key of dropped) {
				rootOwned.delete(key);
			}
		},
		renderId,
		resume: () => {
			clearTimeout(ending);
		},
		routeTap,
		setCommit: (next) => {
			commitNow = next;
			// After a live change, what the server start inserted for a script
			// the root now drops or declares otherwise goes, and no loader
			// adopted it: the engine that loads for the new options starts what
			// they declare instead. A script they keep as it was stays for the
			// loader to adopt, so it does not run twice.
			if (liveNow !== live && !handle.attached() && renderId !== undefined) {
				releaseServerStartedScripts(
					obsoletePlainScripts(
						next?.scripts ?? [],
						declaredAtMount,
						Object.keys(serverStarted)
					),
					renderId
				);
			}
		},
		setLive: (next) => {
			// The plan made at mount no longer holds: a server start still
			// waiting for the page's priority images inserts nothing, from
			// this render on, before any effect runs. `setCommit` then
			// releases what it inserted for a script the root changed.
			if (next !== live && !handle.attached()) {
				// Kept first, so the root can still release them.
				thisRender();
				endPageRender(renderId);
			}
			liveNow = next;
		},
		start,
		startStoredChoice,
		stopStoredChoice: () => {
			stopWatching();
		},
		surface<Value>(key: string, pick: (loaded: unknown) => Value) {
			let value = surfaces.get(key) as Recorded<Value> | undefined;
			if (!value) {
				// oxlint-disable-next-line promise/prefer-await-to-then -- See above.
				const fromEngine = handle.ready.then(async () => pick(await engine()));
				value = record(
					// The dialog may open before the engine (`openDialog`): the
					// same component, from its own module.
					key.startsWith('ConsentDialog')
						? // oxlint-disable-next-line promise/prefer-await-to-then -- See above.
							Promise.race([fromEngine, earlyDialog.then(pick)])
						: fromEngine
				);
				surfaces.set(key, value);
			}
			return value;
		},
	};
};

/** The default `schedule`: the engine starts on the page's trigger. */
const scheduleOnTrigger: NonNullable<
	DeferredConsentShellProps<unknown>['schedule']
> = (start, _handle, onTap, renderId) =>
	scheduleDeferredEngine(start, onTap, renderId);

const EngineSlot = function EngineSlot<EngineModule>({
	render,
	session,
}: {
	render: DeferredConsentShellProps<EngineModule>['renderEngine'];
	session: ShellSession;
}): ReactNode {
	return render(
		read(session.engine()) as EngineModule,
		session.handle.attach,
		session.committed()
	);
};

const subscribeHydrated = (onStoreChange: () => void) => {
	onStoreChange();
	return () => undefined;
};
const hydratedOnClient = () => true;
const notHydratedOnServer = () => false;

/**
 * Renders `children` once the root has hydrated: the server HTML it
 * hydrates has no engine slot. Its own component, so only it re-renders
 * when hydration ends, not the shell and the page under it.
 *
 * The same check as `useIsHydrated`, written out: importing that module
 * here gives it a first-load file of its own in Rolldown builds, because
 * the engine and the other surfaces share it with the shell.
 */
const AfterHydration = ({ children }: { children: ReactNode }): ReactNode =>
	useSyncExternalStore(subscribeHydrated, hydratedOnClient, notHydratedOnServer)
		? children
		: null;

/**
 * Renders `children` with Inth's contexts filled from the server's
 * snapshots, and the engine after them once it loads.
 *
 * @internal
 */
export const DeferredConsentShell = <EngineModule,>(
	props: DeferredConsentShellProps<EngineModule>
): ReactNode => {
	const {
		boot,
		children,
		commit,
		defer,
		live,
		loadCommit,
		loadEngine,
		options,
		prefetch,
		renderEngine,
		schedule = scheduleOnTrigger,
		startScripts = false,
		slotAfterMount = false,
	} = props;
	// oxlint-disable-next-line react/hook-use-state -- Created once, at mount.
	const [session] = useState(() => {
		const created = createSession(
			boot,
			options,
			prefetch,
			loadEngine,
			commit,
			loadCommit,
			startScripts,
			live
		);
		if (!defer) {
			// Nothing to wait for: start during the first render.
			created.start();
		}
		return created;
	});
	const routes = Boolean(commit);
	useEffect(() => {
		if (!defer) {
			return undefined;
		}
		// After hydration, before the visitor can tap.
		session.aheadOfTaps();
		session.startStoredChoice();
		const stopSchedule = schedule(
			session.start,
			session.handle,
			routes ? session.routeTap : undefined,
			session.renderId
		);
		return () => {
			stopSchedule();
			session.stopStoredChoice();
		};
	}, [defer, routes, schedule, session]);
	useEffect(() => {
		session.resume();
		return session.dispose;
	}, [session]);
	// Before any effect of this render, a child's included: the session's
	// starters compare it with the live options it was made with. It runs
	// as the render does, so a server start waiting on its own timer
	// inserts nothing between this render and its commit; ending the page
	// render only stops those inserts, so a render React discards costs a
	// later start at most.
	session.setLive(live);
	// After every commit, before its layout and passive effects: a tap then
	// records with this config, and after a live change a script it declares
	// otherwise is released, which a render React discards must not do.
	useInsertionEffect(() => {
		session.setCommit(commit);
	});
	// After the render commits: a root script it no longer passes leaves.
	useEffect(() => {
		session.releaseDropped(commit);
	}, [commit, session]);
	// oxlint-disable-next-line react/hook-use-state -- The live options at mount.
	const [liveAtMount] = useState(live);
	useEffect(() => {
		if (live !== liveAtMount) {
			session.start();
		}
	}, [live, liveAtMount, session]);

	useColorScheme(options.colorScheme);

	const themeConfig = useMemo(
		() => ({
			colorScheme: options.colorScheme,
			disableAnimation: options.disableAnimation,
			noStyle: options.noStyle,
			scrollLock: options.scrollLock,
			theme: options.theme,
			trapFocus: options.trapFocus,
		}),
		[
			options.colorScheme,
			options.disableAnimation,
			options.noStyle,
			options.scrollLock,
			options.theme,
			options.trapFocus,
		]
	);
	const uiConfig = useMemo<V3UIConfigValue>(
		() => ({
			components: applyThemeSlots(
				options.theme?.slots,
				options.components,
				'className'
			),
			legalLinks: options.legalLinks,
			nonce: options.nonce,
			preloadDialog: options.preloadDialog,
			presentation: options.presentation,
			styles: options.styles,
			theme: options.theme,
		}),
		[
			options.components,
			options.legalLinks,
			options.nonce,
			options.preloadDialog,
			options.presentation,
			options.styles,
			options.theme,
		]
	);

	const slot = (
		<Suspense fallback={null}>
			<EngineSlot
				render={renderEngine}
				session={session}
			/>
		</Suspense>
	);

	return (
		<DeferredSessionContext.Provider value={session}>
			<KernelContext.Provider value={session.handle.kernel}>
				<ProviderServicesContext.Provider value={session.handle.services}>
					<V3ThemeProvider
						themeConfig={themeConfig}
						uiConfig={uiConfig}
					>
						<StreamedPrefetchContext.Provider value={session.handle.streamed}>
							{children}
						</StreamedPrefetchContext.Provider>
						{/* Where the server rendered the boot data and script starts.
						It stays server HTML until the engine loads. */}
						{slotAfterMount ? <AfterHydration>{slot}</AfterHydration> : slot}
					</V3ThemeProvider>
				</ProviderServicesContext.Provider>
			</KernelContext.Provider>
		</DeferredSessionContext.Provider>
	);
};
