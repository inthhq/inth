/**
 * `dist/inth.adapter-databuddy.js`: the Databuddy session replay adapter, for a manifest
 * the Inth server sends that names it. The script-tag engines load it only
 * for a list with such a manifest, and install it into `inth.manifests.js`
 * or `inth.manifests3.js`. See `../init/manifests-import.ts`.
 */

import { databuddyAdapter } from '@inth/sdk-core/manifest-runtime/adapters/databuddy';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[ADAPTER_KEYS.databuddy] = {
	adapter: databuddyAdapter,
	version,
};
