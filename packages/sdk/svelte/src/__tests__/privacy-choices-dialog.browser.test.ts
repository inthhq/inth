/**
 * The Privacy Choices (v6) "Your Privacy Choices" dialog of the stock
 * Svelte `ConsentDialog`, ported from React's
 * `privacy-choices-dialog.test.tsx`, itself ported from the explorer's
 * self-test groups about the dialog: the US first view and its rights, the
 * receipt, Preferences, vendors and row clicks, the EU staged model, phone
 * sheets, focus, Escape and announcements. Each test names the invariant
 * it guards (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`).
 */
import '@testing-library/jest-dom/vitest';
import type { ConsentPresentation, ConsentSnapshot } from '@inth/sdk/engine';
import type { PolicyRule } from '@inth/sdk/schema/types';
import { mount as mountComponent, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { testing } from '../lib/testing';
import type { ConsentManagerOptions } from '../lib/types';
import Fixture from './fixtures/privacy-choices-fixture.svelte';
import { policyFixture } from './policy-fixture';

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

/** The snapshot, for assertions on what was recorded. */
const probe: { snapshot: ConsentSnapshot | null } = { snapshot: null };

let mounted: Record<string, unknown> | undefined;
let fixture = 0;
const mount = async function mount({
	region = 'us-opt-out',
	design = 'privacy-choices',
	edgeStyle,
}: {
	region?: Region;
	design?: ConsentPresentation['design'] | null;
	edgeStyle?: 'inset' | 'flush';
} = {}) {
	fixture += 1;
	const options = {
		consentCategories: [
			'necessary',
			'functionality',
			'measurement',
			'experience',
			'marketing',
		],
		legalLinks: { privacyPolicy: { href: '/privacy' } },
		mode: testing(),
		persistence: false,
		prefetch: policyFixture(undefined, {
			id: `pcd-${region}-${fixture}`,
			...RULES[region],
		}),
		presentation:
			design === null
				? undefined
				: {
						design,
						prompt: { container: { type: 'card' }, edgeStyle },
					},
		vendors: VENDORS,
	} as ConsentManagerOptions;
	// A page control opens the dialog in every region.
	mounted = mountComponent(Fixture, {
		props: { dialog: true, options, probe, triggerLabel: 'Privacy settings' },
		target: document.body,
	});
	await Promise.resolve();
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
/** "Your Privacy Choices" in the US; a page control that opens the dialog elsewhere. */
const link = () =>
	$<HTMLButtonElement>('privacy-choices-link') ??
	must<HTMLButtonElement>('consent-dialog-trigger');
const card = () => must('consent-dialog-card');
const pageAction = () =>
	[...document.querySelectorAll('button')].find(
		(button) => button.textContent === 'Page action'
	) as HTMLButtonElement;
const waitFor = <T>(check: () => T) => vi.waitFor(check, { timeout: 4000 });

/** Open the dialog from "Your Privacy Choices" and wait for its title. */
const openDialog = async function openDialog() {
	await waitFor(() => expect(link()).toBeInTheDocument());
	link().focus();
	link().click();
	await waitFor(() => expect($('consent-dialog-title')).toBeInTheDocument());
	await waitFor(() =>
		expect(document.activeElement).toBe(must('consent-dialog-title'))
	);
};

const status = () => must('consent-dialog-status').textContent ?? '';

const previousSignal = Object.getOwnPropertyDescriptor(
	navigator,
	'globalPrivacyControl'
);
const setGpc = (on: boolean) => {
	Object.defineProperty(navigator, 'globalPrivacyControl', {
		configurable: true,
		value: on,
	});
};

beforeEach(async () => {
	probe.snapshot = null;
	await page.viewport(1280, 800);
});

afterEach(async () => {
	if (mounted) {
		await unmount(mounted);
		mounted = undefined;
	}
	(document.activeElement as HTMLElement | null)?.blur?.();
	if (previousSignal) {
		Object.defineProperty(navigator, 'globalPrivacyControl', previousSignal);
	} else {
		Reflect.deleteProperty(navigator, 'globalPrivacyControl');
	}
	vi.restoreAllMocks();
});

describe('opening', () => {
	test('the classic dialog stays the default', async () => {
		await mount({ design: null });
		await waitFor(() => expect(link()).toBeInTheDocument());
		link().click();
		await waitFor(() => expect($('consent-dialog-root')).toBeInTheDocument());
		expect(must('consent-dialog-root')).not.toHaveAttribute('data-design');
	});

	test('[FOC-02][FOC-03][LAY-01] opens on its title as a modal dialog over an inert page', async () => {
		await mount();
		await openDialog();
		expect(must('consent-dialog-root')).toHaveAttribute(
			'data-design',
			'privacy-choices'
		);
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
		await waitFor(() => expect(document.activeElement).toBe(link()));
		expect(pageAction().closest('[inert]')).toBeNull();
	});

	test('[PERM-05][BNR-02] the banner leaves at once when the dialog opens', async () => {
		await mount({ region: 'eu' });
		await waitFor(() => expect($('consent-banner-root')).toBeInTheDocument());
		link().click();
		await waitFor(() => expect($('consent-dialog-card')).toBeInTheDocument());
		expect($('consent-banner-root')).toBeNull();
	});

	test('[BNR-05][FOC-03] closing without deciding brings the banner back and focuses it', async () => {
		await mount({ region: 'eu' });
		await waitFor(() => expect($('consent-banner-root')).toBeInTheDocument());
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
		await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
		expect(card().contains(document.activeElement)).toBe(true);
		await userEvent.keyboard('{Tab}');
		expect(card().contains(document.activeElement)).toBe(true);
	});
});

describe('US first view', () => {
	test('[LAW-01][LAY-04][LAW-04] rights first, the one-line intro, and only Done', async () => {
		await mount();
		await openDialog();
		expect(must('consent-dialog-intro')).toHaveTextContent(
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
		expect(must('consent-dialog-done')).toHaveTextContent('Done');
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
		await waitFor(() => expect(probe.snapshot?.optOut).toBeTruthy());
		await waitFor(() => expect(status()).toMatch(/^Opted out of .*Saved\./u));
		// Done keeps its node and its label (FOC-06, SR-07).
		expect(must('consent-dialog-done')).toBe(done);
		expect(done).toHaveTextContent('Done');
		expect(must('consent-dialog-saved-cue')).toBeInTheDocument();

		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(document.activeElement).toBe(must('consent-dialog-confirm-cancel'))
		);
		expect(probe.snapshot?.optOut).toBeTruthy();
		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(must('consent-dialog-confirm')).toHaveAttribute(
				'data-nudged',
				'true'
			)
		);
		expect(status()).toMatch(/Choose one of the two buttons first\./u);
		expect(probe.snapshot?.optOut).toBeTruthy();
		must('consent-dialog-confirm-allow').click();
		await waitFor(() => expect(probe.snapshot?.optOut).toBeFalsy());
		// The dialog stays open after a rights choice.
		expect($('consent-dialog-card')).toBeInTheDocument();
	});

	test('[FOC-04] Escape closes the confirmation first, then the dialog', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(probe.snapshot?.optOut).toBeTruthy());
		must('consent-dialog-right-option-sale-allow').click();
		await waitFor(() =>
			expect(document.activeElement).toBe(must('consent-dialog-confirm-cancel'))
		);
		await userEvent.keyboard('{Escape}');
		await waitFor(() =>
			expect(
				must('consent-dialog-confirm').closest('[data-open]')
			).toHaveAttribute('data-open', 'false')
		);
		expect($('consent-dialog-card')).toBeInTheDocument();
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
		expect(receipt).toHaveTextContent(/Saved for this browser · just now/u);
		const toggle = must('consent-dialog-receipt-toggle');
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		toggle.click();
		await waitFor(() =>
			expect(toggle).toHaveAttribute('aria-expanded', 'true')
		);
		expect(must('consent-dialog-receipt-details')).toHaveTextContent(
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
			expect(must('consent-dialog-right-option-sale-allow')).toHaveAttribute(
				'aria-disabled',
				'true'
			)
		);
		expect($('consent-dialog-intro')).toBeNull();
		expect(
			must('consent-dialog-right-option-sale-protect')
		).not.toHaveAttribute('aria-disabled');
		expect(must('consent-dialog-rights-row-sale')).toHaveTextContent(
			/Global Privacy Control signal/u
		);
		expect(must('consent-dialog-receipt')).toHaveTextContent(
			'Honoring Global Privacy Control from this browser'
		);
	});
});

describe('preferences', () => {
	test('[COPY-05][NEST-01][CAT-08][LAW-05] desktop: an accordion without Marketing, with Advertising following the sale choice', async () => {
		await mount();
		await openDialog();
		const row = must('consent-dialog-preferences-row');
		expect(row).toHaveTextContent(/Preferences/u);
		expect(row).toHaveAttribute('aria-expanded', 'false');
		expect(row).not.toHaveAttribute('aria-haspopup');
		row.click();
		await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'));
		expect($('consent-dialog-category-switch-marketing')).toBeNull();
		const advertising = must('consent-dialog-advertising-row');
		expect(advertising).toHaveTextContent(/On$/u);
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(advertising).toHaveTextContent(/Off$/u));
	});

	test('[LAW-04][RCPT-02][CAT-04] a US switch applies at once and keeps the receipt date', async () => {
		await mount();
		await openDialog();
		must('consent-dialog-right-option-sale-protect').click();
		await waitFor(() => expect(probe.snapshot?.optOut).toBeTruthy());
		const recordedAt = probe.snapshot?.optOut?.recordedAt;
		must('consent-dialog-preferences-row').click();
		const sw = await waitFor(() =>
			must<HTMLButtonElement>('consent-dialog-category-switch-functionality')
		);
		const before = sw.getAttribute('aria-checked');
		sw.click();
		await waitFor(() =>
			expect(
				probe.snapshot?.explicitChoice?.categories?.functionality?.value
			).toBe(before !== 'true')
		);
		expect(status()).toMatch(/^Functionality (?:on|off)\. Saved\./u);
		expect(probe.snapshot?.optOut?.recordedAt).toBe(recordedAt);
		expect($('consent-dialog-card')).toBeInTheDocument();
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
		expect(trigger).toHaveTextContent(/0 on/u);
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
		expect(status().replace('\u200B', '')).toBe(
			'Analytics One on. Analytics on.'
		);
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
		const name = document.getElementById(
			sw.getAttribute('aria-labelledby') ?? ''
		) as HTMLElement;
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
		expect(must('consent-dialog-title')).toHaveTextContent('Privacy settings');
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
		expect(probe.snapshot?.explicitChoice?.categories?.experience?.value).toBe(
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
		expect(probe.snapshot?.explicitChoice).toBeFalsy();
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
		await waitFor(() =>
			expect(document.activeElement?.closest('[data-testid]')).toBe(sheet)
		);
		expect(sheet).toHaveAttribute('aria-modal', 'true');
		expect(sheet).toHaveTextContent(
			'Changes apply when you save in Privacy settings.'
		);
		expect(card()).not.toHaveAttribute('aria-modal');
		expect(card()).toHaveAttribute('inert');
		expect(card()).toHaveAttribute('data-nested-open');
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
		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect($('consent-dialog-card')).toBeInTheDocument();
		await waitFor(() =>
			expect(document.activeElement).toBe(
				must('consent-dialog-vendor-trigger-measurement')
			)
		);
		expect(card()).toHaveAttribute('aria-modal', 'true');
	});

	test('[NEST-01][COPY-05][NEST-08] US Preferences opens a sheet; its Done closes only it', async () => {
		await page.viewport(390, 800);
		await mount({ edgeStyle: 'flush' });
		await openDialog();
		expect(must('consent-dialog-root')).toHaveAttribute(
			'data-edge-style',
			'flush'
		);
		const row = must('consent-dialog-preferences-row');
		expect(row).toHaveAttribute('aria-haspopup', 'dialog');
		row.click();
		const sheet = await waitFor(() => must('consent-dialog-sheet'));
		expect(sheet).toHaveTextContent('Saved automatically');
		expect(
			sheet.querySelector('[aria-label="Close preferences"]')
		).not.toBeNull();
		must('consent-dialog-sheet-done').click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(row));
	});

	test('[NEST-05] a tap on the dimmed parent closes the sheet and nothing under it', async () => {
		await page.viewport(390, 800);
		await mount({ region: 'eu' });
		await openDialog();
		must('consent-dialog-vendor-trigger-measurement').click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeInTheDocument());
		const close = must('consent-dialog-close');
		close.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, composed: true })
		);
		close.click();
		await waitFor(() => expect($('consent-dialog-sheet')).toBeNull());
		expect($('consent-dialog-card')).toBeInTheDocument();
	});
});
