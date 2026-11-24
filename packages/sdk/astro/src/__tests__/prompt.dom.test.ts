/**
 * The consent prompt in the browser, ported from React's prompt tests:
 * the page boots on the prompt the
 * server rendered, as a real page does, and the browser controller takes
 * it over. Each test names the invariant it guards
 * (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`). Layout measurements stay
 * in React's browser suite; jsdom has no layout.
 */

import type {
	ConsentContainer,
	ConsentEdgeStyle,
	LegalLinks,
} from '@inth/sdk/engine';
import { getSurfaceSession } from '@inth/sdk/engine';
import type { PolicyRule } from '@inth/sdk/schema/types';
import { openOptInConfirmation } from '@inth/sdk/surface-actions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '../../../core/src/libs/page-globals';
import { EARLY_CONSENT_TAP_SCRIPT } from '../../../core/src/surface-actions/early-consent-tap-script';
import { PROMPT_SLOT_ATTRIBUTE } from '../banner/prompt-slot.model';
import { setPromptLoaderForTest } from '../boot-client-engine';
import * as promptChunk from '../browser/mount-prompt';
import { loadContainerSheets } from '../browser/mount-prompt';
import {
	boot,
	preloadDialog,
	registerDialogAdapter,
	registerDialogStyles,
} from '../client';
import type { AstroConsentClient } from '../client';
import * as reactPanelSurface from '../components/islands/panel-surface';
import { resolveOptions } from '../integration';
import type { InthAstroOptions } from '../inth-options.model';
import { promptClassNames } from '../prompt/prompt-class-names';
import { resolvePromptModel } from '../prompt/prompt.model';
import { renderPromptHTML } from '../prompt/render-prompt-html';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import { reactDialogAdapter } from '../ui/react';
import { registerDialogSurface } from '../ui/register-dialog-adapter';
import { testRule } from './policy-fixture';
import { ISLAND_RENDER_TIMEOUT } from './react-dialog-island';
// The options load on demand; compiling them while this file loads keeps
// the first test inside its waits. The controller is imported above.
import '../prompt/create-prompt-panel';

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
	/** Leave the prompt for the browser to render into the spot. */
	ssr?: boolean;
	/**
	 * Put a `<PrivacyChoicesLink />` on the page, as the server renders it
	 * before it knows the policy: hidden, with no label.
	 */
	link?: boolean;
	/** The link's icon class, as a styled `<PrivacyChoicesLink />` carries it. */
	linkIconClass?: string;
	/** The link's `variant` prop. */
	linkVariant?: string;
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
	const model = resolvePromptModel({
		classNames: promptClassNames,
		options: resolved,
		props: {},
		snapshot: locals.snapshot,
	});
	document.body.innerHTML = [
		'<button type="button">Page action</button>',
		input.link
			? `<button type="button" data-inth-action="customize" data-inth-dialog="preferences" data-inth-default-label=""${input.linkIconClass ? ` data-inth-icon-class="${input.linkIconClass}"` : ''} data-inth-privacy-choices-link="${input.linkVariant ?? ''}" hidden></button>`
			: '',
		'<button type="button" data-testid="consent-dialog-trigger">Your Privacy Choices</button>',
		'<div data-inth-test-spot></div>',
	].join('');
	const spot = document.querySelector('[data-inth-test-spot]') as HTMLElement;
	spot.removeAttribute('data-inth-test-spot');
	spot.hidden = true;
	spot.setAttribute(
		PROMPT_SLOT_ATTRIBUTE,
		JSON.stringify({ classNames: promptClassNames, props: {} })
	);
	if (model && input.ssr !== false && locals.shouldShowBanner) {
		spot.insertAdjacentHTML('afterend', renderPromptHTML(model, false));
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
	setPromptLoaderForTest();
	document.head
		.querySelectorAll('style[data-inth-styles]')
		.forEach((style) => style.remove());
});

describe('a tap before the prompt chunk mounted', () => {
	/**
	 * What the early-tap script leaves after it held `action` on the
	 * server-rendered prompt: the tap, and the style that hides the prompt
	 * after a choice.
	 */
	const holdTap = function holdTap(
		action: 'accept' | 'reject' | 'customize' | 'dismiss',
		policy: { model: string | null; prompt: string | null } = {
			model: null,
			prompt: null,
		}
	) {
		const stop = vi.fn();
		const at = Date.now() - 50;
		globals[EARLY_TAPS_WINDOW_KEY] = {
			stop,
			taps: [{ action, at, ...policy }],
		};
		if (action !== 'customize') {
			const style = document.createElement('style');
			style.id = EARLY_TAP_STYLE_ID;
			document.head.append(style);
		}
		return Object.assign(stop, { at });
	};

	afterEach(() => {
		globals[EARLY_TAPS_WINDOW_KEY] = undefined;
		document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	});

	it('[BNR-13] an Allow commits through the prompt once it mounts', async () => {
		const stop = holdTap('accept');
		const page = await mount();
		await vi.waitFor(() =>
			expect(page.getConsent().explicitChoice).not.toBeNull()
		);
		expect(stop).toHaveBeenCalledOnce();
		expect(page.getConsent().effectivePermissions.marketing).toBe(true);
		expect(page.getConsent().activeUI).toBe('none');
		// The prompt leaves, then the style that hid it goes.
		await vi.waitFor(
			() => expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull(),
			{ timeout: 4000 }
		);
	});

	it('[BNR-15] a Customize opens the options in place, not the dialog', async () => {
		holdTap('customize');
		const page = await mount();
		await waitForPanel();
		await vi.waitFor(() =>
			expect(root().getAttribute('data-expanded')).toBe('true')
		);
		expect(page.getConsent().activeUI).toBe('banner');
		expect(page.getConsent().explicitChoice).toBeNull();
	});

	it('a choice records the time of the tap, not of the replay', async () => {
		const { at } = holdTap('reject');
		const page = await mount();
		await vi.waitFor(() =>
			expect(page.getConsent().explicitChoice).not.toBeNull()
		);
		expect(
			page.getConsent().explicitChoice?.categories?.marketing?.confirmedAt
		).toBe(at);
	});

	it('an OK on the notice records the time of the tap', async () => {
		const { at } = holdTap('dismiss', { model: 'opt-out', prompt: 'notice' });
		const page = await mount({ region: 'us-notice' });
		await vi.waitFor(() =>
			expect(page.getConsent().noticeDismissal).toBeTruthy()
		);
		expect(page.getConsent().noticeDismissal?.dismissedAt).toBe(at);
	});

	// Opus F3: the style the early-tap script added hid the prompt for good
	// when its chunk then failed, so the visitor saw no prompt and the tap
	// went nowhere.
	it('[C1] shows the prompt again when its chunk fails after a held tap, and replays the tap on the retry', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		let calls = 0;
		setPromptLoaderForTest(() => {
			calls += 1;
			return calls === 1
				? Promise.reject(new Error('chunk failed'))
				: Promise.resolve(promptChunk);
		});
		try {
			holdTap('accept');
			const page = await mount();
			await vi.waitFor(() => expect(warn).toHaveBeenCalled());
			expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull();
			expect(root().hidden).toBe(false);
			expect(page.getConsent().explicitChoice).toBeNull();
			// The next sync, here a ClientRouter page load, fetches the chunk
			// again, and the prompt it mounts replays the held tap.
			document.dispatchEvent(new Event('astro:page-load'));
			await vi.waitFor(() =>
				expect(page.getConsent().explicitChoice).not.toBeNull()
			);
			expect(calls).toBe(2);
			expect(page.getConsent().effectivePermissions.marketing).toBe(true);
		} finally {
			warn.mockRestore();
		}
	});

	// GPT round 2: the banner the failed chunk restored took the next tap,
	// but nothing loaded the chunk again until a navigation event, so a
	// visitor's click went nowhere.
	it.each([
		['blocking', true],
		['non-blocking', false],
	])(
		'a click on the %s banner a failed chunk restored loads the chunk again and commits',
		async (_, blockUntilChoice) => {
			const warn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined);
			let failFirst: (error: Error) => void = () => undefined;
			let calls = 0;
			setPromptLoaderForTest(() => {
				calls += 1;
				if (calls > 1) {
					return Promise.resolve(promptChunk);
				}
				// oxlint-disable-next-line promise/avoid-new -- Failed by the test.
				return new Promise((_resolve, reject) => {
					failFirst = reject;
				});
			});
			// The real early-tap script, as the server renders it ahead of the
			// banner.
			// oxlint-disable-next-line no-new-func -- The inline script as shipped.
			new Function(EARLY_CONSENT_TAP_SCRIPT)();
			const accept = () =>
				must('consent-banner-root')
					.querySelector<HTMLButtonElement>('[data-action="accept"]')
					?.click();
			try {
				const page = await mount({ blockUntilChoice });
				accept();
				expect(document.getElementById(EARLY_TAP_STYLE_ID)).not.toBeNull();
				failFirst(new Error('chunk failed'));
				await vi.waitFor(() => expect(warn).toHaveBeenCalled());
				expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull();
				expect(page.getConsent().explicitChoice).toBeNull();
				expect(calls).toBe(1);

				// No navigation event: the click alone retries.
				accept();
				await vi.waitFor(() =>
					expect(page.getConsent().explicitChoice).not.toBeNull()
				);
				expect(calls).toBe(2);
				expect(page.getConsent().effectivePermissions.marketing).toBe(true);
				expect(page.getConsent().activeUI).toBe('none');
			} finally {
				(
					globals[EARLY_TAPS_WINDOW_KEY] as { stop?: () => void } | undefined
				)?.stop?.();
				warn.mockRestore();
			}
		}
	);

	it('drops a tap made under another policy, and shows the prompt again', async () => {
		holdTap('reject', { model: 'opt-out', prompt: 'notice' });
		const page = await mount();
		await waitForController();
		await vi.waitFor(() =>
			expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull()
		);
		expect(page.getConsent().explicitChoice).toBeNull();
		expect(page.getConsent().activeUI).toBe('banner');
	});
});

describe('no prompt', () => {
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
			promptClassNames.surface.visuallyHidden
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
		expect(ids).not.toContain('inth-banner');
	});
});

describe('stylesheets', () => {
	it('a Drawer loads its own sheet and never the card or banner sheet', async () => {
		const ids = (await loadContainerSheets('drawer')).map((sheet) => sheet.id);
		expect(ids).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-surface',
			'inth-drawer',
		]);
	});

	it('the options bring the expand and dialog sheets with them', async () => {
		await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const ids = [...document.querySelectorAll('style[data-inth-styles]')].map(
			(style) => style.getAttribute('data-inth-styles')
		);
		expect(ids).toEqual(expect.arrayContaining(['inth-expand', 'inth-dialog']));
	});
});

describe('the dialog', () => {
	const mounted: { kind?: string }[] = [];
	const stubAdapter = (name: 'react' | 'svelte') => {
		registerDialogAdapter(name, () =>
			Promise.resolve({
				mount: (context) => {
					mounted.push({ kind: context.kind });
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
	});

	afterEach(() => {
		registerDialogStyles([]);
		for (const link of document.head.querySelectorAll(
			'link[data-inth-dialog-styles]'
		)) {
			link.remove();
		}
	});

	it("opens React's dialog with its own sheets", async () => {
		stubAdapter('react');
		const booted = await mount({ ui: 'react' });
		await waitForController();
		await booted.openDialog();
		expect(mounted).toEqual([{ kind: 'preferences' }]);
		const ids = [...document.querySelectorAll('style[data-inth-styles]')].map(
			(style) => style.getAttribute('data-inth-styles')
		);
		expect(ids).toEqual(
			expect.arrayContaining([
				'inth-tokens',
				'inth-button',
				'inth-expand',
				'inth-dialog',
			])
		);
		// [PERM-05] The prompt leaves at once when the dialog opens.
		await vi.waitFor(() => expect($('consent-banner-root')).toBeNull());
	});

	it('links the stylesheets an island registered beside the dialog sheets', async () => {
		registerDialogStyles(['/island-dialog.css']);
		stubAdapter('svelte');
		const booted = await mount({ ui: 'svelte' });
		await waitForController();
		const opening = booted.openDialog();
		// A stylesheet link never loads in jsdom; let it settle.
		const link = await vi.waitFor(() => {
			const found = document.head.querySelector<HTMLLinkElement>(
				'link[href="/island-dialog.css"]'
			);
			expect(found).not.toBeNull();
			return found as HTMLLinkElement;
		});
		link.dispatchEvent(new Event('load'));
		await opening;
		expect(mounted).toEqual([{ kind: 'preferences' }]);
		expect(
			document.head.querySelector('style[data-inth-styles="inth-dialog"]')
		).not.toBeNull();
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

describe('the layout, the panel and the link', () => {
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
		expect(body.className).toBe(promptClassNames.dialog.preferencesBody);
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
});

describe('the React island', () => {
	beforeEach(() => {
		registerDialogAdapter('react', () => Promise.resolve(reactDialogAdapter));
		registerDialogSurface('react', () => Promise.resolve(reactPanelSurface));
	});

	afterEach(() => {
		document.getElementById('inth-dialog-host')?.remove();
	});

	it('[BNR-13] the dialog hosts an opt-in confirmation', async () => {
		const booted = await mount({ region: 'us-opt-in', ui: 'react' });
		await waitForController();
		const confirmed = vi.fn();
		openOptInConfirmation(booted.runtime.kernel, confirmed, null);
		const confirm = await vi.waitFor(
			() => must<HTMLButtonElement>('opt-in-confirmation-confirm-button'),
			ISLAND_RENDER_TIMEOUT
		);
		// The confirmation renders with the widget's rules, so its sheets come too.
		const ids = [...document.querySelectorAll('style[data-inth-styles]')].map(
			(style) => style.getAttribute('data-inth-styles')
		);
		expect(ids).toEqual(expect.arrayContaining(['inth-parts', 'inth-widget']));
		confirm.click();
		await vi.waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
	});

	it('[RCPT-01][FOC-03] the opt-out confirmation opens the dialog on its receipt', async () => {
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

	it('warming loads the dialog and its sheets', async () => {
		const preload = vi.fn(() => Promise.resolve());
		registerDialogAdapter('react', () =>
			Promise.resolve({ ...reactDialogAdapter, preload })
		);
		await mount({ ui: 'react' });
		await waitForController();
		await preloadDialog();
		expect(preload).toHaveBeenCalledWith({ kind: 'preferences' });
		expect(
			document.head.querySelector('style[data-inth-styles="inth-dialog"]')
		).not.toBeNull();
	});
});

describe('the React island and legal links', () => {
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
		'legalLinks=%j on <ConsentDialog /> reaches the dialog (shown: %s)',
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

/** A prompt-chunk import the test releases or fails by hand. */
const heldPrompt = function heldPrompt() {
	let settle: (fail: boolean) => void = () => undefined;
	const held = new Promise<boolean>((resolve) => {
		settle = resolve;
	});
	const load = vi.fn(async () => {
		if (await held) {
			throw new Error('chunk failed');
		}
		return promptChunk;
	});
	return {
		fail: () => settle(true),
		load,
		release: () => settle(false),
	};
};

describe('the prompt chunk', () => {
	it('[C1] a prompt chunk that failed to load is fetched again on the next sync', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		let calls = 0;
		setPromptLoaderForTest(() => {
			calls += 1;
			return calls === 1
				? Promise.reject(new Error('chunk failed'))
				: Promise.resolve(promptChunk);
		});
		try {
			await mount();
			await vi.waitFor(() => expect(calls).toBe(1));
			await vi.waitFor(() => expect(warn).toHaveBeenCalled());
			// The next sync, here a ClientRouter page load, tries again.
			document.dispatchEvent(new Event('astro:page-load'));
			await waitForController();
			expect(calls).toBe(2);
			must('consent-banner-customize-button').click();
			await waitForPanel();
		} finally {
			warn.mockRestore();
		}
	});

	it('[C1] a load still in flight for a disposed client neither holds up the next client nor mounts', async () => {
		let release: () => void = () => undefined;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const staleMount = vi.fn(promptChunk.mountPrompt);
		const staleLoad = vi.fn(async () => {
			await held;
			return { ...promptChunk, mountPrompt: staleMount };
		});
		setPromptLoaderForTest(staleLoad);
		const stale = await mount();
		await vi.waitFor(() => expect(staleLoad).toHaveBeenCalled());
		stale.dispose();
		// The next client boots on the same page while the old load hangs.
		setPromptLoaderForTest();
		client = boot(resolveOptions(optionsFor({})));
		await waitForController();
		release();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(staleMount).not.toHaveBeenCalled();
	});

	it('mounts on the swapped-in page when a ClientRouter swap lands while the chunk loads', async () => {
		const held = heldPrompt();
		setPromptLoaderForTest(held.load);
		await mount();
		await vi.waitFor(() => expect(held.load).toHaveBeenCalled());
		// The swap replaces the spot and the prompt with the next page's.
		const next = document.body.innerHTML;
		document.body.innerHTML = next;
		document.dispatchEvent(new Event('astro:after-swap'));
		held.release();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
	});

	it('a visitor the prompt is not shown to never downloads it', async () => {
		const load = vi.fn(() => Promise.resolve(promptChunk));
		setPromptLoaderForTest(load);
		await mount({ region: 'us-opt-out' });
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(load).not.toHaveBeenCalled();
		expect($('consent-banner-root')).toBeNull();
	});

	it('a server-rendered prompt whose page lacks its sheets loads them', async () => {
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForController();
		await vi.waitFor(() =>
			expect(
				document.querySelector('style[data-inth-styles="inth-drawer"]')
			).not.toBeNull()
		);
		expect(
			document.querySelector('style[data-inth-styles="inth-card"]')
		).toBeNull();
	});

	it("applies the experiment arm's theme in the browser, as the server does", async () => {
		await mount({
			extra: {
				experiment: {
					arm: 'branded',
					arms: {
						branded: {
							theme: { slots: { consentBannerCard: 'arm-card' } },
						},
					},
					id: 'card-class',
				},
			},
		});
		await waitForController();
		// Expanding renders the prompt again in the browser.
		must('consent-banner-customize-button').click();
		await waitForPanel();
		expect(must('consent-banner-card').className).toContain('arm-card');
	});

	it('[PERM-13] the phone Drawer of a side Drawer site takes the in-place panel class', async () => {
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
		const expandClass = promptClassNames.expand.panel as string;
		const bodyClass = promptClassNames.drawer.body as string;
		try {
			await mount({ container: { side: 'start', type: 'drawer' } });
			await waitForController();
			expect(must('consent-banner-expand-panel').className).toContain(
				bodyClass
			);
			phone = true;
			for (const listener of listeners) {
				listener();
			}
			await vi.waitFor(() =>
				expect(root().getAttribute('data-flow')).toBe('expand-in-place')
			);
			const panel = must('consent-banner-expand-panel');
			expect(panel.className).toContain(expandClass);
			expect(panel.className).not.toContain(bodyClass);
		} finally {
			window.matchMedia = original;
		}
	});

	it('[C2] the opt-out icon carries its own size, unless the link is unstyled', async () => {
		await mount({
			link: true,
			linkIconClass: 'inth-opt-out-icon',
			linkVariant: 'privacy-choices',
			region: 'us-opt-out',
		});
		const icon = await vi.waitFor(() => {
			const svg = must('privacy-choices-link').querySelector('svg');
			expect(svg).not.toBeNull();
			return svg as SVGElement;
		});
		expect(icon.getAttribute('height')).toBe('14');
		expect(icon.getAttribute('width')).toBe('30');
		client?.dispose();
		client = null;

		await mount({
			link: true,
			linkVariant: 'privacy-choices',
			region: 'us-opt-out',
		});
		const bare = await vi.waitFor(() => {
			const svg = must('privacy-choices-link').querySelector('svg');
			expect(svg).not.toBeNull();
			return svg as SVGElement;
		});
		expect(bare.hasAttribute('height')).toBe(false);
		expect(bare.hasAttribute('width')).toBe(false);
	});
});

describe('the island and the options', () => {
	it('the dialog downloads once, and a loaded one opens with no second download', async () => {
		await reactPanelSurface.preloadDialog();
		const pending = Symbol('pending');
		const again = await Promise.race([
			reactPanelSurface.preloadDialog(),
			Promise.resolve(pending),
		]);
		expect(again).not.toBe(pending);
	});

	it('[C5] closing the prompt cancels a vendor table reveal still pending', async () => {
		const booted = await mount();
		await waitForController();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		const session = getSurfaceSession(
			(booted.runtime as NonNullable<typeof booted.runtime>).kernel
		);
		const isCurrent = vi.spyOn(session, 'isCurrent');
		// A vendor table trigger, as a category with vendors renders it.
		const body = must('consent-banner-body');
		const group = document.createElement('div');
		group.setAttribute('data-category', 'marketing');
		const trigger = document.createElement('button');
		trigger.setAttribute(
			'data-testid',
			'consent-banner-vendor-trigger-marketing'
		);
		group.append(trigger);
		body.append(group);
		trigger.click();
		// The prompt renders and schedules the reveal, then goes away.
		await Promise.resolve();
		await Promise.resolve();
		booted.dispose();
		client = null;
		await new Promise((resolve) => {
			setTimeout(resolve, 400);
		});
		expect(isCurrent).not.toHaveBeenCalled();
	});
});
