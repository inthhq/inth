/**
 * The adapter modules this SDK ships, each imported on demand. Pass
 * `importAdapter` to `withAdapters`, so a page downloads an adapter only
 * when a manifest names it.
 */
import type { AdapterId, ManifestAdapter } from '../adapter';

const ADAPTER_MODULES: Record<
	AdapterId,
	() => Promise<ManifestAdapter<never>>
> = {
	databuddy: async () => (await import('./databuddy')).databuddyAdapter,
	fullstory: async () => (await import('./fullstory')).fullStoryAdapter,
	'gainsight-px': async () =>
		(await import('./gainsight-px')).gainsightPxAdapter,
	'lucky-orange': async () =>
		(await import('./lucky-orange')).luckyOrangeAdapter,
	sentry: async () => (await import('./sentry')).sentryAdapter,
};

/** Imports the adapter module for `id`. */
export const importAdapter = (id: AdapterId): Promise<ManifestAdapter<never>> =>
	ADAPTER_MODULES[id]();
