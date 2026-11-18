import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from './consent-manager';
import { provideC15t } from './provide-c15t';

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

describe('the preference draft', () => {
	test('loads again after a failed chunk load', async () => {
		TestBed.configureTestingModule({ providers: [provideC15t(testOptions())] });
		const consent = TestBed.inject(ConsentManager);

		consent.preloadDraft();
		await vi.waitFor(() => {
			expect(loads).toBe(1);
		});

		consent.preloadDraft();
		await vi.waitFor(() => {
			expect(loads).toBe(2);
		});
	});
});
