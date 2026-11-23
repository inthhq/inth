/**
 * The Privacy Choices (v6) "Your Privacy Choices" dialog of the stock
 * `<inth-consent-dialog>`, ported from React's
 * `privacy-choices-dialog.test.tsx`: the US first view and its rights, the
 * receipt, Preferences, vendors and row clicks, the EU staged model, phone
 * sheets, focus, Escape and announcements. Each test names the invariant
 * it guards (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`).
 *
 * jsdom has no layout, so React's size checks stay with its browser suite
 * and the parity runner.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentBanner, ConsentManager, provideInth } from '@inth/angular';
import type { ConsentPresentation, PolicyRule } from '@inth/sdk/engine';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { offlineMode } from '../../src/__tests__/fixtures/transport-mode';
import { ALL_CATEGORIES } from '../../src/__tests__/test-local';
import {
	CONSENT_DIALOG_PANEL,
	ConsentDialog,
	PRIVACY_CHOICES_DIALOG,
} from './consent-dialog';

type Region = 'eu' | 'us-opt-in' | 'us-opt-out';

const GPC_RULE = {
	privacySignals: { gpc: { denyCategories: ['marketing' as const] } },
};

const RULES: Record<Region, Partial<PolicyRule>> = {
	eu: {},
	'us-opt-in': { ...GPC_RULE },
	'us-opt-out': {
		...GPC_RULE,
		model: 'opt-out',
		prompt: 'none',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
};

const VENDORS = [
	{
		category: 'functionality' as const,
		description: 'Maps on the store finder.',
		id: 'mapbox',
		name: 'Mapbox',
		privacyPolicyUrl: 'https://example.com/mapbox',
	},
	{
		category: 'measurement' as const,
		description: 'Page views and conversion funnels across the site.',
		id: 'analytics-one',
		name: 'Analytics One',
		privacyPolicyUrl: 'https://example.com/a1',
	},
	{
		category: 'measurement' as const,
		description: 'Session timing.',
		id: 'analytics-two',
		name: 'Analytics Two',
		privacyPolicyUrl: 'https://example.com/a2',
	},
];

/**
 * "Your Privacy Choices" stands in as a page button, as Angular has no
 * `PrivacyChoicesLink`; the same test id lets the dialog return focus to
 * it.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog],
	selector: 'test-pc-dialog-host',
	template: `<button type="button">Page action</button>
		<button
			type="button"
			data-testid="privacy-choices-link"
			(click)="consent.setActiveUI('dialog')"
		>
			Your Privacy Choices
		</button>
		<inth-consent-banner [disableAnimation]="true" />
		<inth-consent-dialog [disableAnimation]="true" />`,
})
class DialogHost {
	protected readonly consent = inject(ConsentManager);
}

/** Stands in for `matchMedia`, so a test picks the phone layout. */
const stubViewport = function stubViewport(phone: boolean): void {
	vi.stubGlobal('matchMedia', (query: string) => ({
		addEventListener: () => undefined,
		matches: phone && query.includes('max-width'),
		media: query,
		removeEventListener: () => undefined,
	}));
};

let fixtureId = 0;
const mount = async function mount({
	region = 'us-opt-out',
	design = 'privacy-choices',
	edgeStyle,
	phone = false,
}: {
	region?: Region;
	design?: ConsentPresentation['design'] | null;
	edgeStyle?: 'inset' | 'flush';
	phone?: boolean;
} = {}) {
	fixtureId += 1;
	stubViewport(phone);
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...ALL_CATEGORIES],
				legalLinks: { privacyPolicy: { href: '/privacy' } },
				mode: offlineMode([
					{
						id: `pcd-${region}-${fixtureId}`,
						match: { fallback: true, isDefault: true },
						model: 'opt-in',
						prompt: 'choice',
						...RULES[region],
					} as PolicyRule,
				]),
				persistence: false,
				presentation:
					design === null
						? undefined
						: {
								design,
								prompt: { container: { type: 'card' }, edgeStyle },
							},
				vendors: VENDORS,
			}),
		],
	});
	const fixture = TestBed.createComponent(DialogHost);
	const consent = TestBed.inject(ConsentManager);
	await fixture.whenStable();
	return { consent, fixture };
};

const $ = <T extends Element = HTMLElement>(testId: string) =>
	document.querySelector<T>(`[data-testid="${testId}"]`);
const must = <T extends Element = HTMLElement>(testId: string): T => {
	const element = $<T>(testId);
	if (!element) {
		throw new Error(`Missing ${testId}`);
	}
	return element;
};
const link = () => must<HTMLButtonElement>('privacy-choices-link');
const card = () => must('consent-dialog-card');
const pageAction = () =>
	[...document.querySelectorAll('button')].find(
		(button) => button.textContent?.trim() === 'Page action'
	) as HTMLButtonElement;
const waitFor = <T>(check: () => T) => vi.waitFor(check, { timeout: 4000 });
const text = (element: Element | null) =>
	element?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';

/** Open the dialog from "Your Privacy Choices" and wait for its title. */
const openDialog = async function openDialog() {
	link().focus();
	link().click();
	await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
	await waitFor(() =>
		expect(document.activeElement).toBe(must('consent-dialog-title'))
	);
};

const status = () => must('consent-dialog-status').textContent ?? '';

/** A key press on the focused element, as it reaches the page. */
const press = function press(key: string, shiftKey = false): void {
	(document.activeElement ?? document.body).dispatchEvent(
		new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key,
			shiftKey,
		})
	);
};

const setGpc = (on: boolean) => {
	Object.defineProperty(navigator, 'globalPrivacyControl', {
		configurable: true,
		value: on,
	});
};

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
	for (const style of document.head.querySelectorAll(
		'style[data-inth-styles]'
	)) {
		style.remove();
	}
	Reflect.deleteProperty(navigator, 'globalPrivacyControl');
	Reflect.deleteProperty(navigator, 'clipboard');
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('opening', () => {
	test('the classic dialog stays the default', async () => {
		await mount({ design: null });
		link().click();
		await waitFor(() => expect($('consent-dialog-root')).not.toBeNull());
		expect(must('consent-dialog-root').hasAttribute('data-design')).toBe(false);
	});

	test('[FOC-02][FOC-03][LAY-01] opens on its title as a modal dialog over an inert page', async () => {
		await mount();
		await openDialog();
		expect(must('consent-dialog-root').getAttribute('data-design')).toBe(
			'privacy-choices'
		);
		expect(card().getAttribute('role')).toBe('dialog');
		expect(card().getAttribute('aria-modal')).toBe('true');
		expect(card().getAttribute('aria-labelledby')).toBe(
			must('consent-dialog-title').id
		);
		expect(pageAction().closest('[inert]')).not.toBeNull();
	});

	test('[FOC-03][ARCH-03] Done closes and returns focus to the opener', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-done').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(link()));
		expect(pageAction().closest('[inert]')).toBeNull();
	});

	test('[PERM-05][BNR-02] the banner leaves at once when the dialog opens', async () => {
		await mount({ region: 'eu' });
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		link().click();
		await waitFor(() => expect($('consent-dialog-card')).not.toBeNull());
		expect($('consent-banner-root')).toBeNull();
	});

	test('[BNR-05][FOC-03] closing without deciding brings the banner back and focuses it', async () => {
		await mount({ region: 'eu' });
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		await openDialog();
		must('consent-dialog-close').click();
		await waitFor(() =>
			expect(document.activeElement).toBe(must('consent-banner-card'))
		);
		expect($('consent-dialog-card')).toBeNull();
	});

	test('[FOC-01] the trap keeps Shift+Tab from the title inside the dialog', async () => {
		await mount();
		await openDialog();
		press('Tab', true);
		expect(card().contains(document.activeElement)).toBe(true);
		press('Tab');
		expect(card().contains(document.activeElement)).toBe(true);
	});

	test('the v6 dialog renders no confirmation of its own', async () => {
		await mount();
		await openDialog();
		expect($('opt-out-confirmation-root')).toBeNull();
		expect(
			document.querySelector(
				'inth-opt-out-confirmation, inth-opt-in-confirmation'
			)
		).toBeNull();
	});
});

describe('US first view', () => {
	test('[LAW-01][LAY-04][LAW-04] rights first, the one-line intro, and only Done', async () => {
		await mount();
		await openDialog();
		expect(text($('consent-dialog-intro'))).toBe(
			'Your choices apply right away.'
		);
		const row = must('consent-dialog-rights-row-sale');
		const group = row.querySelector('[role="group"]');
		expect(group?.getAttribute('aria-label')).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		const footerButtons = must('consent-dialog-footer').querySelectorAll(
			'button'
		);
		expect(footerButtons).toHaveLength(1);
		expect(text($('consent-dialog-done'))).toBe('Done');
		expect(
			must('consent-dialog-legal-link-privacyPolicy').getAttribute('href')
		).toBe('/privacy');
	});

	test('[LAW-02][RIGHT-06][RIGHT-04][SR-01][SR-07] opt out in one press; allowing again asks first and nudges', async () => {
		const { consent } = await mount();
		await openDialog();
		const done = must('consent-dialog-done');
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(consent.snapshot().optOut).toBeTruthy());
		await waitFor(() => expect(status()).toMatch(/^Opted out of .*Saved\./u));
		// Done keeps its node and its label (FOC-06, SR-07).
		expect(must('consent-dialog-done')).toBe(done);
		expect(text(done)).toBe('Done');
		await waitFor(() => expect($('consent-dialog-saved-cue')).not.toBeNull());

		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(document.activeElement).toBe(must('consent-dialog-confirm-cancel'))
		);
		expect(consent.snapshot().optOut).toBeTruthy();
		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(must('consent-dialog-confirm').getAttribute('data-nudged')).toBe(
				'true'
			)
		);
		expect(status()).toMatch(/Choose one of the two buttons first\./u);
		expect(consent.snapshot().optOut).toBeTruthy();
		must('consent-dialog-confirm-allow').click();
		await waitFor(() => expect(consent.snapshot().optOut).toBeFalsy());
		// The dialog stays open after a rights choice.
		expect($('consent-dialog-card')).not.toBeNull();
	});

	test('[FOC-04] Escape closes the confirmation first, then the dialog', async () => {
		const { consent } = await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(consent.snapshot().optOut).toBeTruthy());
		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(document.activeElement).toBe(must('consent-dialog-confirm-cancel'))
		);
		press('Escape');
		await waitFor(() =>
			expect(
				must('consent-dialog-confirm')
					.closest('[data-open]')
					?.getAttribute('data-open')
			).toBe('false')
		);
		expect($('consent-dialog-card')).not.toBeNull();
		press('Escape');
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
	});
});

describe('receipt', () => {
	test('[RCPT-01][RCPT-03] shows only once something is recorded, always mounted', async () => {
		await mount();
		await openDialog();
		const receipt = must('consent-dialog-receipt');
		expect(receipt.getAttribute('data-open')).toBe('false');
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(receipt.getAttribute('data-open')).toBe('true'));
		expect(must('consent-dialog-receipt')).toBe(receipt);
		expect(text(receipt)).toMatch(/Saved for this browser · just now/u);
		const toggle = must('consent-dialog-receipt-toggle');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		toggle.click();
		await waitFor(() =>
			expect(toggle.getAttribute('aria-expanded')).toBe('true')
		);
		expect(text($('consent-dialog-receipt-details'))).toMatch(
			/Applies to this browser\./u
		);
	});

	test('[CLIP-01][CLIP-02] a failed copy shows a labelled field with the reference and focuses it', async () => {
		const writeText = vi.fn(() => Promise.reject(new Error('denied')));
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		});
		await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() =>
			expect(must('consent-dialog-receipt').getAttribute('data-open')).toBe(
				'true'
			)
		);
		must('consent-dialog-receipt-toggle').click();
		const copy = await waitFor(() => must('consent-dialog-copy-reference'));
		copy.click();
		const field = await waitFor(() =>
			must<HTMLInputElement>('consent-dialog-reference-field')
		);
		expect(writeText).toHaveBeenCalled();
		expect(field.value.length).toBeGreaterThan(0);
		expect(field.labels?.[0]?.textContent).toMatch(/^Couldn't copy/u);
		await waitFor(() => expect(document.activeElement).toBe(field));
		expect(status()).toMatch(/Couldn't copy/u);
	});
});

describe('GPC', () => {
	test('[GPC-03][GPC-04][GPC-06] the note replaces the intro, only Allow is disabled, and the receipt is live', async () => {
		setGpc(true);
		await mount();
		await openDialog();
		await waitFor(() =>
			expect(
				must('consent-dialog-right-option-sale-allow').getAttribute(
					'aria-disabled'
				)
			).toBe('true')
		);
		expect($('consent-dialog-intro')).toBeNull();
		expect(
			must('consent-dialog-right-option-sale-protect').hasAttribute(
				'aria-disabled'
			)
		).toBe(false);
		expect(text($('consent-dialog-rights-row-sale'))).toMatch(
			/Global Privacy Control signal/u
		);
		expect(text($('consent-dialog-receipt'))).toContain(
			'Honoring Global Privacy Control from this browser'
		);
	});
});

describe('preferences', () => {
	test('[COPY-05][NEST-01][CAT-08][LAW-05] desktop: an accordion without Marketing, with Advertising following the sale choice', async () => {
		await mount();
		await openDialog();
		const row = must('consent-dialog-preferences-row');
		expect(text(row)).toMatch(/Preferences/u);
		expect(row.getAttribute('aria-expanded')).toBe('false');
		expect(row.hasAttribute('aria-haspopup')).toBe(false);
		row.click();
		await waitFor(() => expect(row.getAttribute('aria-expanded')).toBe('true'));
		expect($('consent-dialog-category-switch-marketing')).toBeNull();
		const advertising = must('consent-dialog-advertising-row');
		expect(text(advertising)).toMatch(/On$/u);
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(text(advertising)).toMatch(/Off$/u));
	});

	test('[LAW-04][RCPT-02][CAT-04] a US switch applies at once and keeps the receipt date', async () => {
		const { consent } = await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(consent.snapshot().optOut).toBeTruthy());
		const recordedAt = consent.snapshot().optOut?.recordedAt;
		must('consent-dialog-preferences-row').click();
		const sw = await waitFor(() =>
			must<HTMLButtonElement>('consent-dialog-category-switch-functionality')
		);
		const before = sw.getAttribute('aria-checked');
		sw.click();
		await waitFor(() =>
			expect(
				consent.snapshot().explicitChoice?.categories?.functionality?.value
			).toBe(before !== 'true')
		);
		await waitFor(() =>
			expect(status()).toMatch(/^Functionality (?:on|off)\. Saved\./u)
		);
		expect(consent.snapshot().optOut?.recordedAt).toBe(recordedAt);
		expect($('consent-dialog-card')).not.toBeNull();
	});
});

describe('vendors:', () => {
	const openAnalytics = async () => {
		await mount({ region: 'eu' });
		await openDialog();
		return await waitFor(() =>
			must<HTMLButtonElement>('consent-dialog-vendor-trigger-measurement')
		);
	};

	test('[CAT-05][CAT-09][CAT-07] the trigger names itself from its text and opens a boxed table', async () => {
		const trigger = await openAnalytics();
		expect(text(trigger)).toMatch(/^View 2 vendors for Analytics/u);
		expect(text(trigger)).toMatch(/0 on/u);
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		trigger.click();
		await waitFor(() =>
			expect(trigger.getAttribute('aria-expanded')).toBe('true')
		);
		const table = must('consent-dialog-vendor-table-measurement');
		expect(table.getAttribute('role')).toBe('table');
		expect(table.getAttribute('aria-label')).toBe('Analytics vendors');
		const policy = table.querySelector('a');
		expect(policy?.getAttribute('aria-label')).toBe(
			'Analytics One privacy policy'
		);
		const sw = must('consent-dialog-vendor-switch-measurement-analytics-one');
		expect(sw.hasAttribute('disabled')).toBe(false);
	});

	test('[CAT-03][CAT-02][CAT-04] a vendor under an off category turns it on alone; the last one off turns it off', async () => {
		const trigger = await openAnalytics();
		trigger.click();
		const one = await waitFor(() =>
			must('consent-dialog-vendor-switch-measurement-analytics-one')
		);
		const two = must('consent-dialog-vendor-switch-measurement-analytics-two');
		const category = must('consent-dialog-category-switch-measurement');
		expect(category.getAttribute('aria-checked')).toBe('false');
		one.click();
		await waitFor(() =>
			expect(category.getAttribute('aria-checked')).toBe('true')
		);
		expect(one.getAttribute('aria-checked')).toBe('true');
		expect(two.getAttribute('aria-checked')).toBe('false');
		// The zero-width flip makes a repeat a new text (SR-03).
		await waitFor(() =>
			expect(status().replace('​', '')).toBe('Analytics One on. Analytics on.')
		);
		one.click();
		await waitFor(() =>
			expect(category.getAttribute('aria-checked')).toBe('false')
		);
		await waitFor(() =>
			expect(status()).toMatch(/^Analytics One off\. Analytics off\./u)
		);
		// Turning the category on with no vendor on turns them all on.
		category.click();
		await waitFor(() => expect(one.getAttribute('aria-checked')).toBe('true'));
		expect(two.getAttribute('aria-checked')).toBe('true');
	});
});

describe('row click:', () => {
	test('[CAT-10] a click on the name toggles; the policy link does not', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		const sw = await waitFor(() =>
			must('consent-dialog-category-switch-functionality')
		);
		const name = document.getElementById(
			sw.getAttribute('aria-labelledby') ?? ''
		) as HTMLElement;
		name.click();
		await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
		must('consent-dialog-vendor-trigger-functionality').click();
		const table = await waitFor(() =>
			must('consent-dialog-vendor-table-functionality')
		);
		const vendorSwitch = must(
			'consent-dialog-vendor-switch-functionality-mapbox'
		);
		const policy = table.querySelector('a') as HTMLAnchorElement;
		policy.addEventListener('click', (event) => event.preventDefault(), {
			once: true,
		});
		policy.click();
		expect(vendorSwitch.getAttribute('aria-checked')).toBe('true');
		// The switch stays the only focus target.
		expect(name.hasAttribute('tabindex')).toBe(false);
	});
});

describe('EU', () => {
	test('[EU-01][EU-03] Reject and Accept are equal; Save waits for an effective change', async () => {
		const { consent, fixture } = await mount({ region: 'eu' });
		await openDialog();
		expect(text($('consent-dialog-title'))).toBe('Privacy settings');
		const reject = must('consent-dialog-reject-all');
		const accept = must('consent-dialog-accept-all');
		expect(reject.className).toBe(accept.className);
		const save = must<HTMLButtonElement>('consent-dialog-save-button');
		expect(save.disabled).toBe(true);
		const sw = must('consent-dialog-category-switch-experience');
		sw.click();
		await fixture.whenStable();
		await waitFor(() => expect(save.disabled).toBe(false));
		sw.click();
		await fixture.whenStable();
		await waitFor(() => expect(save.disabled).toBe(true));
		sw.click();
		await fixture.whenStable();
		await waitFor(() => expect(save.disabled).toBe(false));
		save.click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() =>
			expect(
				consent.snapshot().explicitChoice?.categories?.experience?.value
			).toBe(true)
		);
	});

	test('[EU-02] closing without saving discards the draft', async () => {
		const { consent } = await mount({ region: 'eu' });
		await openDialog();
		must('consent-dialog-category-switch-experience').click();
		await waitFor(() =>
			expect(
				must('consent-dialog-category-switch-experience').getAttribute(
					'aria-checked'
				)
			).toBe('true')
		);
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		expect(consent.snapshot().explicitChoice).toBeFalsy();
		await openDialog();
		expect(
			must('consent-dialog-category-switch-experience').getAttribute(
				'aria-checked'
			)
		).toBe('false');
		expect(must<HTMLButtonElement>('consent-dialog-save-button').disabled).toBe(
			true
		);
	});
});

describe('phone sheets', () => {
	test('[NEST-02][NEST-03][NEST-04][SR-05][EU-05] the EU vendor sheet covers the dialog, and Escape closes only it', async () => {
		await mount({ phone: true, region: 'eu' });
		await openDialog();
		const trigger = await waitFor(() =>
			must('consent-dialog-vendor-trigger-measurement')
		);
		expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
		trigger.click();
		const sheet = await waitFor(() => must('consent-dialog-sheet'));
		await waitFor(() =>
			expect(document.activeElement?.closest('[data-testid]')).toBe(sheet)
		);
		expect(sheet.getAttribute('aria-modal')).toBe('true');
		expect(text(sheet)).toContain(
			'Changes apply when you save in Privacy settings.'
		);
		expect(card().hasAttribute('aria-modal')).toBe(false);
		expect(card().hasAttribute('inert')).toBe(true);
		expect(card().hasAttribute('data-nested-open')).toBe(true);
		// No id repeats across the layers.
		const ids = [...document.querySelectorAll('[id]')].map(({ id }) => id);
		expect(new Set(ids).size).toBe(ids.length);
		// The sheet mirrors the category switch, so it is never a dead end
		// (NEST-07).
		expect(
			sheet.querySelector(
				'[data-testid="consent-dialog-category-switch-measurement"]'
			)
		).not.toBeNull();
		press('Escape');
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect($('consent-dialog-card')).not.toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe(
				must('consent-dialog-vendor-trigger-measurement')
			)
		);
		expect(card().getAttribute('aria-modal')).toBe('true');
	});

	test('[NEST-01][COPY-05][NEST-08] US Preferences opens a sheet; its Done closes only it', async () => {
		await mount({ edgeStyle: 'flush', phone: true });
		await openDialog();
		expect(must('consent-dialog-root').getAttribute('data-edge-style')).toBe(
			'flush'
		);
		const row = must('consent-dialog-preferences-row');
		expect(row.getAttribute('aria-haspopup')).toBe('dialog');
		row.click();
		const sheet = await waitFor(() => must('consent-dialog-sheet'));
		expect(text(sheet)).toContain('Saved automatically');
		expect(
			sheet.querySelector('[aria-label="Close preferences"]')
		).not.toBeNull();
		must('consent-dialog-sheet-done').click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(row));
	});

	test('[NEST-05] a tap on the dimmed parent closes the sheet and nothing under it', async () => {
		await mount({ phone: true, region: 'eu' });
		await openDialog();
		must('consent-dialog-vendor-trigger-measurement').click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		const close = must('consent-dialog-close');
		// jsdom has no PointerEvent; the guard reads only the type and target.
		close.dispatchEvent(
			new MouseEvent('pointerdown', { bubbles: true, composed: true })
		);
		close.click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect($('consent-dialog-card')).not.toBeNull();
	});
});

describe('loading', () => {
	test('the v6 dialog loads on open, never with the banner, and the classic body never loads', async () => {
		const classic = vi.fn(
			async () => (await import('./consent-dialog-panel')).ConsentDialogPanel
		);
		const privacyChoices = vi.fn(
			async () =>
				(await import('./privacy-choices-dialog')).PrivacyChoicesDialog
		);
		fixtureId += 1;
		stubViewport(false);
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					consentCategories: [...ALL_CATEGORIES],
					mode: offlineMode([
						{
							id: `pcd-load-${fixtureId}`,
							match: { fallback: true, isDefault: true },
							model: 'opt-in',
							prompt: 'choice',
						},
					]),
					persistence: false,
					presentation: { design: 'privacy-choices' },
				}),
				{ provide: CONSENT_DIALOG_PANEL, useValue: classic },
				{ provide: PRIVACY_CHOICES_DIALOG, useValue: privacyChoices },
			],
		});
		const fixture = TestBed.createComponent(DialogHost);
		await fixture.whenStable();
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		expect(privacyChoices).not.toHaveBeenCalled();
		await openDialog();
		expect(privacyChoices).toHaveBeenCalledTimes(1);
		expect(classic).not.toHaveBeenCalled();
	});
});

describe('customization', () => {
	test('theme slots style the dialog parts', async () => {
		TestBed.resetTestingModule();
		fixtureId += 1;
		stubViewport(false);
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					consentCategories: [...ALL_CATEGORIES],
					mode: offlineMode([
						{
							id: `pcd-slots-${fixtureId}`,
							match: { fallback: true, isDefault: true },
							model: 'opt-in',
							prompt: 'choice',
							...RULES['us-opt-out'],
						} as PolicyRule,
					]),
					persistence: false,
					presentation: { design: 'privacy-choices' },
					theme: {
						slots: {
							consentDialogDoneButton: 'my-done',
							consentDialogFooter: 'my-footer',
							consentDialogRightsRow: 'my-rights',
						},
					},
				}),
			],
		});
		const fixture = TestBed.createComponent(DialogHost);
		await fixture.whenStable();
		await openDialog();
		expect(must('consent-dialog-footer').className).toContain('my-footer');
		expect(must('consent-dialog-done').className).toContain('my-done');
		expect(must('consent-dialog-rights-row-sale').className).toContain(
			'my-rights'
		);
	});
});
