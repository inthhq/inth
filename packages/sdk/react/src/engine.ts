/**
 * `@inth/react/engine` — engine helpers the guides use, such as
 * `defineExperiment`, `validateExperiment` and `webViewConsentSource`, so an
 * app imports them from `@inth/react` instead of installing `@inth/sdk`.
 * They live in their own entry: the package root re-exports their types
 * only, so an app that does not use them keeps their modules out of its
 * first load.
 */
// oxlint-disable-next-line oxc/no-barrel-file -- A public entry that mirrors part of `@inth/sdk/engine`.
export {
	buildPrefetchScript,
	defineExperiment,
	isVendorAllowed,
	vendorsListedUnder,
	webViewConsentSource,
} from '@inth/sdk/engine';
export { validateExperiment } from '@inth/sdk/experiment';
export type {
	CategoryDecision,
	ExperimentArmName,
	ExperimentAssignment,
	PrefetchOptions,
	ResolvedVendor,
	Script,
	ScriptCallbackInfo,
	TCData,
	TCDataOutsideTCF,
	Vendor,
} from '@inth/sdk/engine';
