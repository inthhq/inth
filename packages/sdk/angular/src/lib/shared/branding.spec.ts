import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from '../core/consent-manager';
import { provideC15t } from '../core/provide-c15t';
import { Branding } from './branding';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Branding],
	selector: 'test-host',
	template: `
		<a
			c15t-branding
			variant="banner-tag"
			data-testid="branding"
		></a>
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

describe('Branding', () => {
	test('renders the stock attribution link', async () => {
		const { byTestId } = await boot();
		const branding = byTestId('branding') as HTMLAnchorElement;
		expect(branding.getAttribute('href')).toMatch(/^https:\/\/c15t\.com/u);
		expect(branding.dataset.branding).toBe('c15t');
		expect(branding.querySelector('svg title')?.textContent).toBe('c15t');
	});
});
