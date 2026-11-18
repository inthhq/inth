/**
 * Browser-side prefetch utilities for Inth consent init data.
 *
 * These functions let any framework start the `/init` request early
 * (before hydration) so the runtime can consume matching data automatically.
 *
 * @remarks
 * Framework adapters like `@inth/nextjs` provide thin wrappers
 * (e.g. `InthPrefetch`) that use these building blocks with
 * framework-specific script injection.
 */

export {
	buildPrefetchScript,
	getMatchingPrefetchedInitialData,
	primePrefetchedInitialData,
} from './prefetch';
export {
	insertPrefetchScript,
	PREFETCH_SCRIPT_ID,
	prefetchScriptOffset,
} from './placement';
export type { PrefetchOptions } from './types';
