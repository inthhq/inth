/**
 * `dist/inth.adapter-ada.js`: the Ada adapter, for a manifest the Inth
 * server sends that names it. The script-tag engines load it only for a
 * list with such a manifest. See `../init/manifests-import.ts`.
 */

import { adaAdapter } from '@inth/sdk-core/manifest-runtime/adapters/ada';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[ADAPTER_KEYS.ada] = {
	adapter: adaAdapter,
	version,
};
