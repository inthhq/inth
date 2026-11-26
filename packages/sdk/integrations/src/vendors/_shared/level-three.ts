import type { Script } from '@inth/sdk/engine';
import { installLevelThree } from '@inth/sdk/manifest-runtime';
import { levelThreePart } from '@inth/sdk/manifest-runtime/level-three';

import { resolvedManifestToScript } from '../../engine/runtime';
import type { ResolvedManifest } from '../../types';

/**
 * The script for a manifest that uses level 3 steps (`if`, `setFlag`,
 * `listen`, `callGlobal.then`).
 *
 * The runtime runs those steps only once its level 3 part is installed. The
 * remote loader downloads the part when a manifest requires level 3; an npm
 * helper bundles it, so only the vendors that need it carry it.
 */
export const levelThreeScript = function levelThreeScript(
	manifest: ResolvedManifest
): Script {
	installLevelThree(levelThreePart);
	return resolvedManifestToScript(manifest);
};
