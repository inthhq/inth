import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from './consent-manager';
import { IfConsent } from './if-consent';
import { provideC15t } from './provide-c15t';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IfConsent],
	selector: 'test-host',
	template: `
		<p
			*c15tIfConsent="'measurement'; else denied"
			data-testid="granted"
		>
			granted
		</p>
		<ng-template #denied><p data-testid="denied">denied</p></ng-template>
		<p
			*c15tIfConsent="{ and: ['measurement', 'marketing'] }"
			data-testid="both"
		>
			both
		</p>
	`,
})
class Host {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IfConsent],
	selector: 'test-context-host',
	template: `<p
		*c15tIfConsent="condition(); let shown"
		data-testid="shown"
	>
		{{ shown }}
	</p>`,
})
class ContextHost {
	readonly condition = signal<'marketing' | 'measurement'>('measurement');
}

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

describe('*c15tIfConsent', () => {
	test('renders the else template until consent, then the content', async () => {
		TestBed.configureTestingModule({ providers: [provideC15t(testOptions())] });
		const fixture = TestBed.createComponent(Host);
		const consent = TestBed.inject(ConsentManager);
		await fixture.whenStable();
		await vi.waitFor(() => {
			expect(consent.hasPolicy()).toBe(true);
		});
		await fixture.whenStable();
		const root = fixture.nativeElement as HTMLElement;
		const byTestId = (id: string) =>
			root.querySelector(`[data-testid="${id}"]`);

		expect(byTestId('granted')).toBeNull();
		expect(byTestId('denied')).not.toBeNull();
		expect(byTestId('both')).toBeNull();

		await consent.saveConsents('all');
		await fixture.whenStable();
		expect(byTestId('granted')).not.toBeNull();
		expect(byTestId('denied')).toBeNull();
		expect(byTestId('both')).not.toBeNull();
	});

	test('updates the context when a new condition keeps the same branch', async () => {
		TestBed.configureTestingModule({ providers: [provideC15t(testOptions())] });
		const fixture = TestBed.createComponent(ContextHost);
		const consent = TestBed.inject(ConsentManager);
		await vi.waitFor(() => {
			expect(consent.hasPolicy()).toBe(true);
		});
		await consent.saveConsents('all');
		await fixture.whenStable();
		const shown = () =>
			(fixture.nativeElement as HTMLElement)
				.querySelector('[data-testid="shown"]')
				?.textContent?.trim();
		expect(shown()).toBe('measurement');

		fixture.componentInstance.condition.set('marketing');
		await fixture.whenStable();
		expect(shown()).toBe('marketing');
	});
});
