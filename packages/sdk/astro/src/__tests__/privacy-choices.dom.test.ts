/**
 * The Privacy Choices (v6) prompt in the browser, ported from React's
 * `privacy-choices-banner.test.tsx`: the page boots on the prompt the
 * server rendered, as a real page does, and the browser controller takes
 * it over. Each test names the invariant it guards
 * (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`). Layout measurements stay
 * in React's browser suite; jsdom has no layout.
 */

import type {
	ConsentContainer,
	ConsentEdgeStyle,
	ConsentPresentation,
	LegalLinks,
} from '@inth/sdk/engine';
import type { PolicyRule } from '@inth/sdk/schema/types';
import { openOptInConfirmation } from '@inth/sdk/surface-actions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROMPT_SLOT_ATTRIBUTE } from '../banner/slot';
import { loadPresentationSheets } from '../browser/privacy-choices';
import {
	boot,
	preloadDialog,
	registerDialogAdapter,
	registerDialogStyles,
} from '../client';
import type { AstroConsentClient } from '../client';
import * as reactPanelSurface from '../components/islands/panel-surface';
import { resolveOptions } from '../integration';
import { privacyChoicesClassNames } from '../privacy-choices/class-names';
import { resolvePrivacyChoicesModel } from '../privacy-choices/model';
import { renderPrivacyChoicesHTML } from '../privacy-choices/server';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions } from '../types';
import { registerDialogSurface } from '../ui/adapter';
import { reactDialogAdapter } from '../ui/react';
import { testRule } from './policy-fixture';
import { ISLAND_RENDER_TIMEOUT } from './react-dialog-island';
// The options load on demand; compiling them while this file loads keeps
// the first test inside its waits. The controller is imported above.
import '../privacy-choices/panel';

type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const US_GPC = { gpc: { denyCategories: ['marketing', 'measurement'] } };

const RULES: Record<Region, Partial<PolicyRule>> = {
	eu: {},
	'us-notice': {
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'notice',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
	'us-opt-in': { privacySignals: US_GPC },
	'us-opt-out': {
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'none',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
};

interface MountOptions {
	/** The `ui` option: which island renders the dialog. */
	ui?: 'react' | 'svelte';
	/** `null` sets no container. */
	container?: ConsentContainer | null;
	edgeStyle?: ConsentEdgeStyle;
	blockUntilChoice?: boolean;
	region?: Region;
	design?: ConsentPresentation['design'] | null;
	/** Leave the prompt for the browser to render into the spot. */
	ssr?: boolean;
	/**
	 * Put a `<PrivacyChoicesLink />` on the page, as the server renders it
	 * before it knows the policy: hidden, with no label.
	 */
	link?: boolean;
	/** Merged over the integration options. */
	extra?: Partial<InthAstroOptions>;
}

const globals = window as unknown as Record<string, unknown>;
let client: AstroConsentClient | null = null;

const clearCookies = function clearCookies(): void {
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	localStorage.clear();
};

const optionsFor = function optionsFor({
	container = { type: 'card' },
	edgeStyle,
	blockUntilChoice,
	region = 'eu',
	design = 'privacy-choices',
	ui,
	extra,
}: MountOptions): InthAstroOptions {
	return {
		...extra,
		consentCategories: [
			'necessary',
			'functionality',
			'measurement',
			'experience',
			'marketing',
		],
		disableAnimation: true,
		legalLinks: { privacyPolicy: { href: '/privacy' } },
		mode: testingMode({
			policy: [
				{
					...testRule,
					categories: [
						'functionality',
						'measurement',
						'experience',
						'marketing',
					],
					...RULES[region],
				},
			],
		}),
		presentation: {
			design: design === null ? undefined : design,
			prompt: {
				blockUntilChoice,
				container: container ?? undefined,
				edgeStyle,
			},
		},
		ui,
	};
};

/** Render the page the server would, then boot its client. */
const mount = async function mount(input: MountOptions = {}) {
	const options = optionsFor(input);
	const resolved = resolveOptions(options);
	const locals = await resolveConsentContext({
		headers: new Headers(),
		options: resolved,
	});
	globals.__inthAstroConfig = JSON.parse(JSON.stringify(locals.config));
	const model = resolvePrivacyChoicesModel({
		classNames: privacyChoicesClassNames,
		options: resolved,
		props: {},
		snapshot: locals.snapshot,
	});
	document.body.innerHTML = [
		'<button type="button">Page action</button>',
		input.link
			? '<button type="button" data-inth-action="customize" data-inth-dialog="preferences" data-inth-default-label="" data-inth-privacy-choices-link="" hidden></button>'
			: '',
		'<button type="button" data-testid="consent-dialog-trigger">Your Privacy Choices</button>',
		'<div data-inth-test-spot></div>',
	].join('');
	const spot = document.querySelector('[data-inth-test-spot]') as HTMLElement;
	spot.removeAttribute('data-inth-test-spot');
	spot.hidden = true;
	spot.setAttribute(
		PROMPT_SLOT_ATTRIBUTE,
		JSON.stringify({ privacyChoices: privacyChoicesClassNames, props: {} })
	);
	if (model && input.ssr !== false && locals.shouldShowBanner) {
		spot.insertAdjacentHTML('afterend', renderPrivacyChoicesHTML(model, false));
	}
	client = boot(resolved);
	return client;
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
const waitForController = () =>
	vi.waitFor(
		() =>
			expect($('consent-banner-announcement')?.getAttribute('role')).toBe(
				'status'
			),
		{ timeout: 4000 }
	);
const waitForPanel = () =>
	vi.waitFor(
		() =>
			expect(
				document.querySelector('[data-testid="consent-banner-body"] > *')
			).not.toBeNull(),
		{ timeout: 4000 }
	);
const pageAction = () =>
	[...document.querySelectorAll('button')].find(
		(button) => button.textContent === 'Page action'
	) as HTMLButtonElement;
const escape = () =>
	document.activeElement?.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
	) ?? document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

beforeEach(() => {
	clearCookies();
	document.body.innerHTML = '';
	globals.__inthAstro = undefined;
	globals.__inthAstroConfig = undefined;
});

afterEach(() => {
	client?.dispose();
	client = null;
	document.head
		.querySelectorAll('style[data-inth-styles]')
		.forEach((style) => style.remove());
});

describe('opt-in', () => {
	it('the classic design stays the default', async () => {
		await mount({ container: null, design: null });
		expect($('consent-banner-root')).toBeNull();
		expect($('consent-banner-announcement')).toBeNull();
	});

	it('[BNR-13][BNR-10] US opt-out with no prompt shows nothing and never blocks', async () => {
		await mount({ blockUntilChoice: true, region: 'us-opt-out' });
		await new Promise((resolve) => {
			setTimeout(resolve, 100);
		});
		expect($('consent-banner-root')).toBeNull();
		// No prompt was ever owed, so the page has no status region (as React).
		expect($('consent-banner-announcement')).toBeNull();
		expect(pageAction().closest('[inert]')).toBeNull();
	});
});

describe('card:', () => {
	it('[BNR-15] starts collapsed, Customize expands in place and focus moves in', async () => {
		await mount();
		await waitForController();
		expect(root().getAttribute('data-placement')).toBe('card-start');
		expect(root().getAttribute('data-flow')).toBe('expand-in-place');
		expect(root().getAttribute('data-design')).toBe('privacy-choices');
		const customize = must<HTMLButtonElement>(
			'consent-banner-customize-button'
		);
		const panel = must('consent-banner-expand-panel');
		expect(customize.getAttribute('aria-expanded')).toBe('false');
		expect(customize.getAttribute('aria-controls')).toBe(panel.id);
		expect(panel.getAttribute('data-open')).toBe('false');
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
		expect(root().getAttribute('data-expanded')).toBe('true');
		expect($('consent-banner-category-group')).not.toBeNull();
		await vi.waitFor(() =>
			expect(must('consent-banner-status').textContent).toMatch(
				/More options shown\./u
			)
		);
	});

	it('[EU-01] the footer becomes Reject all · Accept all + Save choices, equal pair', async () => {
		await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect($('consent-banner-save-button')).not.toBeNull()
		);
		expect($('consent-banner-customize-button')).toBeNull();
		const reject = must('consent-banner-reject-button');
		const accept = must('consent-banner-accept-button');
		expect(reject.textContent).toContain('Reject all');
		expect(accept.textContent).toContain('Accept all');
		expect(reject.className).toBe(accept.className);
	});

	it('[FOC-04][BNR-15] Esc folds back, the banner stays, focus returns to Customize', async () => {
		await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-expand-panel').contains(document.activeElement)
			).toBe(true)
		);
		escape();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-expand-panel').getAttribute('data-open')
			).toBe('false')
		);
		expect(root()).not.toBeNull();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-customize-button'))
		);
	});

	it('[PERM-15] Esc pressed elsewhere on the page leaves the panel open', async () => {
		await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		pageAction().focus();
		escape();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(must('consent-banner-expand-panel').getAttribute('data-open')).toBe(
			'true'
		);
	});

	it('[EU-03] a switch stages the draft, and Save records exactly what is on', async () => {
		const booted = await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const marketing = must<HTMLButtonElement>(
			'consent-banner-category-switch-marketing'
		);
		marketing.click();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-category-switch-marketing').getAttribute(
					'aria-checked'
				)
			).toBe('true')
		);
		expect(booted.getConsent().explicitChoice).toBeFalsy();
		must('consent-banner-save-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		const choice = booted.getConsent().explicitChoice;
		expect(choice?.categories?.marketing?.value).toBe(true);
		expect(choice?.categories?.measurement?.value).toBe(false);
	});

	it('[CAT-10] a click on a row text toggles its switch', async () => {
		await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const name = document.getElementById(
			must('consent-banner-category-switch-measurement').getAttribute(
				'aria-labelledby'
			) ?? ''
		) as HTMLElement;
		name.click();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-category-switch-measurement').getAttribute(
					'aria-checked'
				)
			).toBe('true')
		);
	});

	it('[CAT-01][SR-06] every switch is named by its row and described inline', async () => {
		await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const sw = must('consent-banner-category-switch-measurement');
		expect(sw.getAttribute('role')).toBe('switch');
		const label = document.getElementById(
			sw.getAttribute('aria-labelledby') ?? ''
		);
		const description = document.getElementById(
			sw.getAttribute('aria-describedby') ?? ''
		);
		expect(label.textContent).toContain('Analytics');
		expect(description?.textContent).toMatch(/understand how visitors/u);
		expect(label?.tagName).not.toMatch(/^H\d$/u);
	});

	it('[BNR-06] a choice announces on the page and focuses Your Privacy Choices', async () => {
		const booted = await mount();
		await waitForController();
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
		expect(document.activeElement).toBe($('consent-dialog-trigger'));
		expect(
			booted.getConsent().explicitChoice?.categories?.marketing?.value
		).toBe(false);
	});

	it('[BNR-08] links only the configured policies', async () => {
		await mount();
		await waitForRoot();
		expect($('consent-banner-legal-link-privacyPolicy')).not.toBeNull();
		expect($('consent-banner-legal-link-cookiePolicy')).toBeNull();
	});

	it('[BNR-11] carries the "Consent by" tag beside the card', async () => {
		await mount();
		await waitForRoot();
		const tag = must('consent-banner-branding');
		expect(tag.textContent).toContain('Consent by');
		expect(must('consent-banner-shell').contains(tag)).toBe(true);
		expect(must('consent-banner-card').contains(tag)).toBe(false);
	});

	it('[ARCH-01] expanding keeps the card, head and footer nodes', async () => {
		await mount();
		await waitForController();
		const card = must('consent-banner-card');
		const header = must('consent-banner-header');
		const footer = must('consent-banner-footer');
		must('consent-banner-customize-button').click();
		await waitForPanel();
		expect(must('consent-banner-card')).toBe(card);
		expect(must('consent-banner-header')).toBe(header);
		expect(must('consent-banner-footer')).toBe(footer);
	});

	it('[ARCH-01] adopts the server-rendered prompt instead of rendering another', async () => {
		await mount();
		const card = must('consent-banner-card');
		await waitForController();
		expect(must('consent-banner-card')).toBe(card);
		expect(
			document.querySelectorAll('[data-testid="consent-banner-root"]')
		).toHaveLength(1);
	});
});

describe('banner:', () => {
	it('[BNR-18] a one-row bar with Reject, Accept and Customize, and a hidden heading', async () => {
		await mount({ container: { edge: 'bottom', type: 'banner' } });
		await waitForController();
		expect(root().getAttribute('data-placement')).toBe('banner-bottom');
		const footer = must('consent-banner-footer');
		const customize = must('consent-banner-customize-button');
		expect(footer.contains($('consent-banner-reject-button'))).toBe(true);
		expect(footer.contains($('consent-banner-accept-button'))).toBe(true);
		expect(footer.contains(customize)).toBe(true);
		// The collapsed bar has no panel to point at (PERM-09).
		expect(customize.hasAttribute('aria-controls')).toBe(false);
		expect(customize.getAttribute('aria-expanded')).toBe('false');
		expect(must('consent-banner-title').className).toBe(
			privacyChoicesClassNames.surface.visuallyHidden
		);
	});

	it('[BNR-18] Customize expands to full content and options in place; Esc folds back', async () => {
		await mount({ container: { edge: 'bottom', type: 'banner' } });
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() =>
			expect(
				must('consent-banner-expand-panel').getAttribute('data-open')
			).toBe('true')
		);
		expect($('consent-banner-header')).not.toBeNull();
		expect($('consent-banner-save-button')).not.toBeNull();
		escape();
		await vi.waitFor(() => expect($('consent-banner-header')).toBeNull());
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-customize-button'))
		);
	});

	it('[BNR-09] US opt-in bar asks in US terms', async () => {
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			region: 'us-opt-in',
		});
		await waitForRoot();
		expect(must('consent-banner-reject-button').textContent).toContain(
			"Don't allow"
		);
		expect(must('consent-banner-accept-button').textContent).toContain('Allow');
		expect(must('consent-banner-customize-button').textContent).toContain(
			'Choose'
		);
	});
});

describe('aio', () => {
	it('[BNR-14] a side drawer shows the categories at once, with no Customize', async () => {
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForController();
		expect(root().getAttribute('data-flow')).toBe('all-in-one');
		expect(root().getAttribute('data-placement')).toBe('drawer-start');
		await waitForPanel();
		expect($('consent-banner-customize-button')).toBeNull();
		expect($('consent-banner-save-button')).not.toBeNull();
		expect($('consent-banner-category-group')).not.toBeNull();
		expect(pageAction().closest('[inert]')).toBeNull();
		expect(must('consent-banner-card').getAttribute('role')).toBe('region');
		// The tag floats in the scroll area's slot (BNR-14).
		expect(
			must('consent-banner-expand-panel').contains($('consent-banner-branding'))
		).toBe(true);
	});

	it('[BNR-14] US notice: rights rows inline and OK only; an opt-out applies at once', async () => {
		const booted = await mount({
			container: { side: 'end', type: 'drawer' },
			region: 'us-notice',
		});
		await waitForController();
		await vi.waitFor(() =>
			expect($('consent-banner-rights-row-sale')).not.toBeNull()
		);
		expect($('consent-banner-dismiss-button')).not.toBeNull();
		expect($('consent-banner-right-link-opt-out')).toBeNull();
		expect($('consent-banner-save-button')).toBeNull();
		must('consent-banner-right-option-sale-protect').click();
		await vi.waitFor(() => expect(booted.getConsent().optOut).toBeTruthy());
	});

	it('[LAW-02][RIGHT-06] US opt-in: Allow needs the confirmation, which opens on Cancel', async () => {
		const booted = await mount({
			container: { side: 'end', type: 'drawer' },
			region: 'us-opt-in',
		});
		await waitForController();
		await vi.waitFor(() =>
			expect($('consent-banner-rights-row-sale')).not.toBeNull()
		);
		const row = must('consent-banner-rights-row-sale');
		const group = row.querySelector('[role="group"]') as HTMLElement;
		expect(group.getAttribute('aria-label')).toBeTruthy();
		must('consent-banner-right-option-sale-allow').click();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-confirm-cancel'))
		);
		expect(
			must('consent-banner-right-option-sale-allow').getAttribute(
				'aria-pressed'
			)
		).toBe('false');
		expect(booted.getConsent().explicitChoice).toBeFalsy();
		// [RIGHT-04] Pressing Allow again nudges.
		must('consent-banner-right-option-sale-allow').click();
		await vi.waitFor(() =>
			expect(must('consent-banner-confirm').getAttribute('data-nudged')).toBe(
				'true'
			)
		);
		must('consent-banner-confirm-cancel').click();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe(
				$('consent-banner-right-option-sale-allow')
			)
		);
		expect(root()).not.toBeNull();
	});

	it('[PERM-13] on phone a side drawer becomes the bottom drawer, keeping the card node', async () => {
		const listeners = new Set<() => void>();
		let phone = false;
		const original = window.matchMedia;
		window.matchMedia = ((query: string) => ({
			addEventListener: (_: string, listener: () => void) => {
				if (query.includes('max-width')) {
					listeners.add(listener);
				}
			},
			matches: query.includes('max-width') ? phone : false,
			media: query,
			removeEventListener: (_: string, listener: () => void) =>
				listeners.delete(listener),
		})) as unknown as typeof window.matchMedia;
		try {
			await mount({ container: { side: 'start', type: 'drawer' } });
			await waitForController();
			const card = must('consent-banner-card');
			phone = true;
			for (const listener of listeners) {
				listener();
			}
			await vi.waitFor(() =>
				expect(root().getAttribute('data-placement')).toBe('drawer-bottom')
			);
			expect(root().getAttribute('data-flow')).toBe('expand-in-place');
			expect(
				must('consent-banner-expand-panel').getAttribute('data-open')
			).toBe('false');
			expect(must('consent-banner-card')).toBe(card);
		} finally {
			window.matchMedia = original;
		}
	});
});

describe('blocking:', () => {
	it.each([
		['card', { position: 'start', type: 'card' }],
		['banner', { edge: 'bottom', type: 'banner' }],
		['drawer', { side: 'bottom', type: 'drawer' }],
	] as const)(
		'[BNR-13][PERM-08] block on + %s: backdrop, inert page, dialog role on the shell',
		async (_name, container) => {
			await mount({ blockUntilChoice: true, container });
			await waitForController();
			const shell = must('consent-banner-shell');
			expect($('consent-banner-overlay')).not.toBeNull();
			expect(shell.getAttribute('role')).toBe('dialog');
			expect(shell.getAttribute('aria-modal')).toBe('true');
			expect(shell.contains($('consent-banner-branding'))).toBe(true);
			expect(must('consent-banner-card').hasAttribute('role')).toBe(false);
			await vi.waitFor(() =>
				expect(pageAction().closest('[inert]')).not.toBeNull()
			);
		}
	);

	it('[BNR-13] the US notice never blocks, even with blockUntilChoice', async () => {
		await mount({ blockUntilChoice: true, region: 'us-notice' });
		await waitForController();
		expect($('consent-banner-overlay')).toBeNull();
		expect(must('consent-banner-shell').hasAttribute('role')).toBe(false);
		expect(pageAction().closest('[inert]')).toBeNull();
	});

	it('[PERM-03] Esc never dismisses a blocking prompt; a choice releases the page', async () => {
		await mount({ blockUntilChoice: true });
		await waitForController();
		escape();
		expect(root()).not.toBeNull();
		must('consent-banner-accept-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(pageAction().closest('[inert]')).toBeNull();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe($('consent-dialog-trigger'))
		);
	});
});

describe('notice', () => {
	it('[BNR-01][BNR-10] offers "Do not sell or share my data" and OK, and expands to the rights', async () => {
		await mount({ region: 'us-notice' });
		await waitForController();
		expect(root().getAttribute('data-variant')).toBe('notice');
		const link = must('consent-banner-right-link-opt-out');
		expect(link.textContent).toContain('Do not sell or share my data');
		expect($('consent-banner-reject-button')).toBeNull();
		link.click();
		await vi.waitFor(() =>
			expect($('consent-banner-rights-row-sale')).not.toBeNull()
		);
		expect(must('consent-banner-footer').children).toHaveLength(1);
	});

	it('OK records no consent and ends the prompt', async () => {
		const booted = await mount({ region: 'us-notice' });
		await waitForController();
		must('consent-banner-dismiss-button').click();
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(booted.getConsent().explicitChoice).toBeFalsy();
	});
});

describe('a page the server could not render the prompt for', () => {
	it('renders the prompt into the spot, after its stylesheets', async () => {
		await mount({ container: { side: 'bottom', type: 'drawer' }, ssr: false });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('drawer-bottom');
		const ids = [...document.querySelectorAll('style[data-inth-styles]')].map(
			(style) => style.getAttribute('data-inth-styles')
		);
		expect(ids).toEqual(
			expect.arrayContaining([
				'inth-tokens',
				'inth-button',
				'inth-surface',
				'inth-drawer',
			])
		);
		expect(ids).not.toContain('inth-card');
		expect(ids).not.toContain('inth-bar');
	});
});

describe('stylesheets', () => {
	it('a Drawer loads its own sheet and never the card or bar sheet', async () => {
		const ids = (await loadPresentationSheets('drawer')).map(
			(sheet) => sheet.id
		);
		expect(ids).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-surface',
			'inth-drawer',
		]);
	});

	it('the options bring the expand and Privacy Choices sheets with them', async () => {
		await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const ids = [...document.querySelectorAll('style[data-inth-styles]')].map(
			(style) => style.getAttribute('data-inth-styles')
		);
		expect(ids).toEqual(
			expect.arrayContaining(['inth-expand', 'inth-privacy-choices-dialog'])
		);
	});
});

describe('the dialog', () => {
	const mounted: { design?: string; kind?: string }[] = [];
	const stubAdapter = (name: 'react' | 'svelte') => {
		registerDialogAdapter(name, () =>
			Promise.resolve({
				mount: (context) => {
					mounted.push({ design: context.design, kind: context.kind });
					return Promise.resolve({
						close: () => undefined,
						destroy: () => undefined,
					});
				},
				name,
			})
		);
	};

	beforeEach(() => {
		mounted.length = 0;
		registerDialogStyles(['/classic-dialog.css']);
	});

	afterEach(() => {
		registerDialogStyles([]);
		for (const link of document.head.querySelectorAll(
			'link[data-inth-dialog-styles]'
		)) {
			link.remove();
		}
	});

	it("opens React's Privacy Choices dialog, with its own sheets and no classic one", async () => {
		stubAdapter('react');
		const booted = await mount({ ui: 'react' });
		await waitForController();
		await booted.openDialog();
		expect(mounted).toEqual([
			{ design: 'privacy-choices', kind: 'preferences' },
		]);
		const ids = [...document.querySelectorAll('style[data-inth-styles]')].map(
			(style) => style.getAttribute('data-inth-styles')
		);
		expect(ids).toEqual(
			expect.arrayContaining([
				'inth-tokens',
				'inth-button',
				'inth-expand',
				'inth-privacy-choices-dialog',
			])
		);
		expect(
			document.head.querySelector('link[href="/classic-dialog.css"]')
		).toBeNull();
		// [PERM-05] The prompt leaves at once when the dialog opens.
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
	});

	it('keeps the classic dialog on an island without the Privacy Choices one', async () => {
		stubAdapter('svelte');
		const booted = await mount({ ui: 'svelte' });
		await waitForController();
		const opening = booted.openDialog();
		// The classic stylesheet link never loads in jsdom; let it settle.
		const link = await vi.waitFor(() => {
			const found = document.head.querySelector<HTMLLinkElement>(
				'link[href="/classic-dialog.css"]'
			);
			expect(found).not.toBeNull();
			return found as HTMLLinkElement;
		});
		link.dispatchEvent(new Event('load'));
		await opening;
		expect(mounted).toEqual([{ design: 'classic', kind: 'preferences' }]);
	});
});

/** Swap `matchMedia` for one whose phone query a test can flip. */
const phoneViewport = function phoneViewport(initial: boolean) {
	const listeners = new Set<() => void>();
	let phone = initial;
	const original = window.matchMedia;
	window.matchMedia = ((query: string) => ({
		addEventListener: (_: string, listener: () => void) => {
			if (query.includes('max-width')) {
				listeners.add(listener);
			}
		},
		matches: query.includes('max-width') ? phone : false,
		media: query,
		removeEventListener: (_: string, listener: () => void) =>
			listeners.delete(listener),
	})) as unknown as typeof window.matchMedia;
	return {
		restore: () => {
			window.matchMedia = original;
		},
		set: (value: boolean) => {
			phone = value;
			for (const listener of listeners) {
				listener();
			}
		},
	};
};

describe('wave B round 1', () => {
	it('[PERM-13] an expansion made on phone does not survive a pass through all-in-one', async () => {
		const viewport = phoneViewport(true);
		try {
			await mount({ container: { side: 'start', type: 'drawer' } });
			await waitForController();
			must('consent-banner-customize-button').click();
			await vi.waitFor(() =>
				expect(root().getAttribute('data-expanded')).toBe('true')
			);
			viewport.set(false);
			await vi.waitFor(() =>
				expect(root().getAttribute('data-flow')).toBe('all-in-one')
			);
			// Esc on desktop has nothing to fold, so it is left to the page.
			const press = new KeyboardEvent('keydown', {
				bubbles: true,
				cancelable: true,
				key: 'Escape',
			});
			document.dispatchEvent(press);
			expect(press.defaultPrevented).toBe(false);
			viewport.set(true);
			await vi.waitFor(() =>
				expect(root().getAttribute('data-flow')).toBe('expand-in-place')
			);
			expect(root().hasAttribute('data-expanded')).toBe(false);
			expect(
				must('consent-banner-expand-panel').getAttribute('data-open')
			).toBe('false');
		} finally {
			viewport.restore();
		}
	});

	it('[PERM-05][SR-05] a folded panel carries a real inert attribute, dropped when it opens', async () => {
		await mount();
		await waitForController();
		const panel = must('consent-banner-expand-panel');
		expect(panel.hasAttribute('inert')).toBe(true);
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await vi.waitFor(() => expect(panel.hasAttribute('inert')).toBe(false));
		expect(root().hasAttribute('inert')).toBe(false);
	});

	it('the Preferences body spacing lives in the stylesheet, so noStyle drops it', async () => {
		await mount({ container: { type: 'banner' }, region: 'us-opt-in' });
		await waitForController();
		must('consent-banner-customize-button').click();
		const row = await vi.waitFor(() => must('consent-banner-preferences-row'), {
			timeout: 4000,
		});
		const panel = document.getElementById(
			row.getAttribute('aria-controls') ?? ''
		) as HTMLElement;
		const body = panel.querySelector(':scope > * > *') as HTMLElement;
		expect(body.getAttribute('style')).toBeNull();
		expect(body.className).toBe(
			privacyChoicesClassNames.choices.preferencesBody
		);
		// The folded Preferences and the closed confirmation are inert.
		expect(panel.hasAttribute('inert')).toBe(true);
		expect(must('consent-banner-confirm').closest('[inert]')).not.toBeNull();
	});

	it('[BNR-05][BNR-06] Your Privacy Choices shows once the policy resolves, and takes focus after a choice', async () => {
		await mount({ link: true, region: 'us-opt-in' });
		await waitForController();
		const link = await vi.waitFor(() => must('privacy-choices-link'));
		expect(link.hidden).toBe(false);
		expect(link.textContent).toBe('Your Privacy Choices');
		expect(link.querySelector('svg')).toBeNull();
		expect(link.hasAttribute('data-opt-out-variant')).toBe(false);
		must('consent-banner-accept-button').click();
		await vi.waitFor(() => expect(document.activeElement).toBe(link));
	});

	it('the classic design hides Your Privacy Choices under an opt-in policy', async () => {
		await mount({
			container: null,
			design: null,
			link: true,
			region: 'us-opt-in',
		});
		await vi.waitFor(() =>
			expect(
				document.querySelector(
					'[data-testid="consent-banner-root"], [data-inth-privacy-choices-link]'
				)
			).not.toBeNull()
		);
		const link = document.querySelector<HTMLElement>(
			'[data-inth-privacy-choices-link]'
		);
		expect(link?.hidden).toBe(true);
		expect(link?.hasAttribute('data-testid')).toBe(false);
	});
});

describe('the React island (wave B round 1)', () => {
	beforeEach(() => {
		registerDialogAdapter('react', () => Promise.resolve(reactDialogAdapter));
		registerDialogSurface('react', () => Promise.resolve(reactPanelSurface));
	});

	afterEach(() => {
		document.getElementById('inth-dialog-host')?.remove();
	});

	it('[BNR-13] the dialog hosts an opt-in confirmation under the Privacy Choices design', async () => {
		const booted = await mount({ region: 'us-opt-in', ui: 'react' });
		await waitForController();
		const confirmed = vi.fn();
		openOptInConfirmation(booted.runtime.kernel, confirmed, null);
		const confirm = await vi.waitFor(
			() => must<HTMLButtonElement>('opt-in-confirmation-confirm-button'),
			ISLAND_RENDER_TIMEOUT
		);
		// The confirmation keeps its classic design, so its sheets come too.
		const ids = [...document.querySelectorAll('style[data-inth-styles]')].map(
			(style) => style.getAttribute('data-inth-styles')
		);
		expect(ids).toEqual(expect.arrayContaining(['inth-banner', 'inth-dialog']));
		confirm.click();
		await vi.waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
	});

	it('[RCPT-01][FOC-03] the opt-out confirmation opens the Privacy Choices dialog on its receipt', async () => {
		const booted = await mount({
			// The confirmation opens in place; the reload case is core's.
			extra: { reloadOnConsentRevoked: false },
			region: 'us-notice',
			ui: 'react',
		});
		await waitForController();
		await booted.optOut();
		const receipt = await vi.waitFor(
			() => must('consent-dialog-receipt'),
			ISLAND_RENDER_TIMEOUT
		);
		expect(receipt.getAttribute('tabindex')).toBe('-1');
		await vi.waitFor(
			() => expect(document.activeElement).toBe(receipt),
			ISLAND_RENDER_TIMEOUT
		);
		expect(booted.getConsent().activeUI).toBe('dialog');
	});

	it('warming on a Privacy Choices page loads that dialog and never the classic one', async () => {
		const preload = vi.fn(() => Promise.resolve());
		registerDialogAdapter('react', () =>
			Promise.resolve({ ...reactDialogAdapter, preload })
		);
		registerDialogStyles(['/classic-dialog.css']);
		try {
			await mount({ ui: 'react' });
			await waitForController();
			await preloadDialog();
			expect(preload).toHaveBeenCalledWith({
				design: 'privacy-choices',
				kind: 'preferences',
			});
			expect(
				document.head.querySelector('link[href="/classic-dialog.css"]')
			).toBeNull();
			expect(
				document.head.querySelector(
					'style[data-inth-styles="inth-privacy-choices-dialog"]'
				)
			).not.toBeNull();
		} finally {
			registerDialogStyles([]);
		}
	});
});

describe('the React island (wave B round 2)', () => {
	beforeEach(() => {
		registerDialogAdapter('react', () => Promise.resolve(reactDialogAdapter));
		registerDialogSurface('react', () => Promise.resolve(reactPanelSurface));
	});

	afterEach(() => {
		document.getElementById('inth-dialog-host')?.remove();
	});

	it.each<[(keyof LegalLinks)[] | null | undefined, boolean]>([
		[undefined, true],
		[null, false],
		[['cookiePolicy'], false],
		[['privacyPolicy'], true],
	])(
		'legalLinks=%j on <ConsentDialog /> reaches the Privacy Choices dialog (shown: %s)',
		async (legalLinks, shown) => {
			const booted = await mount({ region: 'us-notice', ui: 'react' });
			// The host `<ConsentDialog legalLinks>` renders: no list leaves the
			// attribute out, and `null` is an empty list.
			const host = document.createElement('div');
			host.setAttribute('data-inth-dialog-host', 'preferences');
			if (legalLinks !== undefined) {
				host.setAttribute('data-legal-links', (legalLinks ?? []).join(' '));
			}
			document.body.append(host);
			await waitForController();
			await booted.openDialog();
			await vi.waitFor(
				() => expect($('consent-dialog-card')).not.toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);
			expect($('consent-dialog-legal-link-privacyPolicy') !== null).toBe(shown);
		}
	);
});
