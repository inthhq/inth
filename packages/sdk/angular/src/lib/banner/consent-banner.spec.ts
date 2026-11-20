import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { InthProvider } from '../../../provider/src/inth-provider';
import { testOptions } from '../../__tests__/test-local';
import { ConsentManager } from '../core/consent-manager';
import { provideInth } from '../core/provide-inth';
import { ConsentButton } from '../shared/consent-button';
import {
	ConsentBannerAction,
	ConsentBannerDescription,
	ConsentBannerTitle,
} from './banner-templates';
import { ConsentBanner } from './consent-banner';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		ConsentBannerAction,
		ConsentBannerDescription,
		ConsentBannerTitle,
		ConsentBanner,
		ConsentButton,
	],
	selector: 'test-custom-banner',
	template: `
		<inth-consent-banner>
			<ng-template
				inthConsentBannerTitle
				let-title
				>Custom: {{ title }}</ng-template
			>
			<ng-template
				inthConsentBannerDescription
				let-notice="notice"
				>Notice: {{ notice }}</ng-template
			>
			<ng-template
				inthConsentBannerAction
				let-action
				let-label="label"
				let-testId="testId"
			>
				<button
					inth-consent-button
					[action]="action"
					[attr.data-testid]="'custom-' + testId"
				>
					{{ label }}!
				</button>
			</ng-template>
			<a
				data-testid="projected"
				href="/cookies"
				>Cookies</a
			>
		</inth-consent-banner>
	`,
})
class CustomBannerHost {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InthProvider],
	selector: 'test-root-host',
	template: '<inth-provider [hideBranding]="true" />',
})
class RootHost {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InthProvider],
	selector: 'test-wrapping-root-host',
	template:
		'<inth-provider><p data-testid="wrapped-app">App</p></inth-provider>',
})
class WrappingRootHost {}

const boot = async (host: new () => unknown) => {
	TestBed.configureTestingModule({ providers: [provideInth(testOptions())] });
	const fixture = TestBed.createComponent(host);
	const consent = TestBed.inject(ConsentManager);
	await fixture.whenStable();
	await vi.waitFor(() => {
		expect(consent.activeUI()).toBe('banner');
	});
	await fixture.whenStable();
	const byTestId = (id: string) =>
		document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
	return { byTestId, consent, fixture };
};

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

describe('<inth-consent-banner> lifecycle', () => {
	test('leaves the page in the change detection after a choice, with motion on', async () => {
		const { byTestId, consent, fixture } = await boot(CustomBannerHost);
		expect(byTestId('consent-banner-root')).not.toBeNull();
		await consent.saveConsents('all');
		fixture.detectChanges();
		// No exit fade holding the banner's area, as with @inth/react.
		expect(byTestId('consent-banner-root')).toBeNull();
	});

	test('ends its markup with the marker the stylesheet waits for', async () => {
		const { byTestId } = await boot(CustomBannerHost);
		const root = byTestId('consent-banner-root');
		expect(root?.hasAttribute('data-inth-streamed')).toBe(true);
		expect(root?.lastElementChild?.hasAttribute('data-inth-stream-end')).toBe(
			true
		);
	});
});

describe('<inth-consent-banner> templates', () => {
	test('replace the copy and the buttons, and project into the footer', async () => {
		const { byTestId, consent, fixture } = await boot(CustomBannerHost);
		expect(byTestId('consent-banner-title')?.textContent?.trim()).toBe(
			'Custom: We value your privacy'
		);
		expect(byTestId('consent-banner-description')?.textContent?.trim()).toBe(
			'Notice: false'
		);
		expect(byTestId('consent-banner-accept-button')).toBeNull();
		const accept = byTestId('custom-consent-banner-accept-button');
		expect(accept?.textContent?.trim()).toBe('Accept All!');
		expect(
			byTestId('consent-banner-footer')?.contains(byTestId('projected'))
		).toBe(true);

		accept?.click();
		await vi.waitFor(() => {
			expect(consent.has('marketing')).toBe(true);
		});
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(byTestId('consent-banner-root')).toBeNull();
		});
	});
});

describe('<inth-provider>', () => {
	test('renders the banner and opens the dialog from Customize', async () => {
		const { byTestId, fixture } = await boot(RootHost);
		expect(byTestId('consent-banner-root')).not.toBeNull();
		expect(byTestId('consent-banner-branding')).toBeNull();

		byTestId('consent-banner-customize-button')?.click();
		await fixture.whenStable();
		await vi.waitFor(() => {
			expect(byTestId('consent-dialog-root')).not.toBeNull();
		});
	});

	test('renders the content it wraps, without a box of its own', async () => {
		const { byTestId } = await boot(WrappingRootHost);
		expect(byTestId('wrapped-app')?.textContent).toBe('App');
		expect(byTestId('consent-banner-root')).not.toBeNull();
		const host = document.querySelector('inth-provider');
		expect(host && getComputedStyle(host).display).toBe('contents');
	});
});

describe('a tap before hydration', () => {
	const EARLY_TAPS = '__inthEarlyTaps';

	afterEach(() => {
		document.getElementById('inth-early-tap')?.remove();
		Reflect.deleteProperty(window, EARLY_TAPS);
	});

	/** The server's banner, tapped while only the inline script runs. */
	const tapServerBanner = (action: string) => {
		// An earlier banner claimed the queue; a fresh page has none.
		Reflect.deleteProperty(window, EARLY_TAPS);
		// oxlint-disable-next-line no-new-func -- The script ships as text.
		new Function(EARLY_CONSENT_TAP_SCRIPT)();
		document.body.innerHTML = `<div data-testid="consent-banner-root" data-model="opt-in" data-prompt="choice"><button data-action="${action}">${action}</button></div>`;
		document
			.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
			?.click();
		const queue = (window as unknown as Record<string, { taps?: unknown[] }>)[
			EARLY_TAPS
		];
		expect(queue?.taps).toHaveLength(1);
		document.body.replaceChildren();
	};

	test('records the tapped accept once the banner hydrates', async () => {
		tapServerBanner('accept');
		// The script hid the banner for the visitor.
		expect(document.getElementById('inth-early-tap')).not.toBeNull();
		TestBed.configureTestingModule({
			providers: [provideInth(testOptions())],
		});
		const fixture = TestBed.createComponent(RootHost);
		const consent = TestBed.inject(ConsentManager);
		await fixture.whenStable();

		await vi.waitFor(() => {
			expect(consent.has('marketing')).toBe(true);
		});
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(
				document.querySelector('[data-testid="consent-banner-root"]')
			).toBeNull();
			expect(document.getElementById('inth-early-tap')).toBeNull();
		});
	});

	test('opens the dialog for a tapped Customize', async () => {
		tapServerBanner('customize');
		TestBed.configureTestingModule({
			providers: [provideInth(testOptions())],
		});
		const fixture = TestBed.createComponent(RootHost);
		const consent = TestBed.inject(ConsentManager);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(consent.activeUI()).toBe('dialog');
			expect(
				document.querySelector('[data-testid="consent-dialog-root"]')
			).not.toBeNull();
		});
		expect(consent.has('marketing')).toBe(false);
	});
});
