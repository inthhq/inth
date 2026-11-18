/**
 * The kernel a deferred root puts in context before the consent engine
 * has loaded.
 *
 * Reads come from the snapshots the server rendered with. Mutations and
 * commands ask for the engine and run on it once it attaches; commands
 * resolve with the engine's result. Once attached, every property read
 * goes to the engine's kernel, and subscribers hear about the switch.
 * The object stays the same throughout, so no context value changes and
 * a Suspense boundary that has not hydrated yet is never forced to
 * render on the client.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	AllConsentNames,
	ConsentKernel,
	ConsentPresentation,
	ConsentSnapshot,
	KernelActiveUI,
	KernelEvent,
} from '@inth/sdk/engine';
import type {
	ConsentRuntime,
	RuntimePrefetch,
	StreamedPrefetch,
} from '@inth/sdk/runtime';

import type { ProviderServices } from '../context';
import { markDeferredKernel } from './registry';
import type { DeferredModules } from './registry';

/** What the loaded engine hands the stand-in. @internal */
export interface DeferredEngine {
	kernel: ConsentKernel;
	services: ProviderServices;
	streamed: StreamedPrefetch | undefined;
	modules: DeferredModules;
}

/** @internal */
export interface DeferredKernelOptions {
	/** The snapshot the server rendered the page from. */
	serverSnapshot: ConsentSnapshot;
	/** The snapshot to read after hydration, until the engine attaches. */
	snapshot: ConsentSnapshot;
	/** Starts loading the engine, if it is not loading yet. */
	requestEngine: () => void;
	/**
	 * The pending `prefetch`, when the server streamed it. The stand-in
	 * then offers a streamed prefetch to consent surfaces, as the provider
	 * does.
	 */
	settled?: PromiseLike<RuntimePrefetch | undefined>;
	consentCategories?: readonly AllConsentNames[];
	presentation?: ConsentPresentation;
	/**
	 * Runs a command called before the engine attached without waiting for
	 * the engine, such as a banner accept the root can commit (see
	 * `commit.ts`). Returns `undefined` to wait for the engine, as by
	 * default; `engine` runs it there.
	 */
	early?: (
		name: string,
		args: unknown[],
		engine: () => Promise<unknown>
	) => Promise<unknown> | undefined;
	/**
	 * `set.activeUI` before the engine attached shows the surface at once,
	 * without loading the engine: for a root that renders the dialog
	 * without it. The engine takes the surface over when it attaches.
	 */
	localSurfaces?: boolean;
}

/** @internal */
export interface DeferredKernelHandle {
	/** The kernel to put in context. Stable for the root's lifetime. */
	readonly kernel: ConsentKernel;
	readonly services: ProviderServices;
	readonly streamed: StreamedPrefetch | undefined;
	/** Resolves when the engine first attaches. */
	readonly ready: Promise<void>;
	/** Whether the engine has attached. */
	readonly attached: () => boolean;
	/** Route the kernel to the engine's. Call again when it changes. */
	attach: (engine: DeferredEngine) => void;
	/**
	 * Replace the snapshot reads return until the engine attaches, as when a
	 * client-rendered root learns the policy from a prefetched `/init`.
	 * Ignored once attached.
	 */
	setSnapshot: (snapshot: ConsentSnapshot) => void;
	/**
	 * Take a choice recorded without the engine (see `instant.ts` and
	 * `commit.ts`): reads return `snapshot` and listeners hear it, then
	 * `events` go to the stand-in's event listeners. The snapshot already
	 * committed is not announced again. Refused (`false`) once the engine
	 * has attached; the engine records it then.
	 */
	commit: (
		snapshot: ConsentSnapshot,
		events: readonly KernelEvent[]
	) => boolean;
	/** Setter calls waiting for the engine, in order. */
	readonly pending: () => readonly { name: string; args: unknown[] }[];
}

/** Commands that answer the prompt: the banner hides when one is called. */
const ANSWERS = new Set(['save', 'dismissNotice']);

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Setters that queue without loading the engine: registrations a module
 * makes when it mounts, such as a network or iframe blocker. A visitor the
 * engine waits for has granted nothing optional, so they change nothing
 * until it loads.
 */
const QUIET_SETTERS: ReadonlySet<string> = new Set([
	'registerConsentCategories',
	'vendors',
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
 * Creates the stand-in kernel and the services that go with it.
 *
 * @returns The handle the root renders and attaches the engine to.
 * @internal
 */
export const createDeferredKernel = function createDeferredKernel(
	options: DeferredKernelOptions
): DeferredKernelHandle {
	let engine: DeferredEngine | null = null;
	let resolveReady: () => void = () => undefined;
	const ready = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});
	const listeners = new Set<(snapshot: ConsentSnapshot) => void>();
	const queued: ((kernel: ConsentKernel) => void)[] = [];
	const pending: { name: string; args: unknown[] }[] = [];
	// Event listeners before the engine attached, for a committed choice.
	const eventListeners = new Set<{
		type: string;
		listener: (event: KernelEvent) => void;
	}>();
	let committed: ConsentSnapshot | null = null;
	// A surface shown before the engine (`localSurfaces`), over the
	// snapshot reads return; the same object for the same input, as
	// `useSyncExternalStore` compares.
	let shown: KernelActiveUI | undefined;
	let shownFrom: ConsentSnapshot | undefined;
	let shownSnapshot: ConsentSnapshot | undefined;
	const withShown = (snapshot: ConsentSnapshot): ConsentSnapshot => {
		if (shown === undefined || snapshot.activeUI === shown) {
			return snapshot;
		}
		if (shownFrom !== snapshot) {
			shownFrom = snapshot;
			shownSnapshot = Object.freeze({ ...snapshot, activeUI: shown });
		}
		return shownSnapshot as ConsentSnapshot;
	};
	let resolveCommitted: () => void = () => undefined;
	const choiceCommitted = new Promise<void>((resolve) => {
		resolveCommitted = resolve;
	});
	let unsubscribeEngine: (() => void) | undefined;

	const later = function later<Result>(
		run: (attached: DeferredEngine) => Result
	): Promise<Awaited<Result>> {
		options.requestEngine();
		// oxlint-disable-next-line promise/prefer-await-to-then -- Runs after `attach`, which resolves `ready`.
		return ready.then(() => run(engine as DeferredEngine)) as Promise<
			Awaited<Result>
		>;
	};

	// Answers tapped before the engine attached, still running. While any
	// is, a snapshot that still shows the banner reads as dismissed: the
	// tap hid it, and the engine has not applied the choice yet.
	let answering = 0;
	let dismissedFrom: ConsentSnapshot | undefined;
	let dismissedSnapshot: ConsentSnapshot | undefined;
	const dismissed = (snapshot: ConsentSnapshot): ConsentSnapshot => {
		if (answering === 0 || snapshot.activeUI !== 'banner') {
			return snapshot;
		}
		// The same object for the same input: `useSyncExternalStore` compares.
		if (dismissedFrom !== snapshot) {
			dismissedFrom = snapshot;
			dismissedSnapshot = Object.freeze({ ...snapshot, activeUI: 'none' });
		}
		return dismissedSnapshot as ConsentSnapshot;
	};

	const currentSnapshot = (): ConsentSnapshot =>
		dismissed(
			engine
				? engine.kernel.getSnapshot()
				: withShown(committed ?? options.snapshot)
		);

	const notify = (): void => {
		const snapshot = currentSnapshot();
		for (const listener of [...listeners]) {
			listener(snapshot);
		}
	};

	const set = functionTable<ConsentKernel['set']>((name) => (...args) => {
		const call = (kernel: ConsentKernel) =>
			(kernel.set as unknown as Record<string, AnyFunction>)[name]?.(...args);
		if (engine) {
			return call(engine.kernel);
		}
		if (name === 'activeUI' && options.localSurfaces) {
			shown = args[0] as KernelActiveUI;
			notify();
			return undefined;
		}
		queued.push(call);
		pending.push({ args, name });
		// A module registering what it gates changes nothing the visitor
		// sees before the engine: wait for it rather than load it.
		if (!QUIET_SETTERS.has(name)) {
			options.requestEngine();
		}
		return undefined;
	});
	const commands = functionTable<ConsentKernel['commands']>((name) => {
		const call = (kernel: ConsentKernel, args: unknown[]) =>
			(kernel.commands as unknown as Record<string, AnyFunction>)[name]?.(
				...args
			);
		const run = (...args: unknown[]) => {
			if (engine) {
				return call(engine.kernel, args);
			}
			const onEngine = () => later((attached) => call(attached.kernel, args));
			return options.early?.(name, args, onEngine) ?? onEngine();
		};
		if (!ANSWERS.has(name)) {
			return run;
		}
		return async (...args: unknown[]) => {
			if (engine && answering === 0) {
				return run(...args);
			}
			answering += 1;
			notify();
			try {
				return await run(...args);
			} finally {
				answering -= 1;
				notify();
			}
		};
	});

	const stub: ConsentKernel = {
		commands,
		dispose: () => undefined,
		events: {
			on(type, listener) {
				let live = true;
				let off: (() => void) | undefined;
				const local = {
					listener: listener as (event: KernelEvent) => void,
					type,
				};
				eventListeners.add(local);
				// oxlint-disable-next-line promise/prefer-await-to-then -- Subscribes once the engine attaches.
				void ready.then(() => {
					if (live) {
						off = engine?.kernel.events.on(type, listener);
					}
				});
				return () => {
					live = false;
					eventListeners.delete(local);
					off?.();
				};
			},
		},
		getRecordsGeneration: () => 0,
		getServerSnapshot: () => options.serverSnapshot,
		getSnapshot: currentSnapshot,
		refresh: () => withShown(committed ?? options.snapshot),
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
			// Subscribers stay on the stand-in, which forwards the engine's
			// notifications, so they survive the engine swapping kernels.
			// The server snapshot stays the one the server rendered with:
			// a boundary that hydrates late must match that HTML.
			const name = key as keyof ConsentKernel;
			if (
				name === 'subscribe' ||
				name === 'getServerSnapshot' ||
				name === 'getSnapshot' ||
				name === 'commands'
			) {
				return target[name];
			}
			return (engine ? engine.kernel : target)[name];
		},
	});

	const services: ProviderServices = {
		clearRecords: () => {
			void later((attached) => attached.services.clearRecords());
		},
		getConsentCategories: () =>
			engine?.services.getConsentCategories() ??
			options.consentCategories ??
			[],
		getPresentation: () =>
			engine ? engine.services.getPresentation() : options.presentation,
		isStarted: () => engine?.services.isStarted() ?? false,
		// oxlint-disable-next-line promise/prefer-await-to-then -- Settles once attached.
		ready: ready.then(() => undefined),
		get runtime(): ConsentRuntime {
			return engine?.services.runtime as ConsentRuntime;
		},
		setLanguage: (code) => {
			void later((attached) => attached.services.setLanguage(code));
		},
	};

	const pendingStreamed = options.settled;
	const streamed: StreamedPrefetch | undefined = pendingStreamed
		? {
				adopt: (config) => engine?.streamed?.adopt(config),
				get settled() {
					return engine?.streamed?.settled ?? pendingStreamed;
				},
				// What a surface hydrates from. After a commit the engine starts
				// from the committed records, but the server HTML is the
				// snapshot the server rendered.
				snapshotFor: (config) =>
					engine?.streamed && !committed
						? engine.streamed.snapshotFor(config)
						: options.snapshot,
			}
		: undefined;

	markDeferredKernel(
		kernel,
		// oxlint-disable-next-line promise/prefer-await-to-then -- Resolves with the first engine's modules.
		ready.then(() => (engine as DeferredEngine).modules),
		options.requestEngine,
		() => engine?.kernel,
		Promise.race([ready, choiceCommitted])
	);

	return {
		attach(next) {
			const previous = engine;
			engine = next;
			if (previous?.kernel !== next.kernel) {
				unsubscribeEngine?.();
				unsubscribeEngine = next.kernel.subscribe(notify);
			}
			if (!previous) {
				eventListeners.clear();
				pending.length = 0;
				for (const call of queued.splice(0)) {
					call(next.kernel);
				}
				if (shown !== undefined) {
					next.kernel.set.activeUI(shown);
					shown = undefined;
				}
				resolveReady();
			}
			notify();
		},
		attached: () => engine !== null,
		commit(snapshot, events) {
			if (engine) {
				return false;
			}
			// A commit chunk completing an instant commit hands the same
			// snapshot back with the events: listeners heard it already.
			if (snapshot !== committed) {
				committed = snapshot;
				// The commit's snapshot carries the surface a choice leaves.
				shown = undefined;
				// Loaders waiting for a choice start a task later, so their
				// chunk requests stay out of the tap's task.
				setTimeout(resolveCommitted, 0);
				notify();
			}
			for (const event of events) {
				for (const entry of [...eventListeners]) {
					if (entry.type === event.type) {
						entry.listener(event);
					}
				}
			}
			return true;
		},
		kernel,
		pending: () => pending,
		ready,
		services,
		setSnapshot(next) {
			if (!engine && next !== options.snapshot) {
				options.snapshot = next;
				notify();
			}
		},
		streamed,
	};
};
