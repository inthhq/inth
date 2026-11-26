/**
 * `@inth/sdk/manifest-runtime`
 *
 * Runs vendor manifests: serializable `ResolvedManifest` data, as
 * `@inth/integrations` builds it and the Inth server sends it, turned into a
 * `Script` the script loader mounts.
 */
export { callReachesCode, stepReachesCode } from './call-path';
export { mapConsentState } from './consent-mapping';
export { isDeclarableGlobal, manifestRoots } from './globals';
export {
	CONDITION_LEVELS,
	manifestFeatureLevel,
	MANIFEST_FIELD_LEVELS,
	RUNTIME_VALUE_LEVELS,
	STEP_FIELD_LEVELS,
	STEP_VALUE_LEVELS,
} from './features';
export {
	MANIFEST_RUNTIME_LEVEL,
	requiresLevelThree,
	withLevelThreePart,
} from './level';
export { parseResolvedManifest } from './parse';
export { installLevelThree } from './part';
export type { LevelThreePart } from './part';
export type { ParsedManifest } from './parse';
export {
	createManifestScriptFactory,
	isRecord,
	resolvedManifestToScript,
} from './runtime';
export type { InlineStepsStart } from './runtime';
export * from './types';
export { ALL_DENIED, signalConsents } from './vendor-consent';
