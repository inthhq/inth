import type { ConsentRuntimeIABFactory } from '@inth/sdk/runtime';
import type { ConsentRuntimeModules } from '@inth/sdk/runtime/provider';

/**
 * What a page needs to run the IAB CMP: a lazy `createIAB` (from
 * `createLazyIABFactory`), its readiness signal, and the runtime mount.
 *
 * @internal
 */
export interface PageIAB {
	/** The `createIAB` the runtime calls synchronously. */
	create: ConsentRuntimeIABFactory;
	/** Resolves once every pending `@inth/sdk/iab` load has settled. */
	whenReady: () => Promise<void>;
	/** `mountRuntimeIAB` from `@inth/sdk/runtime`. */
	mount: NonNullable<ConsentRuntimeModules['mountIAB']>;
}

/** Set by the engine module of a site that sets `iab`; `null` everywhere else. */
let pageIAB: PageIAB | null = null;

/**
 * Wire the IAB CMP into the page runtime.
 *
 * The integration's engine module calls this only when the site sets `iab`,
 * so a site without IAB ships neither the mount nor the lazy factory, and
 * never fetches `@inth/sdk/iab`. Call before `boot()`.
 *
 * @param iab - The lazy factory and the mount.
 * @internal
 */
export const registerIAB = function registerIAB(iab: PageIAB): void {
	pageIAB = iab;
};

/**
 * The IAB wiring the engine module registered, or `null`.
 *
 * @internal
 */
export const registeredIAB = function registeredIAB(): PageIAB | null {
	return pageIAB;
};
