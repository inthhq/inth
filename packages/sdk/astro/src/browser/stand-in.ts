/**
 * The runtime a preference dialog renders against when the shell opens it
 * before the consent engine has loaded.
 *
 * Reads come from the snapshot the shell holds: the one the server
 * rendered the banner from, or the choice the shell committed since. The
 * active surface is the stand-in's own, so the dialog opens and closes
 * without the engine. Everything else waits for it: a setter is queued and
 * replayed, a command (a save from the dialog) asks for the engine and
 * runs there. Once the engine attaches, every read and call goes to its
 * runtime, and listeners hear the switch. The objects stay the same, so
 * the island that took them at mount keeps working.
 *
 * Loaded beside the dialog's chunks, never on first load. The same idea as
 * `@c15t/svelte`'s and `@c15t/vue`'s deferred stand-in kernels.
 *
 * @internal
 */

import { allConsentNames } from '@c15t/core';
import type {
	AllConsentNames,
	ConsentKernel,
	ConsentSnapshot,
	KernelActiveUI,
	KernelEvent,
} from '@c15t/core';
import type { ConsentRuntime } from '@c15t/core/runtime';

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
 * Setters that queue without loading the engine: what the island's
 * provider sets as it mounts. The shell stands in only while nothing
 * optional is granted, so they change nothing until the engine loads.
 */
const QUIET: ReadonlySet<string> = new Set([
	'registerConsentCategories',
	'setConsentCategories',
]);

/** An object whose every property is a function made by `make`, cached. */
const functionTable = function functionTable<Table extends object>(
	make: (name: string) => AnyFunction
): Table {
	const cache = new Map<string, AnyFunction>();
	return new Proxy({} as Table, {
		get(_target, key) {
			if (typeof key !== 'string') {
				return undefined;
			}
			let value = cache.get(key);
			if (!value) {
				value = make(key);
				cache.set(key, value);
			}
			return value;
		},
	});
};

/**
 * Creates the stand-in runtime.
 *
 * @param options - The shell's snapshot, the engine loader and the
 * surface listener.
 * @returns The stand-in.
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One kernel stand-in and the runtime around it.
export const createDialogStandIn = function createDialogStandIn(
	options: DialogStandInOptions
): DialogStandIn {
	let engine: ConsentRuntime | null = null;
	const listeners = new Set<(snapshot: ConsentSnapshot) => void>();
	const runtimeListeners = new Set<() => void>();
	const queued: ((runtime: ConsentRuntime) => void)[] = [];
	const events = new Set<{
		type: string;
		listener: (event: KernelEvent) => void;
		stop?: () => void;
	}>();
	const unsubscribes: (() => void)[] = [];

	// The surface the dialog shows, over the shell's snapshot.
	let shown: KernelActiveUI | undefined;
	let shownFrom: ConsentSnapshot | undefined;
	let shownSnapshot: ConsentSnapshot | undefined;
	const read = (): ConsentSnapshot => {
		if (engine) {
			return engine.kernel.getSnapshot();
		}
		const snapshot = options.read();
		if (shown === undefined || snapshot.activeUI === shown) {
			return snapshot;
		}
		if (shownFrom !== snapshot) {
			shownFrom = snapshot;
			shownSnapshot = Object.freeze({ ...snapshot, activeUI: shown });
		}
		return shownSnapshot as ConsentSnapshot;
	};
	let last = read();
	const notify = (): void => {
		const snapshot = read();
		if (snapshot === last) {
			return;
		}
		last = snapshot;
		for (const listener of [...listeners]) {
			listener(snapshot);
		}
	};
	const notifyRuntime = (): void => {
		for (const listener of [...runtimeListeners]) {
			listener();
		}
	};

	/** Runs `run` on the engine's runtime, loading it first. */
	const later = async function later<Result>(
		run: (runtime: ConsentRuntime) => Result
	): Promise<Awaited<Result>> {
		const runtime = engine ?? (await options.requestEngine());
		return await run(runtime);
	};

	const set = functionTable<ConsentKernel['set']>((name) => (...args) => {
		const call = (runtime: ConsentRuntime) =>
			(runtime.kernel.set as unknown as Record<string, AnyFunction>)[name]?.(
				...args
			);
		if (engine) {
			return call(engine);
		}
		if (name === 'activeUI') {
			shown = args[0] as KernelActiveUI;
			notify();
			options.onSurface(read().activeUI);
			return undefined;
		}
		queued.push(call);
		if (!QUIET.has(name)) {
			void later(() => undefined);
		}
		return undefined;
	});

	const commands = functionTable<ConsentKernel['commands']>(
		(name) =>
			(...args) =>
				later((runtime) =>
					(runtime.kernel.commands as unknown as Record<string, AnyFunction>)[
						name
					]?.(...args)
				)
	);

	const stub: ConsentKernel = {
		commands,
		dispose: () => undefined,
		events: {
			on(type, listener) {
				if (engine) {
					return engine.kernel.events.on(type, listener);
				}
				const entry = {
					listener: listener as (event: KernelEvent) => void,
					type: type as string,
				} as {
					type: string;
					listener: (event: KernelEvent) => void;
					stop?: () => void;
				};
				events.add(entry);
				return () => {
					events.delete(entry);
					entry.stop?.();
				};
			},
		},
		getRecordsGeneration: () => 0,
		getServerSnapshot: () => options.read(),
		getSnapshot: read,
		refresh: () => read(),
		set,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};

	const kernel = new Proxy(stub, {
		get(target, key) {
			// Subscribers and commands stay on the stand-in, which forwards.
			const name = key as keyof ConsentKernel;
			if (
				name === 'subscribe' ||
				name === 'getSnapshot' ||
				name === 'getServerSnapshot' ||
				name === 'commands' ||
				name === 'events'
			) {
				return target[name];
			}
			return (engine?.kernel ?? target)[name];
		},
	});

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
			const snapshot = read();
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
	} as unknown as ConsentRuntime;

	return {
		attach(next) {
			if (engine) {
				return;
			}
			engine = next;
			unsubscribes.push(
				next.kernel.subscribe(notify),
				next.subscribe(notifyRuntime)
			);
			for (const call of queued.splice(0)) {
				call(next);
			}
			for (const entry of events) {
				entry.stop = next.kernel.events.on(
					entry.type as KernelEvent['type'],
					entry.listener as never
				);
			}
			if (shown !== undefined && next.kernel.getSnapshot().activeUI !== shown) {
				next.kernel.set.activeUI(shown);
			}
			shown = undefined;
			notify();
			notifyRuntime();
		},
		changed() {
			if (engine) {
				return;
			}
			shown = undefined;
			notify();
		},
		dispose() {
			for (const unsubscribe of unsubscribes.splice(0)) {
				unsubscribe();
			}
			listeners.clear();
			runtimeListeners.clear();
		},
		runtime,
	};
};
