/** @vitest-environment jsdom */
import { createConsentRuntime } from '@c15t/core/runtime';
import { testing } from '@c15t/core/testing';
import { afterEach, expect, test, vi } from 'vitest';

import type { GPPPingData } from '../gpp';

const ping = (): GPPPingData | undefined => {
	let data: GPPPingData | undefined;
	window.__gpp?.('ping', (result) => {
		data = result as GPPPingData;
	});
	return data;
};

afterEach(() => {
	delete window.__gpp;
});

test('the runtime gpp option mounts __gpp from @c15t/iab/gpp and removes it on dispose', async () => {
	const runtime = createConsentRuntime({
		gpp: { usFallback: 'none' },
		loadGPP: () => import('../gpp'),
		// The recommended pack's US privacy states rule answers California.
		overrides: { country: 'US', region: 'CA' },
		persistence: false,
		mode: testing(),
	});
	runtime.start();

	await vi.waitFor(() =>
		expect(ping()).toMatchObject({
			applicableSections: [8],
			cmpStatus: 'loaded',
			signalStatus: 'ready',
			supportedAPIs: expect.not.arrayContaining(['7:usnat']),
		})
	);

	runtime.dispose();
	expect(window.__gpp).toBeUndefined();
});
