/**
 * `dist/inth.manifests3.js`: the manifest runtime of `inth.manifests.js`
 * with its level 3 part, which runs `if`, `setFlag`, `listen` and
 * `callGlobal.then`. The init script and the script-tag engines load it in
 * place of `inth.manifests.js` when a manifest the Inth server sent
 * requires level 3, so a page loads one runtime file, and a page without
 * such a manifest never downloads the part. See `../init/manifests-file.ts`.
 */

import {
	installLevelThree,
	parseResolvedManifest,
	resolvedManifestToScript,
} from '@inth/sdk-core/manifest-runtime';
import { levelThreePart } from '@inth/sdk-core/manifest-runtime/level-three';

import { LEVEL_THREE_KEY } from '../init/manifests-file';
import type { ManifestsFile } from '../init/manifests-file';
import { version } from '../version';

installLevelThree(levelThreePart);

(window as unknown as Record<string, ManifestsFile>)[LEVEL_THREE_KEY] = {
	parseResolvedManifest,
	resolvedManifestToScript,
	version,
};
