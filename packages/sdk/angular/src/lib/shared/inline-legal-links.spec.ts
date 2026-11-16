import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from '../core/consent-manager';
import { provideC15t } from '../core/provide-c15t';
import { InlineLegalLinks } from './inline-legal-links';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InlineLegalLinks],
	selector: 'test-host',
	template: `
		<span
			c15t-inline-legal-links
			[links]="['privacyPolicy', 'termsOfService']"
			testIdPrefix="legal"
			data-testid="legal"
		></span>
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

describe('InlineLegalLinks', () => {
	test('renders the provider links with their targets', async () => {
		const { byTestId } = await boot();
		const legal = byTestId('legal');
		expect(legal.textContent).toBe(' Privacy Policy, Terms');
		const privacy = byTestId('legal-privacyPolicy') as HTMLAnchorElement;
		expect(privacy.target).toBe('_blank');
		const terms = byTestId('legal-termsOfService') as HTMLAnchorElement;
		expect(terms.target).toBe('_self');
		expect(terms.rel).toBe('');
	});
});
