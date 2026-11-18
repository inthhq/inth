/**
 * `@inth/sdk/iab-support` — what `@inth/sdk/iab` and the IAB surfaces need
 * from core: the banner summary, the vendor list after publisher
 * restrictions, the IAB controls registry and the protocol parameters of
 * the GVL request. The restriction helpers live here, not in
 * `@inth/sdk/iab`, so DevTools in a non-IAB bundle can use them.
 *
 * The root entry re-exports the summary, the registry and the protocol
 * parameters too. Importing them from here keeps a
 * lazily loaded IAB chunk from using the root entry, which a bundler that
 * splits by file (esbuild) would then treat as needed and load, with the
 * kernel it re-exports, beside any first-load module that imports the root
 * entry for something else.
 *
 * @packageDocumentation
 */

export {
	applyPublisherRestrictionsToGVL,
	type IABLegitimateInterestState,
	introducedLegitimateInterest,
	type IntroducedLegitimateInterest,
	isLegitimateInterestAllowed,
} from './libs/effective-vendor-list';
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
export { inthProtocolParams } from './transports/version-header';
