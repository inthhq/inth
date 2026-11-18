/**
 * The kernel a deferred root renders in the browser before the consent
 * engine has loaded.
 *
 * Reads come from the snapshot the server rendered with. Setters queue and
 * replay on the engine's kernel once it attaches; commands ask for the
 * engine and resolve with its result, or reject when it fails to load.
 * Once attached, every property read goes to the engine's kernel, and
 * subscribers hear about the switch. The object stays the same throughout,
 * so a component or script loader that took it at setup keeps working.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	ConsentKernel,
	ConsentSnapshot,
	KernelActiveUI,
	KernelEvent,
} from '../types';

/** @internal */
export interface StandInKernelOptions {
	/** The snapshot reads return until the engine attaches. */
	snapshot: ConsentSnapshot;
	/**
	 * The snapshot the server rendered the page from, when it differs from
	 * `snapshot`: a surface that hydrates late must match that HTML.
	 */
	serverSnapshot?: ConsentSnapshot;
	/**
	 * Starts loading the engine, if it is not loading yet. A load that
	 * fails must call the handle's `fail`, or the commands waiting for it
	 * never settle.
	 */
	requestEngine: () => void;
	/**
	 * Runs a command called before the engine attached without waiting for
	 * it, such as a save the shell can commit at once. Returns `undefined`
	 * to wait for the engine; `engine` runs it there.
	 */
	early?: (
		name: string,
		args: unknown[],
		engine: () => Promise<unknown>
	) => Promise<unknown> | undefined;
	/**
	 * `set.activeUI` before the engine shows the surface at once, without
	 * loading the engine. `true` by default; `false` queues it for the
	 * engine like any other setter.
	 */
	localSurfaces?: boolean;
	/** Hears a surface `set.activeUI` showed before the engine. */
	onSurface?: (activeUI: KernelActiveUI) => void;
}

/** @internal */
export interface StandInKernelHandle {
	/** The kernel to render. Stable for the runtime's lifetime. */
	readonly kernel: ConsentKernel;
	/** Resolves when the engine first attaches. */
	readonly ready: Promise<void>;
	readonly attached: () => boolean;
	/** The engine's kernel, once attached. */
	readonly engine: () => ConsentKernel | undefined;
	/** Route the kernel to the engine's. Call again when it changes. */
	attach: (engine: ConsentKernel) => void;
	/**
	 * The engine failed to load: commands waiting for it reject, so an
	 * answer that hid the banner shows it again. The next command asks for
	 * the engine again.
	 */
	fail: (error: unknown) => void;
	/**
	 * Take a choice recorded without the engine: reads return `snapshot`
	 * and listeners hear it, then `events` go to the stand-in's event
	 * listeners. The snapshot already committed is not announced again.
	 * Refused (`false`) once the engine has attached.
	 */
	commit: (
		snapshot: ConsentSnapshot,
		events: readonly KernelEvent[]
	) => boolean;
	/**
	 * Replace the snapshot reads return until the engine attaches, as when a
	 * client-rendered root learns the policy from a prefetched `/init`.
	 * Ignored once attached.
	 */
	setSnapshot: (snapshot: ConsentSnapshot) => void;
	/** Setter calls waiting for the engine, in order. */
	readonly pending: () => readonly { name: string; args: unknown[] }[];
	/** Stops forwarding the engine's notifications. */
	dispose: () => void;
}

/** Commands that answer the prompt: the banner hides when one is called. */
const ANSWERS: ReadonlySet<string> = new Set(['save', 'dismissNotice']);

/**
 * Setters that queue without loading the engine: registrations a module
 * makes when it mounts, such as a script loader's categories. A visitor
 * the engine waits for has granted nothing optional, so they change
 * nothing until it loads.
 */
const QUIET_SETTERS: ReadonlySet<string> = new Set([
	'registerConsentCategories',
	'vendors',
]);

type AnyFunction = (...args: unknown[]) => unknown;

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

/** The same frozen copy of `snapshot` with `activeUI`, while the input holds. */
const withActiveUI = function withActiveUI() {
	let from: ConsentSnapshot | undefined;
	let copy: ConsentSnapshot | undefined;
	return (snapshot: ConsentSnapshot, activeUI: KernelActiveUI) => {
		if (from !== snapshot || copy?.activeUI !== activeUI) {
			from = snapshot;
			copy = Object.freeze({ ...snapshot, activeUI });
		}
		return copy;
	};
};

/**
 * Creates the stand-in kernel.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One kernel and its engine handover.
export const createStandInKernel = function createStandInKernel(
	options: StandInKernelOptions
): StandInKernelHandle {
	const serverSnapshot = options.serverSnapshot ?? options.snapshot;
	let base = options.snapshot;
	let engine: ConsentKernel | null = null;
	let resolveReady: () => void = () => undefined;
	const ready = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});
	const listeners = new Set<(snapshot: ConsentSnapshot) => void>();
	/** Commands waiting for the engine, settled by `attach` or `fail`. */
	const waiting = new Set<{
		resolve: () => void;
		reject: (error: unknown) => void;
	}>();
	const settleWaiting = (error?: unknown): void => {
		const settled = [...waiting];
		waiting.clear();
		for (const waiter of settled) {
			if (error === undefined) {
				waiter.resolve();
			} else {
				waiter.reject(error);
			}
		}
	};
	const queued: ((kernel: ConsentKernel) => void)[] = [];
	const pending: { name: string; args: unknown[] }[] = [];
	const eventListeners = new Set<{
		type: string;
		listener: (event: KernelEvent) => void;
	}>();
	let committed: ConsentSnapshot | null = null;
	// A surface shown before the engine, over the snapshot reads return.
	// The same object for the same input, as `useSyncExternalStore` compares.
	let shown: KernelActiveUI | undefined;
	const showing = withActiveUI();
	const withShown = (snapshot: ConsentSnapshot): ConsentSnapshot =>
		shown === undefined || snapshot.activeUI === shown
			? snapshot
			: showing(snapshot, shown);
	let unsubscribeEngine: (() => void) | undefined;
	// Answers called before the engine attached, still running. While any
	// is, a snapshot that still shows the banner reads as dismissed: the
	// tap hid it, and the engine has not applied the choice yet.
	let answering = 0;
	const dismissing = withActiveUI();
	const dismissed = (snapshot: ConsentSnapshot): ConsentSnapshot =>
		answering === 0 || snapshot.activeUI !== 'banner'
			? snapshot
			: dismissing(snapshot, 'none');
	const beforeEngine = (): ConsentSnapshot => withShown(committed ?? base);
	const read = (): ConsentSnapshot =>
		dismissed(engine ? engine.getSnapshot() : beforeEngine());
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

	const later = async function later<Result>(
		run: (attached: ConsentKernel) => Result
	): Promise<Awaited<Result>> {
		if (!engine) {
			const attached = new Promise<void>((resolve, reject) => {
				waiting.add({ reject, resolve });
			});
			options.requestEngine();
			await attached;
		}
		return (await run(engine as ConsentKernel)) as Awaited<Result>;
	};

	const set = functionTable<ConsentKernel['set']>((name) => (...args) => {
		const call = (kernel: ConsentKernel) =>
			(kernel.set as unknown as Record<string, AnyFunction>)[name]?.(...args);
		if (engine) {
			return call(engine);
		}
		if (name === 'activeUI' && options.localSurfaces !== false) {
			shown = args[0] as KernelActiveUI;
			notify();
			options.onSurface?.(read().activeUI);
			return undefined;
		}
		queued.push(call);
		pending.push({ args, name });
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
				return call(engine, args);
			}
			const onEngine = () => later((attached) => call(attached, args));
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
						off = engine?.events.on(type, listener);
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
		getServerSnapshot: () => serverSnapshot,
		getSnapshot: read,
		refresh: beforeEngine,
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
			// The server snapshot stays the one the server rendered with.
			const name = key as keyof ConsentKernel;
			if (
				name === 'subscribe' ||
				name === 'getServerSnapshot' ||
				name === 'getSnapshot' ||
				name === 'commands'
			) {
				return target[name];
			}
			return (engine ?? target)[name];
		},
	});

	return {
		attach(next) {
			if (engine === next) {
				return;
			}
			const first = !engine;
			engine = next;
			unsubscribeEngine?.();
			unsubscribeEngine = next.subscribe(notify);
			if (first) {
				eventListeners.clear();
				pending.length = 0;
				for (const call of queued.splice(0)) {
					call(next);
				}
				if (shown !== undefined) {
					if (next.getSnapshot().activeUI !== shown) {
						next.set.activeUI(shown);
					}
					shown = undefined;
				}
				resolveReady();
				settleWaiting();
			}
			notify();
		},
		attached: () => engine !== null,
		commit(snapshot, events) {
			if (engine) {
				return false;
			}
			if (snapshot !== committed) {
				committed = snapshot;
				// The commit's snapshot carries the surface a choice leaves.
				shown = undefined;
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
		dispose() {
			unsubscribeEngine?.();
			listeners.clear();
			if (!engine) {
				settleWaiting(new Error('The consent runtime was disposed.'));
			}
		},
		engine: () => engine ?? undefined,
		fail(error) {
			if (!engine) {
				settleWaiting(error ?? new Error('The consent engine failed to load.'));
			}
		},
		kernel,
		pending: () => pending,
		ready,
		setSnapshot(next) {
			if (!engine && next !== base) {
				base = next;
				notify();
			}
		},
	};
};
