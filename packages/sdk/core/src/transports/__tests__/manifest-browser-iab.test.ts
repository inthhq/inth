import type { ConsentManifest, InitOutput } from '@inth/sdk-schema/types';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { clearGvlCache } from '../gvl-cache';
import { attachVendorList } from '../manifest-browser-iab';

afterEach(() => {
	clearGvlCache();
});

test('asks for the vendor list in the lower-case primary language', async () => {
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockResolvedValue(Response.json({ vendorListVersion: 1 }));
	const output = {
		policyResolution: { policy: { model: 'iab' }, status: 'matched' },
		translations: { language: 'DE-AT' },
	} as unknown as InitOutput;
	const manifest = {
		iab: { gvl: { url: 'https://gvl.test/list' } },
	} as unknown as ConsentManifest;

	await attachVendorList(output, manifest, fetch);

	expect(fetch).toHaveBeenCalledWith(
		'https://gvl.test/list',
		expect.objectContaining({ headers: { 'accept-language': 'de' } })
	);
});
