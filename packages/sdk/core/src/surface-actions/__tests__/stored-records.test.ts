/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from 'vitest';

import { NOW } from '../../__tests__/fixtures/kernel-fixtures';
import { hasStoredClearEpoch } from '../instant-commit';
import { clearStoredRecordsFor } from '../stored-records';

describe('clearStoredRecordsFor', () => {
	const store = () => {
		const stored = `c.necessary:1,c.measurement:1,i.t:${NOW}`;
		localStorage.setItem('inth', stored);
		document.cookie = `inth=${stored}; path=/`;
	};
	const cleared = () =>
		localStorage.getItem('inth') === null &&
		!/(?:^|; )inth=/u.test(document.cookie);

	afterEach(() => {
		localStorage.clear();
		for (const name of ['inth', 'inth-epoch']) {
			document.cookie = `${name}=; Max-Age=0; path=/`;
		}
	});

	test('removes the stored choice and stores the clear epoch', () => {
		store();
		expect(clearStoredRecordsFor({}, NOW)).toBe(true);
		expect(cleared()).toBe(true);
		expect(hasStoredClearEpoch()).toBe(true);
	});

	test('uses the storage key persistence would', () => {
		localStorage.setItem('site-consent', 'c.necessary:1');
		clearStoredRecordsFor(
			{ persistence: { storageConfig: { storageKey: 'site-consent' } } },
			NOW
		);
		expect(localStorage.getItem('site-consent')).toBeNull();
	});

	test.each([
		['persistence is off', { persistence: false as const }],
		['the runtime is disabled', { enabled: false }],
	])('leaves storage alone when %s', (_case, options) => {
		store();
		expect(clearStoredRecordsFor(options, NOW)).toBe(false);
		expect(cleared()).toBe(false);
	});
});
