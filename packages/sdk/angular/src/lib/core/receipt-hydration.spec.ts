/**
 * The opt-out receipt data hydrates as the server rendered it (C4): until
 * the application is stable, the consent manager serves the kernel's
 * server value (`getServerOptOutReceiptData`), as React's
 * `useSyncExternalStore` does, and switches to this browser's local data
 * after.
 */
import {
	ApplicationRef,
	ChangeDetectionStrategy,
	Component,
	PendingTasks,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PolicyRule } from '@inth/sdk/engine';
import {
	getOptOutReceiptData,
	getServerOptOutReceiptData,
} from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { offlineMode } from '../../__tests__/fixtures/transport-mode';
import { ALL_CATEGORIES } from '../../__tests__/test-local';
import { ConsentManager } from './consent-manager';
import { provideInth } from './provide-inth';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'test-receipt-host',
	template: '',
})
class Host {}

afterEach(() => {
	TestBed.resetTestingModule();
});

describe('opt-out receipt data', () => {
	test('[C4] serves the server value until the application is stable, then the local one', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					consentCategories: [...ALL_CATEGORIES],
					mode: offlineMode([
						{
							id: 'receipt-hydration',
							match: { fallback: true, isDefault: true },
							model: 'opt-out',
							prompt: 'none',
							rights: ['disclosure', 'preferences', 'opt-out'],
						} as PolicyRule,
					]),
					persistence: false,
				}),
			],
		});
		// Holds the application unstable, as a hydration still running does.
		const done = TestBed.inject(PendingTasks).add();
		const consent = TestBed.inject(ConsentManager);
		const fixture = TestBed.createComponent(Host);
		fixture.detectChanges();
		await vi.waitFor(() =>
			expect(consent.snapshot().policyRule.id).toBe('receipt-hydration')
		);
		void consent.requestOptOut();
		await vi.waitFor(() =>
			expect(getOptOutReceiptData(consent.kernel()).localAct).not.toBeNull()
		);
		expect(consent.ɵoptOutReceiptData()).toEqual(
			getServerOptOutReceiptData(consent.kernel())
		);
		done();
		await TestBed.inject(ApplicationRef).whenStable();
		await vi.waitFor(() =>
			expect(consent.ɵoptOutReceiptData()).toEqual(
				getOptOutReceiptData(consent.kernel())
			)
		);
		expect(consent.ɵoptOutReceiptData().localAct).not.toBeNull();
	});
});
