/**
 * The stock Svelte `ConsentBanner`: a Card, Banner or Drawer, ported from
 * React's `consent-banner.test.tsx`, itself ported from the explorer's self-test groups: `card:`, `card bottom right`,
 * `banner:`, `top drawer:`, `aio`, `block on + …`, `blocking:`, `fades:`
 * and `phone flush/inset bottom drawer`. Each test names the invariant it
 * guards (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`).
 */
import type {
	ConsentContainer,
	ConsentEdgeStyle,
	ConsentKernel,
	ConsentPresentation,
	ConsentSnapshot,
} from '@inth/sdk/engine';
import '@testing-library/jest-dom/vitest';
import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '@inth/sdk/runtime/page-globals';
import type { PolicyRule } from '@inth/sdk/schema/types';
import {
	EARLY_CONSENT_TAP_SCRIPT,
	openOptInConfirmation,
} from '@inth/sdk/surface-actions';
import { defaultTranslationConfig } from '@inth/sdk/surface-state';
import { mount as mountComponent, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { rightsBundleOf } from '../lib/components/parts/rights-bundle.model';
import type { ConsentManagerOptions } from '../lib/manager-options.model';
import { testing } from '../lib/testing';
import Fixture from './fixtures/consent-surfaces-fixture.svelte';
import { policyFixture } from './policy-fixture';

type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const RULES: Record<Region, Partial<PolicyRule>> = {
	eu: {},
	'us-notice': {
		model: 'opt-out',
		privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
		prompt: 'notice',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
	'us-opt-in': {
		privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	},
	'us-opt-out': {
		model: 'opt-out',
		privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
		prompt: 'none',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
};

interface MountOptions {
	/** `null` sets no container. */
	container?: ConsentContainer | null;
	edgeStyle?: ConsentEdgeStyle;
	blockUntilChoice?: boolean;
	region?: Region;
	/** More provider options, such as `theme` or `noStyle`. */
	extra?: Partial<ConsentManagerOptions>;
	/** Merged over the region's policy rule. */
	rule?: Partial<PolicyRule>;
	/** Props for the stock `ConsentBanner`. */
	bannerProps?: Record<string, unknown>;
	/** The resolved language, which sets the prompt's `dir`. */
	language?: string;
}

/** The snapshot, for assertions on what was recorded, and the kernel. */
const probe: {
	snapshot: ConsentSnapshot | null;
	kernel: ConsentKernel | null;
} = { kernel: null, snapshot: null };

let mounted: Record<string, unknown> | undefined;
let fixture = 0;
const mount = async function mount({
	container = { type: 'card' },
	edgeStyle,
	blockUntilChoice,
	region = 'eu',
	extra,
	rule,
	bannerProps,
	language,
}: MountOptions = {}) {
	fixture += 1;
	const prefetch = policyFixture(undefined, {
		id: `pc-${region}-${fixture}`,
		...RULES[region],
		...rule,
	});
	if (language) {
		prefetch.initialTranslations = {
			language,
			translations: defaultTranslationConfig.translations.en as never,
		};
	}
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
		prefetch,
		presentation: {
			prompt: {
				blockUntilChoice,
				container: container ?? undefined,
				edgeStyle,
			},
		},
		...extra,
	} as ConsentManagerOptions;
	mounted = mountComponent(Fixture, {
		props: { bannerProps, options, probe },
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
const root = () => must('consent-banner-root');

/**
 * The root, once the presentation's deferred stylesheet text has landed.
 * React holds the prompt until its sheets are ready; Svelte renders it at
 * once under a rule that keeps it transparent until they are, so geometry
 * waits for the text too.
 */
const waitForRoot = () =>
	vi.waitFor(
		() => {
			expect($('consent-banner-root')).toBeInTheDocument();
			expect(document.querySelector('style[data-inth-pending]')).toBeNull();
		},
		{ timeout: 4000 }
	);
const waitForPanel = () =>
	vi.waitFor(
		() =>
			expect(
				document.querySelector('[data-testid="consent-banner-body"] > *')
			).toBeInTheDocument(),
		{ timeout: 4000 }
	);
const finishAnimations = () => {
	for (const animation of document.getAnimations()) {
		animation.finish();
	}
};
const box = (testId: string) => must(testId).getBoundingClientRect();
const pageAction = () =>
	[...document.querySelectorAll('button')].find(
		(button) => button.textContent === 'Page action'
	) as HTMLButtonElement;

beforeEach(async () => {
	probe.snapshot = null;
	probe.kernel = null;
	await page.viewport(1280, 800);
});

afterEach(async () => {
	if (mounted) {
		await unmount(mounted);
		mounted = undefined;
	}
	document.documentElement.removeAttribute('dir');
	(document.activeElement as HTMLElement | null)?.blur?.();
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const host = window as unknown as Record<
		string,
		{ stop?: () => void } | undefined
	>;
	host[EARLY_TAPS_WINDOW_KEY]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
});

/**
 * A tap on the server-rendered prompt before it hydrated: the inline
 * script runs, the visitor taps a button of the server's markup, and that
 * markup goes away as Svelte takes the page.
 */
const tapBeforeHydration = (action: string) => {
	const server = document.createElement('div');
	server.innerHTML = `<div data-testid="consent-banner-root"><button type="button" data-action="${action}">${action}</button></div>`;
	document.body.append(server);
	// oxlint-disable-next-line no-new-func -- Runs the inline script as server HTML would.
	new Function(EARLY_CONSENT_TAP_SCRIPT)();
	server.querySelector('button')?.click();
	server.remove();
};

/** When the inline script recorded the first held tap. */
const tapTime = (): number | undefined =>
	(
		window as unknown as Record<string, { taps?: { at: number }[] } | undefined>
	)[EARLY_TAPS_WINDOW_KEY]?.taps?.[0]?.at;

describe('opt-in', () => {
	test('renders an inset Card in the start corner by default', async () => {
		await mount({ container: null });
		await waitForRoot();
		expect(root()).toHaveAttribute('data-placement', 'card-start');
	});

	test('[BNR-13] provider scrollLock and trapFocus never block the stock banner: blockUntilChoice does', async () => {
		await mount({
			extra: { scrollLock: true, trapFocus: true },
		});
		await waitForRoot();
		expect(root()).not.toHaveAttribute('data-blocking');
		expect(pageAction()).not.toHaveAttribute('inert');
		expect(must('consent-banner-shell')).not.toHaveAttribute('role', 'dialog');
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
		expect(must('consent-banner-card').contains(document.activeElement)).toBe(
			false
		);

		customize.click();
		await waitForPanel();
		await vi.waitFor(() => {
			expect(panel).toHaveAttribute('data-open', 'true');
			expect(panel.contains(document.activeElement)).toBe(true);
		});
		expect(root()).toHaveAttribute('data-expanded', 'true');
		expect($('consent-banner-category-group')).toBeInTheDocument();
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
			expect($('consent-banner-save-button')).toBeInTheDocument()
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
			expect(
				must('consent-banner-expand-panel').contains(document.activeElement)
			).toBe(true)
		);
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() =>
			expect(must('consent-banner-expand-panel')).toHaveAttribute(
				'data-open',
				'false'
			)
		);
		expect(root()).toBeInTheDocument();
		expect(document.activeElement).toBe($('consent-banner-customize-button'));
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
		expect(probe.snapshot?.explicitChoice).toBeFalsy();
		must('consent-banner-save-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(probe.snapshot?.explicitChoice?.categories?.marketing?.value).toBe(
			true
		);
		expect(probe.snapshot?.explicitChoice?.categories?.measurement?.value).toBe(
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
		const label = document.getElementById(
			sw.getAttribute('aria-labelledby') ?? ''
		);
		const description = document.getElementById(
			sw.getAttribute('aria-describedby') ?? ''
		);
		expect(label).toHaveTextContent('Analytics');
		expect(description?.textContent).toMatch(/understand how visitors/u);
		expect(description).toBeVisible();
	});

	test('[CAT-01][CAT-06] the name labels the row, the description is muted and smaller', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const sw = await vi.waitFor(() =>
			must('consent-banner-category-switch-measurement')
		);
		const label = document.getElementById(
			sw.getAttribute('aria-labelledby') ?? ''
		) as HTMLElement;
		const description = document.getElementById(
			sw.getAttribute('aria-describedby') ?? ''
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
		// The "Your Privacy Choices" link stays on the page under an opt-in
		// policy, with no opt-out icon: the way back in.
		const link = must('privacy-choices-link');
		expect(document.activeElement).toBe(link);
		expect(link).toHaveTextContent('Your Privacy Choices');
		expect(link.querySelector('svg')).toBeNull();
		expect(probe.snapshot?.explicitChoice?.categories?.marketing?.value).toBe(
			false
		);
	});

	test('[BNR-08] links only the configured policies', async () => {
		await mount();
		await waitForRoot();
		expect($('consent-banner-legal-link-privacyPolicy')).toBeInTheDocument();
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
		await mount({
			container: { position: 'start', type: 'card' },
			language: 'he',
		});
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
		expect($('consent-banner-header')).toBeInTheDocument();
		expect($('consent-banner-save-button')).toBeInTheDocument();
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() => expect($('consent-banner-header')).toBeNull());
		expect(document.activeElement).toBe($('consent-banner-customize-button'));
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
		expect($('consent-banner-save-button')).toBeInTheDocument();
		expect($('consent-banner-category-group')).toBeInTheDocument();
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
		expect(
			Number.parseInt(
				getComputedStyle(must('consent-banner-body')).paddingBottom,
				10
			)
		).toBeGreaterThanOrEqual(56);
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
		expect($('consent-banner-dismiss-button')).toBeInTheDocument();
		expect($('consent-banner-right-link-opt-out')).toBeNull();
		expect($('consent-banner-save-button')).toBeNull();
		protect.click();
		await vi.waitFor(() => expect(probe.snapshot?.optOut).toBeTruthy());
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
			expect(document.activeElement).toBe($('consent-banner-confirm-cancel'))
		);
		expect(allow).toHaveAttribute('aria-pressed', 'false');
		expect(probe.snapshot?.explicitChoice).toBeFalsy();
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
		await vi.waitFor(() => expect(document.activeElement).toBe(allow));
		expect(root()).toBeInTheDocument();
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
			expect($('consent-banner-overlay')).toBeInTheDocument();
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
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-card'))
		);
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
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-card'))
		);
		await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
		expect(document.activeElement).toBe($('consent-banner-branding'));
		await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
		const shell = must('consent-banner-shell');
		const stops = [...shell.querySelectorAll('button, a[href]')];
		expect(document.activeElement).toBe(stops[stops.length - 1]);
	});

	test('[PERM-03] Esc never dismisses a blocking prompt; a choice releases the page', async () => {
		await mount({ container: { position: 'center', type: 'card' } });
		await waitForRoot();
		await userEvent.keyboard('{Escape}');
		expect(root()).toBeInTheDocument();
		must('consent-banner-reject-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(pageAction().closest('[inert]')).toBeNull();
		expect(document.body.style.overflow).not.toBe('hidden');
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('privacy-choices-link'))
		);
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
			expect($('consent-banner-rights-row-sale')).toBeInTheDocument()
		);
		// [PERM-11] The expanded notice's footer holds OK alone.
		expect(must('consent-banner-footer').children).toHaveLength(1);
	});

	test('[VIS-02] "Do not sell or share my data" reads as a link in the text blue, light and dark', async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		const link = must('consent-banner-right-link-opt-out');
		const blue = document.createElement('span');
		blue.style.color = 'var(--inth-primary-text)';
		link.after(blue);
		const check = () => {
			const style = getComputedStyle(link);
			expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
			expect(style.color).toBe(getComputedStyle(blue).color);
			expect(style.textDecorationLine).toBe('underline');
		};
		await vi.waitFor(check);
		document.documentElement.classList.add('dark');
		try {
			await vi.waitFor(check);
		} finally {
			document.documentElement.classList.remove('dark');
			blue.remove();
		}
	});

	test('OK records no consent and ends the prompt', async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		must('consent-banner-dismiss-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(probe.snapshot?.explicitChoice).toBeFalsy();
	});
});

describe('customization', () => {
	test("theme slots style the prompt's parts, as the components slots do in React", async () => {
		const slot = (className: string) => ({
			className,
			style: { outlineColor: 'rgb(1, 2, 3)' },
		});
		await mount({
			extra: {
				theme: {
					slots: {
						consentBannerCard: slot('slot-card'),
						consentBannerExpand: slot('slot-expand'),
						consentBannerRightsRow: slot('slot-rights'),
						consentBannerSaveButton: slot('slot-save'),
					},
				},
			},
			region: 'us-opt-in',
		});
		await waitForRoot();
		expect(must('consent-banner-card')).toHaveClass('slot-card');
		expect(must('consent-banner-expand-panel')).toHaveClass('slot-expand');
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const row = await vi.waitFor(() => must('consent-banner-rights-row-sale'));
		expect(row).toHaveClass('slot-rights');
		expect(row.style.outlineColor).toBe('rgb(1, 2, 3)');
		expect(must('consent-banner-save-button')).toHaveClass('slot-save');
	});

	test("the notice's right-link takes the consentBannerRightLink slot", async () => {
		await mount({
			extra: {
				theme: {
					slots: {
						consentBannerRightLink: {
							className: 'slot-right-link',
							style: { outlineColor: 'rgb(1, 2, 3)' },
						},
					},
				},
			},
			region: 'us-notice',
		});
		await waitForRoot();
		const link = must('consent-banner-right-link-opt-out');
		expect(link).toHaveClass('slot-right-link');
		expect(link.style.outlineColor).toBe('rgb(1, 2, 3)');
	});

	test('noStyle drops the stock classes and keeps the test ids and data attributes', async () => {
		await mount({ extra: { noStyle: true } });
		await vi.waitFor(() =>
			expect($('consent-banner-root')).toBeInTheDocument()
		);
		expect(root()).toHaveAttribute('data-placement', 'card-start');
		expect(root()).not.toHaveAttribute('class');
		expect(must('consent-banner-card')).not.toHaveAttribute('class');
		expect(must('consent-banner-reject-button')).not.toHaveAttribute('class');
	});
});

describe('wave B round 1', () => {
	test('[BNR-13] an opt-in confirmation opens over the prompt', async () => {
		await mount({ region: 'us-opt-in' });
		await waitForRoot();
		await vi.waitFor(() => expect(probe.kernel).not.toBeNull());
		const kernel = probe.kernel as ConsentKernel;
		const confirmed = vi.fn();
		openOptInConfirmation(kernel, confirmed, null);
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
		expect(panel.hasAttribute('inert')).toBe(true);
		expect(panel.inert).toBe(true);
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
		expect($('consent-banner-reject-button')).toBeInTheDocument();
		expect($('consent-banner-accept-button')).toBeInTheDocument();
		if (mounted) {
			await unmount(mounted);
			mounted = undefined;
		}
		await mount({ container: { type: 'banner' }, rule: actions });
		await waitForRoot();
		expect(root()).toHaveAttribute('data-placement', 'banner-bottom');
		expect($('consent-banner-customize-button')).toBeNull();
		expect($('consent-banner-reject-button')).toBeInTheDocument();
	});

	test('[BNR-15] the summary follows the host layout order', async () => {
		await mount({
			bannerProps: { layout: ['customize', ['accept', 'reject']] },
		});
		await waitForRoot();
		const footer = must('consent-banner-footer');
		expect(footer.firstElementChild).toBe($('consent-banner-customize-button'));
		const group = must('consent-banner-footer-sub-group');
		expect(group.firstElementChild).toBe($('consent-banner-accept-button'));
	});

	test('[BNR-15] the collapsed Banner keeps the host groups and their slot', async () => {
		await mount({
			bannerProps: { layout: ['customize', ['accept', 'reject']] },
			container: { type: 'banner' },
			extra: {
				theme: {
					slots: { consentBannerFooterSubGroup: { className: 'group-marker' } },
				},
			},
		});
		await waitForRoot();
		expect(root()).toHaveAttribute('data-placement', 'banner-bottom');
		const footer = must('consent-banner-footer');
		expect(footer.firstElementChild).toBe($('consent-banner-customize-button'));
		const group = must('consent-banner-footer-sub-group');
		expect(group.parentElement).toBe(footer);
		expect(group).toHaveClass('group-marker');
		expect(group.firstElementChild).toBe($('consent-banner-accept-button'));
		expect(group.lastElementChild).toBe($('consent-banner-reject-button'));
		// Grouped buttons get the bar's button size, not the group.
		expect(box('consent-banner-accept-button').height).toBeGreaterThanOrEqual(
			32
		);
		expect(box('consent-banner-accept-button').width).toBeCloseTo(
			box('consent-banner-reject-button').width,
			0
		);
		// Stacked, every button takes an equal share of the row.
		await page.viewport(390, 800);
		await vi.waitFor(() =>
			expect(box('consent-banner-customize-button').width).toBeCloseTo(
				box('consent-banner-accept-button').width,
				0
			)
		);
		expect(box('consent-banner-reject-button').width).toBeCloseTo(
			box('consent-banner-accept-button').width,
			0
		);
	});

	test('[PERM-13] an expansion made on phone does not survive a pass through all-in-one', async () => {
		await page.viewport(390, 800);
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await vi.waitFor(() =>
			expect(root()).toHaveAttribute('data-expanded', 'true')
		);
		await page.viewport(1280, 800);
		await vi.waitFor(() =>
			expect(root()).toHaveAttribute('data-flow', 'all-in-one')
		);
		// Esc on desktop has nothing to fold, so it is left to the page.
		const escape = new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key: 'Escape',
		});
		document.dispatchEvent(escape);
		expect(escape.defaultPrevented).toBe(false);
		await page.viewport(390, 800);
		await vi.waitFor(() =>
			expect(root()).toHaveAttribute('data-flow', 'expand-in-place')
		);
		expect(root()).not.toHaveAttribute('data-expanded');
		expect(must('consent-banner-expand-panel')).toHaveAttribute(
			'data-open',
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
		await mount({ bannerProps: { noStyle: true } });
		await waitForRoot();
		for (const id of [
			'consent-banner-reject-button',
			'consent-banner-accept-button',
			'consent-banner-customize-button',
		]) {
			expect(must(id).getAttribute('class') ?? '').toBe('');
		}
	});

	test('the collapsed bar merges the title, description and footer slots', async () => {
		await mount({
			container: { type: 'banner' },
			extra: {
				theme: {
					slots: {
						consentBannerDescription: 'description-marker',
						consentBannerFooter: 'footer-marker',
						consentBannerTitle: 'title-marker',
					},
				},
			},
		});
		await waitForRoot();
		expect(must('consent-banner-title')).toHaveClass('title-marker');
		expect(must('consent-banner-description')).toHaveClass(
			'description-marker'
		);
		expect(must('consent-banner-footer')).toHaveClass('footer-marker');
	});

	test('the root carries the direction, the surface marker and the animation switch', async () => {
		await mount({ language: 'he' });
		await waitForRoot();
		expect(root()).toHaveAttribute('dir', 'rtl');
		expect(root()).toHaveAttribute('data-inth-surface', 'banner');
		expect(root()).toHaveAttribute('data-animation', 'off');
		expect(getComputedStyle(must('consent-banner-shell')).animationName).toBe(
			'none'
		);
	});

	test('the Preferences body spacing lives in the stylesheet, so noStyle drops it', async () => {
		await mount({ container: { type: 'banner' }, region: 'us-opt-in' });
		await waitForRoot();
		must('consent-banner-customize-button').click();
		const row = await vi.waitFor(() => must('consent-banner-preferences-row'), {
			timeout: 4000,
		});
		const body = document.querySelector(
			`#${CSS.escape(row.getAttribute('aria-controls') ?? '')} > * > *`
		) as HTMLElement;
		expect(body.getAttribute('style')).toBeNull();
		await vi.waitFor(() =>
			expect(getComputedStyle(body).paddingTop).toBe('8px')
		);
	});
});

describe('wave C round 1', () => {
	test("ConsentBanner's class reaches the prompt root, with and without noStyle", async () => {
		await mount({
			bannerProps: { class: 'host-banner' },
			extra: {
				theme: { slots: { consentBanner: 'slot-banner' } },
			} as Partial<ConsentManagerOptions>,
		});
		await waitForRoot();
		expect(root()).toHaveClass('host-banner');
		expect(root()).toHaveClass('slot-banner');
		if (mounted) {
			await unmount(mounted);
			mounted = undefined;
		}
		await mount({ bannerProps: { class: 'host-banner', noStyle: true } });
		await waitForRoot();
		expect(root().className).toBe('host-banner');
	});

	test('[MOT-03] the system reduced motion setting skips the exit, even with animation on', async () => {
		const matchMedia = window.matchMedia.bind(window);
		vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
			query.includes('prefers-reduced-motion')
				? ({
						addEventListener: () => undefined,
						addListener: () => undefined,
						dispatchEvent: () => false,
						matches: true,
						media: query,
						onchange: null,
						removeEventListener: () => undefined,
						removeListener: () => undefined,
					} as MediaQueryList)
				: matchMedia(query)
		);
		await mount({
			bannerProps: { disableAnimation: false },
			extra: { disableAnimation: false } as Partial<ConsentManagerOptions>,
		});
		await waitForRoot();
		let closing = false;
		const watcher = new MutationObserver(() => {
			if ($('consent-banner-root')?.getAttribute('data-state') === 'closed') {
				closing = true;
			}
		});
		watcher.observe(document.body, {
			attributes: true,
			childList: true,
			subtree: true,
		});
		must('consent-banner-accept-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		watcher.disconnect();
		expect(closing).toBe(false);
	});

	test('[COPY-01] the opt-out icon carries its own size where no banner sheet sizes it', async () => {
		const presentation: ConsentPresentation = {
			optOutLink: 'privacy-choices',
		};
		await mount({
			extra: { presentation } as Partial<ConsentManagerOptions>,
			region: 'us-opt-out',
		});
		const link = await vi.waitFor(() => must('privacy-choices-link'));
		const icon = link.querySelector('svg');
		expect(icon).toHaveAttribute('height', '14');
		expect(icon).toHaveAttribute('width', '30');
		expect(icon?.getBoundingClientRect().height).toBeGreaterThan(0);
		expect(icon?.getBoundingClientRect().height).toBeLessThanOrEqual(16);
		if (mounted) {
			await unmount(mounted);
			mounted = undefined;
		}
		await mount({
			extra: { noStyle: true, presentation } as Partial<ConsentManagerOptions>,
			region: 'us-opt-out',
		});
		const bare = await vi.waitFor(() => must('privacy-choices-link'));
		const bareIcon = bare.querySelector('svg');
		expect(bareIcon).not.toBeNull();
		expect(bareIcon).not.toHaveAttribute('width');
		expect(bareIcon).not.toHaveAttribute('height');
	});
});

describe('[BNR-06] a tap before hydration', () => {
	test('the server markup lets the inline script hold taps on the prompt buttons', async () => {
		await mount({ region: 'us-opt-in' });
		await waitForRoot();
		for (const testId of [
			'consent-banner-reject-button',
			'consent-banner-accept-button',
			'consent-banner-customize-button',
		]) {
			expect(must(testId)).not.toHaveAttribute('data-early-tap');
		}
	});

	test("a Reject replays through the prompt's commit", async () => {
		tapBeforeHydration('reject');
		await mount({ region: 'us-opt-in' });
		await vi.waitFor(() => expect(probe.snapshot?.explicitChoice).toBeTruthy());
		expect(probe.snapshot?.explicitChoice?.categories?.marketing?.value).toBe(
			false
		);
		expect(probe.snapshot?.explicitChoice?.categories?.measurement?.value).toBe(
			false
		);
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		await vi.waitFor(() =>
			expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull()
		);
	});

	test("an Accept replays through the prompt's commit", async () => {
		tapBeforeHydration('accept');
		await mount();
		await vi.waitFor(() =>
			expect(probe.snapshot?.explicitChoice?.categories?.marketing?.value).toBe(
				true
			)
		);
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
	});

	test("the root names the policy's model and prompt, and the notice's right-link replays as Customize", async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		// The script records these with a tap, so a replay against another
		// policy is dropped.
		expect(root()).toHaveAttribute('data-model', 'opt-out');
		expect(root()).toHaveAttribute('data-prompt', 'notice');
		expect(must('consent-banner-right-link-opt-out')).toHaveAttribute(
			'data-action',
			'customize'
		);
	});

	test("a tap on the notice's right-link before hydration expands the rights in place", async () => {
		tapBeforeHydration('customize');
		await mount({ region: 'us-notice' });
		await waitForRoot();
		await vi.waitFor(() =>
			expect(root()).toHaveAttribute('data-expanded', 'true')
		);
		expect(probe.snapshot?.activeUI).toBe('banner');
		expect(probe.snapshot?.optOut).toBeFalsy();
	});

	test('a choice records the time of the tap, not of the replay', async () => {
		tapBeforeHydration('reject');
		const tappedAt = tapTime();
		expect(tappedAt).toBeTypeOf('number');
		await new Promise((resolve) => {
			setTimeout(resolve, 30);
		});
		await mount({ region: 'us-opt-in' });
		await vi.waitFor(() => expect(probe.snapshot?.explicitChoice).toBeTruthy());
		expect(
			probe.snapshot?.explicitChoice?.categories?.marketing?.confirmedAt
		).toBe(tappedAt);
	});

	test('an OK on the notice before hydration records the time of the tap', async () => {
		tapBeforeHydration('dismiss');
		const tappedAt = tapTime();
		await new Promise((resolve) => {
			setTimeout(resolve, 30);
		});
		await mount({ region: 'us-notice' });
		await vi.waitFor(() =>
			expect(probe.snapshot?.noticeDismissal).toBeTruthy()
		);
		expect(probe.snapshot?.noticeDismissal?.dismissedAt).toBe(tappedAt);
	});

	test('a Customize expands the options in place, with no dialog', async () => {
		tapBeforeHydration('customize');
		await mount();
		await waitForRoot();
		await vi.waitFor(() =>
			expect(root()).toHaveAttribute('data-expanded', 'true')
		);
		await waitForPanel();
		expect(probe.snapshot?.activeUI).toBe('banner');
		expect(probe.snapshot?.explicitChoice).toBeFalsy();
		expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull();
	});
});
