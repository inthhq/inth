/**
 * Framework-agnostic headless IAB logic.
 *
 * Pure functions for IAB state derivation — no React, Svelte, or Vue.
 * Each framework package wraps these in its own reactivity system.
 *
 * @packageDocumentation
 */

export {
	IAB_BANNER_MAX_DISPLAY_ITEMS,
	resolveIABBannerSummary,
} from '@inth/sdk-core/iab-support';
export type { ResolveIABBannerSummaryOptions } from '@inth/sdk-core/iab-support';
export {
	type IABBannerCopy,
	resolveIABBannerCopy,
} from '@inth/sdk-core/iab-support';
export {
	applyPublisherRestrictionsToGVL,
	type IABLegitimateInterestState,
	introducedLegitimateInterest,
	type IntroducedLegitimateInterest,
	isLegitimateInterestAllowed,
} from '@inth/sdk-core/iab-support';
export { permittedLegitimateInterestPurposes } from '@inth/sdk-schema/types';
export {
	type HeadlessIABDialogDisplayModel,
	type HeadlessIABDisplayConsentRow,
	type HeadlessIABDisplayRow,
	type HeadlessIABDisplayRowKind,
	type HeadlessIABDisplayStackRow,
	type HeadlessIABDisplayToggle,
	countIABPartners,
	iabDisplayTestId,
	resolveIABDialogDisplayModel,
} from './headless/display-model';
export {
	formatVendorMaxAge,
	mapCustomVendor,
	mapGvlVendor,
	type ProcessedFeature,
	type ProcessedGVLData,
	type ProcessedPurpose,
	type ProcessedSpecialFeature,
	type ProcessedStack,
	type ProcessedVendor,
	processGVLForDialog,
	type VendorMaxAgeCopy,
} from './headless/dialog-data';
export {
	type IABVendorUrls,
	resolveIABSafeUrl,
	resolveIABVendorUrls,
} from './headless/vendor-urls';
export type {
	HeadlessIABBannerAction,
	HeadlessIABBannerState,
	HeadlessIABDialogAction,
	HeadlessIABDialogData,
	HeadlessIABDialogState,
	HeadlessIABPreferenceTab,
	HeadlessIABProcessedFeature,
	HeadlessIABProcessedPurpose,
	HeadlessIABProcessedSpecialFeature,
	HeadlessIABProcessedStack,
	HeadlessIABProcessedVendor,
	HeadlessIABStateInput,
	HeadlessIABVendorId,
} from './headless/types';
