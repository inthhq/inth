/**
 * `@inth/sdk/manifest-runtime`
 *
 * Runs vendor manifests: serializable `ResolvedManifest` data, as
 * `@inth/integrations` builds it and the Inth server sends it, turned into a
 * `Script` the script loader mounts.
 */
export { mapConsentState } from './consent-mapping';
export { MANIFEST_RUNTIME_LEVEL } from './level';
export { parseResolvedManifest } from './parse';
export type { ParsedManifest } from './parse';
export {
	createManifestScriptFactory,
	isRecord,
	resolvedManifestToScript,
} from './runtime';
export type { InlineStepsStart } from './runtime';
export * from './types';
export { ALL_DENIED, signalConsents } from './vendor-consent';
