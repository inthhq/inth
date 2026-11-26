/**
 * `dist/inth.adapter-hubspot.js`: the HubSpot adapter, for a manifest the
 * Inth server sends that names it. It checks for another HubSpot loader
 * before it inserts its own, forwards consent and runs the chat widget. The
 * script-tag engines load it only for a list with such a manifest. See
 * `../init/manifests-import.ts`.
 */

import { hubspotAdapter } from '@inth/sdk-core/manifest-runtime/adapters/hubspot';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[ADAPTER_KEYS.hubspot] = {
	adapter: hubspotAdapter,
	version,
};
