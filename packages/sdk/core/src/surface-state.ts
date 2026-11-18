/**
 * `@inth/sdk/surface-state` — what a consent surface reads from a
 * snapshot before the consent engine has loaded: category names and
 * metadata, consent conditions, vendor listings, the IAB requirement, the
 * prompt presentation, experiment arms, the GPC signal and the pending
 * snapshot.
 *
 * The root entry re-exports these too, next to the kernel. A bundler that
 * splits code by file (esbuild, in Angular's application builder) puts
 * every module a first-load import reaches beside it in the first load,
 * even when only a lazy chunk uses that module. Importing these from here
 * keeps the kernel, the transports and the policy code out of a page that
 * loads its engine later. Each module re-exported here imports nothing the
 * engine alone needs; keep it that way.
 *
 * @packageDocumentation
 */

export { allConsentNames, consentTypes } from './consent/consent-types';
export type { AllConsentNames, ConsentType } from './consent/consent-types';
export { has } from './libs/has';
export type { HasCondition } from './libs/has';
export { deniedVendorIds } from './modules/has';
export { vendorsListedUnder } from './libs/vendor-listing';
export { IABUnavailableError, policyNeedsIAB } from './libs/iab-unavailable';
export { resolveConsentPresentation } from './libs/policy-actions';
export {
	resolveActionLabels,
	resolveCategoryTitle,
	resolveIABCopy,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
	resolveSurfaceTranslations,
	resolveTriggerLabels,
	resolveVendorListCopy,
} from './libs/consent-copy';
export type { ResolvedIABCopy } from './libs/consent-copy';
export {
	applyExperimentAssignment,
	applyExperimentTheme,
} from './libs/experiment';
export { hasGlobalPrivacyControlSignal } from './libs/global-privacy-control';
export { defaultTranslationConfig } from './translations/defaults';
export { createLazyIABFactory, iabSurfaceActions } from './runtime/lazy-iab';
export type { IABSurfaceActions } from './runtime/lazy-iab';
export { pendingBootSnapshot } from './runtime/pending-snapshot';
export type { PendingSnapshotOptions } from './runtime/pending-snapshot';
