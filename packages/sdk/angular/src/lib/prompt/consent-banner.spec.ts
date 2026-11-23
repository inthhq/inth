/**
 * The stock `<inth-consent-banner>`, ported from React's
 * `consent-banner.test.tsx`, which ports the
 * explorer's self-test groups. Each test names the invariant it guards
 * (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`).
 *
 * These run under jsdom, which has no layout: React's geometry checks
 * (margins, the tag's offset, padding, fade lengths) stay with the
 * browser-mode React suite and the parity runner. Everything about markup,
 * ARIA, focus, keys and what is recorded is checked here.
 */
import {
	ChangeDetectionStrategy,
	Component,
	effect,
	inject,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
	ConsentContainer,
	ConsentEdgeStyle,
	PolicyRule,
} from '@inth/sdk/engine';
import {
	EARLY_CONSENT_TAP_SCRIPT,
	openOptInConfirmation,
} from '@inth/sdk/surface-actions';
import type { Theme } from '@inth/sdk/ui/theme';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { InthProvider } from '../../../provider/src/inth-provider';
import { offlineMode } from '../../__tests__/fixtures/transport-mode';
import { ALL_CATEGORIES, testOptions } from '../../__tests__/test-local';
import { ConsentManager } from '../core/consent-manager';
import { provideInth } from '../core/provide-inth';
import { rightsBundleOf } from '../parts/surface-session';
import { ConsentBanner } from './prompt';
import type { ConsentBannerLayout } from './prompt';

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

/** The banner's own inputs for the next mount. */
const bannerInputs: {
	layout?: ConsentBannerLayout;
	noStyle?: boolean;
	openDialog?: boolean;
} = {};

/** Opens the dialog once the page renders, as a page link would. */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'test-open-dialog',
	template: '',
})
class OpenDialog {
	readonly #consent = inject(ConsentManager);
	constructor() {
		let opened = false;
		effect(() => {
			if (!opened && this.#consent.hasConsentUi()) {
				opened = true;
				this.#consent.setActiveUI('dialog');
			}
		});
	}
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, OpenDialog],
	selector: 'test-banner-host',
	template: `<button type="button">Page action</button>
		<button
			type="button"
			data-testid="privacy-choices-link"
		>
			Your Privacy Choices
		</button>
		<inth-consent-banner
			[disableAnimation]="true"
			[layout]="inputs.layout"
			[noStyle]="inputs.noStyle"
		/>
		@if (inputs.openDialog) {
			<test-open-dialog />
		}`,
})
class BannerHost {
	protected readonly inputs = { ...bannerInputs };
}

interface MountOptions {
	/** `null` sets no container. */
	container?: ConsentContainer | null;
	edgeStyle?: ConsentEdgeStyle;
	blockUntilChoice?: boolean;
	region?: Region;
	phone?: boolean;
	theme?: Theme;
	noStyle?: boolean;
	/** Merged over the region's policy rule. */
	rule?: Partial<PolicyRule>;
	/** The visitor's language, which sets the prompt's `dir`. */
	language?: string;
	/** `layout` on the banner. */
	layout?: ConsentBannerLayout;
	/** `noStyle` on the banner itself, not the provider. */
	bannerNoStyle?: boolean;
	/** Open the dialog as soon as the page can, from a later sibling. */
	openDialog?: boolean;
	/** Provider-level `scrollLock` and `trapFocus`. */
	modal?: { scrollLock?: boolean; trapFocus?: boolean };
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
	phone = false,
	theme,
	noStyle,
	rule,
	language,
	layout,
	bannerNoStyle,
	openDialog,
	modal,
}: MountOptions = {}) {
	fixtureId += 1;
	stubViewport(phone);
	bannerInputs.layout = layout;
	bannerInputs.noStyle = bannerNoStyle;
	bannerInputs.openDialog = openDialog;
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...ALL_CATEGORIES],
				i18n: language ? { locale: language } : undefined,
				legalLinks: { privacyPolicy: { href: '/privacy' } },
				mode: offlineMode([
					{
						id: `pc-${region}-${fixtureId}`,
						match: { fallback: true, isDefault: true },
						model: 'opt-in',
						prompt: 'choice',
						...RULES[region],
						...rule,
					} as PolicyRule,
				]),
				noStyle,
				persistence: false,
				presentation: {
					prompt: {
						blockUntilChoice,
						container: container ?? undefined,
						edgeStyle,
					},
				},
				theme,
				...modal,
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
	test('with no container set, the prompt is a Card in the start corner', async () => {
		await mount({ container: null });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('card-start');
		expect(root().getAttribute('data-variant')).toBe('choice');
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

describe('provider options', () => {
	test('[BNR-13] provider scrollLock and trapFocus never block the stock banner: blockUntilChoice does', async () => {
		await mount({ modal: { scrollLock: true, trapFocus: true } });
		await waitForRoot();
		expect(root().hasAttribute('data-blocking')).toBe(false);
		expect(pageAction().hasAttribute('inert')).toBe(false);
		expect(must('consent-banner-shell').getAttribute('role')).toBeNull();
	});
});

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

	test('[ARCH-01] the options sit straight in the scroll area, with no inputs written as attributes', async () => {
		await mount({
			container: { side: 'start', type: 'drawer' },
			region: 'us-opt-in',
		});
		await waitForRoot();
		await waitForPanel();
		await vi.waitFor(() =>
			expect($('consent-banner-preferences-row')).not.toBeNull()
		);
		const body = must('consent-banner-body');
		// React's markup has no element between the scroll area and the
		// rights row or Preferences.
		expect(body.querySelector('inth-prompt-options')).toBeNull();
		expect(
			[...body.children].map((child) => child.getAttribute('data-testid'))
		).toEqual(['consent-banner-rights-row-sale', null]);
		expect(body.lastElementChild?.firstElementChild).toBe(
			must('consent-banner-preferences-row')
		);
		// A static attribute in an Angular template is written into the DOM
		// as well as set as the input. Bound inputs are not.
		const leaked = [
			'consentaction',
			'testidprefix',
			'testid',
			'slot',
			'vendortableslot',
			'uisource',
			'mode',
			'variant',
			'size',
			'apply',
			'vendors',
		];
		for (const element of must('consent-banner-root').querySelectorAll('*')) {
			for (const name of leaked) {
				expect(element.hasAttribute(name), `${element.outerHTML} ${name}`).toBe(
					false
				);
			}
		}
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

describe('owed, then the dialog at once', () => {
	test('[BNR-06] a dialog the page opens as the prompt is owed leaves the page announcement in place', async () => {
		const { consent } = await mount({ openDialog: true });
		await vi.waitFor(
			() => expect($('consent-banner-announcement')).not.toBeNull(),
			{ timeout: 4000 }
		);
		expect(consent.activeUI()).toBe('dialog');
		expect($('consent-banner-root')).toBeNull();
	});
});

describe('blocking commit', () => {
	test('[BNR-06][BNR-13] a blocking choice releases the page before focus returns', async () => {
		await mount({ container: { position: 'center', type: 'card' } });
		await waitForRoot();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-card'))
		);
		// jsdom lets an inert element take focus, so record whether the
		// page was still inert when focus was asked for.
		const target = must('privacy-choices-link');
		const inertWhenFocused: boolean[] = [];
		const focus = target.focus.bind(target);
		target.focus = (options?: FocusOptions) => {
			inertWhenFocused.push(target.closest('[inert]') !== null);
			focus(options);
		};
		must('consent-banner-accept-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		await vi.waitFor(() => expect(inertWhenFocused.length).toBeGreaterThan(0));
		expect(inertWhenFocused).toEqual([false]);
		expect(document.activeElement).toBe(target);
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
	test('theme slots style the prompt parts, and every button opts out of the early-tap replay', async () => {
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

describe('council fixes', () => {
	test('[BNR-13] the banner hosts an opt-in confirmation', async () => {
		const { consent, fixture } = await mount({ region: 'us-opt-in' });
		await waitForRoot();
		const confirmed = vi.fn();
		openOptInConfirmation(consent.kernel(), confirmed, null);
		fixture.detectChanges();
		const confirm = await vi.waitFor(
			() => must<HTMLButtonElement>('opt-in-confirmation-confirm-button'),
			{ timeout: 4000 }
		);
		confirm.click();
		await vi.waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
	});

	test('[PERM-05][SR-05] collapsed panels carry a real inert attribute', async () => {
		await mount();
		await waitForRoot();
		const panel = must('consent-banner-expand-panel');
		expect(panel.getAttribute('inert')).toBe('');
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() => expect(panel.hasAttribute('inert')).toBe(false));
		expect(root().hasAttribute('inert')).toBe(false);
	});

	test('[BNR-15] the summary shows only the actions the policy allows, in every presentation', async () => {
		const actions = { actions: ['accept', 'reject'] } as Partial<PolicyRule>;
		await mount({ rule: actions });
		await waitForRoot();
		expect($('consent-banner-customize-button')).toBeNull();
		expect($('consent-banner-reject-button')).not.toBeNull();
		expect($('consent-banner-accept-button')).not.toBeNull();
		TestBed.resetTestingModule();
		document.body.replaceChildren();
		await mount({ container: { type: 'banner' }, rule: actions });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('banner-bottom');
		expect($('consent-banner-customize-button')).toBeNull();
		expect($('consent-banner-reject-button')).not.toBeNull();
	});

	test('[BNR-15] the summary follows the host layout order', async () => {
		await mount({ layout: ['customize', ['accept', 'reject']] });
		await waitForRoot();
		const footer = must('consent-banner-footer');
		expect(footer.firstElementChild).toBe($('consent-banner-customize-button'));
		const group = must('consent-banner-footer-sub-group');
		expect(group.firstElementChild).toBe($('consent-banner-accept-button'));
	});

	test('[BNR-15] the collapsed Banner keeps the host groups and their slot', async () => {
		await mount({
			container: { type: 'banner' },
			layout: ['customize', ['accept', 'reject']],
			theme: { slots: { consentBannerFooterSubGroup: 'group-marker' } },
		});
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('banner-bottom');
		const footer = must('consent-banner-footer');
		expect(footer.firstElementChild).toBe($('consent-banner-customize-button'));
		const group = must('consent-banner-footer-sub-group');
		expect(group.parentElement).toBe(footer);
		expect(group.classList).toContain('group-marker');
		expect(group.firstElementChild).toBe($('consent-banner-accept-button'));
		expect(group.lastElementChild).toBe($('consent-banner-reject-button'));
	});

	test('[PERM-13] an expansion made on phone does not survive a pass through all-in-one', async () => {
		const { fixture } = await mount({
			container: { side: 'start', type: 'drawer' },
			phone: true,
		});
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await vi.waitFor(() =>
			expect(root().getAttribute('data-expanded')).toBe('true')
		);
		setPhone(false);
		fixture.detectChanges();
		await vi.waitFor(() =>
			expect(root().getAttribute('data-flow')).toBe('all-in-one')
		);
		await fixture.whenStable();
		// Esc on desktop has nothing to fold, so it is left to the page.
		const escape = new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key: 'Escape',
		});
		document.dispatchEvent(escape);
		expect(escape.defaultPrevented).toBe(false);
		setPhone(true);
		fixture.detectChanges();
		await vi.waitFor(() =>
			expect(root().getAttribute('data-flow')).toBe('expand-in-place')
		);
		expect(root().hasAttribute('data-expanded')).toBe(false);
		expect(must('consent-banner-expand-panel').getAttribute('data-open')).toBe(
			'false'
		);
	});

	test('[COPY-01][SR-04] the rights bundle reads the backend-confirmed rights from the local receipt', () => {
		const snapshot = {
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: 1,
				rights: ['sale', 'share'],
			},
		} as unknown as Parameters<typeof rightsBundleOf>[0];
		expect(
			rightsBundleOf(snapshot, {
				localAct: 'button',
				reference: 'ref',
				rightsConfirmed: true,
			})
		).toBe('sale-share');
		expect(rightsBundleOf(snapshot, null)).toBe('all');
	});

	test('a local noStyle reaches the stock buttons', async () => {
		await mount({ bannerNoStyle: true });
		await waitForRoot();
		for (const id of [
			'consent-banner-reject-button',
			'consent-banner-accept-button',
			'consent-banner-customize-button',
		]) {
			expect(must(id).getAttribute('class') ?? '').toBe('');
		}
	});

	test('the collapsed bar takes the title, description and footer slots', async () => {
		await mount({
			container: { type: 'banner' },
			theme: {
				slots: {
					consentBannerDescription: 'description-marker',
					consentBannerFooter: 'footer-marker',
					consentBannerTitle: 'title-marker',
				},
			},
		});
		await waitForRoot();
		expect(must('consent-banner-title').classList).toContain('title-marker');
		expect(must('consent-banner-description').classList).toContain(
			'description-marker'
		);
		expect(must('consent-banner-footer').classList).toContain('footer-marker');
	});

	test('the root carries the direction, the surface marker and the animation switch', async () => {
		await mount({ language: 'he' });
		await waitForRoot();
		expect(root().getAttribute('dir')).toBe('rtl');
		expect(root().getAttribute('data-inth-surface')).toBe('banner');
		expect(root().getAttribute('data-animation')).toBe('off');
	});

	test('the Preferences body spacing lives in the stylesheet, so noStyle drops it', async () => {
		await mount({ container: { type: 'banner' }, region: 'us-opt-in' });
		await waitForRoot();
		must('consent-banner-customize-button').click();
		const row = await vi.waitFor(() => must('consent-banner-preferences-row'), {
			timeout: 4000,
		});
		const body = document
			.getElementById(row.getAttribute('aria-controls') ?? '')
			?.querySelector(':scope > * > *') as HTMLElement;
		expect(body.getAttribute('style')).toBeNull();
		expect(body.className).not.toBe('');
	});
});

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

const bootProvider = async (host: new () => unknown) => {
	stubViewport(false);
	TestBed.configureTestingModule({ providers: [provideInth(testOptions())] });
	const fixture = TestBed.createComponent(host);
	const consent = TestBed.inject(ConsentManager);
	await fixture.whenStable();
	return { consent, fixture };
};

describe('<inth-provider>', () => {
	test('renders the banner, whose Customize opens the options in place', async () => {
		const { consent } = await bootProvider(RootHost);
		await waitForRoot();
		expect($('consent-banner-branding')).toBeNull();
		await expandPanel();
		expect(consent.activeUI()).toBe('banner');
		expect($('consent-dialog-root')).toBeNull();
	});

	test('renders the content it wraps, without a box of its own', async () => {
		await bootProvider(WrappingRootHost);
		await waitForRoot();
		expect($('wrapped-app')?.textContent).toBe('App');
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

	/**
	 * The server's banner, tapped while only the inline script runs.
	 *
	 * @returns When the script recorded the tap.
	 */
	const tapServerBanner = (
		action: string,
		{ model = 'opt-in', prompt = 'choice' } = {}
	): number => {
		// An earlier banner claimed the queue; a fresh page has none.
		Reflect.deleteProperty(window, EARLY_TAPS);
		// oxlint-disable-next-line no-new-func -- The script ships as text.
		new Function(EARLY_CONSENT_TAP_SCRIPT)();
		document.body.innerHTML = `<div data-testid="consent-banner-root" data-model="${model}" data-prompt="${prompt}"><button data-action="${action}">${action}</button></div>`;
		document
			.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
			?.click();
		const queue = (
			window as unknown as Record<string, { taps?: { at: number }[] }>
		)[EARLY_TAPS];
		expect(queue?.taps).toHaveLength(1);
		document.body.replaceChildren();
		return queue?.taps?.[0]?.at ?? Number.NaN;
	};

	/** Long enough that the replay's own clock differs from the tap's. */
	const later = () =>
		new Promise((resolve) => {
			setTimeout(resolve, 30);
		});

	test("the root names the policy's model and prompt, and the notice's right-link replays as Customize", async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		// The script records these with a tap, so a replay against another
		// policy is dropped.
		expect(root().getAttribute('data-model')).toBe('opt-out');
		expect(root().getAttribute('data-prompt')).toBe('notice');
		expect(
			must('consent-banner-right-link-opt-out').getAttribute('data-action')
		).toBe('customize');
	});

	test("a tap on the notice's right-link before hydration expands the rights in place", async () => {
		tapServerBanner('customize', { model: 'opt-out', prompt: 'notice' });
		const { consent } = await mount({ region: 'us-notice' });
		await waitForRoot();
		await vi.waitFor(
			() => expect(root().getAttribute('data-expanded')).toBe('true'),
			{ timeout: 4000 }
		);
		expect(consent.activeUI()).toBe('banner');
		expect(consent.snapshot().optOut).toBeFalsy();
	});

	test('a choice records the time of the tap, not of the replay', async () => {
		const tappedAt = tapServerBanner('reject');
		await later();
		const { consent } = await mount({ region: 'us-opt-in' });
		await vi.waitFor(
			() => expect(consent.snapshot().explicitChoice).toBeTruthy(),
			{ timeout: 4000 }
		);
		expect(
			consent.snapshot().explicitChoice?.categories?.marketing?.confirmedAt
		).toBe(tappedAt);
	});

	test('an OK on the notice before hydration records the time of the tap', async () => {
		const tappedAt = tapServerBanner('dismiss', {
			model: 'opt-out',
			prompt: 'notice',
		});
		await later();
		const { consent } = await mount({ region: 'us-notice' });
		await vi.waitFor(
			() => expect(consent.snapshot().noticeDismissal).toBeTruthy(),
			{ timeout: 4000 }
		);
		expect(consent.snapshot().noticeDismissal?.dismissedAt).toBe(tappedAt);
	});

	test('records the tapped accept through the prompt once it hydrates', async () => {
		tapServerBanner('accept');
		// The script hid the banner for the visitor.
		expect(document.getElementById('inth-early-tap')).not.toBeNull();
		const { consent, fixture } = await bootProvider(RootHost);

		await vi.waitFor(() => expect(consent.has('marketing')).toBe(true), {
			timeout: 4000,
		});
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect($('consent-banner-root')).toBeNull();
			expect(document.getElementById('inth-early-tap')).toBeNull();
		});
	});

	test('opens the options in place for a tapped Customize, recording nothing', async () => {
		tapServerBanner('customize');
		const { consent } = await bootProvider(RootHost);
		await waitForRoot();
		await vi.waitFor(
			() =>
				expect(
					must('consent-banner-expand-panel').getAttribute('data-open')
				).toBe('true'),
			{ timeout: 4000 }
		);
		expect(consent.activeUI()).toBe('banner');
		expect(consent.has('marketing')).toBe(false);
	});
});
