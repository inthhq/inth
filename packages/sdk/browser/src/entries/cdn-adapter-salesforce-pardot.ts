/**
 * `dist/inth.adapter-salesforce-pardot.js`: the Salesforce Pardot adapter,
 * for a manifest the Inth server sends that names it. It grants tracking
 * once per consent cycle after pdt.js loads, for consent mode. The script-
 * tag engines load it only for a list with such a manifest. See
 * `../init/manifests-import.ts`.
 */

import { pardotAdapter } from '@inth/sdk-core/manifest-runtime/adapters/salesforce-pardot';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[
	ADAPTER_KEYS['salesforce-pardot']
] = {
	adapter: pardotAdapter,
	version,
};
