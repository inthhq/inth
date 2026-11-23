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
import {
	ApplicationRef,
	ChangeDetectionStrategy,
	Component,
	inject,
	signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	ConsentBanner,
	ConsentManager,
	PrivacyChoicesLink,
	provideInth,
	ɵloadPrivacyChoicesDialog,
} from '@inth/angular';
import type {
	ConsentContainer,
	ConsentPresentation,
	PolicyRule,
} from '@inth/sdk/engine';
import {
	hasPendingOptOutConfirmation,
	markPendingOptOutConfirmation,
	openOptInConfirmation,
	watchPendingOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { offlineMode } from '../../src/__tests__/fixtures/transport-mode';
import { ALL_CATEGORIES } from '../../src/__tests__/test-local';
import {
	CONSENT_DIALOG_PANEL,
	ConsentDialog,
	PRIVACY_CHOICES_DIALOG,
} from './consent-dialog';
import type { ConsentDialogLegalLinks } from './dialog-options';

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

/** What the next mount renders beside the dialog. */
interface HostConfig {
	/** Mount the banner too. Without it, the dialog hosts the confirmations. */
	banner: boolean;
	/**
	 * Render the stock `<inth-privacy-choices-link>`. Otherwise a page
	 * button stands in with its test id, in every region, so the dialog
	 * returns focus to it.
	 */
	stockLink: boolean;
	/** A page control that opts out in one click, as a "Do Not Sell" link does. */
	optOutButton: boolean;
	disableAnimation: boolean;
	showTrigger: boolean;
	noStyle: boolean | undefined;
	legalLinks: ConsentDialogLegalLinks | undefined;
}
const DEFAULT_HOST: HostConfig = {
	banner: true,
	disableAnimation: true,
	legalLinks: undefined,
	noStyle: undefined,
	optOutButton: false,
	showTrigger: false,
	stockLink: false,
};
let hostConfig: HostConfig = { ...DEFAULT_HOST };

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog, PrivacyChoicesLink],
	selector: 'test-pc-dialog-host',
	template: `<button type="button">Page action</button>
		@if (config.stockLink) {
			<inth-privacy-choices-link />
		} @else {
			<button
				type="button"
				data-testid="privacy-choices-link"
				(click)="consent.setActiveUI('dialog')"
			>
				Your Privacy Choices
			</button>
		}
		@if (config.optOutButton) {
			<button
				type="button"
				data-testid="one-click-opt-out"
				(click)="consent.requestOptOut()"
			>
				Do Not Sell
			</button>
		}
		@if (config.banner) {
			<inth-consent-banner [disableAnimation]="true" />
		}
		<inth-consent-dialog
			[disableAnimation]="config.disableAnimation"
			[showTrigger]="config.showTrigger"
			[noStyle]="config.noStyle"
			[legalLinks]="config.legalLinks"
			[open]="open()"
		/>`,
})
class DialogHost {
	protected readonly consent = inject(ConsentManager);
	protected readonly config = { ...hostConfig };
	/** `open` on the dialog; unset, it follows the consent state. */
	readonly open = signal<boolean | undefined>(undefined);
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
	container = { type: 'card' },
	language,
	host,
}: {
	region?: Region;
	design?: ConsentPresentation['design'] | null;
	edgeStyle?: 'inset' | 'flush';
	phone?: boolean;
	container?: ConsentContainer;
	/** The visitor's language, which sets the dialog's `dir`. */
	language?: string;
	host?: Partial<HostConfig>;
} = {}) {
	fixtureId += 1;
	stubViewport(phone);
	hostConfig = { ...DEFAULT_HOST, ...host };
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...ALL_CATEGORIES],
				i18n: language ? { locale: language } : undefined,
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
								prompt: { container, edgeStyle },
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
	hostConfig = { ...DEFAULT_HOST };
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

	test('the v6 dialog renders no opt-out confirmation of its own', async () => {
		await mount();
		await openDialog();
		expect($('opt-out-confirmation-root')).toBeNull();
		expect(document.querySelector('inth-opt-out-confirmation')).toBeNull();
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

	test('[LAY-05] opening a vendor table brings it into view once it starts to open', async () => {
		const trigger = await openAnalytics();
		// jsdom has no layout to scroll; the reveal looks the table up when
		// it runs, so that lookup shows it ran.
		const lookup = vi.spyOn(document, 'getElementById');
		trigger.click();
		await waitFor(() =>
			expect(trigger.getAttribute('aria-expanded')).toBe('true')
		);
		const panelId = trigger.getAttribute('aria-controls');
		expect(panelId).toBeTruthy();
		await waitFor(() => expect(lookup).toHaveBeenCalledWith(panelId));
	});

	test('[LAY-05] a vendor reveal still due is cancelled when the dialog goes', async () => {
		const trigger = await openAnalytics();
		const scheduled = vi.spyOn(globalThis, 'setTimeout');
		const cleared = vi.spyOn(globalThis, 'clearTimeout');
		trigger.click();
		await waitFor(() =>
			expect(trigger.getAttribute('aria-expanded')).toBe('true')
		);
		const index = scheduled.mock.calls.findIndex(([, delay]) => delay === 230);
		expect(index).not.toBe(-1);
		const timer = scheduled.mock.results[index]?.value as unknown;
		TestBed.resetTestingModule();
		expect(cleared.mock.calls.map(([id]) => id)).toContain(timer);
	});

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
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			edgeStyle: 'flush',
			phone: true,
		});
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
		const privacyChoices = vi.fn(ɵloadPrivacyChoicesDialog);
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

describe('design switch', () => {
	const closeDialog = async (consent: ConsentManager) => {
		consent.setActiveUI('none');
		await TestBed.inject(ApplicationRef).whenStable();
		await waitFor(() => expect($('consent-dialog-root')).toBeNull());
	};
	const roots = () =>
		[...document.querySelectorAll('[data-testid="consent-dialog-root"]')].map(
			(root) => root.getAttribute('data-design')
		);

	test('only the design in force opens after updateOptions switches it, with both bodies loaded', async () => {
		const { consent } = await mount({ design: null, host: { banner: false } });
		link().click();
		await waitFor(() => expect(roots()).toEqual([null]));
		await closeDialog(consent);

		await consent.updateOptions({
			presentation: { design: 'privacy-choices' },
		});
		await openDialog();
		expect(roots()).toEqual(['privacy-choices']);
		await closeDialog(consent);

		await consent.updateOptions({ presentation: { design: 'classic' } });
		link().click();
		await waitFor(() => expect(roots()).toEqual([null]));
		await closeDialog(consent);

		await consent.updateOptions({
			presentation: { design: 'privacy-choices' },
		});
		await openDialog();
		expect(roots()).toEqual(['privacy-choices']);
	});

	test('a body whose import resolves after the design switched away is not attached', async () => {
		let releaseClassic: () => void = () => undefined;
		const classic = vi.fn(async () => {
			await new Promise<void>((resolve) => {
				releaseClassic = resolve;
			});
			return (await import('./consent-dialog-panel')).ConsentDialogPanel;
		});
		fixtureId += 1;
		stubViewport(false);
		hostConfig = { ...DEFAULT_HOST, banner: false };
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					consentCategories: [...ALL_CATEGORIES],
					mode: offlineMode([
						{
							id: `pcd-switch-${fixtureId}`,
							match: { fallback: true, isDefault: true },
							model: 'opt-in',
							prompt: 'choice',
						},
					]),
					persistence: false,
				}),
				{ provide: CONSENT_DIALOG_PANEL, useValue: classic },
			],
		});
		const fixture = TestBed.createComponent(DialogHost);
		const consent = TestBed.inject(ConsentManager);
		fixture.detectChanges();
		link().click();
		await waitFor(() => expect(classic).toHaveBeenCalledTimes(1));
		await consent.updateOptions({
			presentation: { design: 'privacy-choices' },
		});
		await waitFor(() => expect(roots()).toEqual(['privacy-choices']));
		releaseClassic();
		await TestBed.inject(ApplicationRef).whenStable();
		expect(roots()).toEqual(['privacy-choices']);
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

describe('council fixes', () => {
	test('[BNR-13] the dialog hosts an opt-in confirmation when no banner does', async () => {
		const { consent, fixture } = await mount({
			host: { banner: false },
			region: 'us-opt-in',
		});
		const confirmed = vi.fn();
		openOptInConfirmation(consent.kernel(), confirmed, null);
		fixture.detectChanges();
		const confirm = await waitFor(() =>
			must<HTMLButtonElement>('opt-in-confirmation-confirm-button')
		);
		confirm.click();
		await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
	});

	test('showTrigger renders the floating trigger under the Privacy Choices design', async () => {
		await mount({ host: { showTrigger: true } });
		await waitFor(() => expect($('consent-dialog-trigger')).not.toBeNull());
		expect($('consent-dialog-card')).toBeNull();
	});

	test('[RCPT-01][FOC-03] the opt-out confirmation opens the Privacy Choices dialog on its receipt', async () => {
		// A one-click opt-out with no reload due opens the confirmation; on
		// this design it is the dialog, focused on the receipt.
		const { consent } = await mount({ host: { optOutButton: true } });
		const button = must<HTMLButtonElement>('one-click-opt-out');
		button.focus();
		button.click();
		const receipt = await waitFor(() => must('consent-dialog-receipt'));
		await waitFor(() => expect(document.activeElement).toBe(receipt));
		expect(receipt.getAttribute('tabindex')).toBe('-1');
		expect(receipt.getAttribute('data-open')).toBe('true');
		expect(text(receipt)).toMatch(/opted out/iu);
		expect($('opt-out-confirmation-card')).toBeNull();
		expect(consent.snapshot().optOut).not.toBeNull();
		// A later open starts on the title again.
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await openDialog();
	});

	test('[RIGHT-08] after a revocation reload, the Privacy Choices dialog reopens on the receipt', async () => {
		const { consent } = await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(consent.snapshot().optOut).not.toBeNull());
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		// What the next document does when the opt-out reloaded the page:
		// the marker opens the confirmation once, which is this dialog.
		markPendingOptOutConfirmation();
		const stop = watchPendingOptOutConfirmation(consent.kernel());
		const receipt = await waitFor(() => must('consent-dialog-receipt'));
		await waitFor(() => expect(document.activeElement).toBe(receipt));
		expect(hasPendingOptOutConfirmation()).toBe(false);
		expect($('opt-out-confirmation-card')).toBeNull();
		stop();
	});

	test('[BNR-05] Your Privacy Choices stays a way back in under US opt-in, without the opt-out icon', async () => {
		await mount({ host: { stockLink: true }, region: 'us-opt-in' });
		const choices = await waitFor(() => must('privacy-choices-link'));
		expect(text(choices)).toBe('Your Privacy Choices');
		expect(choices.querySelector('svg')).toBeNull();
		expect(choices.hasAttribute('data-opt-out-variant')).toBe(false);
		await openDialog();
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
	});

	test('the stock link is the opt-out link under an opt-out policy', async () => {
		await mount({ host: { stockLink: true } });
		const choices = await waitFor(() => must('privacy-choices-link'));
		expect(choices.getAttribute('data-opt-out-variant')).not.toBeNull();
		expect(choices.getAttribute('data-inth-rights')).toContain('opt-out');
	});

	test('the classic design keeps Your Privacy Choices to opt-out policies', async () => {
		await mount({
			design: null,
			host: { stockLink: true },
			region: 'us-opt-in',
		});
		expect($('privacy-choices-link')).toBeNull();
	});

	test('[FOC-03] with the opener gone, focus returns to Your Privacy Choices', async () => {
		const { consent } = await mount({ host: { stockLink: true } });
		const choices = await waitFor(() =>
			must<HTMLButtonElement>('privacy-choices-link')
		);
		const opener = document.createElement('button');
		document.body.append(opener);
		opener.focus();
		consent.setActiveUI('dialog');
		await waitFor(() =>
			expect(document.activeElement).toBe(must('consent-dialog-title'))
		);
		opener.remove();
		must('consent-dialog-done').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(choices));
	});

	test('[NEST-03] only the top layer is exposed: covered and folded parts carry a real inert', async () => {
		await mount({ phone: true });
		await openDialog();
		// The receipt is folded until there is something to show.
		expect(must('consent-dialog-receipt').getAttribute('inert')).toBe('');
		must('consent-dialog-preferences-row').click();
		const sheet = await waitFor(() => must('consent-dialog-sheet'));
		expect(card().getAttribute('inert')).toBe('');
		expect(sheet.hasAttribute('inert')).toBe(false);
	});

	test('[PERM-01][FOC-04] a controlled open hands the banner over through the consent manager', async () => {
		const { consent, fixture } = await mount({ phone: true, region: 'eu' });
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		fixture.componentInstance.open.set(true);
		fixture.detectChanges();
		await waitFor(() => expect($('consent-dialog-card')).not.toBeNull());
		expect(consent.activeUI()).toBe('dialog');
		await waitFor(() => expect($('consent-banner-root')).toBeNull());
		// The session follows the dialog: a phone sheet opens.
		must('consent-dialog-vendor-trigger-measurement').click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		// Escape closes the sheet, then the dialog, and the banner returns.
		press('Escape');
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		press('Escape');
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(consent.activeUI()).toBe('banner'));
	});

	test('a controlled open of false hides the dialog whatever the consent state shows', async () => {
		const { consent, fixture } = await mount();
		fixture.componentInstance.open.set(false);
		fixture.detectChanges();
		consent.setActiveUI('dialog');
		fixture.detectChanges();
		await fixture.whenStable();
		expect($('consent-dialog-card')).toBeNull();
	});

	test('[NEST-03][NEST-06] a sheet reopened during its exit stays open', async () => {
		await mount({ host: { disableAnimation: false }, phone: true });
		await openDialog();
		const row = must('consent-dialog-preferences-row');
		row.click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		must('consent-dialog-sheet-close').click();
		await waitFor(() =>
			expect(must('consent-dialog-sheet').getAttribute('data-state')).toBe(
				'closed'
			)
		);
		row.click();
		await waitFor(() =>
			expect(must('consent-dialog-sheet').getAttribute('data-state')).toBe(
				'open'
			)
		);
		// Past the old exit timer, the reopened sheet is still there.
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(must('consent-dialog-sheet').getAttribute('data-state')).toBe(
			'open'
		);
		expect(must('consent-dialog-sheet').hasAttribute('inert')).toBe(false);
		// Closing the dialog clears a closing sheet at once.
		must('consent-dialog-sheet-close').click();
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
	});

	test('[NEST-01] phone sheets take the resolved phone edge style: a Card is always inset', async () => {
		await mount({ edgeStyle: 'flush', phone: true });
		await openDialog();
		expect(must('consent-dialog-root').getAttribute('data-edge-style')).toBe(
			'inset'
		);
	});

	test('[CAT-09] chevrons that point to a sheet carry data-direction="end"', async () => {
		await mount({ phone: true, region: 'eu' });
		await openDialog();
		expect(
			must('consent-dialog-vendor-trigger-measurement')
				.querySelector('[data-direction]')
				?.getAttribute('data-direction')
		).toBe('end');
	});

	test('[CAT-09] the desktop vendor and Preferences chevrons point down', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		expect(
			must('consent-dialog-vendor-trigger-measurement')
				.querySelector('[data-direction]')
				?.getAttribute('data-direction')
		).toBe('down');
	});

	test('[CAT-09] the phone Preferences chevron points the reading direction', async () => {
		await mount({ language: 'he', phone: true });
		await openDialog();
		expect(must('consent-dialog-root').getAttribute('dir')).toBe('rtl');
		expect(
			must('consent-dialog-preferences-row').querySelector(
				'[data-direction="end"]'
			)
		).not.toBeNull();
	});

	test('[US-01] an EU opt-in policy that shows no banner still gets the EU dialog', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		expect(must('consent-dialog-root').getAttribute('data-regime')).toBe('eu');
	});

	test('a local noStyle reaches Done', async () => {
		await mount({ host: { noStyle: true } });
		await openDialog();
		expect(must('consent-dialog-done').getAttribute('class') ?? '').toBe('');
	});

	test('a local noStyle reaches the EU buttons', async () => {
		await mount({ host: { noStyle: true }, region: 'eu' });
		await openDialog();
		for (const id of [
			'consent-dialog-reject-all',
			'consent-dialog-accept-all',
			'consent-dialog-save-button',
		]) {
			expect(must(id).getAttribute('class') ?? '').toBe('');
		}
	});

	test('[COPY-05] the Preferences count follows the draft as it changes', async () => {
		await mount();
		await openDialog();
		const row = must('consent-dialog-preferences-row');
		const before = row.textContent;
		row.click();
		const toggle = await waitFor(() =>
			must('consent-dialog-category-switch-measurement')
		);
		toggle.click();
		await waitFor(() => expect(row.textContent).not.toBe(before));
	});
});

describe('wave B round 2', () => {
	test('[RCPT-01] a controlled open of false leaves the opt-out confirmation on its own', async () => {
		const { consent, fixture } = await mount({ host: { optOutButton: true } });
		fixture.componentInstance.open.set(false);
		fixture.detectChanges();
		must<HTMLButtonElement>('one-click-opt-out').click();
		// The dialog can't show, so it doesn't adopt the confirmation.
		await waitFor(() => expect($('opt-out-confirmation-card')).not.toBeNull());
		expect($('consent-dialog-card')).toBeNull();
		expect(consent.activeUI()).not.toBe('dialog');
	});

	test('[PERM-01][NEST-06] a controlled open turning false closes the shown dialog through the consent manager', async () => {
		const { consent, fixture } = await mount({ phone: true, region: 'eu' });
		fixture.componentInstance.open.set(true);
		fixture.detectChanges();
		await waitFor(() => expect($('consent-dialog-card')).not.toBeNull());
		await waitFor(() => expect($('consent-banner-root')).toBeNull());
		must('consent-dialog-vendor-trigger-measurement').click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		fixture.componentInstance.open.set(false);
		fixture.detectChanges();
		// The unanswered banner comes back, and the session drops the sheet.
		await waitFor(() => expect(consent.activeUI()).toBe('banner'));
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		expect($('consent-dialog-card')).toBeNull();
		fixture.componentInstance.open.set(true);
		fixture.detectChanges();
		await waitFor(() => expect($('consent-dialog-card')).not.toBeNull());
		expect($('consent-dialog-sheet')).toBeNull();
		expect(card().hasAttribute('data-nested-open')).toBe(false);
	});

	test('[MOT-03] disableAnimation turns the dialog motion off and drops a sheet at once', async () => {
		await mount({ host: { disableAnimation: false }, phone: true });
		await openDialog();
		expect(must('consent-dialog-root').hasAttribute('data-animation')).toBe(
			false
		);
		TestBed.resetTestingModule();
		document.body.replaceChildren();

		await mount({ phone: true });
		await openDialog();
		const root = must('consent-dialog-root');
		expect(root.getAttribute('data-animation')).toBe('off');
		must('consent-dialog-preferences-row').click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		// The sheet never plays an exit: it goes without a closing state.
		let closing = false;
		const watcher = new MutationObserver(() => {
			if ($('consent-dialog-sheet')?.getAttribute('data-state') === 'closed') {
				closing = true;
			}
		});
		watcher.observe(root, { attributes: true, childList: true, subtree: true });
		must('consent-dialog-sheet-close').click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		watcher.disconnect();
		expect(closing).toBe(false);
	});

	test.each<[ConsentDialogLegalLinks | undefined, boolean]>([
		[undefined, true],
		[null, false],
		[['cookiePolicy'], false],
		[['privacyPolicy'], true],
	])(
		'legalLinks=%j on the dialog: null hides the footer link, a list allows it (shown: %s)',
		async (legalLinks, shown) => {
			await mount({ host: { legalLinks } });
			await openDialog();
			expect($('consent-dialog-legal-link-privacyPolicy') !== null).toBe(shown);
		}
	);
});
