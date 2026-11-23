/**
 * The Privacy Choices (v6) design of the stock `<inth-consent-banner>`,
 * ported from React's `privacy-choices-banner.test.tsx`, which ports the
 * explorer's self-test groups. Each test names the invariant it guards
 * (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`).
 *
 * These run under jsdom, which has no layout: React's geometry checks
 * (margins, the tag's offset, padding, fade lengths) stay with the
 * browser-mode React suite and the parity runner. Everything about markup,
 * ARIA, focus, keys and what is recorded is checked here.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
	ConsentContainer,
	ConsentEdgeStyle,
	ConsentPresentation,
	PolicyRule,
} from '@inth/sdk/engine';
import type { Theme } from '@inth/sdk/ui/theme';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { offlineMode } from '../../../__tests__/fixtures/transport-mode';
import { ALL_CATEGORIES } from '../../../__tests__/test-local';
import { ConsentManager } from '../../core/consent-manager';
import { provideInth } from '../../core/provide-inth';
import { ConsentBanner } from '../consent-banner';

type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const GPC = { gpc: { denyCategories: ['marketing', 'measurement'] } };

const RULES: Record<Region, Partial<PolicyRule>> = {
	eu: {},
	'us-notice': {
		model: 'opt-out',
		privacySignals: GPC,
		prompt: 'notice',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
	'us-opt-in': { privacySignals: GPC },
	'us-opt-out': {
		model: 'opt-out',
		privacySignals: GPC,
		prompt: 'none',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
};

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'test-pc-banner-host',
	template: `<button type="button">Page action</button>
		<button
			type="button"
			data-testid="privacy-choices-link"
		>
			Your Privacy Choices
		</button>
		<inth-consent-banner [disableAnimation]="true" />`,
})
class BannerHost {}

interface MountOptions {
	/** `null` sets no container. */
	container?: ConsentContainer | null;
	edgeStyle?: ConsentEdgeStyle;
	blockUntilChoice?: boolean;
	region?: Region;
	design?: ConsentPresentation['design'] | null;
	phone?: boolean;
	theme?: Theme;
	noStyle?: boolean;
}

let fixtureId = 0;

/**
 * Stands in for `matchMedia`, so a test picks the viewport and can switch
 * it while the prompt shows.
 */
const viewport = {
	listeners: new Set<(event: { matches: boolean }) => void>(),
	phone: false,
};
const setPhone = function setPhone(phone: boolean): void {
	viewport.phone = phone;
	for (const listener of viewport.listeners) {
		listener({ matches: phone });
	}
};
const stubViewport = function stubViewport(phone: boolean): void {
	viewport.phone = phone;
	viewport.listeners.clear();
	vi.stubGlobal('matchMedia', (query: string) => ({
		addEventListener: (
			_type: string,
			listener: (event: { matches: boolean }) => void
		) => {
			viewport.listeners.add(listener);
		},
		get matches() {
			return viewport.phone && query.includes('max-width');
		},
		media: query,
		removeEventListener: (
			_type: string,
			listener: (event: { matches: boolean }) => void
		) => {
			viewport.listeners.delete(listener);
		},
	}));
};

const mount = async function mount({
	container = { type: 'card' },
	edgeStyle,
	blockUntilChoice,
	region = 'eu',
	design = 'privacy-choices',
	phone = false,
	theme,
	noStyle,
}: MountOptions = {}) {
	fixtureId += 1;
	stubViewport(phone);
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...ALL_CATEGORIES],
				legalLinks: { privacyPolicy: { href: '/privacy' } },
				mode: offlineMode([
					{
						id: `pc-${region}-${fixtureId}`,
						match: { fallback: true, isDefault: true },
						model: 'opt-in',
						prompt: 'choice',
						...RULES[region],
					} as PolicyRule,
				]),
				noStyle,
				persistence: false,
				presentation: {
					design: design === null ? undefined : design,
					prompt: {
						blockUntilChoice,
						container: container ?? undefined,
						edgeStyle,
					},
				},
				theme,
			}),
		],
	});
	const fixture = TestBed.createComponent(BannerHost);
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
const root = () => must('consent-banner-root');
const waitForRoot = () =>
	vi.waitFor(() => expect($('consent-banner-root')).not.toBeNull(), {
		timeout: 4000,
	});
const waitForPanel = () =>
	vi.waitFor(
		() =>
			expect(
				document.querySelector('[data-testid="consent-banner-body"] > *')
			).not.toBeNull(),
		{ timeout: 4000 }
	);

beforeEach(() => {
	document.documentElement.removeAttribute('dir');
});

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
	for (const style of document.head.querySelectorAll(
		'style[data-inth-styles]'
	)) {
		style.remove();
	}
	vi.unstubAllGlobals();
});

describe('opt-in', () => {
	test('the classic design stays the default', async () => {
		await mount({ container: null, design: null });
		await waitForRoot();
		expect(root().hasAttribute('data-design')).toBe(false);
		expect(root().hasAttribute('data-variant')).toBe(true);
	});

	test('[BNR-13][BNR-10] US opt-out with no prompt shows nothing and never blocks', async () => {
		await mount({ blockUntilChoice: true, region: 'us-opt-out' });
		await new Promise((resolve) => {
			setTimeout(resolve, 200);
		});
		expect($('consent-banner-root')).toBeNull();
		const pageAction = [...document.querySelectorAll('button')].find(
			(button) => button.textContent === 'Page action'
		);
		expect(pageAction?.hasAttribute('inert')).toBe(false);
	});
});

const pageAction = () =>
	[...document.querySelectorAll('button')].find(
		(button) => button.textContent?.trim() === 'Page action'
	) as HTMLButtonElement;

/** Escape on the focused element, as a key press reaches the page. */
const pressEscape = function pressEscape(): void {
	(document.activeElement ?? document.body).dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
	);
};

/** Shift+Tab on the focused element, for the focus trap to handle. */
const pressShiftTab = function pressShiftTab(): void {
	(document.activeElement ?? document.body).dispatchEvent(
		new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key: 'Tab',
			shiftKey: true,
		})
	);
};

const expandPanel = async function expandPanel(): Promise<void> {
	must('consent-banner-customize-button').click();
	await waitForPanel();
	await vi.waitFor(() =>
		expect(must('consent-banner-expand-panel').getAttribute('data-open')).toBe(
			'true'
		)
	);
};

describe('card:', () => {
	test('[BNR-15] starts collapsed, Customize expands in place and focus moves in', async () => {
		await mount();
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('card-start');
		expect(root().getAttribute('data-flow')).toBe('expand-in-place');
		const customize = must<HTMLButtonElement>(
			'consent-banner-customize-button'
		);
		const panel = must('consent-banner-expand-panel');
		expect(customize.getAttribute('aria-expanded')).toBe('false');
		expect(customize.getAttribute('aria-controls')).toBe(panel.id);
		expect(panel.getAttribute('data-open')).toBe('false');
		expect(panel.hasAttribute('inert')).toBe(true);
		// [BNR-03] A non-blocking prompt does not take focus.
		expect(must('consent-banner-card').contains(document.activeElement)).toBe(
			false
		);

		customize.click();
		await waitForPanel();
		await vi.waitFor(() => {
			expect(panel.getAttribute('data-open')).toBe('true');
			expect(panel.contains(document.activeElement)).toBe(true);
		});
		expect(panel.hasAttribute('inert')).toBe(false);
		expect(root().getAttribute('data-expanded')).toBe('true');
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
		await expandPanel();
		await vi.waitFor(() =>
			expect($('consent-banner-save-button')).not.toBeNull()
		);
		expect($('consent-banner-customize-button')).toBeNull();
		const reject = must('consent-banner-reject-button');
		const accept = must('consent-banner-accept-button');
		expect(reject.textContent?.trim()).toBe('Reject all');
		expect(accept.textContent?.trim()).toBe('Accept all');
		expect(reject.className).toBe(accept.className);
		expect(reject.dataset['variant']).toBe(accept.dataset['variant']);
		expect(reject.dataset['mode']).toBe(accept.dataset['mode']);
	});

	test('[FOC-04][BNR-15] Esc folds back, the banner stays, focus returns to Customize', async () => {
		await mount();
		await waitForRoot();
		await expandPanel();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-expand-panel').contains(document.activeElement)
			).toBe(true)
		);
		pressEscape();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-expand-panel').getAttribute('data-open')
			).toBe('false')
		);
		expect($('consent-banner-root')).not.toBeNull();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-customize-button'))
		);
	});

	test('[PERM-15] Esc pressed elsewhere on the page leaves the panel open', async () => {
		await mount();
		await waitForRoot();
		await expandPanel();
		pageAction().focus();
		pressEscape();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(must('consent-banner-expand-panel').getAttribute('data-open')).toBe(
			'true'
		);
	});

	test('[EU-03] a switch stages the draft, and Save records exactly what is on', async () => {
		const { consent } = await mount();
		await waitForRoot();
		await expandPanel();
		const marketing = must<HTMLButtonElement>(
			'consent-banner-category-switch-marketing'
		);
		marketing.click();
		await vi.waitFor(() =>
			expect(marketing.getAttribute('aria-checked')).toBe('true')
		);
		expect(consent.snapshot().explicitChoice).toBeFalsy();
		must('consent-banner-save-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		const categories = consent.snapshot().explicitChoice?.categories;
		expect(categories?.marketing?.value).toBe(true);
		expect(categories?.measurement?.value).toBe(false);
	});

	test('[CAT-01][SR-06] every switch is named by its row and described inline', async () => {
		await mount();
		await waitForRoot();
		await expandPanel();
		const sw = must('consent-banner-category-switch-measurement');
		expect(sw.getAttribute('role')).toBe('switch');
		const label = document.getElementById(
			sw.getAttribute('aria-labelledby') ?? ''
		);
		const description = document.getElementById(
			sw.getAttribute('aria-describedby') ?? ''
		);
		expect(label?.textContent).toContain('Analytics');
		expect(label?.tagName).not.toMatch(/^H\d$/u);
		expect(description?.textContent).toMatch(/understand how visitors/u);
		// One bordered group: its rows are its own children.
		const group = must('consent-banner-category-group');
		expect(
			[...group.children].every((row) => row.hasAttribute('data-category'))
		).toBe(true);
	});

	test('[BNR-06] a choice announces on the page and focuses Your Privacy Choices', async () => {
		const { consent } = await mount();
		await waitForRoot();
		must('consent-banner-reject-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		await vi.waitFor(() =>
			expect(must('consent-banner-announcement').textContent).toMatch(
				/Optional cookies rejected\./u
			)
		);
		expect(must('consent-banner-announcement').getAttribute('role')).toBe(
			'status'
		);
		expect(document.activeElement).toBe($('privacy-choices-link'));
		expect(
			consent.snapshot().explicitChoice?.categories?.marketing?.value
		).toBe(false);
	});

	test('[BNR-08] links only the configured policies', async () => {
		await mount();
		await waitForRoot();
		expect($('consent-banner-legal-link-privacyPolicy')).not.toBeNull();
		expect($('consent-banner-legal-link-cookiePolicy')).toBeNull();
	});

	test('[BNR-11] the "Consent by" tag sits on the shell, before the card', async () => {
		await mount();
		await waitForRoot();
		await vi.waitFor(() => expect($('consent-banner-branding')).not.toBeNull());
		const tag = must('consent-banner-branding');
		expect(tag.textContent).toContain('Consent by');
		expect(tag.parentElement).toBe(must('consent-banner-shell'));
		expect(tag.nextElementSibling).toBe(must('consent-banner-card'));
	});

	test('[ARCH-01] expanding keeps the card, head and footer nodes', async () => {
		await mount();
		await waitForRoot();
		const card = must('consent-banner-card');
		const header = must('consent-banner-header');
		const footer = must('consent-banner-footer');
		await expandPanel();
		expect(must('consent-banner-card')).toBe(card);
		expect(must('consent-banner-header')).toBe(header);
		expect(must('consent-banner-footer')).toBe(footer);
	});
});

describe('card bottom right', () => {
	test('[BNR-16] the end card resolves to card-end', async () => {
		await mount({ container: { position: 'end', type: 'card' } });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('card-end');
	});
});

describe('banner:', () => {
	test('[BNR-18] a one-row bar on the bottom edge with Reject, Accept and Customize', async () => {
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			edgeStyle: 'flush',
		});
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('banner-bottom');
		expect(root().getAttribute('data-edge-style')).toBe('flush');
		const footer = must('consent-banner-footer');
		expect(footer.contains($('consent-banner-reject-button'))).toBe(true);
		expect(footer.contains($('consent-banner-accept-button'))).toBe(true);
		const customize = must('consent-banner-customize-button');
		expect(footer.contains(customize)).toBe(true);
		// [PERM-09] The collapsed bar points at no panel.
		expect(customize.hasAttribute('aria-controls')).toBe(false);
		expect(customize.getAttribute('aria-expanded')).toBe('false');
		// The heading is there for `aria-labelledby`, but hidden.
		expect(must('consent-banner-title').className).toMatch(/visuallyHidden/iu);
		// One policy link keeps it to one line.
		expect(
			must('consent-banner-description').querySelectorAll('a')
		).toHaveLength(1);
	});

	test('[BNR-18] Customize expands to full content and options in place; Esc folds back', async () => {
		await mount({ container: { edge: 'bottom', type: 'banner' } });
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-expand-panel').getAttribute('data-open')
			).toBe('true')
		);
		expect($('consent-banner-header')).not.toBeNull();
		expect($('consent-banner-save-button')).not.toBeNull();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-expand-panel').contains(document.activeElement)
			).toBe(true)
		);
		pressEscape();
		await vi.waitFor(() => expect($('consent-banner-header')).toBeNull());
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-customize-button'))
		);
	});

	test('[BNR-09] US opt-in bar asks in US terms', async () => {
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			region: 'us-opt-in',
		});
		await waitForRoot();
		expect(must('consent-banner-reject-button').textContent?.trim()).toBe(
			"Don't allow"
		);
		expect(must('consent-banner-accept-button').textContent?.trim()).toBe(
			'Allow'
		);
		expect(must('consent-banner-customize-button').textContent?.trim()).toBe(
			'Choose'
		);
		expect(must('consent-banner-description').textContent).toMatch(
			/asks before using optional cookies/u
		);
	});
});

describe('top drawer:', () => {
	test('[BNR-16] anchored to the top', async () => {
		await mount({ container: { side: 'top', type: 'drawer' } });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('drawer-top');
	});

	test('[BNR-16] Customize expands in place, and the top drawer stays on top on phone', async () => {
		const { fixture } = await mount({
			container: { side: 'top', type: 'drawer' },
		});
		await waitForRoot();
		await expandPanel();
		setPhone(true);
		await fixture.whenStable();
		await vi.waitFor(() =>
			expect(root().getAttribute('data-placement')).toBe('drawer-top')
		);
	});
});

describe('aio', () => {
	test('[BNR-14] a side drawer shows the categories at once, with no Customize', async () => {
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		expect(root().getAttribute('data-flow')).toBe('all-in-one');
		expect(root().getAttribute('data-placement')).toBe('drawer-start');
		await waitForPanel();
		expect($('consent-banner-customize-button')).toBeNull();
		expect($('consent-banner-save-button')).not.toBeNull();
		await vi.waitFor(() =>
			expect($('consent-banner-category-group')).not.toBeNull()
		);
		// [BNR-03] Non-blocking: the page stays usable.
		expect(pageAction().closest('[inert]')).toBeNull();
		expect(must('consent-banner-card').getAttribute('role')).toBe('region');
	});

	test('[BNR-14] the tag floats in its slot after the scroll area', async () => {
		await mount({ container: { side: 'end', type: 'drawer' } });
		await waitForRoot();
		await waitForPanel();
		await vi.waitFor(() => expect($('consent-banner-branding')).not.toBeNull());
		const tag = must('consent-banner-branding');
		const slot = tag.parentElement as HTMLElement;
		expect(slot.parentElement).toBe(must('consent-banner-expand-panel'));
		expect(slot.previousElementSibling).toBe(must('consent-banner-body'));
		expect(must('consent-banner-shell').firstElementChild).toBe(
			must('consent-banner-card')
		);
	});

	test('[BNR-14] US notice: rights rows inline and OK only; an opt-out applies at once', async () => {
		const { consent } = await mount({
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
		await vi.waitFor(() => expect(consent.snapshot().optOut).toBeTruthy());
	});

	test('[LAW-02][RIGHT-06] US opt-in: Allow needs the confirmation, which opens on Cancel', async () => {
		const { consent } = await mount({
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
		expect(group.getAttribute('role')).toBe('group');
		expect(group.firstElementChild?.nextElementSibling).toBe(
			$('consent-banner-right-option-sale-protect')
		);
		expect(group.getAttribute('aria-label')).toBe(
			'Allow selling, sharing and targeted ads'
		);
		allow.click();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-confirm-cancel'))
		);
		expect(allow.getAttribute('aria-pressed')).toBe('false');
		expect(consent.snapshot().explicitChoice).toBeFalsy();
		// [RIGHT-04] Allow again nudges and records nothing.
		allow.click();
		await vi.waitFor(() =>
			expect(must('consent-banner-confirm').getAttribute('data-nudged')).toBe(
				'true'
			)
		);
		expect(must('consent-banner-status').textContent).toMatch(
			/Choose one of the two buttons first\./u
		);
		// [PERM-03] Esc closes the confirmation first, focus back on Allow.
		pressEscape();
		await vi.waitFor(() => expect(document.activeElement).toBe(allow));
		expect($('consent-banner-root')).not.toBeNull();
	});

	test('[PERM-13] on phone a side drawer becomes the bottom drawer, summary first', async () => {
		await mount({ container: { side: 'start', type: 'drawer' }, phone: true });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('drawer-bottom');
		expect(root().getAttribute('data-flow')).toBe('expand-in-place');
		expect(must('consent-banner-expand-panel').getAttribute('data-open')).toBe(
			'false'
		);
	});

	test('[ARCH-01] switching to phone keeps the card node', async () => {
		const { fixture } = await mount({
			container: { side: 'start', type: 'drawer' },
		});
		await waitForRoot();
		const card = must('consent-banner-card');
		setPhone(true);
		await fixture.whenStable();
		await vi.waitFor(() =>
			expect(root().getAttribute('data-placement')).toBe('drawer-bottom')
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
		test(`[BNR-13][PERM-08] block on + ${name}: backdrop, inert page, dialog role on the shell`, async () => {
			await mount({ blockUntilChoice: true, container });
			await waitForRoot();
			const shell = must('consent-banner-shell');
			expect($('consent-banner-overlay')).not.toBeNull();
			expect(shell.getAttribute('role')).toBe('dialog');
			expect(shell.getAttribute('aria-modal')).toBe('true');
			await vi.waitFor(() =>
				expect($('consent-banner-branding')).not.toBeNull()
			);
			expect(shell.contains($('consent-banner-branding'))).toBe(true);
			expect(must('consent-banner-card').hasAttribute('role')).toBe(false);
			await vi.waitFor(() =>
				expect(pageAction().closest('[inert]')).not.toBeNull()
			);
		});
	}

	test('[BNR-13] the US notice never blocks, even with blockUntilChoice', async () => {
		await mount({ blockUntilChoice: true, region: 'us-notice' });
		await waitForRoot();
		expect($('consent-banner-overlay')).toBeNull();
		expect(must('consent-banner-shell').hasAttribute('role')).toBe(false);
		expect(pageAction().closest('[inert]')).toBeNull();
	});
});

describe('blocking:', () => {
	test('[PERM-06][BNR-16] a centred card blocks, and focus lands on the card', async () => {
		await mount({ container: { position: 'center', type: 'card' } });
		await waitForRoot();
		expect(root().getAttribute('data-blocking')).toBe('true');
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-card'))
		);
	});

	test('[FOC-01][PERM-08] Shift+Tab from the card reaches the tag, then wraps inside the shell', async () => {
		await mount({ container: { position: 'center', type: 'card' } });
		await waitForRoot();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-card'))
		);
		await vi.waitFor(() => expect($('consent-banner-branding')).not.toBeNull());
		pressShiftTab();
		expect(document.activeElement).toBe($('consent-banner-branding'));
		pressShiftTab();
		const shell = must('consent-banner-shell');
		const stops = [...shell.querySelectorAll('button, a[href]')];
		expect(document.activeElement).toBe(stops[stops.length - 1]);
	});

	test('[PERM-03] Esc never dismisses a blocking prompt; a choice releases the page', async () => {
		await mount({ container: { position: 'center', type: 'card' } });
		await waitForRoot();
		pressEscape();
		expect($('consent-banner-root')).not.toBeNull();
		must('consent-banner-reject-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		await vi.waitFor(() => expect(pageAction().closest('[inert]')).toBeNull());
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('privacy-choices-link'))
		);
	});
});

describe('notice', () => {
	test('[BNR-01][BNR-10] the US notice offers "Do not sell or share my data" and OK, and expands to the rights', async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		expect(root().getAttribute('data-variant')).toBe('notice');
		const link = must('consent-banner-right-link-opt-out');
		expect(link.textContent?.trim()).toBe('Do not sell or share my data');
		expect($('consent-banner-reject-button')).toBeNull();
		link.click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect($('consent-banner-rights-row-sale')).not.toBeNull()
		);
		// [PERM-11] The expanded notice's footer holds OK alone.
		expect(must('consent-banner-footer').children).toHaveLength(1);
	});

	test('OK records no consent and ends the prompt', async () => {
		const { consent } = await mount({ region: 'us-notice' });
		await waitForRoot();
		must('consent-banner-dismiss-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(consent.snapshot().explicitChoice).toBeFalsy();
	});
});

describe('customization', () => {
	test('theme slots style the v6 parts, and every button opts out of the early-tap replay', async () => {
		await mount({
			theme: {
				slots: {
					consentBannerExpand: 'my-expand',
					consentBannerSaveButton: 'my-save',
				},
			},
		});
		await waitForRoot();
		expect(must('consent-banner-expand-panel').className).toContain(
			'my-expand'
		);
		for (const id of ['reject', 'accept', 'customize']) {
			expect(
				must(`consent-banner-${id}-button`).getAttribute('data-early-tap')
			).toBe('off');
		}
		await expandPanel();
		expect(must('consent-banner-save-button').className).toContain('my-save');
	});

	test('noStyle drops every stock class', async () => {
		await mount({ noStyle: true });
		await waitForRoot();
		for (const element of [
			root(),
			must('consent-banner-card'),
			must('consent-banner-shell'),
			must('consent-banner-reject-button'),
		]) {
			expect(element.getAttribute('class')).toBeNull();
		}
		expect(
			document.head.querySelector('style[data-inth-styles="inth-card"]')
		).toBeNull();
	});
});
