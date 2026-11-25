/**
 * The Nuxt plugin's consent context before the consent engine has loaded.
 *
 * A server render already put the banner, its first-paint styles and the
 * early-tap script in the HTML. For a visitor the engine can wait for (see
 * `deferred-boot.model.ts`), the browser's first-load chunk holds only this: refs filled
 * from the snapshot the server rendered with, over a stand-in kernel
 * (`stand-in.ts`), so the app hydrates and every composable reads the
 * server's state. The engine (`engine.ts`, which also brings the stock
 * banner) loads after the page's priority images, on the first input or
 * scroll, or when page code needs it.
 *
 * A tap on the banner before the engine loads it: the banner replays the
 * tap through its own handlers once it hydrates, so nothing commits before
 * the engine is ready.
 *
 * A dialog save made before the engine is recorded in the tap's own task
 * (`planInstantCommit`): the snapshot the page reads changes and the
 * allowed plain scripts start at once. One task later the commit chunk
 * (`commit.ts`) stores the record and queues the backend save; then the
 * engine loads, starts from the record and sends the save without
 * recording it again.
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
import { importChunk } from '@inth/sdk/runtime/import-chunk';
import {
	EARLY_TAP_ROOT,
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
	earlyTapQueue,
} from '@inth/sdk/runtime/page-globals';
import type { ConsentRuntime } from '@inth/sdk/runtime/provider';
import { createStandInKernel } from '@inth/sdk/runtime/stand-in-kernel';
import { storageFor } from '@inth/sdk/runtime/storage-for';
import type { ConsentActiveUI } from '@inth/sdk/schema/config';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import type {
	CompleteCommitInput,
	CompleteCommitResult,
	DeferredCommitted,
} from '@inth/sdk/surface-actions/early-commit';
import {
	generateUuidV7,
	hasStoredClearEpoch,
	pendingIsInert,
	planInstantCommit,
} from '@inth/sdk/surface-actions/instant-commit';
import type { InstantCommit } from '@inth/sdk/surface-actions/instant-commit';
import {
	isRunnableNow,
	startPlainScripts,
} from '@inth/sdk/surface-actions/plain-scripts';
import { computed, ref, shallowRef } from 'vue';
import type { Ref } from 'vue';

import {
	reuseDisplayData,
	snapshotToDisplayData,
	toKernelActiveUI,
	toVueActiveUI,
} from '../display-data.model';
import type { VueConsentDisplayData } from '../display-data.model';
import type {
	ConsentBannerView,
	RuntimeConsentConfig,
	VueConsentKernelContext,
} from '../vue-consent-kernel-context.model';
import { withRegisteredScripts } from '../with-registered-scripts';
import type { RegisteredScripts } from '../with-registered-scripts';
import { removePlainScripts } from './remove-plain-scripts';
import { scheduleDeferredEngine } from './schedule-deferred-engine';

/** Builds the engine's context, from a commit made before it, if any. @internal */
export type DeferredEngineFactory = (
	committed: DeferredCommitted | undefined
) => VueConsentKernelContext;

/** @internal */
export interface DeferredContextOptions {
	/** The snapshot the server rendered the page from. */
	snapshot: ConsentSnapshot;
	config: () => RuntimeConsentConfig;
	loadEngine: () => Promise<DeferredEngineFactory>;
	/** Completes a commit; loads `commit.ts` by default. A test seam. */
	completeCommit?: (
		input: CompleteCommitInput
	) => Promise<CompleteCommitResult | null>;
	/** Decides when the engine loads. A test seam. */
	schedule?: typeof scheduleDeferredEngine;
}

/** The hiding `<style>` once the context handles the tap. */
const COMMITTED_STYLE_ID = 'inth-early-commit';

/** Longest wait, after the engine attached, for the tapped banner to go. */
const BANNER_LEAVE_MS = 10_000;

const loadCompleteCommit = async (
	input: CompleteCommitInput
): Promise<CompleteCommitResult | null> => {
	const completeCommit = await importChunk(
		() => import('@inth/sdk/surface-actions/early-commit'),
		(module) =>
			typeof module.completeCommit === 'function'
				? module.completeCommit
				: undefined
	);
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
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One context, its tap routing and its engine handover.
export const createDeferredContext = function createDeferredContext(
	options: DeferredContextOptions
): VueConsentKernelContext {
	let requestEngine: () => void = () => undefined;
	/** Scripts components registered before the engine (`registerScripts`). */
	const registered = new Map<symbol, readonly Script[]>();
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
	/** Storage read ahead of a tap, so the tap's task reads none. */
	let ahead: { clearEpoch: boolean; subjectId: string } | undefined;
	const readAhead = () => {
		ahead ??= {
			clearEpoch: hasStoredClearEpoch(storageFor(options.config())),
			subjectId: generateUuidV7(),
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
	const buildEngine = async (): Promise<
		VueConsentKernelContext | undefined
	> => {
		const create = await options.loadEngine();
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
		return context;
	};

	/** The load in flight. A failed one clears, so the next request retries. */
	let loading: Promise<VueConsentKernelContext | undefined> | undefined;
	/**
	 * Loads the engine once; never rejects. A failure leaves the page on the
	 * stand-in until something asks for the engine again, and rejects the
	 * commands waiting for it so their surface shows again.
	 */
	const loadEngine = (): Promise<VueConsentKernelContext | undefined> => {
		if (engine) {
			return Promise.resolve(engine);
		}
		loading ??= (async () => {
			try {
				return await buildEngine();
			} catch (error) {
				console.error('[inth] The consent engine failed to load.', error);
				if (handle.attached()) {
					return engine;
				}
				engine = undefined;
				loading = undefined;
				// A banner the early-tap script hid for a tap the engine was to
				// replay shows again, or it stays hidden for good.
				if (typeof document !== 'undefined') {
					document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
				}
				handle.fail(error);
				return undefined;
			}
		})();
		return loading;
	};
	requestEngine = () => {
		void loadEngine();
	};

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
			(window as unknown as Record<string, unknown>)[EARLY_TAPS_WINDOW_KEY] =
				{};
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
	 * `null` when the commit path declined it.
	 */
	const commitChoice = (
		choice: CompleteCommitInput['choice'],
		actionAt: number,
		uiSource: SaveUISource | undefined
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
			context?.uiSource
		).then((result) => result ?? onEngine());
	};

	/**
	 * A tap the early-tap script recorded on the server-rendered banner
	 * loads the engine. The banner replays it through its own handlers once
	 * it hydrates, so it commits through the banner's own plan and
	 * Customize opens the options in place.
	 */
	const routeTap = (): void => {
		if ((earlyTapQueue()?.taps ?? []).length === 0 || routing) {
			return;
		}
		requestEngine();
	};

	// -- The banner's hydration view ------------------------------------------
	// The stock banner hydrates once the engine is in, against the HTML the
	// server rendered: it reads the server's snapshot until it has hydrated,
	// then the live one. A choice made before then otherwise makes its
	// first render differ from the HTML.
	const released = ref(false);
	let hydrated = false;
	let holds = 0;
	const release = () => {
		if (hydrated && holds === 0) {
			released.value = true;
		}
	};
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
			// oxlint-disable-next-line promise/prefer-await-to-then -- Runs once attached.
			void loadEngine().then((attached) => attached?.clearRecords());
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
			// oxlint-disable-next-line promise/prefer-await-to-then -- Runs once attached.
			void loadEngine().then((attached) => attached?.setLanguage(language));
		},
		setOverrides(overrides) {
			if (engine) {
				engine.setOverrides(overrides);
				return;
			}
			// oxlint-disable-next-line promise/prefer-await-to-then -- Runs once attached.
			void loadEngine().then((attached) => attached?.setOverrides(overrides));
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
		hold: () => {
			if (released.value) {
				return () => undefined;
			}
			holds += 1;
			let held = true;
			return () => {
				if (held) {
					held = false;
					holds -= 1;
					release();
				}
			};
		},
		hydrated: () => {
			hydrated = true;
			release();
		},
		init: viewInit,
		ready: handle.ready,
		snapshot: viewSnapshot as Readonly<Ref<ConsentSnapshot>>,
		storedConsent: viewStoredConsent,
	};
	context.bannerView = bannerView;
	return context;
};
