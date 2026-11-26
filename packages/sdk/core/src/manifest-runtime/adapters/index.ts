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
	'lucky-orange': async () =>
		(await import('./lucky-orange')).luckyOrangeAdapter,
	sentry: async () => (await import('./sentry')).sentryAdapter,
};

/** Imports the adapter module for `id`. */
export const importAdapter = (id: AdapterId): Promise<ManifestAdapter<never>> =>
	ADAPTER_MODULES[id]();
