import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from '../core/consent-manager';
import { provideC15t } from '../core/provide-c15t';
import { ConsentButton } from './consent-button';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentButton],
	selector: 'test-host',
	template: `
		<button
			c15t-consent-button
			action="accept"
			variant="primary"
			class="mine"
			data-testid="accept"
		>
			Accept
		</button>
		<button
			c15t-consent-button
			action="customize"
			data-testid="customize"
		>
			Customize
		</button>
	`,
})
class Host {}

const boot = async () => {
	TestBed.configureTestingModule({
		providers: [
			provideC15t({
				...testOptions(),
				legalLinks: {
					privacyPolicy: { href: '/privacy' },
					termsOfService: { href: '/terms', label: 'Terms', target: '_self' },
				},
			}),
		],
	});
	const fixture = TestBed.createComponent(Host);
	const consent = TestBed.inject(ConsentManager);
	await fixture.whenStable();
	await vi.waitFor(() => {
		expect(consent.hasPolicy()).toBe(true);
	});
	await fixture.whenStable();
	const root = fixture.nativeElement as HTMLElement;
	const byTestId = (id: string) =>
		root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
	return { byTestId, consent, fixture };
};

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

describe('ConsentButton', () => {
	test('keeps the host class and records the choice', async () => {
		const { byTestId, consent, fixture } = await boot();
		const accept = byTestId('accept') as HTMLButtonElement;
		expect(accept.type).toBe('button');
		expect(accept.classList.contains('mine')).toBe(true);
		expect(accept.dataset.variant).toBe('primary');

		byTestId('customize').click();
		expect(consent.activeUI()).toBe('dialog');

		accept.click();
		await vi.waitFor(() => {
			expect(consent.has('marketing')).toBe(true);
		});
		await fixture.whenStable();
	});
});
