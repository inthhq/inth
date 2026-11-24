/**
 * The "Your Privacy Choices" consent dialog in Vue, ported from React's
 * dialog tests (`consent-dialog.test.tsx`). Each
 * test names the invariant it guards
 * (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`). Geometry checks stay in
 * React's browser tests and the parity runner: jsdom lays nothing out.
 */
import {
	hasPendingOptOutConfirmation,
	markPendingOptOutConfirmation,
	openOptInConfirmation,
	watchPendingOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { useOptOut } from '../runtime/composables/use-consent-kernel';
import type { MountOptions } from './consent-ui-fixture';
import {
	$,
	mountConsentUI,
	must,
	pageAction,
	setPhone,
	setPhoneLive,
	settle,
	unmountConsentUI,
	waitFor,
} from './consent-ui-fixture';

let context: Awaited<ReturnType<typeof mountConsentUI>> | null = null;
const mount = async (options: MountOptions = {}) => {
	context = await mountConsentUI({
		region: 'us-opt-out',
		vendors: true,
		...options,
	});
	return context;
};
const snapshot = () => context?.snapshot.value;
const kernel = () => {
	if (!context) {
		throw new Error('No kernel yet');
	}
	return context.kernel;
};

/** A page control that opts out in one click, as a "Do Not Sell" link does. */
const OptOutNow = defineComponent({
	setup() {
		const optOut = useOptOut();
		return () =>
			h(
				'button',
				{
					'data-testid': 'one-click-opt-out',
					onClick: () => {
						void optOut();
					},
					type: 'button',
				},
				'Do Not Sell'
			);
	},
});

const link = () => must<HTMLButtonElement>('privacy-choices-link');
const card = () => must('consent-dialog-card');
const status = () => must('consent-dialog-status').textContent ?? '';
const escape = () =>
	(document.activeElement ?? document.body).dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
	);

/** Open the dialog from "Your Privacy Choices" and wait for its title. */
const openDialog = async function openDialog() {
	link().focus();
	link().click();
	await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
	await waitFor(() =>
		expect(document.activeElement).toBe(must('consent-dialog-title'))
	);
};

const previousSignal = Object.getOwnPropertyDescriptor(
	navigator,
	'globalPrivacyControl'
);

afterEach(async () => {
	await unmountConsentUI();
	context = null;
	if (previousSignal) {
		Object.defineProperty(navigator, 'globalPrivacyControl', previousSignal);
	} else {
		Reflect.deleteProperty(navigator, 'globalPrivacyControl');
	}
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('opening', () => {
	test('[FOC-02][FOC-03][LAY-01] opens on its title as a modal dialog over an inert page', async () => {
		await mount();
		await openDialog();
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
			expect(document.activeElement).toBe($('consent-banner-card'))
		);
		expect($('consent-dialog-card')).toBeNull();
	});
});

describe('US first view', () => {
	test('[LAW-01][LAY-04][LAW-04] rights first, the one-line intro, and only Done', async () => {
		await mount();
		await openDialog();
		expect(must('consent-dialog-intro').textContent?.trim()).toBe(
			'Your choices apply right away.'
		);
		const group = must('consent-dialog-rights-row-sale').querySelector(
			'[role="group"]'
		);
		expect(group?.getAttribute('aria-label')).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		expect(
			must('consent-dialog-footer').querySelectorAll('button')
		).toHaveLength(1);
		expect(must('consent-dialog-done').textContent).toMatch(/Done/u);
		expect(
			must('consent-dialog-legal-link-privacyPolicy').getAttribute('href')
		).toBe('/privacy');
	});

	test('[LAW-02][RIGHT-06][RIGHT-04][SR-01][SR-07] opt out in one press; allowing again asks first and nudges', async () => {
		await mount();
		await openDialog();
		const done = must('consent-dialog-done');
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(snapshot()?.optOut).toBeTruthy());
		await waitFor(() => expect(status()).toMatch(/^Opted out of .*Saved\./u));
		// Done keeps its node and its label (FOC-06, SR-07).
		expect(must('consent-dialog-done')).toBe(done);
		expect(done.textContent).toMatch(/Done/u);
		expect($('consent-dialog-saved-cue')).not.toBeNull();

		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(document.activeElement).toBe($('consent-dialog-confirm-cancel'))
		);
		expect(snapshot()?.optOut).toBeTruthy();
		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(must('consent-dialog-confirm').getAttribute('data-nudged')).toBe(
				'true'
			)
		);
		expect(status()).toMatch(/Choose one of the two buttons first\./u);
		must('consent-dialog-confirm-allow').click();
		await waitFor(() => expect(snapshot()?.optOut).toBeFalsy());
		// The dialog stays open after a rights choice.
		expect($('consent-dialog-card')).not.toBeNull();
	});

	test('[FOC-04] Escape closes the confirmation first, then the dialog', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(snapshot()?.optOut).toBeTruthy());
		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(document.activeElement).toBe($('consent-dialog-confirm-cancel'))
		);
		escape();
		await waitFor(() =>
			expect(
				must('consent-dialog-confirm')
					.closest('[data-open]')
					?.getAttribute('data-open')
			).toBe('false')
		);
		expect($('consent-dialog-card')).not.toBeNull();
		escape();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
	});
});

describe('receipt', () => {
	test('[RCPT-01][RCPT-03] shows only once something is recorded, always mounted', async () => {
		await mount();
		await openDialog();
		const receipt = must('consent-dialog-receipt');
		expect(receipt.getAttribute('data-open')).toBe('false');
		expect(receipt.hasAttribute('inert')).toBe(true);
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(receipt.getAttribute('data-open')).toBe('true'));
		expect(must('consent-dialog-receipt')).toBe(receipt);
		expect(receipt.textContent).toMatch(/Saved for this browser · just now/u);
		const toggle = must('consent-dialog-receipt-toggle');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		toggle.click();
		await waitFor(() =>
			expect(toggle.getAttribute('aria-expanded')).toBe('true')
		);
		expect(must('consent-dialog-receipt-details').textContent).toMatch(
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
		await waitFor(() =>
			expect($('consent-dialog-copy-reference')).not.toBeNull()
		);
		must('consent-dialog-copy-reference').click();
		await waitFor(() =>
			expect($('consent-dialog-reference-field')).not.toBeNull()
		);
		const field = must<HTMLInputElement>('consent-dialog-reference-field');
		expect(writeText).toHaveBeenCalled();
		expect(field.value.length).toBeGreaterThan(0);
		expect(field.labels?.[0]?.textContent).toMatch(/^Couldn't copy/u);
		await waitFor(() => expect(document.activeElement).toBe(field));
		expect(status()).toMatch(/Couldn't copy/u);
	});
});

describe('GPC', () => {
	test('[GPC-03][GPC-04][GPC-06] the note replaces the intro, only Allow is disabled, and the receipt is live', async () => {
		Object.defineProperty(navigator, 'globalPrivacyControl', {
			configurable: true,
			value: true,
		});
		const gpcContext = await mount();
		gpcContext.kernel.set.overrides({ gpc: true });
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
		expect(must('consent-dialog-rights-row-sale').textContent).toMatch(
			/Global Privacy Control signal/u
		);
		expect(must('consent-dialog-receipt').textContent).toMatch(
			/Honoring Global Privacy Control from this browser/u
		);
	});
});

describe('preferences', () => {
	test('[COPY-05][NEST-01][CAT-08][LAW-05] desktop: an accordion without Marketing, with Advertising following the sale choice', async () => {
		await mount();
		await openDialog();
		const row = must('consent-dialog-preferences-row');
		expect(row.textContent).toMatch(/Preferences/u);
		expect(row.getAttribute('aria-expanded')).toBe('false');
		expect(row.hasAttribute('aria-haspopup')).toBe(false);
		row.click();
		await waitFor(() => expect(row.getAttribute('aria-expanded')).toBe('true'));
		expect($('consent-dialog-category-switch-marketing')).toBeNull();
		const advertising = must('consent-dialog-advertising-row');
		expect(advertising.textContent?.trim()).toMatch(/On$/u);
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() =>
			expect(advertising.textContent?.trim()).toMatch(/Off$/u)
		);
	});

	test('[LAW-04][RCPT-02][CAT-04] a US switch applies at once and keeps the receipt date', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(snapshot()?.optOut).toBeTruthy());
		const recordedAt = snapshot()?.optOut?.recordedAt;
		must('consent-dialog-preferences-row').click();
		await waitFor(() =>
			expect($('consent-dialog-category-switch-functionality')).not.toBeNull()
		);
		const toggle = must('consent-dialog-category-switch-functionality');
		const before = toggle.getAttribute('aria-checked');
		toggle.click();
		await waitFor(() =>
			expect(snapshot()?.explicitChoice?.categories?.functionality?.value).toBe(
				before !== 'true'
			)
		);
		expect(status()).toMatch(/^Functionality (?:on|off)\. Saved\./u);
		expect(snapshot()?.optOut?.recordedAt).toBe(recordedAt);
		expect($('consent-dialog-card')).not.toBeNull();
	});
});

describe('vendors:', () => {
	const openAnalytics = async () => {
		await mount({ region: 'eu' });
		await openDialog();
		await waitFor(() =>
			expect($('consent-dialog-vendor-trigger-measurement')).not.toBeNull()
		);
		return must<HTMLButtonElement>('consent-dialog-vendor-trigger-measurement');
	};

	test('[CAT-05][CAT-09][CAT-07] the trigger names itself from its text and opens a boxed table', async () => {
		const trigger = await openAnalytics();
		expect(trigger.textContent).toMatch(/^View 2 vendors for Analytics/u);
		expect(trigger.textContent).toMatch(/0 on/u);
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		trigger.click();
		await waitFor(() =>
			expect(trigger.getAttribute('aria-expanded')).toBe('true')
		);
		const table = must('consent-dialog-vendor-table-measurement');
		expect(table.getAttribute('role')).toBe('table');
		expect(table.getAttribute('aria-label')).toBe('Analytics vendors');
		expect(table.querySelector('a')?.getAttribute('aria-label')).toBe(
			'Analytics One privacy policy'
		);
		expect(
			must(
				'consent-dialog-vendor-switch-measurement-analytics-one'
			).hasAttribute('disabled')
		).toBe(false);
	});

	test('[CAT-03][CAT-02][CAT-04] a vendor under an off category turns it on alone; the last one off turns it off', async () => {
		const trigger = await openAnalytics();
		trigger.click();
		const one = must('consent-dialog-vendor-switch-measurement-analytics-one');
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
		const toggle = must('consent-dialog-category-switch-functionality');
		const name = document.getElementById(
			toggle.getAttribute('aria-labelledby') ?? ''
		) as HTMLElement;
		name.click();
		await waitFor(() =>
			expect(toggle.getAttribute('aria-checked')).toBe('true')
		);
		must('consent-dialog-vendor-trigger-functionality').click();
		const table = must('consent-dialog-vendor-table-functionality');
		const vendorSwitch = must(
			'consent-dialog-vendor-switch-functionality-mapbox'
		);
		const policy = table.querySelector('a') as HTMLAnchorElement;
		policy.addEventListener('click', (event) => event.preventDefault(), {
			once: true,
		});
		policy.click();
		await settle(1);
		expect(vendorSwitch.getAttribute('aria-checked')).toBe('true');
		// The switch stays the only focus target.
		expect(name.hasAttribute('tabindex')).toBe(false);
	});
});

describe('EU', () => {
	test('[EU-01][EU-03] Reject and Accept are equal; Save waits for an effective change', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		expect(must('consent-dialog-title').textContent?.trim()).toBe(
			'Privacy settings'
		);
		const reject = must('consent-dialog-reject-all');
		const accept = must('consent-dialog-accept-all');
		expect(reject.className).toBe(accept.className);
		expect(reject.getAttribute('data-mode')).toBe(
			accept.getAttribute('data-mode')
		);
		const save = must<HTMLButtonElement>('consent-dialog-save-button');
		expect(save.disabled).toBe(true);
		const toggle = must('consent-dialog-category-switch-experience');
		toggle.click();
		await waitFor(() => expect(save.disabled).toBe(false));
		toggle.click();
		await waitFor(() => expect(save.disabled).toBe(true));
		toggle.click();
		await waitFor(() => expect(save.disabled).toBe(false));
		save.click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		expect(snapshot()?.explicitChoice?.categories?.experience?.value).toBe(
			true
		);
	});

	test('[EU-02] closing without saving discards the draft', async () => {
		await mount({ region: 'eu' });
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
		expect(snapshot()?.explicitChoice).toBeFalsy();
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
		setPhone(true);
		await mount({ region: 'eu' });
		await openDialog();
		await waitFor(() =>
			expect(
				must('consent-dialog-vendor-trigger-measurement').getAttribute(
					'aria-haspopup'
				)
			).toBe('dialog')
		);
		must('consent-dialog-vendor-trigger-measurement').click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		const sheet = must('consent-dialog-sheet');
		await waitFor(() =>
			expect(document.activeElement?.closest('[data-testid]')).toBe(sheet)
		);
		expect(sheet.getAttribute('aria-modal')).toBe('true');
		expect(sheet.textContent).toMatch(
			/Changes apply when you save in Privacy settings\./u
		);
		expect(card().hasAttribute('aria-modal')).toBe(false);
		expect(card().hasAttribute('inert')).toBe(true);
		expect(card().hasAttribute('data-nested-open')).toBe(true);
		// No id repeats across the layers.
		const ids = [...document.querySelectorAll('[id]')].map(({ id }) => id);
		expect(new Set(ids).size).toBe(ids.length);
		// The sheet mirrors the category switch (NEST-07).
		expect(
			sheet.querySelector(
				'[data-testid="consent-dialog-category-switch-measurement"]'
			)
		).not.toBeNull();
		escape();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect($('consent-dialog-card')).not.toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe(
				$('consent-dialog-vendor-trigger-measurement')
			)
		);
		expect(card().getAttribute('aria-modal')).toBe('true');
	});

	test('[NEST-01][COPY-05][NEST-08] US Preferences opens a sheet; its Done closes only it', async () => {
		setPhone(true);
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			edgeStyle: 'flush',
		});
		await openDialog();
		expect(must('consent-dialog-root').getAttribute('data-edge-style')).toBe(
			'flush'
		);
		const row = must('consent-dialog-preferences-row');
		await waitFor(() =>
			expect(row.getAttribute('aria-haspopup')).toBe('dialog')
		);
		row.click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		const sheet = must('consent-dialog-sheet');
		expect(sheet.textContent).toMatch(/Saved automatically/u);
		expect(
			sheet.querySelector('[aria-label="Close preferences"]')
		).not.toBeNull();
		must('consent-dialog-sheet-done').click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(row));
	});
});

describe('legal links', () => {
	const legalLinks = {
		cookiePolicy: { href: '/cookies' },
		privacyPolicy: { href: '/privacy' },
	};
	const footerLink = () => $('consent-dialog-legal-link-privacyPolicy');

	test('with `dialogLegalLinks` unset, the footer links the privacy policy', async () => {
		await mount({ config: { legalLinks } });
		await openDialog();
		expect(footerLink()?.getAttribute('href')).toBe('/privacy');
	});

	test('an empty `dialogLegalLinks` and a list without the link leave it out', async () => {
		await mount({ config: { dialogLegalLinks: [], legalLinks } });
		await openDialog();
		expect(footerLink()).toBeNull();
		await unmountConsentUI();
		await mount({
			config: { dialogLegalLinks: ['cookiePolicy'], legalLinks },
		});
		await openDialog();
		expect(footerLink()).toBeNull();
	});

	test('a list that names the link keeps it', async () => {
		await mount({
			config: { dialogLegalLinks: ['privacyPolicy'], legalLinks },
		});
		await openDialog();
		expect(footerLink()?.getAttribute('href')).toBe('/privacy');
	});
});

describe('customization', () => {
	test('the dialog parts take their components slots', async () => {
		await mount({
			config: {
				components: {
					dialog: {
						doneButton: { class: 'my-done' },
						footer: { class: 'my-footer', noStyle: true } as object,
						rightsRow: { class: 'my-rights' },
					},
				},
			},
		});
		await openDialog();
		expect(must('consent-dialog-footer').className).toBe('my-footer');
		expect(must('consent-dialog-done').className).toMatch(/my-done/u);
		expect(must('consent-dialog-rights-row-sale').className).toMatch(
			/my-rights/u
		);
	});
});

describe('wave B round 1', () => {
	test('[BNR-13] the dialog hosts an opt-in confirmation when no banner does', async () => {
		await mount();
		await openDialog();
		const confirmed = vi.fn();
		openOptInConfirmation(kernel(), confirmed, null);
		await waitFor(() =>
			expect($('opt-in-confirmation-confirm-button')).not.toBeNull()
		);
		must<HTMLButtonElement>('opt-in-confirmation-confirm-button').click();
		await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
	});

	test('showTrigger renders the floating trigger', async () => {
		await mount({ config: { showTrigger: true } });
		await waitFor(() => expect($('consent-dialog-trigger')).not.toBeNull());
		expect($('consent-dialog-card')).toBeNull();
	});

	test('[RCPT-01][FOC-03] the opt-out confirmation opens the dialog on its receipt', async () => {
		// A one-click opt-out with no reload due opens the confirmation,
		// which is the dialog, focused on the receipt.
		await mount({
			config: { reloadOnConsentRevoked: false },
			page: () => h(OptOutNow),
		});
		const button = must<HTMLButtonElement>('one-click-opt-out');
		button.focus();
		button.click();
		await waitFor(() =>
			expect(
				$('consent-dialog-receipt')?.getAttribute('data-open') ?? null
			).toBe('true')
		);
		const receipt = must('consent-dialog-receipt');
		await waitFor(() => expect(document.activeElement).toBe(receipt));
		expect(receipt.getAttribute('tabindex')).toBe('-1');
		expect(receipt.textContent).toMatch(/opted out/iu);
		expect($('opt-out-confirmation-card')).toBeNull();
		expect(snapshot()?.optOut).not.toBeNull();
		// A later open starts on the title again.
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await openDialog();
	});

	test('[RIGHT-08] after a revocation reload, the dialog reopens on the receipt', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(snapshot()?.optOut).not.toBeNull());
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		// What the next document does when the opt-out reloaded the page:
		// the marker opens the confirmation once, which is this dialog.
		markPendingOptOutConfirmation();
		const stop = watchPendingOptOutConfirmation(kernel());
		await waitFor(() => expect($('consent-dialog-card')).not.toBeNull());
		const receipt = must('consent-dialog-receipt');
		await waitFor(() => expect(document.activeElement).toBe(receipt));
		expect(hasPendingOptOutConfirmation()).toBe(false);
		expect($('opt-out-confirmation-card')).toBeNull();
		stop();
	});

	test('[BNR-05] Your Privacy Choices stays a way back in under US opt-in, without the opt-out icon', async () => {
		await mount({ link: 'stock', region: 'us-opt-in' });
		const choices = link();
		expect(choices.textContent?.trim()).toBe('Your Privacy Choices');
		expect(choices.querySelector('svg')).toBeNull();
		expect(choices.hasAttribute('data-opt-out-variant')).toBe(false);
		await openDialog();
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(link()));
	});

	test('[BNR-05] Your Privacy Choices stays the opt-out link under an opt-out policy', async () => {
		await mount({ link: 'stock' });
		expect(link().getAttribute('data-opt-out-variant')).not.toBeNull();
	});

	test('[FOC-03] with the opener gone, focus returns to Your Privacy Choices', async () => {
		const current = await mount({ link: 'stock' });
		pageAction().focus();
		current.activeUI.value = 'manager';
		await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
		pageAction().remove();
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(link()));
	});

	test('[NEST-03] only the top layer is exposed: covered and folded parts carry a real inert', async () => {
		const resize = setPhoneLive(true);
		await mount();
		await openDialog();
		// The receipt is folded until there is something to show.
		expect(must('consent-dialog-receipt').hasAttribute('inert')).toBe(true);
		must('consent-dialog-preferences-row').click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		expect(card().hasAttribute('inert')).toBe(true);
		expect(must('consent-dialog-sheet').hasAttribute('inert')).toBe(false);
		resize(false);
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect(card().hasAttribute('inert')).toBe(false);
		expect(must('consent-dialog-preferences-panel').hasAttribute('inert')).toBe(
			true
		);
	});

	test('[NEST-03][NEST-06] a sheet reopened during its exit stays open', async () => {
		const resize = setPhoneLive(true);
		await mount({ config: { disableAnimation: false } });
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
		// A move to desktop clears a closing sheet at once.
		must('consent-dialog-sheet-close').click();
		await waitFor(() =>
			expect(must('consent-dialog-sheet').getAttribute('data-state')).toBe(
				'closed'
			)
		);
		resize(false);
		await settle(1);
		expect($('consent-dialog-sheet')).toBeNull();
	});

	test('[NEST-01] phone sheets take the resolved phone edge style: a Card is always inset', async () => {
		setPhone(true);
		await mount({ edgeStyle: 'flush' });
		await openDialog();
		expect(must('consent-dialog-root').getAttribute('data-edge-style')).toBe(
			'inset'
		);
	});

	test('[CAT-09] sheet chevrons point to the reading direction; accordion chevrons point down', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		const vendor = must('consent-dialog-vendor-trigger-measurement');
		expect(
			vendor.querySelector('[data-direction]')?.getAttribute('data-direction')
		).toBe('down');
		expect(
			must('consent-dialog-root').querySelector('[data-direction="end"]')
		).toBeNull();
	});

	test('[CAT-09] the phone Preferences chevron points the reading direction', async () => {
		setPhone(true);
		await mount({ language: 'he' });
		await openDialog();
		expect(must('consent-dialog-root').getAttribute('dir')).toBe('rtl');
		expect(
			must('consent-dialog-preferences-row').querySelector(
				'[data-direction="end"]'
			)
		).not.toBeNull();
	});

	test('[COPY-05] the Preferences count follows the draft as it changes', async () => {
		await mount();
		await openDialog();
		const row = must('consent-dialog-preferences-row');
		const before = row.textContent;
		row.click();
		await waitFor(() =>
			expect($('consent-dialog-category-switch-measurement')).not.toBeNull()
		);
		must('consent-dialog-category-switch-measurement').click();
		await waitFor(() => expect(row.textContent).not.toBe(before));
	});
});

describe('wave B round 2', () => {
	test('[MOT-03] disableAnimation turns the dialog motion off and drops a sheet at once', async () => {
		setPhone(true);
		await mount({ config: { disableAnimation: false } });
		await openDialog();
		expect(must('consent-dialog-root').hasAttribute('data-animation')).toBe(
			false
		);
		await unmountConsentUI();

		await mount();
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
});
