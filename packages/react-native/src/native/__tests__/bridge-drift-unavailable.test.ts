/**
 * A runtime that cannot load the development-only drift checker, such as Jest
 * without `--experimental-vm-modules`, rejects the dynamic import. The report
 * must swallow that, or the unhandled rejection fails every test that creates
 * a consent client.
 */

import { expect, test, vi } from 'vite-plus/test';

import { reportBridgeDrift } from '../client';

test('a drift checker that cannot load is skipped, not a rejection', async () => {
	const refused = Promise.reject(
		new TypeError(
			'A dynamic import callback was invoked without --experimental-vm-modules'
		)
	);

	await expect(
		reportBridgeDrift(refused, 'bootstrap', {})
	).resolves.toBeUndefined();
});

test('a drift checker that breaks for another reason warns once', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	try {
		const broken = () => Promise.reject(new SyntaxError('Unexpected token'));

		await reportBridgeDrift(broken(), 'bootstrap', {});
		await reportBridgeDrift(broken(), 'snapshot', {});

		expect(warn).toHaveBeenCalledTimes(1);
	} finally {
		warn.mockRestore();
	}
});
