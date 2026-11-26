/**
 * `dist/inth.adapter-default-com.js`: the Default adapter, for a manifest the
 * Inth server sends that names it. The script-tag engines load it only for
 * a list with such a manifest, and install it into `inth.manifests.js` or
 * `inth.manifests3.js`. See `../init/manifests-import.ts`.
 */

import { defaultComAdapter } from '@inth/sdk-core/manifest-runtime/adapters/default-com';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[
	ADAPTER_KEYS['default-com']
] = {
	adapter: defaultComAdapter,
	version,
};
