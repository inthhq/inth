/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createOfflineTransport } from '../../transports/offline';
import type { SavePayload } from '../../types';
import { NO_RECORDS_WARNING } from '../no-records-warning';

const savePayload = { subjectId: 'sub_local' } as unknown as SavePayload;

const noRecordsWarnings = function noRecordsWarnings(
	warn: ReturnType<typeof vi.spyOn>
): unknown[][] {
	return warn.mock.calls.filter(([message]) => message === NO_RECORDS_WARNING);
};

describe('the offline transport warning', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		Reflect.deleteProperty(globalThis, Symbol.for('c15t.noRecordsWarned'));
		warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test('warns once per page in development, however many transports run', async () => {
		await createOfflineTransport().save(savePayload);
		await createOfflineTransport().save(savePayload);

		expect(noRecordsWarnings(warn)).toHaveLength(1);
	});

	// A custom transport can resolve policy with it and save elsewhere.
	test('createOfflineTransport() warns on save, not when only its init runs', async () => {
		const transport = createOfflineTransport();
		await transport.init({ overrides: {}, user: null });

		expect(noRecordsWarnings(warn)).toEqual([]);

		await transport.save(savePayload);

		expect(noRecordsWarnings(warn)).toHaveLength(1);
	});

	test('names what is missing without blocking anything', () => {
		expect(NO_RECORDS_WARNING).toContain(
			'c15t keeps no server-side record of consent'
		);
		expect(NO_RECORDS_WARNING).toContain('acknowledgeNoRecords: true');
	});

	test('stays silent with acknowledgeNoRecords', async () => {
		await createOfflineTransport({ acknowledgeNoRecords: true }).save(
			savePayload
		);

		expect(noRecordsWarnings(warn)).toEqual([]);
	});

	test('stays silent in a production build', async () => {
		vi.stubEnv('NODE_ENV', 'production');

		await createOfflineTransport().save(savePayload);

		expect(noRecordsWarnings(warn)).toEqual([]);
	});
});
