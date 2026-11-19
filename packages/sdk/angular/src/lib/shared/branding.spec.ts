import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from '../core/consent-manager';
import { provideInth } from '../core/provide-inth';
import { Branding } from './branding';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Branding],
	selector: 'test-host',
	template: `
		<a
			inth-branding
			[surface]="'banner'"
		></a>
	`,
})
class Host {}

const boot = async () => {
	TestBed.configureTestingModule({
		providers: [
			provideInth({
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
		const branding = byTestId('consent-banner-branding') as HTMLAnchorElement;
		expect(branding.getAttribute('href')).toMatch(/^https:\/\/inth\.com/u);
		expect(branding.getAttribute('target')).toBeNull();
		expect(branding.dataset.branding).toBe('inth');
		expect(branding.dataset.variant).toBe('banner-tag');
		expect(branding.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
			'true'
		);
		expect(branding.querySelector('[id]')).toBeNull();
		// The other frameworks render neither input as an attribute.
		expect(branding.hasAttribute('surface')).toBe(false);
		expect(branding.querySelector('[mark]')).toBeNull();
	});

	test('shows the c15t mark for c15t branding', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					...testOptions(),
					prefetch: { initialBranding: 'c15t' },
				}),
			],
		});
		const fixture = TestBed.createComponent(Host);
		await fixture.whenStable();
		const branding = (fixture.nativeElement as HTMLElement).querySelector(
			'[data-testid="consent-banner-branding"]'
		) as HTMLAnchorElement;
		expect(branding.getAttribute('href')).toMatch(/^https:\/\/c15t\.com/u);
		expect(branding.textContent).toContain('c15t');
	});
});
