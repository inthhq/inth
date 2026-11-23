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
export { deniedVendorIds } from './modules/vendor-denial';
export { vendorsListedUnder } from './libs/vendor-listing';
export { IABUnavailableError, policyNeedsIAB } from './libs/iab-unavailable-error';
export { resolveConsentPresentation } from './libs/policy-actions';
export { resolvePrivacyChoicesLink } from './libs/resolve-privacy-choices-link';
export type { PrivacyChoicesLinkState } from './libs/resolve-privacy-choices-link';
export {
	PHONE_LAYOUT_MAX_WIDTH,
	PHONE_LAYOUT_QUERY,
	resolveLayout,
} from './libs/consent-layout.model';
export {
	resolveActionLabels,
	resolveBannerAllowedAnnouncement,
	resolveCategoryTitle,
	resolveGpcNote,
	resolveIABCopy,
	resolveNoticeBarDescription,
	resolveOptInConfirmationSentence,
	resolveOptInPromptCopy,
	resolveOptOutBlockHeading,
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceiptSentence,
	resolvePreferenceControlLabels,
	resolvePreferencesRowCopy,
	resolveAdvertisingRowCopy,
	resolvePrivacyChoicesBannerCopy,
	resolvePrivacyChoicesCopy,
	resolvePrivacyChoicesDialogCopy,
	resolvePrivacyChoicesRegime,
	resolvePrivacyChoicesVariant,
	resolvePromptCopy,
	resolveReceiptScope,
	resolveRightsBundle,
	resolveRightsPhrases,
	resolveRightsReceiptCopy,
	resolveSaleAnnouncement,
	resolveSaleRightCopy,
	resolveSwitchAnnouncement,
	resolveSurfaceTranslations,
	resolveTriggerLabels,
	resolveVendorListCopy,
	resolveVendorTableCopy,
	scopePhrase,
} from './libs/consent-copy';
export type {
	OptInPromptCopy,
	OptOutLinkIcon,
	OptOutLinkVariant,
	PreferencesRowCopy,
	PrivacyChoicesBannerCopy,
	PrivacyChoicesDialogCopy,
	PrivacyChoicesPromptVariant,
	PrivacyChoicesSubject,
	ResolvedIABCopy,
	ResolvedOptOutLink,
	RightsBundle,
	RightsPhrases,
	RightsReceiptCopy,
	RightsReceiptInput,
	SaleAnnouncementOutcome,
	SaleRightCopy,
	VendorTableCopy,
} from './libs/consent-copy';
export {
	isOptedOut,
	resolveCategoryOptOutLock,
	resolveOptOut,
	resolveOptOutReceipt,
	resolveOptOutState,
} from './libs/opt-out-state.model';
export type {
	CategoryOptOutLockSnapshot,
	OptOutCheckSnapshot,
	OptOutLocalAct,
	OptOutLock,
	OptOutReceipt,
	OptOutReceiptData,
	OptOutReceiptScope,
	OptOutReceiptSource,
	OptOutState,
	OptOutVia,
	ResolvedOptOutState,
} from './libs/opt-out-state.model';
export { resolveSurfaceEscape } from './surface-session/resolve-surface-escape';
export type {
	SurfaceEscapeInput,
	SurfaceEscapeOutcome,
} from './surface-session/resolve-surface-escape';
export {
	planCategorySwitch,
	planVendorSwitch,
} from './surface-session/category-switch.model';
export type {
	CategorySwitchPlan,
	CategorySwitchState,
} from './surface-session/category-switch.model';
export { resolveRightsReceipt } from './surface-session/resolve-rights-receipt';
export type { RightsReceipt } from './surface-session/resolve-rights-receipt';
export { resolveSaleRight } from './surface-session/surface-rights.model';
export type {
	RightOption,
	RightSource,
	RightsSnapshot,
	SaleRightState,
} from './surface-session/surface-rights.model';
export {
	announcementText,
	MAIN_LAYER,
	MAX_SURFACE_LAYERS,
} from './surface-session/surface-session-state.model';
export type {
	SurfaceAnnouncement,
	SurfaceSessionState,
} from './surface-session/surface-session-state.model';
export {
	applyExperimentAssignment,
	applyExperimentTheme,
} from './libs/experiment-presentation';
export { hasGlobalPrivacyControlSignal } from './libs/read-global-privacy-control';
export { defaultTranslationConfig } from './translations/defaults';
export { createLazyIABFactory, iabSurfaceActions } from './runtime/lazy-iab';
export type { IABSurfaceActions } from './runtime/lazy-iab';
export { pendingBootSnapshot } from './runtime/pending-snapshot';
export type { PendingSnapshotOptions } from './runtime/pending-snapshot';
