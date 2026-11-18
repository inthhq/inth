/**
 * The kernel `ConsentRoot` provides in the browser before the consent
 * engine has loaded.
 *
 * Reads come from the snapshot the server rendered with. Setters queue and
 * replay on the engine's kernel once it attaches; commands ask for the
 * engine and resolve with its result. Once attached, every property read
 * goes to the engine's kernel, and subscribers hear about the switch. The
 * object stays the same throughout, so a component or script loader that
 * took it at setup keeps working.
 *
 * The same stand-in as `@inth/vue`'s Nuxt module (`runtime/deferred/
 * stand-in.ts`), which is modelled on `@inth/react`'s.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	ConsentKernel,
	ConsentSnapshot,
	KernelActiveUI,
	KernelEvent,
} from '@inth/sdk/engine';

/** @internal */
export interface StandInOptions {
	/** The snapshot the server rendered the page from. */
	snapshot: ConsentSnapshot;
	/** Starts loading the engine, if it is not loading yet. */
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
}

/** @internal */
export interface StandInHandle {
	/** The kernel to provide. Stable for the root's lifetime. */
	readonly kernel: ConsentKernel;
	/** Resolves when the engine first attaches. */
	readonly ready: Promise<void>;
	/** Whether the engine has attached. */
	readonly attached: () => boolean;
	/** The engine's kernel, once attached. */
	readonly engine: () => ConsentKernel | undefined;
	/** Route the kernel to the engine's. */
	attach: (engine: ConsentKernel) => void;
	/**
	 * Take a choice recorded without the engine: reads return `snapshot`
	 * and listeners hear it, then `events` go to the stand-in's event
	 * listeners. Refused (`false`) once the engine has attached.
	 */
	commit: (
		snapshot: ConsentSnapshot,
		events: readonly KernelEvent[]
	) => boolean;
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

/**
 * Creates the stand-in kernel.
 *
 * `set.activeUI` before the engine shows the surface at once, without
 * loading the engine: `ConsentDialog` renders against the stand-in. The engine takes the surface over when it attaches.
 *
 * @param options - The server snapshot and the engine trigger.
 * @returns The handle the root provides and attaches the engine to.
 * @internal
 */
export const createStandInKernel = function createStandInKernel(
	options: StandInOptions
): StandInHandle {
	let engine: ConsentKernel | null = null;
	let resolveReady: () => void = () => undefined;
	const ready = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});
	const listeners = new Set<(snapshot: ConsentSnapshot) => void>();
	const queued: ((kernel: ConsentKernel) => void)[] = [];
	const pending: { name: string; args: unknown[] }[] = [];
	const eventListeners = new Set<{
		type: string;
		listener: (event: KernelEvent) => void;
	}>();
	let committed: ConsentSnapshot | null = null;
	// A surface shown before the engine, over the snapshot reads return.
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
	let unsubscribeEngine: (() => void) | undefined;
	// Answers called before the engine attached, still running. While any
	// is, a snapshot that still shows the banner reads as dismissed.
	let answering = 0;
	let dismissedFrom: ConsentSnapshot | undefined;
	let dismissedSnapshot: ConsentSnapshot | undefined;
	const dismissed = (snapshot: ConsentSnapshot): ConsentSnapshot => {
		if (answering === 0 || snapshot.activeUI !== 'banner') {
			return snapshot;
		}
		if (dismissedFrom !== snapshot) {
			dismissedFrom = snapshot;
			dismissedSnapshot = Object.freeze({ ...snapshot, activeUI: 'none' });
		}
		return dismissedSnapshot as ConsentSnapshot;
	};
	const read = (): ConsentSnapshot =>
		dismissed(
			engine ? engine.getSnapshot() : withShown(committed ?? options.snapshot)
		);
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

	const later = function later<Result>(
		run: (attached: ConsentKernel) => Result
	): Promise<Awaited<Result>> {
		options.requestEngine();
		// oxlint-disable-next-line promise/prefer-await-to-then -- Runs after `attach`, which resolves `ready`.
		return ready.then(() => run(engine as ConsentKernel)) as Promise<
			Awaited<Result>
		>;
	};

	const set = functionTable<ConsentKernel['set']>((name) => (...args) => {
		const call = (kernel: ConsentKernel) =>
			(kernel.set as unknown as Record<string, AnyFunction>)[name]?.(...args);
		if (engine) {
			return call(engine);
		}
		if (name === 'activeUI') {
			shown = args[0] as KernelActiveUI;
			notify();
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
		getServerSnapshot: () => options.snapshot,
		getSnapshot: read,
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
			// notifications. The server snapshot stays the one the server
			// rendered with: a surface that hydrates late must match that HTML.
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
			if (engine) {
				return;
			}
			engine = next;
			unsubscribeEngine = next.subscribe(notify);
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
			notify();
		},
		attached: () => engine !== null,
		commit(snapshot, events) {
			if (engine) {
				return false;
			}
			committed = snapshot;
			// The commit's snapshot carries the surface a choice leaves.
			shown = undefined;
			notify();
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
		},
		engine: () => engine ?? undefined,
		kernel,
		pending: () => pending,
		ready,
	};
};

/**
 * Whether setters queued for the engine leave the snapshot as a commit
 * reads it: only category registrations the snapshot already holds.
 *
 * @param handle - The stand-in.
 * @returns `true` when a commit may read the stand-in's snapshot.
 * @internal
 */
export const pendingIsInert = function pendingIsInert(
	handle: Pick<StandInHandle, 'kernel' | 'pending'>
): boolean {
	const categories = handle.kernel.getSnapshot().consentCategories;
	return handle
		.pending()
		.every(
			({ args, name }) =>
				name === 'registerConsentCategories' &&
				Array.isArray(args[0]) &&
				(args[0] as string[]).every((category) =>
					categories?.includes(category as never)
				)
		);
};
