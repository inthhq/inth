/**
 * Stand-in for `@inth/sdk/generated` in tests (aliased in
 * `vitest.config.ts`): what a `consentManifest()` build would serve. Both
 * exports are live bindings that {@link setGenerated} changes.
 */
import type { ConsentManifest } from '@inth/sdk/schema/types';

// oxlint-disable-next-line import/no-mutable-exports -- Live bindings stand in for a build's values.
export let projectUrl: string | undefined;
// oxlint-disable-next-line import/no-mutable-exports -- See above.
export let snapshot: ConsentManifest | undefined;

/** Sets what the build appears to have fetched. */
export const setGenerated = (module: {
	projectUrl?: string;
	snapshot?: ConsentManifest;
}): void => {
	({ projectUrl, snapshot } = module);
};
