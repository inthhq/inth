/**
 * `dist/inth.adapter-lucky-orange.js`: the Lucky Orange adapter, for a manifest
 * the Inth server sends that names it. The script-tag engines load it only
 * for a list with such a manifest, and install it into `inth.manifests.js`
 * or `inth.manifests3.js`. See `../init/manifests-import.ts`.
 */

import { luckyOrangeAdapter } from '@inth/sdk-core/manifest-runtime/adapters/lucky-orange';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[
	ADAPTER_KEYS['lucky-orange']
] = {
	adapter: luckyOrangeAdapter,
	version,
};
