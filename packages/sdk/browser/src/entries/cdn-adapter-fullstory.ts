/**
 * `dist/inth.adapter-fullstory.js`: the FullStory adapter, for a manifest
 * the Inth server sends that names it. The script-tag engines load it only
 * for a list with such a manifest, and install it into `inth.manifests.js`
 * or `inth.manifests3.js`. See `../init/manifests-import.ts`.
 */

import { fullStoryAdapter } from '@inth/sdk-core/manifest-runtime/adapters/fullstory';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[ADAPTER_KEYS.fullstory] = {
	adapter: fullStoryAdapter,
	version,
};
