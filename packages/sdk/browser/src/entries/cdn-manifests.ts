/**
 * `dist/inth.manifests.js`: the manifest runtime that runs the integrations
 * the Inth server sends with `remoteScripts` on, up to manifest level 2.
 * The init script (`inth.js`) loads it when a list with entries arrives,
 * and each script-tag engine loads it before it mounts them; for a list
 * with a level 3 manifest they load `inth.manifests3.js` instead. See
 * `../init/manifests-file.ts`.
 */

import {
	parseResolvedManifest,
	resolvedManifestToScript,
} from '@inth/sdk-core/manifest-runtime';

import { MANIFESTS_KEY } from '../init/manifests-file';
import type { ManifestsFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, ManifestsFile>)[MANIFESTS_KEY] = {
	parseResolvedManifest,
	resolvedManifestToScript,
	version,
};
