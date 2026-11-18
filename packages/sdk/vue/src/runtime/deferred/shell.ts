/**
 * The Nuxt plugin's consent context before the consent engine has loaded.
 *
 * A server render already put the banner, its first-paint styles and the
 * early-tap script in the HTML. For a visitor the engine can wait for (see
 * `boot.ts`), the browser's first-load chunk holds only this: refs filled
 * from the snapshot the server rendered with, over a stand-in kernel
 * (`stand-in.ts`), so the app hydrates and every composable reads the
 * server's state. The engine (`engine.ts`, which also brings the stock
 * banner) loads after the page's priority images, on the first input or
 * scroll, or when page code needs it.
 *
 * A banner accept or reject, or a dialog save, made before the engine is
 * recorded in the tap's own task (`planInstantCommit`): the snapshot the
 * page reads changes and the allowed plain scripts start at once. One task
 * later the commit chunk (`commit.ts`) stores the record and queues the
 * backend save; then the engine loads, starts from the record and sends
 * the save without recording it again.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	ConsentSnapshot,
	SaveResult,
	SaveUISource,
} from '@inth/sdk/engine';
import type { Script } from '@inth/sdk/modules/script-loader';
import type { ConsentRuntime } from '@inth/sdk/runtime/provider';
import type { ConsentActiveUI } from '@inth/sdk/schema/config';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import {
	generateSubjectId,
	hasStoredClearEpoch,
	planInstantCommit,
} from '@inth/sdk/surface-actions/instant-commit';
import type { InstantCommit } from '@inth/sdk/surface-actions/instant-commit';
import { computed, ref, shallowRef } from 'vue';
import type { Ref } from 'vue';

import {
	reuseDisplayData,
	snapshotToDisplayData,
	toKernelActiveUI,
	toVueActiveUI,
} from '../display-data';
import type { VueConsentDisplayData } from '../display-data';
import type {
	ConsentBannerView,
	RuntimeConsentConfig,
	VueConsentKernelContext,
} from '../kernel';
import { withRegisteredScripts } from '../registered-scripts';
import type { RegisteredScripts } from '../registered-scripts';
import type {
	CompleteCommitInput,
	CompleteCommitResult,
	DeferredCommitted,
} from './commit';
import {
	isRunnableNow,
	removePlainScripts,
	startPlainScripts,
} from './scripts';
import { createStandInKernel, pendingIsInert } from './stand-in';
import {
	BANNER_ROOT,
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_KEY,
	earlyTapQueue,
	scheduleDeferredEngine,
} from './trigger';

/** Builds the engine's context, from a commit made before it, if any. @internal */
export type DeferredEngineFactory = (
	committed: DeferredCommitted | undefined
) => VueConsentKernelContext;

/** @internal */
export interface DeferredContextOptions {
	/** The snapshot the server rendered the page from. */
	snapshot: ConsentSnapshot;
	/** The app's current config. */
	config: () => RuntimeConsentConfig;
	/** Loads the engine chunk. */
	loadEngine: () => Promise<DeferredEngineFactory>;
	/** Completes a commit; loads `commit.ts` by default. A test seam. */
	completeCommit?: (
		input: CompleteCommitInput
	) => Promise<CompleteCommitResult | null>;
	/** Decides when the engine loads. A test seam. */
	schedule?: typeof scheduleDeferredEngine;
}

/** The hiding `<style>` once the context handles the tap. */
const COMMITTED_STYLE_ID = 'c15t-early-commit';

/** The stock dialog's root. */
const DIALOG_ROOT = '[data-testid="consent-dialog-root"]';

/** Load the engine anyway this long after an early dialog opened. */
const DIALOG_SHOWN_MS = 3000;

/** Longest wait, after the engine attached, for the tapped banner to go. */
const BANNER_LEAVE_MS = 10_000;

const loadCompleteCommit = async (
	input: CompleteCommitInput
): Promise<CompleteCommitResult | null> => {
	const { completeCommit } = await import('./commit');
	return completeCommit(input);
};

/** One task later: the tap's own task does only what the page sees. */
const nextTask = (): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

/**
 * Creates the deferred context. Provide it like the engine's context; call
 * `start()` once the app has mounted.
 *
 * @param options - The server snapshot, the config and the engine loader.
 * @returns The context the plugin provides.
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One context, its tap routing and its engine handover.
export const createDeferredContext = function createDeferredContext(
	options: DeferredContextOptions
): VueConsentKernelContext {
	let requestEngine: () => void = () => undefined;
	const requested = new Promise<void>((resolve) => {
		requestEngine = resolve;
	});
	/** Scripts components registered before the engine (`registerScripts`). */
	const registered = new Map<symbol, readonly Script[]>();
	/** The app's config with the registered scripts in it. */
	const configWithScripts = (): RuntimeConsentConfig =>
		withRegisteredScripts(options.config(), registered.values());
	/** The scripts still wanted besides registration `token`'s. */
	const othersScripts = (token: symbol): Script[] => [
		...(options.config().scripts ?? []),
		...[...registered]
			.filter(([key]) => key !== token)
			.flatMap(([, scripts]) => scripts),
	];
	const hooks: {
		early?: (
			name: string,
			args: unknown[],
			onEngine: () => Promise<unknown>
		) => Promise<unknown> | undefined;
	} = {};
	const handle = createStandInKernel({
		early: (name, args, onEngine) => hooks.early?.(name, args, onEngine),
		requestEngine: () => requestEngine(),
		snapshot: options.snapshot,
	});
	const snapshot = shallowRef(handle.kernel.getSnapshot());
	handle.kernel.subscribe((next) => {
		snapshot.value = next;
	});
	const engineRef = shallowRef<VueConsentKernelContext>();
	let engine: VueConsentKernelContext | undefined;
	let mounted = false;
	let active = true;
	let stopSchedule: (() => void) | undefined;
	let committed: DeferredCommitted | undefined;
	let commitSettled: Promise<void> = Promise.resolve();
	let routing = false;
	/** Records a choice on the engine that the commit chunk could not. */
	let fallback: ((engineContext: VueConsentKernelContext) => void) | undefined;
	/** Storage read ahead of a tap, so the tap's task reads none. */
	let ahead: { clearEpoch: boolean; subjectId: string } | undefined;
	const readAhead = () => {
		ahead ??= {
			clearEpoch: hasStoredClearEpoch(options.config().storageConfig),
			subjectId: generateSubjectId(),
		};
		return ahead;
	};

	/** Waits for every commit started so far, including during the wait. */
	const commitsSettled = async (): Promise<void> => {
		const settled = commitSettled;
		await settled;
		if (settled !== commitSettled) {
			await commitsSettled();
		}
	};

	/** The engine's handle for each set registered before it attached. */
	const handovers = new Map<symbol, RegisteredScripts>();
	const engineReady = (async () => {
		await requested;
		let create: DeferredEngineFactory;
		try {
			create = await options.loadEngine();
		} catch (error) {
			// The page keeps the stand-in.
			console.error('[c15t] The consent engine failed to load.', error);
			return undefined;
		}
		// A commit started while the chunk loaded: the engine starts from it.
		await commitsSettled();
		if (!active) {
			return undefined;
		}
		const context = create(committed);
		engine = context;
		// The scripts components registered on the stand-in move to the
		// engine's loader; later registrations go there directly.
		for (const [token, scripts] of registered) {
			handovers.set(token, context.registerScripts(scripts));
		}
		if (mounted) {
			context.start();
		}
		if (committed) {
			// The commit queued its save; send it from the started runtime.
			(context.kernel as { replaySaves?: () => void }).replaySaves?.();
		}
		handle.attach(context.kernel);
		engineRef.value = context;
		fallback?.(context);
		fallback = undefined;
		return context;
	})();

	const activeUI = computed<ConsentActiveUI>({
		get: () => toVueActiveUI(snapshot.value.activeUI),
		set: (value) => showConsentSurface(handle.kernel, toKernelActiveUI(value)),
	});
	const init = computed<VueConsentDisplayData | undefined>((previous) =>
		reuseDisplayData(snapshotToDisplayData(snapshot.value), previous)
	);
	const storedConsent = computed(() => snapshot.value.explicitChoice);

	// -- The tapped banner's markup -----------------------------------------
	let claimed = false;
	/** Hides the stock banner the way the early-tap script does. */
	const hideBanner = (): void => {
		if (document.getElementById(EARLY_TAP_STYLE_ID)) {
			return;
		}
		const style = document.createElement('style');
		style.id = EARLY_TAP_STYLE_ID;
		const { nonce } = options.config();
		if (nonce) {
			style.nonce = nonce;
		}
		style.textContent = `${BANNER_ROOT},[data-testid="consent-banner-overlay"]{display:none!important}`;
		document.head.append(style);
	};
	/**
	 * Keeps the banner hidden by the context rather than by the early-tap
	 * script, whose replay would show it again, until the state asks for
	 * the banner, its markup is gone, or a while after the engine attached.
	 */
	const keepHidden = (): void => {
		const style = document.getElementById(EARLY_TAP_STYLE_ID);
		if (claimed || !style) {
			return;
		}
		claimed = true;
		style.id = COMMITTED_STYLE_ID;
		const roots = [...document.querySelectorAll(BANNER_ROOT)];
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
				claimed = false;
				return;
			}
			requestAnimationFrame(check);
		};
		requestAnimationFrame(check);
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
			(window as unknown as Record<string, unknown>)[EARLY_TAPS_KEY] = {};
		}
		keepHidden();
	};

	// -- Recording a choice -------------------------------------------------
	/**
	 * Commits a save on the stand-in in this task when it is the short case
	 * `planInstantCommit` covers: the allowed plain `scripts` start, then
	 * the stand-in's listeners (the refs, page script loaders) hear it.
	 */
	const commitInstantly = (
		choice: unknown,
		actionAt: number
	): InstantCommit | null => {
		const read = readAhead();
		if (handle.attached() || !pendingIsInert(handle) || read.clearEpoch) {
			return null;
		}
		const plan = planInstantCommit({
			actionAt,
			choice,
			snapshot: handle.kernel.getSnapshot(),
			subjectId: read.subjectId,
		});
		if (!plan) {
			return null;
		}
		const config = configWithScripts();
		startPlainScripts(config.scripts ?? [], plan.snapshot, config.nonce);
		return handle.commit(plan.snapshot, []) ? plan : null;
	};

	/**
	 * Records a choice without the engine, then loads the engine. Resolves
	 * `null` when the commit path declined it; with `replay`, the engine
	 * then records it.
	 */
	const commitChoice = (
		choice: CompleteCommitInput['choice'],
		actionAt: number,
		uiSource: SaveUISource | undefined,
		replay: boolean
	): Promise<SaveResult | null> => {
		routing = true;
		const instant = commitInstantly(choice, actionAt);
		if (instant) {
			claimTaps(true);
		}
		const attempt = (async () => {
			await nextTask();
			try {
				return await (options.completeCommit ?? loadCompleteCommit)({
					actionAt,
					choice,
					config: configWithScripts(),
					handle,
					instant,
					uiSource,
				});
			} catch {
				return null;
			}
		})();
		commitSettled = (async () => {
			const result = await attempt;
			if (result) {
				({ committed } = result);
				claimTaps(true);
			} else if (instant && replay) {
				// The page already reads the choice: the engine records it.
				fallback = (engineContext) => {
					void engineContext.kernel.commands.save(choice, {
						actionAt,
						uiSource,
					});
				};
			}
			routing = false;
		})();
		// oxlint-disable-next-line promise/prefer-await-to-then -- Never rejects.
		void commitSettled.then(() => requestEngine());
		// oxlint-disable-next-line promise/prefer-await-to-then -- The save's own result.
		return attempt.then((result) => result?.result ?? null);
	};

	// A save called on the stand-in before the engine, such as the stock
	// dialog's, goes through the commit path when it is a category choice.
	hooks.early = (name, args, onEngine) => {
		if (name !== 'save' || routing || handle.attached()) {
			return undefined;
		}
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
		const current = handle.kernel.getSnapshot();
		const scope =
			current.evaluationPolicy?.choiceScope ?? current.policyRule.scope;
		const bulk = input === 'all' || input === 'none';
		const selection =
			typeof input === 'object' && input !== null && !('vendors' in input);
		if (
			!(bulk || selection) ||
			context?.vendors !== undefined ||
			context?.iabAuthority !== undefined ||
			(bulk &&
				!scope.every(
					(category) => context?.categories?.includes(category) ?? true
				))
		) {
			return undefined;
		}
		// oxlint-disable-next-line promise/prefer-await-to-then -- The command's own promise.
		return commitChoice(
			input as CompleteCommitInput['choice'],
			context?.actionAt ?? Date.now(),
			context?.uiSource,
			false
		).then((result) => result ?? onEngine());
	};

	/** A Customize tap before the engine: the dialog opens from the stand-in. */
	const customize = (): void => {
		hideBanner();
		claimTaps(false);
		handle.kernel.set.activeUI('dialog');
		// Load the engine once the dialog is on screen: before, its chunks
		// would share the connection with the dialog's.
		const deadline = Date.now() + DIALOG_SHOWN_MS;
		const check = (): void => {
			if (document.querySelector(DIALOG_ROOT) || Date.now() > deadline) {
				requestEngine();
				return;
			}
			requestAnimationFrame(check);
		};
		requestAnimationFrame(check);
	};

	/** Routes the banner tap the early-tap script recorded. */
	const routeTap = (): void => {
		const taps = earlyTapQueue()?.taps ?? [];
		const decided = taps.filter((entry) => entry.action !== 'customize');
		const tap = decided[decided.length - 1] ?? taps[taps.length - 1];
		if (!tap || routing || handle.attached()) {
			return;
		}
		if (tap.action === 'customize') {
			customize();
			return;
		}
		if (tap.action !== 'accept' && tap.action !== 'reject') {
			// The engine's banner replays it.
			requestEngine();
			return;
		}
		void commitChoice(
			tap.action === 'accept' ? 'all' : 'none',
			tap.at,
			undefined,
			true
		);
	};

	// -- The banner's hydration view ------------------------------------------
	// The stock banner hydrates once the engine is in, against the HTML the
	// server rendered: it reads the server's snapshot until it has hydrated,
	// then the live one. A choice made before then otherwise makes its
	// first render differ from the HTML.
	const released = ref(false);
	const viewSnapshot = computed(() =>
		released.value ? snapshot.value : options.snapshot
	);
	const viewActiveUI = computed<ConsentActiveUI>({
		get: () => toVueActiveUI(viewSnapshot.value.activeUI),
		set: (value) => {
			activeUI.value = value;
		},
	});
	const viewInit = computed<VueConsentDisplayData | undefined>((previous) =>
		reuseDisplayData(snapshotToDisplayData(viewSnapshot.value), previous)
	);
	const viewStoredConsent = computed(() => viewSnapshot.value.explicitChoice);

	const context: VueConsentKernelContext = {
		activeUI,
		clearRecords: () => {
			if (engine) {
				engine.clearRecords();
				return;
			}
			requestEngine();
			// oxlint-disable-next-line promise/prefer-await-to-then -- Runs once attached.
			void engineReady.then((attached) => attached?.clearRecords());
		},
		dispose() {
			active = false;
			stopSchedule?.();
			handle.dispose();
			engine?.dispose();
		},
		experimentDefinition: options.config().experiment,
		get iab() {
			return engineRef.value?.iab;
		},
		set iab(value) {
			if (engineRef.value) {
				engineRef.value.iab = value;
			}
		},
		iabUnavailable: computed(
			() => engineRef.value?.iabUnavailable.value ?? false
		),
		init,
		kernel: handle.kernel,
		ownsKernel: true,
		// oxlint-disable-next-line promise/prefer-await-to-then -- Settles once attached.
		ready: handle.ready.then(() => undefined),
		registerScripts(scripts) {
			if (engine) {
				return engine.registerScripts(scripts);
			}
			const token = Symbol('registered scripts');
			registered.set(token, scripts);
			// A script that may run now would otherwise wait for the engine's
			// trigger: ask for the engine, as a configured script does.
			const wake = (): void => {
				const current = handle.kernel.getSnapshot();
				const own = registered.get(token) ?? [];
				if (own.some((script) => isRunnableNow(script, current))) {
					requestEngine();
				}
			};
			wake();
			return {
				dispose: () => {
					const own = registered.get(token) ?? [];
					registered.delete(token);
					const handed = handovers.get(token);
					handovers.delete(token);
					if (handed) {
						handed.dispose();
						return;
					}
					// A commit before the engine may have inserted these; no
					// loader has adopted them yet, so nothing else removes them.
					removePlainScripts(own, othersScripts(token));
				},
				update: (next) => {
					const previous = registered.get(token);
					if (!previous) {
						return;
					}
					registered.set(token, next);
					const handed = handovers.get(token);
					if (handed) {
						handed.update(next);
						return;
					}
					// A commit may have started entries the new set drops; no
					// loader has them yet, so remove them here. The new set is a
					// survivor too: an entry that wants the same file under a new
					// id keeps the element, which the loader adopts.
					const kept = new Set(next.map((script) => script.id));
					removePlainScripts(
						previous.filter((script) => !kept.has(script.id)),
						[...next, ...othersScripts(token)]
					);
					wake();
				},
			};
		},
		get runtime(): ConsentRuntime | undefined {
			return engineRef.value?.runtime;
		},
		setLanguage(language) {
			if (engine) {
				engine.setLanguage(language);
				return;
			}
			requestEngine();
			// oxlint-disable-next-line promise/prefer-await-to-then -- Runs once attached.
			void engineReady.then((attached) => attached?.setLanguage(language));
		},
		setOverrides(overrides) {
			if (engine) {
				engine.setOverrides(overrides);
				return;
			}
			requestEngine();
			// oxlint-disable-next-line promise/prefer-await-to-then -- Runs once attached.
			void engineReady.then((attached) => attached?.setOverrides(overrides));
		},
		snapshot,
		start() {
			if (mounted || !active) {
				return;
			}
			mounted = true;
			readAhead();
			stopSchedule = (options.schedule ?? scheduleDeferredEngine)(
				() => requestEngine(),
				routeTap
			);
			engine?.start();
		},
		storedConsent,
		update(next) {
			// Before the engine, it reads the config when it is created.
			engine?.update(next);
		},
	};
	const viewContext = Object.create(context, {
		activeUI: { value: viewActiveUI },
		init: { value: viewInit },
		snapshot: { value: viewSnapshot },
		storedConsent: { value: viewStoredConsent },
	}) as VueConsentKernelContext;
	const bannerView: ConsentBannerView = {
		activeUI: viewActiveUI,
		context: viewContext,
		hydrated: () => {
			released.value = true;
		},
		init: viewInit,
		ready: handle.ready,
		snapshot: viewSnapshot as Readonly<Ref<ConsentSnapshot>>,
		storedConsent: viewStoredConsent,
	};
	context.bannerView = bannerView;
	return context;
};
