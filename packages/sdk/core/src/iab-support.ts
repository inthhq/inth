/**
 * `@inth/sdk/iab-support` — what `@inth/sdk/iab` and the IAB surfaces need
 * from core: the banner summary, the IAB controls registry and the
 * protocol parameters of the GVL request.
 *
 * The root entry re-exports these too. Importing them from here keeps a
 * lazily loaded IAB chunk from using the root entry, which a bundler that
 * splits by file (esbuild) would then treat as needed and load, with the
 * kernel it re-exports, beside any first-load module that imports the root
 * entry for something else.
 *
 * @packageDocumentation
 */

export {
	IAB_BANNER_MAX_DISPLAY_ITEMS,
	resolveIABBannerSummary,
} from './libs/iab-banner-summary';
export type { ResolveIABBannerSummaryOptions } from './libs/iab-banner-summary';
export {
	getIABControls,
	registerIABControls,
	subscribeIABControls,
} from './modules/iab-controls';
export type { KernelIABControls } from './modules/iab-controls';
export { inthProtocolParams } from './libs/version-header';
