import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from '../core/consent-manager';
import { provideInth } from '../core/provide-inth';
import { ConsentDialogLink } from './consent-dialog-link';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialogLink],
	selector: 'test-host',
	template: `
		<button
			type="button"
			inthConsentDialogLink
		>
			Privacy settings
		</button>
	`,
})
class Host {}

const boot = async () => {
	TestBed.configureTestingModule({ providers: [provideInth(testOptions())] });
	const fixture = TestBed.createComponent(Host);
	const consent = TestBed.inject(ConsentManager);
	await fixture.whenStable();
	await vi.waitFor(() => {
		expect(consent.hasPolicy()).toBe(true);
	});
	await fixture.whenStable();
	const root = fixture.nativeElement as HTMLElement;
	const link = root.querySelector(
		'[data-testid="consent-dialog-link"]'
	) as HTMLButtonElement;
	return { consent, link };
};

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

describe('[inthConsentDialogLink]', () => {
	test('opens the dialog and names the policy rights', async () => {
		const { consent, link } = await boot();
		expect(link.hidden).toBe(false);
		expect(link.hasAttribute('data-inth-rights')).toBe(true);
		link.click();
		expect(consent.activeUI()).toBe('dialog');
	});

	test('leaves the click alone when a handler prevented it', async () => {
		const { consent, link } = await boot();
		link.addEventListener('click', (event) => event.preventDefault(), {
			capture: true,
		});
		link.click();
		expect(consent.activeUI()).toBe('banner');
	});
});
