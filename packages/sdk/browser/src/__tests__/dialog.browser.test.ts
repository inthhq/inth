/**
 * The "Your Privacy Choices" dialog of the script tag, ported from
 * `@inth/react`'s dialog tests: the
 * US first view and its rights, the receipt, Preferences, vendors and row
 * clicks, the EU staged model, phone sheets, focus, Escape and
 * announcements. Each test names the invariant it guards
 * (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`).
 */
import type { ConsentContainer } from '@inth/sdk-core';
import {
	hasPendingOptOutConfirmation,
	markPendingOptOutConfirmation,
	openOptInConfirmation,
	showConsentSurface,
	watchPendingOptOutConfirmation,
} from '@inth/sdk-core/surface-actions';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';

import type { ConsentDialogOptions } from '../consent-client.model';
import { createPrivacyChoicesLink } from '../ui/create-privacy-choices-link';
import { mountConsentUI } from '../ui/mount-consent-ui';
import {
	$,
	active,
	all,
	byId,
	must,
	pageAction,
	snapshotOf,
	startConsentPage,
	stopConsentPages,
} from './fixtures/consent-ui';
import type { ConsentPageOptions, Region } from './fixtures/consent-ui';

const mount = ({
	region = 'us-opt-out',
	edgeStyle,
	gpc,
	container = { type: 'card' },
	privacyChoicesLink = region !== 'eu',
	...rest
}: {
	region?: Region;
	edgeStyle?: 'inset' | 'flush';
	gpc?: boolean;
	container?: ConsentContainer;
	privacyChoicesLink?: boolean;
} & Pick<
	ConsentPageOptions,
	'animate' | 'banner' | 'dialog' | 'language' | 'stockTrigger'
> = {}) =>
	startConsentPage({
		...rest,
		container,
		edgeStyle,
		gpc,
		privacyChoicesLink,
		region,
		// The React dialog suite's GPC rule denies marketing only.
		rule:
			region === 'eu'
				? undefined
				: { privacySignals: { gpc: { denyCategories: ['marketing'] } } },
		vendors: true,
	});

/** "Your Privacy Choices" in the US; a page control that opens the dialog elsewhere. */
const link = () =>
	$<HTMLButtonElement>('privacy-choices-link') ??
	must<HTMLButtonElement>('consent-dialog-trigger');
const card = () => must('consent-dialog-card');
const waitFor = <T>(check: () => T) => vi.waitFor(check, { timeout: 4000 });

/** Open the dialog and wait for its title to take focus. */
const openDialog = async function openDialog() {
	await waitFor(() => expect(link()).not.toBeNull());
	link().focus();
	link().click();
	await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
	await waitFor(() => expect(active()).toBe(must('consent-dialog-title')));
};

const status = () => must('consent-dialog-status').textContent ?? '';

beforeEach(async () => {
	await page.viewport(1280, 800);
});

afterEach(() => {
	stopConsentPages();
	vi.restoreAllMocks();
});

describe('opening', () => {
	test('[FOC-02][FOC-03][LAY-01] opens on its title as a modal dialog over an inert page', async () => {
		await mount();
		await openDialog();
		expect(card()).toHaveAttribute('role', 'dialog');
		expect(card()).toHaveAttribute('aria-modal', 'true');
		expect(card().getAttribute('aria-labelledby')).toBe(
			must('consent-dialog-title').id
		);
		expect(pageAction().closest('[inert]')).not.toBeNull();
		// Only the body scrolls.
		expect(getComputedStyle(must('consent-dialog-content')).overflowY).toBe(
			'auto'
		);
		expect(card().getBoundingClientRect().width).toBeLessThanOrEqual(521);
	});

	test('[FOC-03][ARCH-03] Done closes and returns focus to the opener', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-done').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(active()).toBe(link()));
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
		await waitFor(() => expect(active()).toBe(must('consent-banner-card')));
		expect($('consent-dialog-card')).toBeNull();
	});

	test('[FOC-01] the trap keeps Shift+Tab from the title inside the dialog', async () => {
		await mount();
		await openDialog();
		await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
		expect(card().contains(active())).toBe(true);
		await userEvent.keyboard('{Tab}');
		expect(card().contains(active())).toBe(true);
	});
});

describe('US first view', () => {
	test('[LAW-01][LAY-04][LAW-04] rights first, the one-line intro, and only Done', async () => {
		await mount();
		await openDialog();
		expect(must('consent-dialog-intro')).toMatchTextContent(
			'Your choices apply right away.'
		);
		const row = must('consent-dialog-rights-row-sale');
		expect(row).toBeVisible();
		const group = row.querySelector('[role="group"]');
		expect(group?.getAttribute('aria-label')).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		const footerButtons = must('consent-dialog-footer').querySelectorAll(
			'button'
		);
		expect(footerButtons).toHaveLength(1);
		expect(must('consent-dialog-done')).toMatchTextContent('Done');
		expect(must('consent-dialog-legal-link-privacyPolicy')).toHaveAttribute(
			'href',
			'/privacy'
		);
	});

	test('[LAW-02][RIGHT-06][RIGHT-04][SR-01][SR-07] opt out in one press; allowing again asks first and nudges', async () => {
		await mount();
		await openDialog();
		const done = must('consent-dialog-done');
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(snapshotOf()?.optOut).toBeTruthy());
		await waitFor(() => expect(status()).toMatch(/^Opted out of .*Saved\./u));
		// Done keeps its node and its label (FOC-06, SR-07).
		expect(must('consent-dialog-done')).toBe(done);
		expect(done).toMatchTextContent('Done');
		expect($('consent-dialog-saved-cue')).not.toBeNull();

		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(active()).toBe(must('consent-dialog-confirm-cancel'))
		);
		expect(snapshotOf()?.optOut).toBeTruthy();
		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(must('consent-dialog-confirm')).toHaveAttribute(
				'data-nudged',
				'true'
			)
		);
		expect(status()).toMatch(/Choose one of the two buttons first\./u);
		expect(snapshotOf()?.optOut).toBeTruthy();
		must('consent-dialog-confirm-allow').click();
		await waitFor(() => expect(snapshotOf()?.optOut).toBeFalsy());
		// The dialog stays open after a rights choice.
		expect($('consent-dialog-card')).not.toBeNull();
	});

	test('[FOC-04] Escape closes the confirmation first, then the dialog', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(snapshotOf()?.optOut).toBeTruthy());
		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(active()).toBe(must('consent-dialog-confirm-cancel'))
		);
		await userEvent.keyboard('{Escape}');
		await waitFor(() =>
			expect(
				must('consent-dialog-confirm').closest('[data-open]')
			).toHaveAttribute('data-open', 'false')
		);
		expect($('consent-dialog-card')).not.toBeNull();
		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
	});
});

describe('receipt', () => {
	test('[RCPT-01][RCPT-03] shows only once something is recorded, always mounted', async () => {
		await mount();
		await openDialog();
		const receipt = must('consent-dialog-receipt');
		expect(receipt).toHaveAttribute('data-open', 'false');
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(receipt).toHaveAttribute('data-open', 'true'));
		expect(must('consent-dialog-receipt')).toBe(receipt);
		expect(receipt).toMatchTextContent(/Saved for this browser · just now/u);
		const toggle = must('consent-dialog-receipt-toggle');
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		toggle.click();
		await waitFor(() =>
			expect(toggle).toHaveAttribute('aria-expanded', 'true')
		);
		expect(must('consent-dialog-receipt-details')).toMatchTextContent(
			/Applies to this browser\./u
		);
	});

	test('[CLIP-01][CLIP-02] a failed copy shows a labelled field with the reference and focuses it', async () => {
		const writeText = vi.fn(() => Promise.reject(new Error('denied')));
		const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		});
		try {
			await mount();
			await openDialog();
			must('consent-dialog-right-option-sale-protect').click();
			await waitFor(() =>
				expect(must('consent-dialog-receipt')).toHaveAttribute(
					'data-open',
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
			await waitFor(() => expect(active()).toBe(field));
			expect(status()).toMatch(/Couldn't copy/u);
		} finally {
			if (previous) {
				Object.defineProperty(navigator, 'clipboard', previous);
			} else {
				Reflect.deleteProperty(navigator, 'clipboard');
			}
		}
	});
});

describe('GPC', () => {
	test('[GPC-03][GPC-04][GPC-06] the note replaces the intro, only Allow is disabled, and the receipt is live', async () => {
		await mount({ gpc: true });
		await openDialog();
		await waitFor(() =>
			expect(must('consent-dialog-right-option-sale-allow')).toHaveAttribute(
				'aria-disabled',
				'true'
			)
		);
		expect($('consent-dialog-intro')).toBeNull();
		expect(
			must('consent-dialog-right-option-sale-protect')
		).not.toHaveAttribute('aria-disabled');
		expect(must('consent-dialog-rights-row-sale')).toMatchTextContent(
			/Global Privacy Control signal/u
		);
		expect(must('consent-dialog-receipt')).toMatchTextContent(
			'Honoring Global Privacy Control from this browser'
		);
	});
});

describe('preferences', () => {
	test('[COPY-05][NEST-01][CAT-08][LAW-05] desktop: an accordion without Marketing, with Advertising following the sale choice', async () => {
		await mount();
		await openDialog();
		const row = must('consent-dialog-preferences-row');
		expect(row).toMatchTextContent(/Preferences/u);
		expect(row).toHaveAttribute('aria-expanded', 'false');
		expect(row).not.toHaveAttribute('aria-haspopup');
		row.click();
		await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'));
		expect($('consent-dialog-category-switch-marketing')).toBeNull();
		const advertising = must('consent-dialog-advertising-row');
		expect(advertising).toMatchTextContent(/On$/u);
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(advertising).toMatchTextContent(/Off$/u));
	});

	test('[LAW-04][RCPT-02][CAT-04] a US switch applies at once and keeps the receipt date', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(snapshotOf()?.optOut).toBeTruthy());
		const recordedAt = snapshotOf()?.optOut?.recordedAt;
		must('consent-dialog-preferences-row').click();
		const sw = await waitFor(() =>
			must<HTMLButtonElement>('consent-dialog-category-switch-functionality')
		);
		const before = sw.getAttribute('aria-checked');
		sw.click();
		await waitFor(() =>
			expect(
				snapshotOf()?.explicitChoice?.categories?.functionality?.value
			).toBe(before !== 'true')
		);
		expect(status()).toMatch(/^Functionality (?:on|off)\. Saved\./u);
		expect(snapshotOf()?.optOut?.recordedAt).toBe(recordedAt);
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
		expect(trigger.textContent).toMatch(/^View 2 vendors for Analytics/u);
		expect(trigger).toMatchTextContent(/0 on/u);
		expect(trigger).toHaveAttribute('aria-expanded', 'false');
		trigger.click();
		await waitFor(() =>
			expect(trigger).toHaveAttribute('aria-expanded', 'true')
		);
		const table = must('consent-dialog-vendor-table-measurement');
		expect(table).toHaveAttribute('role', 'table');
		expect(table).toHaveAttribute('aria-label', 'Analytics vendors');
		const policy = table.querySelector('a');
		expect(policy).toHaveAttribute(
			'aria-label',
			'Analytics One privacy policy'
		);
		const sw = must('consent-dialog-vendor-switch-measurement-analytics-one');
		expect(sw).not.toHaveAttribute('disabled');
	});

	test('[CAT-03][CAT-02][CAT-04] a vendor under an off category turns it on alone; the last one off turns it off', async () => {
		const trigger = await openAnalytics();
		trigger.click();
		const one = await waitFor(() =>
			must('consent-dialog-vendor-switch-measurement-analytics-one')
		);
		const two = must('consent-dialog-vendor-switch-measurement-analytics-two');
		const category = must('consent-dialog-category-switch-measurement');
		expect(category).toHaveAttribute('aria-checked', 'false');
		one.click();
		await waitFor(() =>
			expect(category).toHaveAttribute('aria-checked', 'true')
		);
		expect(one).toHaveAttribute('aria-checked', 'true');
		expect(two).toHaveAttribute('aria-checked', 'false');
		// The zero-width flip makes a repeat a new text (SR-03).
		expect(status().replace('​', '')).toBe('Analytics One on. Analytics on.');
		one.click();
		await waitFor(() =>
			expect(category).toHaveAttribute('aria-checked', 'false')
		);
		expect(status()).toMatch(/^Analytics One off\. Analytics off\./u);
		// Turning the category on with no vendor on turns them all on.
		category.click();
		await waitFor(() => expect(one).toHaveAttribute('aria-checked', 'true'));
		expect(two).toHaveAttribute('aria-checked', 'true');
	});
});

describe('row click:', () => {
	test('[CAT-10] a click on the name toggles; the policy link does not', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		const sw = await waitFor(() =>
			must('consent-dialog-category-switch-functionality')
		);
		const name = byId(sw.getAttribute('aria-labelledby')) as HTMLElement;
		name.click();
		await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
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
		expect(vendorSwitch).toHaveAttribute('aria-checked', 'true');
		// The switch stays the only focus target.
		expect(name).not.toHaveAttribute('tabindex');
	});
});

describe('EU', () => {
	test('[EU-01][EU-03] Reject and Accept are equal; Save waits for an effective change', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		expect(must('consent-dialog-title')).toMatchTextContent('Privacy settings');
		const reject = must('consent-dialog-reject-all');
		const accept = must('consent-dialog-accept-all');
		expect(reject.className).toBe(accept.className);
		expect(reject.getBoundingClientRect().height).toBe(
			accept.getBoundingClientRect().height
		);
		const save = must<HTMLButtonElement>('consent-dialog-save-button');
		expect(save.disabled).toBe(true);
		const sw = must('consent-dialog-category-switch-experience');
		sw.click();
		await waitFor(() => expect(save.disabled).toBe(false));
		sw.click();
		await waitFor(() => expect(save.disabled).toBe(true));
		sw.click();
		await waitFor(() => expect(save.disabled).toBe(false));
		save.click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		expect(snapshotOf()?.explicitChoice?.categories?.experience?.value).toBe(
			true
		);
	});

	test('[EU-02] closing without saving discards the draft', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		must('consent-dialog-category-switch-experience').click();
		await waitFor(() =>
			expect(must('consent-dialog-category-switch-experience')).toHaveAttribute(
				'aria-checked',
				'true'
			)
		);
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		expect(snapshotOf()?.explicitChoice).toBeFalsy();
		await openDialog();
		expect(must('consent-dialog-category-switch-experience')).toHaveAttribute(
			'aria-checked',
			'false'
		);
		expect(must<HTMLButtonElement>('consent-dialog-save-button').disabled).toBe(
			true
		);
	});
});

describe('phone sheets', () => {
	test('[NEST-02][NEST-03][NEST-04][SR-05][EU-05] the EU vendor sheet covers the dialog, and Escape closes only it', async () => {
		await page.viewport(390, 800);
		await mount({ region: 'eu' });
		await openDialog();
		const trigger = await waitFor(() =>
			must('consent-dialog-vendor-trigger-measurement')
		);
		expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
		trigger.click();
		const sheet = await waitFor(() => must('consent-dialog-sheet'));
		await waitFor(() => expect(active()?.closest('[data-testid]')).toBe(sheet));
		expect(sheet).toHaveAttribute('aria-modal', 'true');
		expect(sheet).toMatchTextContent(
			'Changes apply when you save in Privacy settings.'
		);
		expect(card()).not.toHaveAttribute('aria-modal');
		expect(card()).toHaveAttribute('inert');
		expect(card()).toHaveAttribute('data-nested-open');
		// No id repeats across the layers.
		const ids = all('[id]').map(({ id }) => id);
		expect(new Set(ids).size).toBe(ids.length);
		// The sheet mirrors the category switch, so it is never a dead end
		// (NEST-07).
		expect(
			sheet.querySelector(
				'[data-testid="consent-dialog-category-switch-measurement"]'
			)
		).not.toBeNull();
		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect($('consent-dialog-card')).not.toBeNull();
		await waitFor(() =>
			expect(active()).toBe(must('consent-dialog-vendor-trigger-measurement'))
		);
		expect(card()).toHaveAttribute('aria-modal', 'true');
	});

	test('[NEST-01][COPY-05][NEST-08] US Preferences opens a sheet; its Done closes only it', async () => {
		await page.viewport(390, 800);
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			edgeStyle: 'flush',
		});
		await openDialog();
		expect(must('consent-dialog-root')).toHaveAttribute(
			'data-edge-style',
			'flush'
		);
		const row = must('consent-dialog-preferences-row');
		expect(row).toHaveAttribute('aria-haspopup', 'dialog');
		row.click();
		const sheet = await waitFor(() => must('consent-dialog-sheet'));
		expect(sheet).toMatchTextContent('Saved automatically');
		expect(
			sheet.querySelector('[aria-label="Close preferences"]')
		).not.toBeNull();
		must('consent-dialog-sheet-done').click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		await waitFor(() => expect(active()).toBe(row));
	});

	test('[NEST-05] a tap on the dimmed parent closes the sheet and nothing under it', async () => {
		await page.viewport(390, 800);
		await mount({ region: 'eu' });
		await openDialog();
		must('consent-dialog-vendor-trigger-measurement').click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		const close = must('consent-dialog-close');
		close.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, composed: true })
		);
		close.click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect($('consent-dialog-card')).not.toBeNull();
	});
});

describe('wave B round 1', () => {
	test('[BNR-13] the dialog hosts an opt-in confirmation when no banner does', async () => {
		const client = await mount({ banner: false, region: 'us-opt-in' });
		const confirmed = vi.fn();
		openOptInConfirmation(client.kernel, confirmed, null);
		const confirm = await waitFor(() =>
			must<HTMLButtonElement>('opt-in-confirmation-confirm-button')
		);
		confirm.click();
		await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
	});

	test('the floating trigger renders beside the dialog host', async () => {
		await mount({ stockTrigger: true });
		await waitFor(() =>
			expect(all('[data-testid="consent-dialog-trigger"]')).toHaveLength(1)
		);
		expect($('consent-dialog-card')).toBeNull();
	});

	test('[RCPT-01][FOC-03] the opt-out confirmation opens the dialog on its receipt', async () => {
		// A one-click opt-out with no reload due opens the confirmation: the
		// dialog, focused on the receipt.
		const client = await mount();
		await client.optOut();
		const receipt = await waitFor(() => must('consent-dialog-receipt'));
		await waitFor(() => expect(active()).toBe(receipt));
		expect(receipt).toHaveAttribute('data-open', 'true');
		expect(receipt).toHaveAttribute('tabindex', '-1');
		expect(receipt).toMatchTextContent(/opted out/iu);
		expect($('opt-out-confirmation-card')).toBeNull();
		expect(snapshotOf()?.optOut).not.toBeNull();
		// A later open starts on the title again.
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await openDialog();
	});

	test('[RIGHT-08] after a revocation reload, the dialog reopens on the receipt', async () => {
		const client = await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(snapshotOf()?.optOut).not.toBeNull());
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		// What the next document does when the opt-out reloaded the page:
		// the marker opens the confirmation once, which is this dialog.
		markPendingOptOutConfirmation();
		const stop = watchPendingOptOutConfirmation(client.kernel);
		const receipt = await waitFor(() => must('consent-dialog-receipt'));
		await waitFor(() => expect(active()).toBe(receipt));
		expect(hasPendingOptOutConfirmation()).toBe(false);
		expect($('opt-out-confirmation-card')).toBeNull();
		stop();
	});

	test('[BNR-05] Your Privacy Choices stays a way back in under US opt-in, without the opt-out icon', async () => {
		const client = await mount({
			privacyChoicesLink: false,
			region: 'us-opt-in',
		});
		const choices = createPrivacyChoicesLink(client);
		document.body.append(choices.element);
		expect(choices.element.hidden).toBe(false);
		expect(choices.element).toMatchTextContent('Your Privacy Choices');
		expect(choices.element.querySelector('svg')).toBeNull();
		expect(choices.element).not.toHaveAttribute('data-opt-out-variant');
		await openDialog();
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(active()).toBe(choices.element));
		choices.destroy();
	});

	test('[BNR-05] under an opt-out policy the link is the opt-out link, with the icon', async () => {
		const client = await mount({ privacyChoicesLink: false });
		const choices = createPrivacyChoicesLink(client, {
			variant: 'privacy-choices',
		});
		expect(choices.element.hidden).toBe(false);
		expect(choices.element).toHaveAttribute(
			'data-opt-out-variant',
			'privacy-choices'
		);
		expect(choices.element.querySelector('svg')).not.toBeNull();
		choices.destroy();
	});

	test('[FOC-03] with the opener and the link gone, focus returns to the trigger', async () => {
		const client = await mount({ privacyChoicesLink: false, region: 'eu' });
		pageAction().focus();
		client.openDialog();
		await waitFor(() => expect(active()).toBe(must('consent-dialog-title')));
		pageAction().remove();
		must('consent-dialog-close').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(active()).toBe(must('consent-dialog-trigger')));
	});

	test('[NEST-03] only the top layer is exposed: covered and folded parts carry a real inert', async () => {
		await page.viewport(390, 800);
		await mount();
		await openDialog();
		// The receipt is folded until there is something to show.
		expect(must('consent-dialog-receipt')).toHaveAttribute('inert');
		must('consent-dialog-preferences-row').click();
		const sheet = await waitFor(() => must('consent-dialog-sheet'));
		expect(card()).toHaveAttribute('inert', '');
		expect(sheet).not.toHaveAttribute('inert');
		await page.viewport(1280, 800);
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect(card()).not.toHaveAttribute('inert');
		expect(must('consent-dialog-preferences-panel')).toHaveAttribute(
			'inert',
			''
		);
	});

	test('[NEST-03][NEST-06] a sheet reopened during its exit stays open', async () => {
		await page.viewport(390, 800);
		await mount({ animate: true });
		await openDialog();
		const row = must('consent-dialog-preferences-row');
		row.click();
		await waitFor(() => expect($('consent-dialog-sheet')).not.toBeNull());
		must('consent-dialog-sheet-close').click();
		await waitFor(() =>
			expect(must('consent-dialog-sheet')).toHaveAttribute(
				'data-state',
				'closed'
			)
		);
		row.click();
		await waitFor(() =>
			expect(must('consent-dialog-sheet')).toHaveAttribute('data-state', 'open')
		);
		// Past the old exit timer, the reopened sheet is still there.
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(must('consent-dialog-sheet')).toHaveAttribute('data-state', 'open');
		expect(must('consent-dialog-sheet')).not.toHaveAttribute('inert');
		// A move to desktop clears a closing sheet at once.
		must('consent-dialog-sheet-close').click();
		await page.viewport(1280, 800);
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
	});

	test('[NEST-01] phone sheets take the resolved phone edge style: a Card is always inset', async () => {
		await page.viewport(390, 800);
		await mount({ edgeStyle: 'flush' });
		await openDialog();
		expect(must('consent-dialog-root')).toHaveAttribute(
			'data-edge-style',
			'inset'
		);
	});

	test('[CAT-09] the vendor chevron turns when its table opens', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		const trigger = must('consent-dialog-vendor-trigger-measurement');
		const chevron = trigger.querySelector<HTMLElement>('[data-direction]');
		expect(chevron).not.toBeNull();
		const transform = () => getComputedStyle(chevron as HTMLElement).transform;
		expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform());
		trigger.click();
		await waitFor(() =>
			expect(transform()).toMatch(/^matrix\(-1, [-0-9.e]+, [-0-9.e]+, -1,/u)
		);
	});

	test('[CAT-09] the phone Preferences chevron points the reading direction', async () => {
		await page.viewport(390, 800);
		await mount({ language: 'he' });
		await openDialog();
		expect(must('consent-dialog-root')).toHaveAttribute('dir', 'rtl');
		const chevron = must('consent-dialog-preferences-row').querySelector(
			'[data-direction="end"]'
		) as HTMLElement;
		await waitFor(() =>
			expect(getComputedStyle(chevron).transform).toBe(
				'matrix(-1, 0, 0, 1, 0, 0)'
			)
		);
	});

	test('noStyle reaches Done and the EU buttons', async () => {
		const client = await mount({ privacyChoicesLink: false, region: 'eu' });
		client.ui?.destroy();
		const handle = mountConsentUI(client, {
			disableAnimation: true,
			noStyle: true,
		});
		client.openDialog();
		const part = (testId: string) =>
			handle.root.querySelector(`[data-testid="${testId}"]`);
		await waitFor(() =>
			expect(part('consent-dialog-save-button')).not.toBeNull()
		);
		for (const id of [
			'consent-dialog-reject-all',
			'consent-dialog-accept-all',
			'consent-dialog-save-button',
		]) {
			expect(part(id)?.getAttribute('class') ?? '').toBe('');
		}
		handle.destroy();
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
	test('[MOT-03] disableAnimation turns the dialog motion off and drops a sheet at once', async () => {
		await page.viewport(390, 800);
		await mount({ animate: true });
		await openDialog();
		expect(must('consent-dialog-root')).not.toHaveAttribute('data-animation');
		expect(getComputedStyle(card()).animationName).not.toBe('none');
		stopConsentPages();

		await mount();
		await openDialog();
		const root = must('consent-dialog-root');
		expect(root).toHaveAttribute('data-animation', 'off');
		expect(getComputedStyle(root).animationName).toBe('none');
		expect(getComputedStyle(card()).animationName).toBe('none');
		expect(getComputedStyle(card()).transitionDuration).toBe('0s');
		must('consent-dialog-preferences-row').click();
		const sheet = await waitFor(() => must('consent-dialog-sheet'));
		expect(getComputedStyle(sheet).animationName).toBe('none');
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

	test.each<[ConsentDialogOptions['legalLinks'], boolean]>([
		[undefined, true],
		[null, false],
		[['cookiePolicy'], false],
		[['privacyPolicy'], true],
	])(
		'legalLinks=%j on the dialog: null hides the footer link, a list allows it (shown: %s)',
		async (legalLinks, shown) => {
			await mount({ dialog: { legalLinks } });
			await openDialog();
			expect($('consent-dialog-legal-link-privacyPolicy') !== null).toBe(shown);
		}
	);
});

describe('wave C round 1', () => {
	test('[ARCH-03] the root carries the surface marker, the consentDialog slot and part', async () => {
		await startConsentPage({
			privacyChoicesLink: true,
			region: 'us-opt-out',
			slots: { consentDialog: 'host-dialog' },
		});
		await openDialog();
		const root = must('consent-dialog-root');
		expect(root).toHaveAttribute('data-inth-surface', 'dialog');
		expect(root.getAttribute('part')?.split(' ')).toContain('consentDialog');
		expect(root).toHaveClass('host-dialog');
	});

	test('the root takes consentDialogOverlay with consentDialog, as dialog.overlay does in React', async () => {
		await startConsentPage({
			privacyChoicesLink: true,
			region: 'us-opt-out',
			slots: {
				consentDialog: { className: 'host-dialog', style: { opacity: 0.9 } },
				consentDialogOverlay: {
					className: 'host-overlay',
					style: { opacity: 0.4, outlineWidth: 3 },
				},
			},
		});
		await openDialog();
		const root = must('consent-dialog-root');
		const stock = root.classList.length;
		expect(root.getAttribute('part')?.split(' ')).toEqual(
			expect.arrayContaining(['consentDialog', 'consentDialogOverlay'])
		);
		expect(root).toHaveClass('host-dialog', 'host-overlay');
		// The stock backdrop class stays; the container wins a shared style.
		expect(stock).toBeGreaterThan(2);
		expect(root.style.opacity).toBe('0.9');
		expect(root.style.outlineWidth).toBe('3px');
	});

	test.each(['consentDialog', 'consentDialogOverlay'] as const)(
		'a noStyle %s drops only the stock backdrop class, not the other slot',
		async (withNoStyle) => {
			await startConsentPage({
				privacyChoicesLink: true,
				region: 'us-opt-out',
				slots: {
					consentDialog: {
						className: 'host-dialog',
						noStyle: withNoStyle === 'consentDialog',
					},
					consentDialogOverlay: {
						className: 'host-overlay',
						noStyle: withNoStyle === 'consentDialogOverlay',
					},
				},
			});
			await openDialog();
			const root = must('consent-dialog-root');
			expect([...root.classList].sort()).toEqual([
				'host-dialog',
				'host-overlay',
			]);
		}
	);

	test('the intro takes the consentDialogDescription slot and part, as description.dialog does in React', async () => {
		await startConsentPage({
			privacyChoicesLink: true,
			region: 'us-opt-out',
			slots: { consentDialogDescription: 'host-intro' },
		});
		await openDialog();
		const intro = must('consent-dialog-intro');
		expect(intro).toHaveClass('host-intro');
		expect(intro.getAttribute('part')?.split(' ')).toContain(
			'consentDialogDescription'
		);
	});

	test('[FOC-03] focus return skips an opener and a link that cannot take focus', async () => {
		await mount();
		await openDialog();
		// The page hides its footer link with CSS; it keeps its test id.
		must('privacy-choices-link').style.display = 'none';
		must('consent-dialog-done').click();
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		await waitFor(() => expect(active()).toBe($('consent-dialog-trigger')));
	});

	test('[CAT-10] a row click with text selected in the shadow root does not toggle', async () => {
		await mount({ region: 'eu' });
		await openDialog();
		const sw = await waitFor(() =>
			must('consent-dialog-category-switch-functionality')
		);
		// A switch re-renders the dialog, so each row's handler now runs
		// on the mounted row, not the one it was built with.
		sw.click();
		await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
		const name = byId(sw.getAttribute('aria-labelledby')) as HTMLElement;
		// Text selected inside a shadow root, as Chromium reports it: the
		// root's selection holds it, and the document's is collapsed on the
		// host.
		const inShadow = vi
			.spyOn(
				ShadowRoot.prototype as ShadowRoot & { getSelection: () => unknown },
				'getSelection'
			)
			.mockReturnValue({ isCollapsed: false });
		vi.spyOn(document, 'getSelection').mockReturnValue({
			isCollapsed: true,
		} as Selection);
		name.click();
		expect(sw).toHaveAttribute('aria-checked', 'true');
		inShadow.mockReturnValue({ isCollapsed: true });
		name.click();
		await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
	});

	test('a disposed dialog stops looking for the returning banner', async () => {
		const client = await mount({ banner: false, region: 'eu' });
		await waitFor(() => expect(link()).not.toBeNull());
		link().click();
		await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
		// Closing back to a banner that never renders: the dialog looks for
		// it for a while.
		showConsentSurface(client.kernel, 'banner');
		await waitFor(() => expect($('consent-dialog-card')).toBeNull());
		stopConsentPages();
		const frame = vi.spyOn(window, 'requestAnimationFrame');
		await new Promise((resolve) => {
			setTimeout(resolve, 150);
		});
		expect(frame).not.toHaveBeenCalled();
	});

	test('[BNR-05] the opt-out icon has an intrinsic size unless noStyle', async () => {
		const client = await mount({ privacyChoicesLink: false });
		const choices = createPrivacyChoicesLink(client, {
			variant: 'privacy-choices',
		});
		const icon = choices.element.querySelector('svg') as SVGSVGElement;
		expect(icon).toHaveAttribute('height', '14');
		expect(icon).toHaveAttribute('width', '30');
		document.body.append(choices.element);
		expect(icon.getBoundingClientRect().height).toBe(14);
		const plain = createPrivacyChoicesLink(client, {
			noStyle: true,
			variant: 'privacy-choices',
		});
		const plainIcon = plain.element.querySelector('svg') as SVGSVGElement;
		expect(plainIcon).not.toHaveAttribute('height');
		expect(plainIcon).not.toHaveAttribute('width');
		choices.destroy();
		plain.destroy();
	});
});
