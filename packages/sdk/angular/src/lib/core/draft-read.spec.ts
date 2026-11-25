import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from './consent-manager';
import { provideInth } from './provide-inth';

// Its own file: the draft module must not have loaded in an earlier test.
let loads = 0;
// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when this chunk fails to load; nothing else can make a dynamic import reject. The factory fails the first load and returns the real module after that.
vi.mock('@inth/sdk/preference-draft', async (importActual) => {
	loads += 1;
	if (loads === 1) {
		throw new Error('chunk failed');
	}
	return await importActual();
});

afterEach(() => {
	TestBed.resetTestingModule();
});

describe('reading the preference draft', () => {
	test('a later read after a failed chunk load loads it again', async () => {
		TestBed.configureTestingModule({ providers: [provideInth(testOptions())] });
		const consent = TestBed.inject(ConsentManager);
		await vi.waitFor(() => {
			expect(consent.hasPolicy()).toBe(true);
		});

		expect(consent.draft.values()).toEqual({});
		await vi.waitFor(() => {
			expect(loads).toBe(1);
		});

		// Reads keep coming, as a template's would; one of them retries.
		await vi.waitFor(
			() => {
				consent.draft.values();
				expect(loads).toBe(2);
			},
			{ interval: 100, timeout: 5000 }
		);
		await vi.waitFor(() => {
			expect(Object.keys(consent.draft.values()).length).toBeGreaterThan(0);
		});
	}, 15_000);
});
