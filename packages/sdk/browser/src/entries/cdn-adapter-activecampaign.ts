/**
 * `dist/inth.adapter-activecampaign.js`: the ActiveCampaign adapter, for a
 * manifest the Inth server sends that names it. It checks that no other
 * tracker owns the page before it sets the tag's `src`. The script-tag
 * engines load it only for a list with such a manifest. See
 * `../init/manifests-import.ts`.
 */

import { activeCampaignAdapter } from '@inth/sdk-core/manifest-runtime/adapters/activecampaign';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

(window as unknown as Record<string, AdapterFile>)[
	ADAPTER_KEYS.activecampaign
] = {
	adapter: activeCampaignAdapter,
	version,
};
