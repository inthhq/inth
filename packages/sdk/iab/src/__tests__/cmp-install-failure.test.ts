/** @vitest-environment jsdom */
import { createConsentKernel } from '@inth/sdk-core';
import type { PingData } from '@inth/sdk-core';
import { afterEach, expect, test } from 'vitest';

import { createIAB } from '../index';
import { completeGVL } from './fixtures/gvl-sample';

const disposers: (() => void)[] = [];
afterEach(() => {
	for (const dispose of disposers.splice(0)) {
		dispose();
	}
});

test('a CMP API install failure is reported, and a later call retries it', async () => {
	const kernel = createConsentKernel({
		initialIab: { cmpId: 28, enabled: true, gvl: completeGVL },
	});
	disposers.push(kernel.dispose);
	const handle = createIAB({ cmpId: 28, gvl: completeGVL, kernel });
	disposers.push(handle.dispose);
	// The stub queues this call, and the CMP API replays it while it installs.
	window.__tcfapi?.('getVendorList', 2, () => {
		throw new Error('vendor callback failed');
	});

	await expect(handle.whenReady()).rejects.toThrow('vendor callback failed');
	expect(kernel.getSnapshot().iab?.gvl).toBe(completeGVL);

	await expect(handle.whenReady()).resolves.toBeUndefined();
	let status: string | undefined;
	window.__tcfapi?.('ping', 2, (ping: PingData) => {
		status = ping.cmpStatus;
	});
	expect(status).toBe('loaded');
});
