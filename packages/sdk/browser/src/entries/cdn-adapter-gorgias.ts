/**
 * `dist/inth.adapter-gorgias.js`: the Gorgias Chat adapter, for a manifest the Inth
 * server sends that names it. The script-tag engines load it only for a
 * list with such a manifest. See `../init/manifests-import.ts`.
 */

import { gorgiasAdapter } from '@inth/sdk-core/manifest-runtime/adapters/gorgias';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[ADAPTER_KEYS.gorgias] = {
	adapter: gorgiasAdapter,
	version,
};
