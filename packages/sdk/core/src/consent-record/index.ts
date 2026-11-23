/**
 * `@inth/sdk/consent-record`
 *
 * The consent-record model the kernel runs on: one latest decision per
 * optional category, a separate local notice dismissal, a validated
 * policy projection and the pure evaluator that turns them into effective
 * permissions, restrictions, the remaining prompt requirement and the next
 * deadline.
 *
 * Everything here is pure. Nothing reads storage, the clock, the network
 * or the DOM; callers pass `now`.
 */

export {
	evaluateConsentRecord,
	OPT_OUT_REPROMPT_WAIT_MS,
	optInPromptAllowedAt,
} from './evaluate';
export { optOutDenyCategories, saveWouldLiftOptOut } from './opt-out-rules.model';
export type { SaveOptOutLiftSnapshot } from './opt-out-rules.model';
export type { ConsentEvaluationInput } from './evaluate';
export {
	LEGACY_OPT_OUT_CATEGORIES,
	optOutDecidingCategory,
	policyOptOutCategories,
} from './types';
export {
	canonicalizeCategories,
	createEvaluationPolicy,
} from './evaluation-policy.model';
export type { EvaluationPolicyInput } from './evaluation-policy.model';
export { normalizeLegacyConsentRecord } from './normalize-legacy-consent-record';
export type {
	LegacyRecordEncoding,
	NormalizeLegacyOptions,
	NormalizeLegacyResult,
} from './normalize-legacy-consent-record';
export { recordCategoryPatch } from './consent-record.model';
export type { RecordPatchOptions, RecordPatchResult } from './consent-record.model';
export { CONSENT_CATEGORIES, OPTIONAL_CONSENT_CATEGORIES } from './types';
export type {
	CategoryDecision,
	CategoryEvaluation,
	ChoiceBasis,
	CONSENT_CATEGORY,
	ConsentCategory,
	ConsentEvaluation,
	ConsentSubject,
	DecisionAuthority,
	EvaluationPolicy,
	ExplicitChoice,
	NoticeDismissal,
	OptionalConsentCategory,
	PermissionSource,
	PolicyModel,
	PolicyPrompt,
	PromptReason,
	PromptRequirement,
	RecordValidity,
	RestrictionReason,
} from './types';
export type {
	OptOutHolder,
	OptOutMethod,
	OptOutRecord,
	OptOutRight,
} from '@inth/sdk-schema/types';
export {
	isOptionalConsentCategory,
	validateExplicitChoice,
	validateNoticeDismissal,
	validateOptOutRecord,
} from './consent-record-validation.model';
export type { RecordIssue, ValidationResult } from './consent-record-validation.model';
