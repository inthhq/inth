/**
 * The Privacy Choices (v6) prompt as the server renders it: the design
 * opts in the way React's does, the collapsed desktop prompt carries
 * React's markup, and a page inlines only the presentation it shows.
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

import { canDeferEngine } from '../banner/deferred-boot';
import { PROMPT_SLOT_ATTRIBUTE } from '../banner/slot';
import { dialogDesignFor } from '../browser/dialog-loading';
import ConsentBanner from '../components/prompt.astro';
import { resolveOptions } from '../integration';
import { privacyChoicesClassNames } from '../privacy-choices/class-names';
import { PRIVACY_CHOICES_DIALOG_SHEETS } from '../privacy-choices/dialog-sheets';
import { privacyChoicesFirstPaintSheets } from '../privacy-choices/server';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions, InthLocals } from '../types';
import { testRule } from './policy-fixture';

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

type Presentation = NonNullable<InthAstroOptions['presentation']>;

const buildLocals = async function buildLocals(
	presentation: Presentation | undefined,
	rule: Partial<typeof testRule> = {},
	extra: Partial<InthAstroOptions> = {}
): Promise<InthLocals> {
	return await resolveConsentContext({
		headers: new Headers(),
		options: resolveOptions({
			legalLinks: {
				cookiePolicy: { href: '/cookies' },
				privacyPolicy: { href: '/privacy' },
			},
			mode: testingMode({ policy: [{ ...testRule, ...rule }] }),
			presentation,
			...extra,
		}),
	});
};

const render = async function render(
	locals: InthLocals,
	props: Record<string, unknown> = {}
): Promise<Document> {
	const html = await container.renderToString(ConsentBanner, {
		locals: { inth: locals },
		props,
	});
	return new JSDOM(html).window.document;
};

const PC: Presentation = {
	design: 'privacy-choices',
	prompt: { container: { type: 'card' } },
};

const $ = (document: Document, testId: string) =>
	document.querySelector(`[data-testid="${testId}"]`);

describe('<ConsentBanner /> design', () => {
	it('keeps the classic banner by default', async () => {
		const document = await render(await buildLocals(undefined));
		const root = $(document, 'consent-banner-root');
		expect(root).not.toBeNull();
		expect(root?.hasAttribute('data-design')).toBe(false);
		expect($(document, 'consent-banner-announcement')).toBeNull();
	});

	it('renders the Privacy Choices prompt when the design opts in', async () => {
		const document = await render(await buildLocals(PC));
		const root = $(document, 'consent-banner-root');
		expect(root?.getAttribute('data-design')).toBe('privacy-choices');
		expect(root?.getAttribute('data-placement')).toBe('card-start');
		expect(root?.getAttribute('data-flow')).toBe('expand-in-place');
		expect(root?.getAttribute('data-variant')).toBe('choice');
		expect(root?.getAttribute('data-state')).toBe('open');
		// Only one banner: the classic one is not rendered beside it.
		expect(
			document.querySelectorAll('[data-testid="consent-banner-root"]')
		).toHaveLength(1);
		// The page's status region outlives the prompt (BNR-06).
		expect($(document, 'consent-banner-announcement')).not.toBeNull();
	});

	it('a prompt container alone chooses the Privacy Choices design', async () => {
		const document = await render(
			await buildLocals({ prompt: { container: { type: 'card' } } })
		);
		expect(
			$(document, 'consent-banner-root')?.getAttribute('data-design')
		).toBe('privacy-choices');
	});

	it('an explicit classic design wins over a container', async () => {
		const document = await render(
			await buildLocals({
				design: 'classic',
				prompt: { container: { type: 'card' } },
			})
		);
		expect(
			$(document, 'consent-banner-root')?.hasAttribute('data-design')
		).toBe(false);
	});
});

describe('the server-rendered prompt', () => {
	it('[BNR-15] starts collapsed, with Customize pointing at the closed panel', async () => {
		const document = await render(await buildLocals(PC));
		const customize = $(document, 'consent-banner-customize-button');
		const panel = $(document, 'consent-banner-expand-panel');
		expect(customize?.getAttribute('aria-expanded')).toBe('false');
		expect(customize?.getAttribute('aria-controls')).toBe(panel?.id);
		expect(panel?.getAttribute('data-open')).toBe('false');
		expect(panel?.hasAttribute('inert')).toBe(true);
		// The options load in the browser, on Customize.
		expect($(document, 'consent-banner-body')?.children).toHaveLength(0);
	});

	it('names the card by its heading, and the buttons as React does', async () => {
		const document = await render(await buildLocals(PC));
		const card = $(document, 'consent-banner-card');
		const title = $(document, 'consent-banner-title');
		expect(card?.getAttribute('role')).toBe('region');
		expect(card?.getAttribute('aria-labelledby')).toBe(title?.id);
		expect(card?.getAttribute('tabindex')).toBe('-1');
		const reject = $(document, 'consent-banner-reject-button');
		expect(reject?.getAttribute('data-action')).toBe('reject');
		expect(reject?.getAttribute('data-size')).toBe('small');
		expect(reject?.getAttribute('data-early-tap')).toBe('off');
		// No classic delegated action: the controller owns the clicks.
		expect(reject?.hasAttribute('data-inth-action')).toBe(false);
		expect(
			$(document, 'consent-banner-customize-button')?.getAttribute(
				'data-variant'
			)
		).toBe('primary');
	});

	it('[BNR-08] links the policies the card shows, and the tag beside it', async () => {
		const document = await render(await buildLocals(PC));
		expect(
			$(document, 'consent-banner-legal-link-privacyPolicy')
		).not.toBeNull();
		expect(
			$(document, 'consent-banner-legal-link-cookiePolicy')
		).not.toBeNull();
		const tag = $(document, 'consent-banner-branding');
		expect(tag?.textContent).toContain('Consent by');
		expect(tag?.getAttribute('target')).toBe('_blank');
		expect($(document, 'consent-banner-shell')?.contains(tag ?? null)).toBe(
			true
		);
	});

	it('[BNR-18] the bar hides its heading and links only the privacy policy', async () => {
		const document = await render(
			await buildLocals({
				design: 'privacy-choices',
				prompt: { container: { edge: 'bottom', type: 'banner' } },
			})
		);
		expect(
			$(document, 'consent-banner-root')?.getAttribute('data-placement')
		).toBe('banner-bottom');
		expect($(document, 'consent-banner-title')?.getAttribute('class')).toBe(
			privacyChoicesClassNames.surface.visuallyHidden
		);
		expect($(document, 'consent-banner-header')).toBeNull();
		expect($(document, 'consent-banner-legal-link-cookiePolicy')).toBeNull();
		expect(
			$(document, 'consent-banner-customize-button')?.hasAttribute(
				'aria-controls'
			)
		).toBe(false);
	});

	it('[BNR-14] a side drawer renders all-in-one, with its tag in the body', async () => {
		const document = await render(
			await buildLocals({
				design: 'privacy-choices',
				prompt: { container: { side: 'start', type: 'drawer' } },
			})
		);
		expect($(document, 'consent-banner-root')?.getAttribute('data-flow')).toBe(
			'all-in-one'
		);
		expect($(document, 'consent-banner-customize-button')).toBeNull();
		expect($(document, 'consent-banner-save-button')).not.toBeNull();
		expect(
			$(document, 'consent-banner-expand-panel')?.contains(
				$(document, 'consent-banner-branding')
			)
		).toBe(true);
	});

	it('[BNR-13][PERM-08] a blocking prompt has a scrim and a dialog shell', async () => {
		const document = await render(
			await buildLocals({
				design: 'privacy-choices',
				prompt: { blockUntilChoice: true, container: { type: 'card' } },
			})
		);
		const shell = $(document, 'consent-banner-shell');
		expect(
			$(document, 'consent-banner-root')?.getAttribute('data-blocking')
		).toBe('true');
		expect($(document, 'consent-banner-overlay')).not.toBeNull();
		expect(shell?.getAttribute('role')).toBe('dialog');
		expect(shell?.getAttribute('aria-modal')).toBe('true');
		expect($(document, 'consent-banner-card')?.hasAttribute('role')).toBe(
			false
		);
	});

	it('[BNR-01] the US notice offers its rights link and OK', async () => {
		const document = await render(
			await buildLocals(PC, {
				model: 'opt-out',
				prompt: 'notice',
				rights: ['disclosure', 'preferences', 'opt-out'],
			})
		);
		expect(
			$(document, 'consent-banner-root')?.getAttribute('data-variant')
		).toBe('notice');
		expect($(document, 'consent-banner-right-link-opt-out')?.textContent).toBe(
			'Do not sell or share my data'
		);
		expect($(document, 'consent-banner-dismiss-button')).not.toBeNull();
		expect($(document, 'consent-banner-reject-button')).toBeNull();
	});

	it('drops the stock classes with noStyle, and keeps theme slots', async () => {
		const document = await render(
			await buildLocals(
				PC,
				{},
				{
					theme: { slots: { consentBannerCard: 'site-card' } },
				}
			),
			{ noStyle: true }
		);
		const card = $(document, 'consent-banner-card');
		expect(card?.getAttribute('class')).toBe('site-card');
		const reject = $(document, 'consent-banner-reject-button');
		expect(reject?.hasAttribute('class')).toBe(false);
		expect(reject?.hasAttribute('data-variant')).toBe(false);
	});

	it('applies a theme slot over the stock classes', async () => {
		const document = await render(
			await buildLocals(
				PC,
				{},
				{
					theme: { slots: { consentBannerFooter: 'site-footer' } },
				}
			)
		);
		const footer = $(document, 'consent-banner-footer');
		expect(footer?.getAttribute('class')).toContain('site-footer');
		expect(footer?.getAttribute('class')).toContain(
			privacyChoicesClassNames.surface.footer
		);
	});

	it('leaves the browser its class names in the spot', async () => {
		const document = await render(await buildLocals(PC));
		const spot = document.querySelector(`[${PROMPT_SLOT_ATTRIBUTE}]`);
		const data = JSON.parse(spot?.getAttribute(PROMPT_SLOT_ATTRIBUTE) ?? '{}');
		expect(data.privacyChoices.surface.root).toBe(
			privacyChoicesClassNames.surface.root
		);
		expect((spot as HTMLElement | null)?.hidden).toBe(true);
	});

	it('[BNR-10] renders nothing for a US opt-out policy with no prompt', async () => {
		const document = await render(
			await buildLocals(PC, {
				model: 'opt-out',
				prompt: 'none',
				rights: ['disclosure', 'preferences', 'opt-out'],
			})
		);
		expect($(document, 'consent-banner-root')).toBeNull();
	});
});

describe('the engine', () => {
	it('loads at once for the Privacy Choices prompt', async () => {
		const categories: Partial<InthAstroOptions> = {
			consentCategories: ['necessary', 'measurement', 'marketing'],
		};
		const classic = await buildLocals(undefined, {}, categories);
		const v6 = await buildLocals(PC, {}, categories);
		const defers = (locals: InthLocals) =>
			canDeferEngine(
				locals.snapshot,
				locals.options,
				false,
				Date.now(),
				locals.config
			);
		expect(defers(classic)).toBe(true);
		expect(defers(v6)).toBe(false);
	});
});

describe('stylesheets', () => {
	const inlined = async (presentation: Presentation) => {
		const html = await container.renderToString(ConsentBanner, {
			locals: { inth: await buildLocals(presentation) },
		});
		return [...html.matchAll(/data-inth-styles="(?<id>[^"]+)"/gu)].map(
			(match) => match.groups?.id
		);
	};

	it('a Drawer page inlines the drawer sheet and never the card or bar sheet', async () => {
		const ids = await inlined({
			design: 'privacy-choices',
			prompt: { container: { side: 'bottom', type: 'drawer' } },
		});
		expect(ids).toContain('inth-drawer');
		expect(ids).not.toContain('inth-card');
		expect(ids).not.toContain('inth-bar');
		// The classic first-paint sheet stays off a Privacy Choices page.
		expect(ids).not.toContain('inth-first-paint');
		// The options' sheets wait for Customize.
		expect(ids).not.toContain('inth-expand');
	});

	it('a Card page inlines the card sheet only', async () => {
		const ids = await inlined(PC);
		expect(ids).toContain('inth-card');
		expect(ids).not.toContain('inth-drawer');
		expect(ids).not.toContain('inth-bar');
	});

	it('a classic page keeps its first-paint sheet', async () => {
		const ids = await inlined(undefined as unknown as Presentation);
		expect(ids).toContain('inth-first-paint');
		expect(ids).not.toContain('inth-surface');
	});

	it('orders the first-paint sheets tokens, buttons, trigger, gate, shell, presentation', () => {
		expect(
			privacyChoicesFirstPaintSheets('bar').map((sheet) => sheet.id)
		).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-trigger',
			'inth-consent-gate',
			'inth-surface',
			'inth-bar',
			'inth-astro-hidden-banner',
		]);
	});

	it('the dialog brings the tokens, buttons, expand and its own sheet, and no classic one', () => {
		expect(PRIVACY_CHOICES_DIALOG_SHEETS.map((sheet) => sheet.id)).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-expand',
			'inth-privacy-choices-dialog',
		]);
	});
});

describe('the dialog', () => {
	it('renders the Privacy Choices dialog only from an island that has it', () => {
		expect(dialogDesignFor('react', 'preferences', true)).toBe(
			'privacy-choices'
		);
		expect(dialogDesignFor('react', 'iab', true)).toBe('classic');
		expect(dialogDesignFor('react', 'preferences', false)).toBe('classic');
		// Svelte and Vue keep their classic dialog until their ports land.
		expect(dialogDesignFor('svelte', 'preferences', true)).toBe('classic');
		expect(dialogDesignFor('vue', 'preferences', true)).toBe('classic');
	});
});
