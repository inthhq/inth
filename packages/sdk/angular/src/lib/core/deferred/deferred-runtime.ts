/**
 * The runtime `ConsentManager` renders in the browser before the consent
 * engine has loaded.
 *
 * `provideC15tServer()` and the server render put the banner, its
 * first-paint styles and the boot (`boot.ts`) in the HTML. The browser's
 * first-load chunk holds only this: a runtime over a stand-in kernel
 * (`stand-in.ts`) that reads the snapshot the server rendered with, so the
 * page hydrates and every component reads the server's state. The engine
 * (`engine.ts`) loads after the page's priority images, on the first input
 * or scroll outside the banner, or when page code needs it (`trigger.ts`);
 * at once for a visitor the engine must serve now.
 *
 * A banner accept or reject, or a dialog save, made before the engine is
 * recorded in the tap's own task (`planInstantCommit`): the snapshot the
 * page reads changes and the allowed plain scripts start at once. One task
 * later the commit chunk (`commit.ts`) stores the record and queues the
 * backend save; then the engine loads, starts from the record and sends
 * the save without recording it again.
 *
 * The same design as `@inth/svelte`'s `ConsentRoot` and `@inth/vue`'s Nuxt
 * module.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	ConsentExperiment,
	ConsentKernel,
	SaveResult,
	SaveUISource,
} from '@inth/sdk/engine';
import type { ConsentRuntimeIABHandle } from '@inth/sdk/runtime';
import type {
	ConsentProviderRuntime,
	ConsentRuntimeUpdate,
} from '@inth/sdk/runtime/provider';
import {
	generateSubjectId,
	hasStoredClearEpoch,
	planInstantCommit,
} from '@inth/sdk/surface-actions/instant-commit';
import type { InstantCommit } from '@inth/sdk/surface-actions/instant-commit';
import { startPlainScripts } from '@inth/sdk/surface-actions/plain-scripts';
import {
	clearStoredRecordsFor,
	storageFor,
} from '@inth/sdk/surface-actions/stored-records';
import {
	allConsentNames,
	hasGlobalPrivacyControlSignal,
	pendingBootSnapshot,
} from '@inth/sdk/surface-state';

import type { C15tResolvedOptions } from '../options';
import type { ConsentBoot } from './boot';
import type * as CommitModule from './commit';
import type {
	CompleteCommitInput,
	CompleteCommitResult,
	DeferredCommitted,
} from './commit';
import { createStandInKernel, pendingIsInert } from './stand-in';
import { DIALOG_ROOT, scheduleDeferredEngine, whenIdle } from './trigger';

/** The engine as the deferred runtime takes it over. @internal */
export interface LoadedEngine {
	runtime: ConsentProviderRuntime;
	/** The options `update()` hands the engine: its own `mode` kept. */
	updateOptions: (next: ConsentRuntimeUpdate) => ConsentRuntimeUpdate;
	/** Loads the save's code ahead of the visitor's choice. */
	preloadSavePath: () => Promise<void>;
}

/** Builds the engine, from a commit made before it, if any. @internal */
export type EngineFactory = (
	committed: DeferredCommitted | undefined
) => LoadedEngine;

/** @internal */
export interface DeferredRuntimeOptions {
	/** The boot the server rendered the page with. */
	boot: ConsentBoot;
	/** The provider's current options. */
	options: () => C15tResolvedOptions;
	/** Loads the engine chunk. */
	loadEngine: () => Promise<EngineFactory>;
	/** Completes a commit; loads `commit.ts` by default. A test seam. */
	completeCommit?: (
		input: CompleteCommitInput
	) => Promise<CompleteCommitResult | null>;
	/** Decides when the engine loads. A test seam. */
	schedule?: typeof scheduleDeferredEngine;
}

/** The runtime `ConsentManager` renders, and whether the engine is in. @internal */
export interface DeferredRuntime extends ConsentProviderRuntime {
	/** Resolves with the engine once it has attached, `undefined` if it failed. */
	readonly ready: Promise<ConsentProviderRuntime | undefined>;
	/**
	 * Loads the engine now without starting it, as the server render does:
	 * it renders the engine's snapshot and leaves it for the browser.
	 */
	load: () => void;
	/**
	 * The engine's kernel once it has attached, from a first load or a
	 * retry. Subscribers hear when it attaches.
	 */
	engineKernel: () => ConsentKernel | undefined;
}

/**
 * The live options the stand-in does not apply: a change to one in
 * `update()` waits for the engine. The rest of `update()`'s live options
 * (callbacks) the engine reads when it is created.
 */
const ENGINE_LIVE_OPTIONS = [
	'consentCategories',
	'enabled',
	'iframeBlocker',
	'networkBlocker',
	'overrides',
	'scripts',
	'user',
	'vendors',
] as const satisfies readonly (keyof ConsentRuntimeUpdate)[];

/** Load the engine anyway this long after an early dialog opened. */
const DIALOG_SHOWN_MS = 3000;

let commitModule: Promise<typeof CommitModule> | undefined;
/** Loads the commit chunk once; a failed load is retried next time. */
const loadCommitModule = async (): Promise<typeof CommitModule> => {
	commitModule ??= import('./commit');
	try {
		return await commitModule;
	} catch (error) {
		commitModule = undefined;
		throw error;
	}
};

const loadCompleteCommit = async (
	input: CompleteCommitInput
): Promise<CompleteCommitResult | null> => {
	const { completeCommit } = await loadCommitModule();
	return completeCommit(input);
};

/** One task later: the tap's own task does only what the page sees. */
const nextTask = (): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * The categories the draft displays, from the stand-in's snapshot:
 * `necessary` plus the choice scope, in display order. The rule of core's
 * `displayedCategories`, which the engine's runtime applies.
 */
const displayedCategoriesOf = (
	kernel: ConsentKernel
): ConsentProviderRuntime['consentCategories'] => {
	const snapshot = kernel.getSnapshot();
	const scope: readonly string[] =
		snapshot.evaluationPolicy?.choiceScope ?? snapshot.policyRule.scope;
	return allConsentNames.filter(
		(category) => category === 'necessary' || scope.includes(category)
	);
};

/**
 * Creates the deferred runtime. Render it like the engine's runtime: the
 * provider calls `start()` once mounted.
 *
 * @param options - The boot, the provider's options and the engine loader.
 * @returns The runtime the consent manager renders.
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One runtime, its tap routing and its engine handover.
export const createDeferredRuntime = function createDeferredRuntime(
	options: DeferredRuntimeOptions
): DeferredRuntime {
	const { boot } = options;
	const defer = boot.d === 1;
	let requestEngine: () => void = () => undefined;
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
		snapshot: boot.s,
	});
	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const listener of [...listeners]) {
			listener();
		}
	};
	let engine: LoadedEngine | undefined;
	/** The options of the last `update()`, else the provider's first ones. */
	let applied: ConsentRuntimeUpdate = options.options() as ConsentRuntimeUpdate;
	let mounted = false;
	let active = true;
	let stopSchedule: (() => void) | undefined;
	let stopDialogWatch: (() => void) | undefined;
	let committed: DeferredCommitted | undefined;
	let commitSettled: Promise<void> = Promise.resolve();
	let routing = false;
	/** Storage read ahead of a tap, so the tap's task reads none. */
	let ahead: { clearEpoch: boolean; subjectId: string } | undefined;
	const readAhead = () => {
		ahead ??= {
			clearEpoch: hasStoredClearEpoch(storageFor(options.options())),
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

	let settleReady: (runtime: ConsentProviderRuntime | undefined) => void = () =>
		undefined;
	/** Settles with the first load attempt. */
	const ready = new Promise<ConsentProviderRuntime | undefined>((resolve) => {
		settleReady = resolve;
	});
	/** The load in flight. A failed one clears, so the next request retries. */
	let loading: Promise<ConsentProviderRuntime | undefined> | undefined;

	/** One attempt: import, build, start and attach the engine. */
	const buildEngine = async (): Promise<ConsentProviderRuntime | undefined> => {
		const create = await options.loadEngine();
		// A commit started while the chunk loaded: the engine starts from it.
		await commitsSettled();
		if (!active) {
			return undefined;
		}
		const loaded = create(committed);
		engine = loaded;
		const { runtime } = loaded;
		if (mounted) {
			runtime.start();
		}
		if (committed) {
			// The commit queued its save; send it from the started runtime.
			(runtime.kernel as { replaySaves?: () => void }).replaySaves?.();
		}
		handle.attach(runtime.kernel);
		stopDialogWatch?.();
		runtime.subscribe(notify);
		notify();
		// A visitor a surface asks then downloads nothing before the scripts
		// their choice allows. One with nothing to answer downloads it only
		// if they act, as persistence's own preload does. Not on the server,
		// which renders the engine without starting it.
		if (mounted && handle.kernel.getSnapshot().activeUI !== 'none') {
			whenIdle(() => {
				void loaded.preloadSavePath();
			});
		}
		return runtime;
	};

	/**
	 * An attempt that never rejects. Any failure in it, the chunk request or
	 * a mode factory that throws while the engine is built, leaves the page
	 * on the stand-in until something asks for the engine again, and settles
	 * the commands waiting for it so their surface shows again.
	 */
	const attachEngine = async (): Promise<
		ConsentProviderRuntime | undefined
	> => {
		try {
			return await buildEngine();
		} catch (error) {
			console.error('[c15t] The consent engine failed to load.', error);
			if (handle.attached()) {
				// It failed after it took over; the page runs on it.
				return engine?.runtime;
			}
			const built = engine;
			engine = undefined;
			try {
				built?.runtime.dispose();
			} catch {
				// Half built: nothing more to undo.
			}
			loading = undefined;
			handle.fail(error);
			return undefined;
		}
	};

	/** Loads and attaches the engine, or joins the load in flight. */
	const loadEngine = (): Promise<ConsentProviderRuntime | undefined> => {
		if (engine) {
			return Promise.resolve(engine.runtime);
		}
		if (!loading) {
			const attempt = attachEngine();
			loading = attempt;
			// oxlint-disable-next-line promise/prefer-await-to-then -- `attachEngine` never rejects.
			void attempt.then(settleReady);
		}
		return loading;
	};
	requestEngine = () => {
		void loadEngine();
	};

	/** Runs `run` on the engine, now or once it has attached. */
	const later = function later<Result>(
		run: (runtime: ConsentProviderRuntime) => Result
	): Promise<Awaited<Result> | undefined> {
		if (engine) {
			return Promise.resolve(run(engine.runtime)) as Promise<Awaited<Result>>;
		}
		// oxlint-disable-next-line promise/prefer-await-to-then -- Runs once attached.
		return loadEngine().then((runtime) =>
			runtime ? run(runtime) : undefined
		) as Promise<Awaited<Result> | undefined>;
	};

	// -- Recording a choice -------------------------------------------------
	/**
	 * Commits a save on the stand-in in this task when it is the short case
	 * `planInstantCommit` covers: the allowed plain `scripts` start, then
	 * the stand-in's listeners (the page, script loaders) hear it.
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
		const current = options.options();
		startPlainScripts(current.scripts ?? [], plan.snapshot, current.nonce);
		return handle.commit(plan.snapshot, []) ? plan : null;
	};

	/**
	 * Records a choice without the engine, then loads the engine. Resolves
	 * `null` when the commit path declined it, including a commit the
	 * stand-in already shows; the command that called this then runs the
	 * save on the engine (`hooks.early`), so it records once.
	 */
	const commitChoice = (
		choice: CompleteCommitInput['choice'],
		actionAt: number,
		uiSource: SaveUISource | undefined
	): Promise<SaveResult | null> => {
		routing = true;
		const instant = commitInstantly(choice, actionAt);
		const attempt = (async () => {
			await nextTask();
			try {
				return await (options.completeCommit ?? loadCompleteCommit)({
					actionAt,
					choice,
					config: options.options(),
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
			}
			routing = false;
		})();
		// oxlint-disable-next-line promise/prefer-await-to-then -- Never rejects.
		void commitSettled.then(() => requestEngine());
		// oxlint-disable-next-line promise/prefer-await-to-then -- The save's own result.
		return attempt.then((result) => result?.result ?? null);
	};

	// A save called on the stand-in before the engine, from the stock
	// banner or dialog or from page code, goes through the commit path
	// when it is a category choice.
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
		const instant = commitChoice(
			input as CompleteCommitInput['choice'],
			context?.actionAt ?? Date.now(),
			context?.uiSource
		);
		// oxlint-disable-next-line promise/prefer-await-to-then -- The command's own promise.
		return instant.then((result) => result ?? onEngine());
	};

	/**
	 * A dialog opened before the engine (Customize, or page code): load the
	 * engine once it is on screen. Before, the engine's chunks would share
	 * the connection with the dialog's.
	 */
	const watchDialog = (): (() => void) => {
		let frame = 0;
		const unsubscribe = handle.kernel.subscribe((snapshot) => {
			if (snapshot.activeUI !== 'dialog' || frame || handle.attached()) {
				return;
			}
			const deadline = Date.now() + DIALOG_SHOWN_MS;
			const check = (): void => {
				if (document.querySelector(DIALOG_ROOT) || Date.now() > deadline) {
					frame = 0;
					requestEngine();
					return;
				}
				frame = requestAnimationFrame(check);
			};
			frame = requestAnimationFrame(check);
		});
		return () => {
			unsubscribe();
			cancelAnimationFrame(frame);
		};
	};

	/** IAB calls before the engine wait for its handle, and replay in order. */
	const earlyIAB = new Proxy({} as ConsentRuntimeIABHandle, {
		get(_target, key) {
			if (typeof key !== 'string' || key === 'then') {
				return undefined;
			}
			return (...args: unknown[]) =>
				later((runtime) =>
					(runtime.iab as unknown as Record<string, AnyFunction> | null)?.[
						key
					]?.(...args)
				);
		},
	});

	const forward =
		<Name extends keyof ConsentProviderRuntime>(name: Name) =>
		(...args: unknown[]) => {
			void later((runtime) =>
				(runtime[name] as unknown as AnyFunction)(...args)
			);
		};

	const deferred: DeferredRuntime = {
		clearRecords() {
			if (!handle.attached()) {
				// Before the engine: storage is cleared now, as the engine's
				// clear does, so a reload or teardown before it lands cannot
				// bring the choice back. The page shows no choice until the
				// engine evaluates the cleared records.
				const current = options.options();
				clearStoredRecordsFor(current);
				committed = undefined;
				ahead = undefined;
				handle.commit(
					pendingBootSnapshot({
						consentCategories: current.consentCategories,
						gpc: hasGlobalPrivacyControlSignal(),
						overrides: current.overrides,
					}),
					[]
				);
			}
			// The engine clears its kernel, and its storage again.
			void later((runtime) => runtime.clearRecords());
		},
		get consentCategories() {
			return engine
				? engine.runtime.consentCategories
				: displayedCategoriesOf(handle.kernel);
		},
		dispose() {
			active = false;
			stopSchedule?.();
			stopDialogWatch?.();
			handle.dispose();
			engine?.runtime.dispose();
			listeners.clear();
		},
		get enabled() {
			return engine
				? engine.runtime.enabled
				: options.options().enabled !== false;
		},
		engineKernel: () => engine?.runtime.kernel,
		get experiment(): ConsentExperiment | undefined {
			return engine ? engine.runtime.experiment : boot.x;
		},
		get iab() {
			if (engine) {
				return engine.runtime.iab;
			}
			return handle.kernel.getSnapshot().iab ? earlyIAB : null;
		},
		identify: async (user) => {
			await later((runtime) => runtime.identify(user));
		},
		get kernel(): ConsentKernel {
			// The stand-in forwards to the kernel it attached to; `enabled`
			// toggling swaps the engine's, which the provider then follows.
			const current = engine?.runtime.kernel;
			return current && current !== handle.engine() ? current : handle.kernel;
		},
		load: () => requestEngine(),
		processIframes: forward('processIframes'),
		ready,
		reconcileStorage: () => engine?.runtime.reconcileStorage() ?? false,
		reinit: async () => {
			await later((runtime) => runtime.reinit());
		},
		get scripts() {
			return engine
				? engine.runtime.scripts
				: (options.options().scripts ?? []);
		},
		setConsentCategories: forward('setConsentCategories'),
		setEnabled: forward('setEnabled'),
		setLanguage: forward('setLanguage'),
		setOverrides: forward('setOverrides'),
		start() {
			if (mounted || !active) {
				return;
			}
			mounted = true;
			engine?.runtime.start();
			if (engine) {
				return;
			}
			readAhead();
			stopDialogWatch = watchDialog();
			if (!defer) {
				requestEngine();
				return;
			}
			// Nothing to answer: start the plain scripts the visitor's choice
			// allows now, as the loader would have, and let the engine adopt
			// them after the page.
			const current = handle.kernel.getSnapshot();
			if (current.activeUI === 'none' && !ahead?.clearEpoch) {
				const { nonce, scripts } = options.options();
				startPlainScripts(scripts ?? [], current, nonce);
			}
			stopSchedule = (options.schedule ?? scheduleDeferredEngine)(() => {
				requestEngine();
				// A tap before the engine attaches downloads nothing either.
				whenIdle(async () => {
					try {
						await loadCommitModule();
					} catch {
						// The tap loads it again.
					}
				});
			});
		},
		get started() {
			return mounted;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		async update(next) {
			const previous = applied;
			applied = next;
			// Before the engine, it reads the options when it is created. A
			// change only the engine enforces, such as new network rules,
			// loads it first, so the promise resolves once it applies.
			if (
				!engine &&
				mounted &&
				ENGINE_LIVE_OPTIONS.some((key) => previous[key] !== next[key])
			) {
				await later(() => undefined);
				// The engine did not load: keep the change pending, so the same
				// update asks for it again. A newer update owns `applied` now.
				if (!engine && applied === next) {
					applied = previous;
				}
			}
			// After the wait, a newer `update()` may have set `applied`: send
			// the latest options, so updates in any order end on the last one.
			if (engine) {
				await engine.runtime.update(engine.updateOptions(applied));
			}
		},
	};
	return deferred;
};
