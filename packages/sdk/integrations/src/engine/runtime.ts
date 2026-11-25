import { createManifestScriptFactory } from '@inth/sdk/manifest-runtime';

import { inlineStepsStart } from '#inline-start';

export { isRecord } from '@inth/sdk/manifest-runtime';

/**
 * Turns a resolved manifest into a `Script`. In a server render, its
 * `serverStart` inlines the pre-load steps; browser bundles get the
 * `#inline-start` stub and start in the browser only.
 */
export const resolvedManifestToScript =
	createManifestScriptFactory(inlineStepsStart);
