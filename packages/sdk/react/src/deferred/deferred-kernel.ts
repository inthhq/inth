/**
 * The kernel a deferred root puts in context before the consent engine
 * has loaded.
 *
 * The kernel is core's stand-in (`createStandInKernel`); this adds the
 * services and streamed prefetch a React root puts in context beside it.
 * The objects stay the same throughout, so no context value changes and
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
} from '@inth/sdk/engine';
import type {
	ConsentRuntime,
	RuntimePrefetch,
	StreamedPrefetch,
} from '@inth/sdk/runtime';
import { createStandInKernel } from '@inth/sdk/runtime/stand-in-kernel';
import type { StandInKernelHandle } from '@inth/sdk/runtime/stand-in-kernel';

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
export interface DeferredKernelHandle extends Omit<
	StandInKernelHandle,
	'attach' | 'dispose' | 'engine'
> {
	readonly services: ProviderServices;
	readonly streamed: StreamedPrefetch | undefined;
	/** Route the kernel to the engine's. Call again when it changes. */
	attach: (engine: DeferredEngine) => void;
}

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
	const standIn = createStandInKernel({
		early: options.early,
		localSurfaces: Boolean(options.localSurfaces),
		requestEngine: options.requestEngine,
		serverSnapshot: options.serverSnapshot,
		snapshot: options.snapshot,
	});
	const { kernel, ready } = standIn;
	let committed: ConsentSnapshot | null = null;
	let resolveCommitted: () => void = () => undefined;
	const choiceCommitted = new Promise<void>((resolve) => {
		resolveCommitted = resolve;
	});

	/** Runs `run` on the engine, loading it first. */
	const later = async (run: (attached: DeferredEngine) => void) => {
		options.requestEngine();
		await ready;
		run(engine as DeferredEngine);
	};

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
		...standIn,
		attach(next) {
			engine = next;
			standIn.attach(next.kernel);
		},
		commit(snapshot, events) {
			const fresh = snapshot !== committed;
			if (!standIn.commit(snapshot, events)) {
				return false;
			}
			if (fresh) {
				committed = snapshot;
				// Loaders waiting for a choice start a task later, so their
				// chunk requests stay out of the tap's task.
				setTimeout(resolveCommitted, 0);
			}
			return true;
		},
		services,
		setSnapshot(next) {
			if (!engine) {
				options.snapshot = next;
			}
			standIn.setSnapshot(next);
		},
		streamed,
	};
};
