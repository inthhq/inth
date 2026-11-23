/**
 * The Privacy Choices (v6) design of the script tag's stock banner, ported
 * from `@inth/react`'s `privacy-choices-banner.test.tsx`, which ports the
 * explorer's self-test groups. Each test names the invariant it guards
 * (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`). The UI renders in its
 * shadow root, so the suite looks there as well as in the page.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import {
	$,
	active,
	all,
	byId,
	finishAnimations,
	must,
	pageAction,
	snapshotOf,
	startPrivacyChoicesPage as mount,
	stopPrivacyChoicesPages,
} from './fixtures/privacy-choices';

const root = () => must('consent-banner-root');
const waitForRoot = () =>
	vi.waitFor(() => expect($('consent-banner-root')).not.toBeNull(), {
		timeout: 4000,
	});
const waitForPanel = () =>
	vi.waitFor(
		() =>
			expect(
				all('[data-testid="consent-banner-body"] > *').length
			).toBeGreaterThan(0),
		{ timeout: 4000 }
	);
const box = (testId: string) => must(testId).getBoundingClientRect();

beforeEach(async () => {
	await page.viewport(1280, 800);
});

afterEach(() => {
	stopPrivacyChoicesPages();
});

describe('opt-in', () => {
	test('the classic design stays the default', async () => {
		await mount({ container: null, design: null });
		await waitForRoot();
		expect(root()).not.toHaveAttribute('data-design');
		expect(root()).toHaveAttribute('data-variant');
	});

	test('[BNR-13][BNR-10] US opt-out with no prompt shows nothing and never blocks', async () => {
		await mount({ blockUntilChoice: true, region: 'us-opt-out' });
		await new Promise((resolve) => {
			setTimeout(resolve, 200);
		});
		expect($('consent-banner-root')).toBeNull();
		expect(pageAction()).not.toHaveAttribute('inert');
	});
});

describe('card:', () => {
	test('[BNR-15] starts collapsed, Customize expands in place and focus moves in', async () => {
		await mount();
		await waitForRoot();
		expect(root()).toHaveAttribute('data-placement', 'card-start');
		expect(root()).toHaveAttribute('data-flow', 'expand-in-place');
		const customize = must<HTMLButtonElement>(
			'consent-banner-customize-button'
		);
		const panel = must('consent-banner-expand-panel');
		expect(customize).toHaveAttribute('aria-expanded', 'false');
		expect(customize.getAttribute('aria-controls')).toBe(panel.id);
		expect(panel).toHaveAttribute('data-open', 'false');
		// [BNR-03] A non-blocking prompt does not take focus.
		expect(must('consent-banner-card').contains(active())).toBe(false);

		customize.click();
		await waitForPanel();
		await vi.waitFor(() => {
			expect(panel).toHaveAttribute('data-open', 'true');
			expect(panel.contains(active())).toBe(true);
		});
		expect(root()).toHaveAttribute('data-expanded', 'true');
		expect($('consent-banner-category-group')).not.toBeNull();
		// [SR-*] The expansion is announced in the card's own status region.
		await vi.waitFor(() =>
			expect(must('consent-banner-status').textContent).toMatch(
				/More options shown\./u
			)
		);
	});

	test('[EU-01] the footer becomes Reject all · Accept all + Save choices, equal pair', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect($('consent-banner-save-button')).not.toBeNull()
		);
		expect($('consent-banner-customize-button')).toBeNull();
		const reject = must('consent-banner-reject-button');
		const accept = must('consent-banner-accept-button');
		expect(reject).toHaveTextContent('Reject all');
		expect(accept).toHaveTextContent('Accept all');
		expect(reject.className).toBe(accept.className);
		expect(reject.getBoundingClientRect().width).toBeCloseTo(
			accept.getBoundingClientRect().width,
			0
		);
	});

	test('[FOC-04][BNR-15] Esc folds back, the banner stays, focus returns to Customize', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect(must('consent-banner-expand-panel').contains(active())).toBe(true)
		);
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() =>
			expect(must('consent-banner-expand-panel')).toHaveAttribute(
				'data-open',
				'false'
			)
		);
		expect(root()).not.toBeNull();
		expect(active()).toBe($('consent-banner-customize-button'));
	});

	test('[PERM-15] Esc pressed elsewhere on the page leaves the panel open', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		pageAction().focus();
		await userEvent.keyboard('{Escape}');
		expect(must('consent-banner-expand-panel')).toHaveAttribute(
			'data-open',
			'true'
		);
	});

	test('[EU-03] a switch stages the draft, and Save records exactly what is on', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const marketing = await vi.waitFor(() =>
			must<HTMLButtonElement>('consent-banner-category-switch-marketing')
		);
		marketing.click();
		await vi.waitFor(() =>
			expect(marketing).toHaveAttribute('aria-checked', 'true')
		);
		expect(snapshotOf()?.explicitChoice).toBeFalsy();
		must('consent-banner-save-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(snapshotOf()?.explicitChoice?.categories?.marketing?.value).toBe(
			true
		);
		expect(snapshotOf()?.explicitChoice?.categories?.measurement?.value).toBe(
			false
		);
	});

	test('[CAT-01][SR-06] every switch is named by its row and described inline', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const sw = await vi.waitFor(() =>
			must('consent-banner-category-switch-measurement')
		);
		expect(sw).toHaveAttribute('role', 'switch');
		const label = byId(sw.getAttribute('aria-labelledby'));
		const description = byId(sw.getAttribute('aria-describedby'));
		expect(label).toHaveTextContent('Analytics');
		expect(description?.textContent).toMatch(/understand how visitors/u);
		await vi.waitFor(() => expect(description).toBeVisible());
	});

	test('[CAT-01][CAT-06] the name labels the row, the description is muted and smaller', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const sw = await vi.waitFor(() =>
			must('consent-banner-category-switch-measurement')
		);
		const label = byId(sw.getAttribute('aria-labelledby')) as HTMLElement;
		const description = byId(
			sw.getAttribute('aria-describedby')
		) as HTMLElement;
		await vi.waitFor(() =>
			expect(
				Number.parseFloat(getComputedStyle(description).fontSize)
			).toBeLessThan(Number.parseFloat(getComputedStyle(label).fontSize))
		);
		expect(label.tagName).not.toMatch(/^H\d$/u);
		expect(getComputedStyle(description).color).not.toBe(
			getComputedStyle(label).color
		);
		// One bordered group, with a divider between rows.
		const group = must('consent-banner-category-group');
		expect(getComputedStyle(group).borderTopWidth).toBe('1px');
		const rows = [...group.children] as HTMLElement[];
		expect(getComputedStyle(rows[1] as HTMLElement).borderTopWidth).toBe('1px');
	});

	test('[BNR-06] a choice announces on the page and focuses Your Privacy Choices', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-reject-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		await vi.waitFor(() =>
			expect(must('consent-banner-announcement').textContent).toMatch(
				/Optional cookies rejected\./u
			)
		);
		expect(must('consent-banner-announcement')).toHaveAttribute(
			'role',
			'status'
		);
		expect(active()).toBe($('consent-dialog-trigger'));
		expect(snapshotOf()?.explicitChoice?.categories?.marketing?.value).toBe(
			false
		);
	});

	test('[BNR-08] links only the configured policies', async () => {
		await mount();
		await waitForRoot();
		expect($('consent-banner-legal-link-privacyPolicy')).not.toBeNull();
		expect($('consent-banner-legal-link-cookiePolicy')).toBeNull();
	});

	test('[BNR-11] the "Consent by" tag sits 8px above the card, flush with its end', async () => {
		await mount();
		await waitForRoot();
		finishAnimations();
		const tag = box('consent-banner-branding');
		const card = box('consent-banner-card');
		expect(must('consent-banner-branding')).toHaveTextContent('Consent by');
		expect(Math.abs(card.top - tag.bottom - 8)).toBeLessThanOrEqual(1);
		expect(Math.abs(card.right - tag.right)).toBeLessThanOrEqual(1);
	});

	test('[ARCH-01] expanding keeps the card, head and footer nodes', async () => {
		await mount();
		await waitForRoot();
		const card = must('consent-banner-card');
		const header = must('consent-banner-header');
		const footer = must('consent-banner-footer');
		must('consent-banner-customize-button').click();
		await waitForPanel();
		expect(must('consent-banner-card')).toBe(card);
		expect(must('consent-banner-header')).toBe(header);
		expect(must('consent-banner-footer')).toBe(footer);
	});
});

describe('card bottom right', () => {
	test('[BNR-16] the end card sits 24px from the right edge, with room on the left', async () => {
		await page.viewport(700, 800);
		await mount({ container: { position: 'end', type: 'card' } });
		await waitForRoot();
		finishAnimations();
		const card = box('consent-banner-card');
		expect(root()).toHaveAttribute('data-placement', 'card-end');
		expect(Math.abs(window.innerWidth - card.right - 24)).toBeLessThanOrEqual(
			2
		);
		expect(card.left).toBeGreaterThanOrEqual(22);
	});

	test('[BNR-16] start follows the writing direction: right-to-left puts the start card on the right', async () => {
		document.documentElement.setAttribute('dir', 'rtl');
		await mount({ container: { position: 'start', type: 'card' } });
		await waitForRoot();
		finishAnimations();
		const card = box('consent-banner-card');
		expect(root()).toHaveAttribute('data-placement', 'card-start');
		expect(Math.abs(window.innerWidth - card.right - 24)).toBeLessThanOrEqual(
			2
		);
	});
});

describe('banner:', () => {
	test('[BNR-18] a full-width one-row bar on the bottom edge with Reject, Accept and Customize', async () => {
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			edgeStyle: 'flush',
		});
		await waitForRoot();
		finishAnimations();
		const card = box('consent-banner-card');
		expect(root()).toHaveAttribute('data-placement', 'banner-bottom');
		expect(Math.abs(window.innerHeight - card.bottom)).toBeLessThanOrEqual(2);
		expect(card.width).toBeGreaterThanOrEqual(window.innerWidth - 2);
		expect(card.height).toBeLessThanOrEqual(64);
		const footer = must('consent-banner-footer');
		expect(footer.contains($('consent-banner-reject-button'))).toBe(true);
		expect(footer.contains($('consent-banner-accept-button'))).toBe(true);
		const customize = must('consent-banner-customize-button');
		expect(footer.contains(customize)).toBe(true);
		// [PERM-09] The collapsed bar points at no panel.
		expect(customize).not.toHaveAttribute('aria-controls');
		expect(customize).toHaveAttribute('aria-expanded', 'false');
		// One policy link keeps it to one line.
		expect(must('consent-banner-title').className).toMatch(/visuallyHidden/iu);
	});

	test('[BNR-18] Customize expands to full content and options in place; Esc folds back', async () => {
		await mount({ container: { edge: 'bottom', type: 'banner' } });
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect(must('consent-banner-expand-panel')).toHaveAttribute(
				'data-open',
				'true'
			)
		);
		expect($('consent-banner-header')).not.toBeNull();
		expect($('consent-banner-save-button')).not.toBeNull();
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() => expect($('consent-banner-header')).toBeNull());
		expect(active()).toBe($('consent-banner-customize-button'));
	});

	test('[BNR-18] inset top bar: rounded, 12px from the edges', async () => {
		await mount({ container: { edge: 'top', type: 'banner' } });
		await waitForRoot();
		finishAnimations();
		const card = must('consent-banner-card');
		const rect = card.getBoundingClientRect();
		// [VIS-07] Inset surfaces take the large radius token.
		const large = getComputedStyle(card)
			.getPropertyValue('--inth-radius-lg')
			.trim();
		const largePx = large.endsWith('rem')
			? `${Number.parseFloat(large) * 16}px`
			: large;
		expect(getComputedStyle(card).borderTopLeftRadius).toBe(largePx);
		expect(largePx).not.toBe('0px');
		expect(Math.abs(rect.top - 12)).toBeLessThanOrEqual(2);
		expect(Math.abs(rect.left - 12)).toBeLessThanOrEqual(2);
	});

	test('[BNR-09] US opt-in bar asks in US terms', async () => {
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			region: 'us-opt-in',
		});
		await waitForRoot();
		expect(must('consent-banner-reject-button')).toHaveTextContent(
			"Don't allow"
		);
		expect(must('consent-banner-accept-button')).toHaveTextContent('Allow');
		expect(must('consent-banner-customize-button')).toHaveTextContent('Choose');
		expect(must('consent-banner-description').textContent).toMatch(
			/asks before using optional cookies/u
		);
	});
});

describe('top drawer:', () => {
	test('[BNR-16] anchored to the top, the tag hangs below the card', async () => {
		await mount({ container: { side: 'top', type: 'drawer' } });
		await waitForRoot();
		finishAnimations();
		const card = box('consent-banner-card');
		const tag = box('consent-banner-branding');
		expect(root()).toHaveAttribute('data-placement', 'drawer-top');
		expect(card.top).toBeLessThanOrEqual(14);
		expect(tag.top).toBeGreaterThanOrEqual(card.bottom - 1);
	});

	test('[BNR-16] Customize expands in place, and the top drawer stays on top on phone', async () => {
		await mount({ container: { side: 'top', type: 'drawer' } });
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect(must('consent-banner-expand-panel')).toHaveAttribute(
				'data-open',
				'true'
			)
		);
		await page.viewport(390, 800);
		await vi.waitFor(() =>
			expect(root()).toHaveAttribute('data-placement', 'drawer-top')
		);
	});
});

describe('aio', () => {
	test('[BNR-14] a side drawer shows the categories at once, with no Customize', async () => {
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		expect(root()).toHaveAttribute('data-flow', 'all-in-one');
		expect(root()).toHaveAttribute('data-placement', 'drawer-start');
		await waitForPanel();
		expect($('consent-banner-customize-button')).toBeNull();
		expect($('consent-banner-save-button')).not.toBeNull();
		expect($('consent-banner-category-group')).not.toBeNull();
		// [BNR-03] Non-blocking: the page stays usable.
		expect(pageAction()).not.toHaveAttribute('inert');
		expect(must('consent-banner-card')).toHaveAttribute('role', 'region');
	});

	test('[BNR-14] the tag floats over the scroll area, which leaves it clearance', async () => {
		await mount({ container: { side: 'end', type: 'drawer' } });
		await waitForRoot();
		await waitForPanel();
		const tag = must('consent-banner-branding');
		const slot = tag.parentElement as HTMLElement;
		expect(getComputedStyle(slot).position).toBe('absolute');
		expect(getComputedStyle(slot).pointerEvents).toBe('none');
		await vi.waitFor(() =>
			expect(
				Number.parseInt(
					getComputedStyle(must('consent-banner-body')).paddingBottom,
					10
				)
			).toBeGreaterThanOrEqual(56)
		);
	});

	test('[BNR-14] US notice: rights rows inline and OK only; an opt-out applies at once', async () => {
		await mount({
			container: { side: 'start', type: 'drawer' },
			region: 'us-notice',
		});
		await waitForRoot();
		await waitForPanel();
		const protect = await vi.waitFor(() =>
			must<HTMLButtonElement>('consent-banner-right-option-sale-protect')
		);
		expect($('consent-banner-dismiss-button')).not.toBeNull();
		expect($('consent-banner-right-link-opt-out')).toBeNull();
		expect($('consent-banner-save-button')).toBeNull();
		protect.click();
		await vi.waitFor(() => expect(snapshotOf()?.optOut).toBeTruthy());
	});

	test('[LAW-02][RIGHT-06] US opt-in: Allow needs the confirmation, which opens on Cancel', async () => {
		await mount({
			container: { side: 'start', type: 'drawer' },
			region: 'us-opt-in',
		});
		await waitForRoot();
		await waitForPanel();
		const allow = await vi.waitFor(() =>
			must<HTMLButtonElement>('consent-banner-right-option-sale-allow')
		);
		const group = allow.parentElement as HTMLElement;
		// [RIGHT-01] A group of pressed buttons, protective option first.
		expect(group).toHaveAttribute('role', 'group');
		expect(group.firstElementChild?.nextElementSibling).toBe(
			$('consent-banner-right-option-sale-protect')
		);
		expect(group.getAttribute('aria-label')).toBe(
			'Allow selling, sharing and targeted ads'
		);
		allow.click();
		await vi.waitFor(() =>
			expect(active()).toBe($('consent-banner-confirm-cancel'))
		);
		expect(allow).toHaveAttribute('aria-pressed', 'false');
		expect(snapshotOf()?.explicitChoice).toBeFalsy();
		// [RIGHT-04] Allow again nudges and records nothing.
		allow.click();
		await vi.waitFor(() =>
			expect(must('consent-banner-confirm')).toHaveAttribute(
				'data-nudged',
				'true'
			)
		);
		expect(must('consent-banner-status').textContent).toMatch(
			/Choose one of the two buttons first\./u
		);
		// [PERM-03] Esc closes the confirmation first, focus back on Allow.
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() => expect(active()).toBe(allow));
		expect(root()).not.toBeNull();
	});

	test('[PERM-13] on phone a side drawer becomes the bottom drawer, summary first', async () => {
		await page.viewport(390, 800);
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		expect(root()).toHaveAttribute('data-placement', 'drawer-bottom');
		expect(root()).toHaveAttribute('data-flow', 'expand-in-place');
		expect(must('consent-banner-expand-panel')).toHaveAttribute(
			'data-open',
			'false'
		);
	});

	test('[ARCH-01] switching to phone keeps the card node', async () => {
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		const card = must('consent-banner-card');
		await page.viewport(390, 800);
		await vi.waitFor(() =>
			expect(root()).toHaveAttribute('data-placement', 'drawer-bottom')
		);
		expect(must('consent-banner-card')).toBe(card);
	});
});

describe('block on + …', () => {
	for (const [name, container] of [
		['card', { type: 'card' }],
		['bottom', { side: 'bottom', type: 'drawer' }],
		['start', { side: 'start', type: 'drawer' }],
		['banner', { edge: 'bottom', type: 'banner' }],
	] as const) {
		test(`[BNR-13][PERM-08] block on + ${name}: backdrop, inert page, scroll lock, dialog role on the shell`, async () => {
			await mount({ blockUntilChoice: true, container });
			await waitForRoot();
			const shell = must('consent-banner-shell');
			expect($('consent-banner-overlay')).not.toBeNull();
			expect(shell).toHaveAttribute('role', 'dialog');
			expect(shell).toHaveAttribute('aria-modal', 'true');
			expect(shell.contains($('consent-banner-branding'))).toBe(true);
			expect(must('consent-banner-card')).not.toHaveAttribute('role');
			await vi.waitFor(() =>
				expect(pageAction().closest('[inert]')).not.toBeNull()
			);
			expect(document.body.style.overflow).toBe('hidden');
		});
	}

	test('[BNR-13] the US notice never blocks, even with blockUntilChoice', async () => {
		await mount({ blockUntilChoice: true, region: 'us-notice' });
		await waitForRoot();
		expect($('consent-banner-overlay')).toBeNull();
		expect(must('consent-banner-shell')).not.toHaveAttribute('role');
		expect(pageAction().closest('[inert]')).toBeNull();
		expect(document.body.style.overflow).not.toBe('hidden');
	});
});

describe('blocking:', () => {
	test('[PERM-06][BNR-16] a centred card blocks, and focus lands on the card', async () => {
		await mount({ container: { position: 'center', type: 'card' } });
		await waitForRoot();
		expect(root()).toHaveAttribute('data-blocking', 'true');
		await vi.waitFor(() => expect(active()).toBe($('consent-banner-card')));
	});

	test('[VIS-08] the card border is swapped for a ring over the scrim', async () => {
		await mount({ blockUntilChoice: true });
		await waitForRoot();
		finishAnimations();
		expect(getComputedStyle(must('consent-banner-card')).borderTopColor).toBe(
			'rgba(0, 0, 0, 0)'
		);
	});

	test('[FOC-01][PERM-08] Shift+Tab from the card reaches the tag, then wraps inside the shell', async () => {
		await mount({ container: { position: 'center', type: 'card' } });
		await waitForRoot();
		await vi.waitFor(() => expect(active()).toBe($('consent-banner-card')));
		await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
		expect(active()).toBe($('consent-banner-branding'));
		await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
		const shell = must('consent-banner-shell');
		const stops = [...shell.querySelectorAll('button, a[href]')];
		expect(active()).toBe(stops[stops.length - 1]);
	});

	test('[PERM-03] Esc never dismisses a blocking prompt; a choice releases the page', async () => {
		await mount({ container: { position: 'center', type: 'card' } });
		await waitForRoot();
		await userEvent.keyboard('{Escape}');
		expect(root()).not.toBeNull();
		must('consent-banner-reject-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(pageAction().closest('[inert]')).toBeNull();
		expect(document.body.style.overflow).not.toBe('hidden');
		await vi.waitFor(() => expect(active()).toBe($('consent-dialog-trigger')));
	});
});

describe('fades:', () => {
	test('[LAY-08] no top fade at the top, a bottom fade while more lies below, none at the end', async () => {
		await page.viewport(1280, 520);
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		await waitForPanel();
		const area = must('consent-banner-body');
		area.style.maxHeight = '120px';
		area.scrollTop = 0;
		area.dispatchEvent(new Event('scroll'));
		await vi.waitFor(() => {
			expect(area).not.toHaveAttribute('data-fade-top');
			expect(area).toHaveAttribute('data-fade-bottom');
		});
		area.scrollTop = Math.floor((area.scrollHeight - area.clientHeight) / 2);
		area.dispatchEvent(new Event('scroll'));
		await vi.waitFor(() => {
			expect(area).toHaveAttribute('data-fade-top');
			expect(area).toHaveAttribute('data-fade-bottom');
		});
		area.scrollTop = area.scrollHeight;
		area.dispatchEvent(new Event('scroll'));
		await vi.waitFor(() => {
			expect(area).toHaveAttribute('data-fade-top');
			expect(area).not.toHaveAttribute('data-fade-bottom');
		});
	});
});

describe('phone flush/inset bottom drawer', () => {
	test('[BNR-12] phone flush bottom drawer: no padding', async () => {
		await page.viewport(390, 800);
		await mount({
			container: { side: 'bottom', type: 'drawer' },
			edgeStyle: 'flush',
		});
		await waitForRoot();
		const style = getComputedStyle(root());
		for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
			expect(style[`padding${side}`]).toBe('0px');
		}
	});

	test('[BNR-12] phone inset bottom drawer: 12px sides and bottom', async () => {
		await page.viewport(390, 800);
		await mount({
			container: { side: 'bottom', type: 'drawer' },
			edgeStyle: 'inset',
		});
		await waitForRoot();
		const style = getComputedStyle(root());
		expect(style.paddingBottom).toBe('12px');
		expect(style.paddingLeft).toBe('12px');
	});
});

describe('notice', () => {
	test('[BNR-01][BNR-10] the US notice offers "Do not sell or share my data" and OK, and expands to the rights', async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		expect(root()).toHaveAttribute('data-variant', 'notice');
		const link = must('consent-banner-right-link-opt-out');
		expect(link).toHaveTextContent('Do not sell or share my data');
		expect($('consent-banner-reject-button')).toBeNull();
		link.click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect($('consent-banner-rights-row-sale')).not.toBeNull()
		);
		// [PERM-11] The expanded notice's footer holds OK alone.
		expect(must('consent-banner-footer').children).toHaveLength(1);
	});

	test('[VIS-02] "Do not sell or share my data" reads as a link in the text blue', async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		const link = must('consent-banner-right-link-opt-out');
		const blue = document.createElement('span');
		blue.style.color = 'var(--inth-primary-text)';
		link.after(blue);
		try {
			await vi.waitFor(() => {
				const style = getComputedStyle(link);
				expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
				expect(style.color).toBe(getComputedStyle(blue).color);
				expect(style.textDecorationLine).toBe('underline');
			});
		} finally {
			blue.remove();
		}
	});

	test('OK records no consent and ends the prompt', async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		must('consent-banner-dismiss-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(snapshotOf()?.explicitChoice).toBeFalsy();
	});
});

describe('customization', () => {
	test('noStyle renders the same parts and test ids without class names', async () => {
		stopPrivacyChoicesPages();
		const client = await mount();
		client.ui?.destroy();
		const { mountConsentUI } = await import('../ui/mount');
		const handle = mountConsentUI(client, {
			disableAnimation: true,
			noStyle: true,
		});
		await vi.waitFor(() =>
			expect(
				handle.root.querySelector('[data-testid="consent-banner-root"]')
			).not.toBeNull()
		);
		const card = handle.root.querySelector(
			'[data-testid="consent-banner-card"]'
		);
		expect(card?.getAttribute('class')).toBeNull();
		expect(
			handle.root.querySelectorAll('style[data-inth-styles]')
		).toHaveLength(0);
		handle.destroy();
	});
});
