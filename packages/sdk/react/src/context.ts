import type {
	AllConsentNames,
	ConsentKernel,
	ConsentPresentation,
	ConsentSnapshot,
} from '@c15t/core';
import type { ConsentRuntime, StreamedPrefetch } from '@c15t/core/runtime';
import { createContext } from 'react';

/**
 * React context carrying the kernel instance.
 *
 * v3 Provider puts a kernel here; hooks pull it out and subscribe via
 * useSyncExternalStore. No state snapshot lives in context — only the
 * kernel reference. Consumers subscribe to the kernel directly at their
 * render site, so each hook isolates re-renders to exactly its slice.
 */
export const KernelContext = createContext<ConsentKernel | null>(null);
KernelContext.displayName = 'C15tKernelContext';

/** Provider-owned services used by optional integrations. */
export interface ProviderServices {
	clearRecords: () => void;
	getPresentation: () => ConsentPresentation | undefined;
	getConsentCategories: () => readonly AllConsentNames[];
	/** Whether the runtime has started: records hydrated, prefetch adopted. */
	isStarted: () => boolean;
	/**
	 * The runtime the provider renders, owned or borrowed. Under a deferred
	 * root it is `undefined` until the engine attaches; see `ready`.
	 */
	runtime: ConsentRuntime;
	/**
	 * Settles once `runtime` is set, under a deferred root whose engine has
	 * not attached yet. Absent under a provider.
	 *
	 * @internal
	 */
	ready?: Promise<void>;
	/**
	 * Store a language override and load its copy: init runs again on the
	 * provider's own kernel while it is enabled, and a borrowed runtime
	 * reinitializes itself.
	 */
	setLanguage: (code: string) => void;
}
export const ProviderServicesContext = createContext<ProviderServices | null>(
	null
);

/**
 * The provider runtime's streamed `prefetch`, while `prefetch` is a promise.
 * Consent surfaces render inside a boundary that waits for it.
 *
 * @internal
 */
export const StreamedPrefetchContext = createContext<
	StreamedPrefetch | undefined
>(undefined);

/**
 * The snapshot a streamed consent surface was server-rendered from, which
 * its hydration must read in place of the kernel's own server snapshot.
 * `null` everywhere else.
 *
 * @internal
 */
export const HydrationSnapshotContext = createContext<ConsentSnapshot | null>(
	null
);
