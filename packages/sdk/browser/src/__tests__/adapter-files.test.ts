/**
 * @vitest-environment jsdom
 *
 * Each `inth.adapter-<id>.js` entry publishes the adapter with its ID on
 * that ID's global, which is where `loadManifestsFile` reads it.
 */
import { expect, it } from 'vite-plus/test';

import { ADAPTER_KEYS } from '../init/manifests-file';
import type { AdapterFile } from '../init/manifests-file';
import { version } from '../version';

it.each(Object.entries(ADAPTER_KEYS))(
	'inth.adapter-%s.js publishes its adapter on %s',
	async (id, key) => {
		await import(`../entries/cdn-adapter-${id}.ts`);

		const file = (window as unknown as Record<string, AdapterFile>)[key];
		expect(file?.adapter.id).toBe(id);
		expect(file?.version).toBe(version);
	}
);
