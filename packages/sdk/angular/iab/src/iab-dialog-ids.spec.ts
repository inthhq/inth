import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../src/__tests__/test-local';
import type { C15tProviderOptions } from '../../src/lib/core/options';
import { provideC15t } from '../../src/lib/core/provide-c15t';
import { iabTestOptions } from '../../testing/src/__tests__/harness-test-bed';
import { IABConsentDialog } from './iab-consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentDialog],
	selector: 'test-two-iab-dialogs',
	template: `<c15t-iab-consent-dialog [open]="true" />
		<c15t-iab-consent-dialog
			[open]="true"
			initialTab="vendors"
		/>`,
})
class TwoDialogs {}

afterEach(() => {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
});

describe('two IAB dialogs open at once', () => {
	test('each describes itself with its own description', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
				} as C15tProviderOptions),
			],
		});
		const fixture = TestBed.createComponent(TwoDialogs);
		const cards = () => [
			...document.querySelectorAll<HTMLElement>(
				'[data-testid="iab-consent-dialog-card"]'
			),
		];
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(cards()).toHaveLength(2);
			},
			{ timeout: 5000 }
		);

		for (const card of cards()) {
			const described = card.getAttribute('aria-describedby') ?? '';
			const description = document.getElementById(described);
			expect(description).not.toBeNull();
			expect(card.contains(description)).toBe(true);
		}
		// Every id on the page is used once.
		const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
		expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
	}, 20_000);
});
