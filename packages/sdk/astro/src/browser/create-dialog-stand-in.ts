/**
 * The runtime a preference dialog renders against when the shell opens it
 * before the consent engine has loaded.
 *
 * Its kernel is core's stand-in (`createStandInKernel`) over the snapshot
 * the shell holds: the one the server rendered the banner from, or the
 * choice the shell committed since. The active surface is the stand-in's
 * own, so the dialog opens and closes without the engine. Runtime methods
 * wait for the engine the same way. Once the engine attaches, every read
 * and call goes to its runtime, and listeners hear the switch. The objects
 * stay the same, so the island that took them at mount keeps working.
 *
 * Loaded beside the dialog's chunks, never on first load.
 *
 * @internal
 */

import { allConsentNames } from '@inth/sdk/engine';
import type {
	AllConsentNames,
	ConsentSnapshot,
	KernelActiveUI,
} from '@inth/sdk/engine';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import { createStandInKernel } from '@inth/sdk/runtime/stand-in-kernel';

/** @internal */
export interface DialogStandInOptions {
	/** The shell's snapshot. */
	read: () => ConsentSnapshot;
	/** Loads the engine and resolves with its runtime. */
	requestEngine: () => Promise<ConsentRuntime>;
	/** Hears every surface change the dialog makes before the engine. */
	onSurface: (activeUI: KernelActiveUI) => void;
}

/** @internal */
export interface DialogStandIn {
	/** The runtime the island renders against. */
	readonly runtime: ConsentRuntime;
	/** Hand every read and call over to the engine's runtime. */
	attach: (engine: ConsentRuntime) => void;
	/**
	 * The shell's snapshot changed: a committed choice decides the surface
	 * from here, so the stand-in's own is dropped.
	 */
	changed: () => void;
	/** Stop forwarding the engine's notifications. */
	dispose: () => void;
}

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Runtime methods that queue without loading the engine: what the island's
 * provider sets as it mounts. The shell stands in only while nothing
 * optional is granted, so they change nothing until the engine loads.
 */
const QUIET: ReadonlySet<string> = new Set(['setConsentCategories']);

/**
 * Creates the stand-in runtime.
 *
 * @param options - The shell's snapshot, the engine loader and the
 * surface listener.
 * @returns The stand-in.
 * @internal
 */
export const createDialogStandIn = function createDialogStandIn(
	options: DialogStandInOptions
): DialogStandIn {
	let engine: ConsentRuntime | null = null;
	const runtimeListeners = new Set<() => void>();
	const queued: ((runtime: ConsentRuntime) => void)[] = [];
	let stopRuntime: (() => void) | undefined;

	const handle = createStandInKernel({
		onSurface: options.onSurface,
		requestEngine: () => {
			// oxlint-disable-next-line promise/prefer-await-to-then -- The shell attaches before it resolves.
			options.requestEngine().catch(handle.fail);
		},
		snapshot: options.read(),
	});
	const { kernel } = handle;

	/** Runs `run` on the engine's runtime, loading it first. */
	const later = async function later<Result>(
		run: (runtime: ConsentRuntime) => Result
	): Promise<Awaited<Result>> {
		const runtime = engine ?? (await options.requestEngine());
		return await run(runtime);
	};

	/** A runtime method: the engine's once attached, else queued. */
	const forward =
		(name: string) =>
		(...args: unknown[]): unknown => {
			const call = (runtime: ConsentRuntime) =>
				(runtime as unknown as Record<string, AnyFunction>)[name]?.(...args);
			if (engine) {
				return call(engine);
			}
			if (QUIET.has(name)) {
				queued.push(call);
				return undefined;
			}
			return later(call);
		};

	const runtime = {
		clearRecords: forward('clearRecords'),
		get consentCategories(): AllConsentNames[] {
			if (engine) {
				return engine.consentCategories;
			}
			// `necessary` and the choice scope in display order: the rule
			// core's runtime applies.
			const snapshot = kernel.getSnapshot();
			const scope: readonly string[] =
				snapshot.evaluationPolicy?.choiceScope ?? snapshot.policyRule.scope;
			return allConsentNames.filter(
				(category) => category === 'necessary' || scope.includes(category)
			);
		},
		dispose: () => undefined,
		get experiment() {
			return engine?.experiment;
		},
		get iab() {
			return engine?.iab ?? null;
		},
		identify: forward('identify'),
		kernel,
		processIframes: forward('processIframes'),
		reconcileStorage: () => engine?.reconcileStorage() ?? false,
		reinit: forward('reinit'),
		get scripts() {
			return engine?.scripts ?? [];
		},
		setConsentCategories: forward('setConsentCategories'),
		setEnabled: forward('setEnabled'),
		setLanguage: forward('setLanguage'),
		setOverrides: forward('setOverrides'),
		start: () => undefined,
		get started() {
			return true;
		},
		subscribe(listener: () => void) {
			runtimeListeners.add(listener);
			return () => {
				runtimeListeners.delete(listener);
			};
		},
		syncUserConsent: forward('syncUserConsent'),
	} as unknown as ConsentRuntime;

	const notifyRuntime = (): void => {
		for (const listener of [...runtimeListeners]) {
			listener();
		}
	};

	return {
		attach(next) {
			if (engine) {
				return;
			}
			engine = next;
			stopRuntime = next.subscribe(notifyRuntime);
			for (const call of queued.splice(0)) {
				call(next);
			}
			handle.attach(next.kernel);
			notifyRuntime();
		},
		changed() {
			handle.commit(options.read(), []);
		},
		dispose() {
			stopRuntime?.();
			handle.dispose();
			runtimeListeners.clear();
		},
		runtime,
	};
};
