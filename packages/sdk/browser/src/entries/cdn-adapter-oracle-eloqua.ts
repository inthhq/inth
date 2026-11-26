/**
 * `dist/inth.adapter-oracle-eloqua.js`: the Oracle Eloqua adapter, for a
 * manifest the Inth server sends that names it. It keeps one consent request
 * in flight and tracks a page view after the opt-in response. The script-tag
 * engines load it only for a list with such a manifest. See
 * `../init/manifests-import.ts`.
 */

import { eloquaAdapter } from '@inth/sdk-core/manifest-runtime/adapters/oracle-eloqua';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[
	ADAPTER_KEYS['oracle-eloqua']
] = {
	adapter: eloquaAdapter,
	version,
};
