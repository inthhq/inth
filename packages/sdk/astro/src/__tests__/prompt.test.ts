/**
 * The consent prompt as the server renders it: the collapsed desktop
 * prompt carries React's markup, and a page inlines only the container it
 * shows.
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

import { canDeferEngine } from '../banner/deferred-boot.model';
import { PROMPT_SLOT_ATTRIBUTE } from '../banner/prompt-slot.model';
import PrivacyChoicesLink from '../components/privacy-choices-link.astro';
import ConsentBanner from '../components/prompt.astro';
import { DIALOG_SHEETS } from '../parts/dialog-sheets';
import { resolveOptions } from '../integration';
import { CONTAINER_SHEET_IDS } from '../parts/insert-sheets';
import { WIDGET_SHEETS } from '../parts/widget-sheets';
import { promptClassNames } from '../prompt/prompt-class-names';
import { resolvePromptModel, rightsBundleOf } from '../prompt/prompt.model';
import { promptFirstPaintSheets, renderPromptHTML } from '../prompt/render-prompt-html';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions, InthLocals } from '../inth-options.model';
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
	prompt: { container: { type: 'card' } },
};

const $ = (document: Document, testId: string) =>
	document.querySelector(`[data-testid="${testId}"]`);

describe('<ConsentBanner />', () => {
	it('renders the consent prompt in a Card by default', async () => {
		const document = await render(await buildLocals(undefined));
		const root = $(document, 'consent-banner-root');
		expect(root?.getAttribute('data-placement')).toBe('card-start');
		expect(root?.getAttribute('data-flow')).toBe('expand-in-place');
		expect(root?.getAttribute('data-variant')).toBe('choice');
		expect(root?.getAttribute('data-state')).toBe('open');
		expect(
			document.querySelectorAll('[data-testid="consent-banner-root"]')
		).toHaveLength(1);
		// The page's status region outlives the prompt (BNR-06).
		expect($(document, 'consent-banner-announcement')).not.toBeNull();
	});

	it('renders the container the policy surface names', async () => {
		const document = await render(
			await buildLocals(undefined, {
				surface: { container: { edge: 'top', type: 'banner' } },
			} as Partial<typeof testRule>)
		);
		expect(
			$(document, 'consent-banner-root')?.getAttribute('data-placement')
		).toBe('banner-top');
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
		// The early-tap script holds a tap on it until the prompt replays it.
		expect(reject?.hasAttribute('data-early-tap')).toBe(false);
		// No delegated action: the controller owns the clicks.
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
				prompt: { container: { edge: 'bottom', type: 'banner' } },
			})
		);
		expect(
			$(document, 'consent-banner-root')?.getAttribute('data-placement')
		).toBe('banner-bottom');
		expect($(document, 'consent-banner-title')?.getAttribute('class')).toBe(
			promptClassNames.surface.visuallyHidden
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

	it('marks the root with its policy and the rights link as Customize, so an early tap replays only under the policy it was made in', async () => {
		const document = await render(
			await buildLocals(PC, {
				model: 'opt-out',
				prompt: 'notice',
				rights: ['disclosure', 'preferences', 'opt-out'],
			})
		);
		const root = $(document, 'consent-banner-root');
		expect(root?.getAttribute('data-model')).toBe('opt-out');
		expect(root?.getAttribute('data-prompt')).toBe('notice');
		// The early-tap script holds a tap on it, and the prompt opens the
		// rights in place when it replays it.
		expect(
			$(document, 'consent-banner-right-link-opt-out')?.getAttribute(
				'data-action'
			)
		).toBe('customize');
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
			promptClassNames.surface.footer
		);
	});

	it('leaves the browser its class names in the spot', async () => {
		const document = await render(await buildLocals(PC));
		const spot = document.querySelector(`[${PROMPT_SLOT_ATTRIBUTE}]`);
		const data = JSON.parse(spot?.getAttribute(PROMPT_SLOT_ATTRIBUTE) ?? '{}');
		expect(data.classNames.surface.root).toBe(promptClassNames.surface.root);
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
	it('waits for the page under the consent prompt, whose early-tap script holds a tap', async () => {
		const locals = await buildLocals(
			PC,
			{},
			{
				consentCategories: ['necessary', 'measurement', 'marketing'],
			}
		);
		expect(
			canDeferEngine(locals.snapshot, locals.options, Date.now(), locals.config)
		).toBe(true);
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

	it('a Drawer page inlines the drawer sheet and never the card or banner sheet', async () => {
		const ids = await inlined({
			prompt: { container: { side: 'bottom', type: 'drawer' } },
		});
		expect(ids).toContain('inth-drawer');
		expect(ids).not.toContain('inth-card');
		expect(ids).not.toContain('inth-banner');
		// `first-paint` carries every container; a page that knows its
		// container never inlines it.
		expect(ids).not.toContain('inth-first-paint');
		// The options' sheets wait for Customize.
		expect(ids).not.toContain('inth-expand');
	});

	it('a Card page inlines the card sheet only', async () => {
		const ids = await inlined(PC);
		expect(ids).toContain('inth-card');
		expect(ids).not.toContain('inth-drawer');
		expect(ids).not.toContain('inth-banner');
	});

	it('orders the first-paint sheets tokens, buttons, trigger, gate, shell, container', () => {
		expect(promptFirstPaintSheets('banner').map((sheet) => sheet.id)).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-trigger',
			'inth-consent-gate',
			'inth-surface',
			'inth-banner',
			'inth-astro-hidden-banner',
		]);
	});

	it('the dialog brings the tokens, buttons, expand and its own sheet', () => {
		expect(DIALOG_SHEETS.map((sheet) => sheet.id)).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-expand',
			'inth-dialog',
		]);
	});
});

describe('the policy and the host', () => {
	it('[BNR-15] the summary shows only the actions the policy allows, in every presentation', async () => {
		const rule = { actions: ['accept', 'reject'] } as Partial<typeof testRule>;
		for (const layout of [{ type: 'card' }, { type: 'banner' }] as const) {
			// oxlint-disable-next-line no-await-in-loop -- One presentation at a time.
			const document = await render(
				// oxlint-disable-next-line no-await-in-loop -- As above.
				await buildLocals({ prompt: { container: layout } }, rule)
			);
			expect($(document, 'consent-banner-customize-button')).toBeNull();
			expect($(document, 'consent-banner-reject-button')).not.toBeNull();
			expect($(document, 'consent-banner-accept-button')).not.toBeNull();
		}
	});

	it('[BNR-15] the summary follows the host layout order', async () => {
		const document = await render(
			await buildLocals({
				prompt: {
					container: { type: 'card' },
					layout: ['customize', ['accept', 'reject']],
				},
			})
		);
		const footer = $(document, 'consent-banner-footer');
		expect(footer?.firstElementChild?.getAttribute('data-testid')).toBe(
			'consent-banner-customize-button'
		);
		const group = $(document, 'consent-banner-footer-sub-group');
		expect(group?.firstElementChild?.getAttribute('data-testid')).toBe(
			'consent-banner-accept-button'
		);
	});

	it('[BNR-15] the collapsed Banner keeps the host groups and their slot', async () => {
		const document = await render(
			await buildLocals(
				{
					prompt: {
						container: { type: 'banner' },
						layout: ['customize', ['accept', 'reject']],
					},
				},
				{},
				{ theme: { slots: { consentBannerFooterSubGroup: 'group-marker' } } }
			)
		);
		expect(
			$(document, 'consent-banner-root')?.getAttribute('data-placement')
		).toBe('banner-bottom');
		const footer = $(document, 'consent-banner-footer');
		expect(footer?.firstElementChild?.getAttribute('data-testid')).toBe(
			'consent-banner-customize-button'
		);
		const group = $(document, 'consent-banner-footer-sub-group');
		expect(group?.parentElement).toBe(footer);
		const classes = group?.getAttribute('class') ?? '';
		expect(classes).toContain('group-marker');
		// The bar sizes grouped buttons through its own group class.
		expect(classes).toContain(promptClassNames.banner.actionGroup);
		expect(classes).toContain(promptClassNames.surface.actionGroup);
		expect(group?.firstElementChild?.getAttribute('data-testid')).toBe(
			'consent-banner-accept-button'
		);
		expect(group?.lastElementChild?.getAttribute('data-testid')).toBe(
			'consent-banner-reject-button'
		);
	});

	it('[BNR-01] a notice keeps its opt-out link and OK whatever the actions', async () => {
		const document = await render(
			await buildLocals(
				{
					prompt: { container: { type: 'banner' } },
				},
				{
					model: 'opt-out',
					prompt: 'notice',
					rights: ['disclosure', 'preferences', 'opt-out'],
				}
			)
		);
		const footer = $(document, 'consent-banner-footer');
		expect(
			[...(footer?.children ?? [])].map((child) =>
				child.getAttribute('data-testid')
			)
		).toEqual([
			'consent-banner-right-link-opt-out',
			'consent-banner-dismiss-button',
		]);
	});

	it('[COPY-01][SR-04] the rights bundle reads the backend-confirmed rights from the local receipt', () => {
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

	it('a local noStyle reaches the stock buttons', async () => {
		const document = await render(await buildLocals(PC), { noStyle: true });
		for (const id of [
			'consent-banner-reject-button',
			'consent-banner-accept-button',
			'consent-banner-customize-button',
		]) {
			expect($(document, id)?.getAttribute('class') ?? '').toBe('');
		}
	});

	it('the collapsed bar merges the title, description and footer slots', async () => {
		const document = await render(
			await buildLocals(
				{
					prompt: { container: { type: 'banner' } },
				},
				{},
				{
					theme: {
						slots: {
							consentBannerDescription: 'description-marker',
							consentBannerFooter: 'footer-marker',
							consentBannerTitle: 'title-marker',
						},
					},
				}
			)
		);
		expect($(document, 'consent-banner-title')?.classList).toContain(
			'title-marker'
		);
		// The heading stays visually hidden under the slot.
		expect($(document, 'consent-banner-title')?.classList).toContain(
			promptClassNames.surface.visuallyHidden
		);
		expect($(document, 'consent-banner-description')?.classList).toContain(
			'description-marker'
		);
		expect($(document, 'consent-banner-footer')?.classList).toContain(
			'footer-marker'
		);
	});

	it("the notice's opt-out link takes the consentBannerRightLink slot", async () => {
		const document = await render(
			await buildLocals(
				PC,
				{
					model: 'opt-out',
					prompt: 'notice',
					rights: ['disclosure', 'preferences', 'opt-out'],
				},
				{
					theme: {
						slots: {
							consentBannerRightLink: {
								className: 'right-link-marker',
								style: { textDecorationThickness: '2px' },
							},
						},
					},
				}
			)
		);
		const link = $(document, 'consent-banner-right-link-opt-out');
		expect(link?.classList).toContain('right-link-marker');
		// The slot adds to the stock class; it does not replace it.
		expect(link?.classList).toContain(promptClassNames.surface.rightLink);
		expect((link as HTMLElement | null)?.style.textDecorationThickness).toBe(
			'2px'
		);
	});

	it('the root carries the direction, the surface marker and the animation switch', async () => {
		const locals = await buildLocals(PC, {}, { disableAnimation: true });
		const model = resolvePromptModel({
			classNames: promptClassNames,
			options: locals.options,
			props: {},
			snapshot: {
				...locals.snapshot,
				translations: {
					language: 'he',
					translations: locals.snapshot.translations?.translations ?? {},
				},
			} as typeof locals.snapshot,
		});
		const { document } = new JSDOM(renderPromptHTML(model, false)).window;
		const root = $(document, 'consent-banner-root');
		expect(root?.getAttribute('dir')).toBe('rtl');
		expect(root?.getAttribute('data-inth-surface')).toBe('banner');
		expect(root?.getAttribute('data-animation')).toBe('off');
		const ltr = await render(await buildLocals(PC));
		expect($(ltr, 'consent-banner-root')?.getAttribute('dir')).toBe('ltr');
		expect($(ltr, 'consent-banner-root')?.hasAttribute('data-animation')).toBe(
			false
		);
	});

	it('[PERM-05][SR-05] the collapsed panel carries a real inert attribute', async () => {
		const document = await render(await buildLocals(PC));
		expect(
			$(document, 'consent-banner-expand-panel')?.hasAttribute('inert')
		).toBe(true);
		expect($(document, 'consent-banner-root')?.hasAttribute('inert')).toBe(
			false
		);
	});

	it('[BNR-13] the opt-in confirmation brings the widget sheets React gives it', () => {
		expect(WIDGET_SHEETS.map((sheet) => sheet.id)).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-parts',
			'inth-widget',
		]);
	});
});

describe('<PrivacyChoicesLink />', () => {
	const renderLink = async function renderLink(
		locals: InthLocals,
		props: Record<string, unknown> = {}
	): Promise<Element | null> {
		const html = await container.renderToString(PrivacyChoicesLink, {
			locals: { inth: locals },
			props,
		});
		return new JSDOM(html).window.document.querySelector(
			'[data-inth-privacy-choices-link]'
		);
	};
	const US_OPT_IN = {
		privacySignals: { gpc: { denyCategories: ['marketing'] } },
	};
	const US_OPT_OUT = {
		model: 'opt-out',
		prompt: 'notice',
		rights: ['disclosure', 'preferences', 'opt-out'],
	} as Partial<typeof testRule>;

	it('[BNR-05] stays a way back in under US opt-in, without the opt-out icon', async () => {
		const link = await renderLink(await buildLocals(PC, US_OPT_IN));
		expect(link?.getAttribute('data-testid')).toBe('privacy-choices-link');
		expect(link?.hasAttribute('hidden')).toBe(false);
		expect(link?.textContent).toBe('Your Privacy Choices');
		expect(link?.querySelector('svg')).toBeNull();
		expect(link?.hasAttribute('data-opt-out-variant')).toBe(false);
		expect(link?.getAttribute('data-inth-action')).toBe('customize');
	});

	it('[BNR-05] the EU gets the same way back in', async () => {
		const link = await renderLink(await buildLocals(PC));
		expect(link?.hasAttribute('hidden')).toBe(false);
		expect(link?.textContent).toBe('Your Privacy Choices');
	});

	it('names the opt-out right with the CCPA icon under an opt-out policy', async () => {
		const optOut = await renderLink(await buildLocals(undefined, US_OPT_OUT), {
			variant: 'privacy-choices',
		});
		expect(optOut?.hasAttribute('hidden')).toBe(false);
		expect(optOut?.getAttribute('data-opt-out-variant')).toBe(
			'privacy-choices'
		);
		// The CCPA icon marks the opt-out right, as React draws it.
		expect(optOut?.querySelector('svg')).not.toBeNull();
	});

	it('[C2] sizes the opt-out icon on its own, since the prompt never loads the legal-links sheet that sizes it', async () => {
		const locals = await buildLocals(PC, US_OPT_OUT);
		const styled = await renderLink(locals, { variant: 'privacy-choices' });
		const icon = styled?.querySelector('svg');
		expect(icon?.getAttribute('height')).toBe('14');
		expect(icon?.getAttribute('width')).toBe('30');
		const bare = await renderLink(locals, {
			noStyle: true,
			variant: 'privacy-choices',
		});
		expect(bare?.querySelector('svg')?.hasAttribute('height')).toBe(false);
		expect(bare?.querySelector('svg')?.hasAttribute('width')).toBe(false);
	});
});

describe('legal links and sheet ids', () => {
	it('the banner legal links drop their class with noStyle', async () => {
		const document = await render(await buildLocals(PC), { noStyle: true });
		const link = $(document, 'consent-banner-legal-link-privacyPolicy');
		expect(link).not.toBeNull();
		expect(link?.hasAttribute('class')).toBe(false);
	});

	it.each(['banner', 'card', 'drawer'] as const)(
		'the %s sheet ids the browser looks for match the sheets it loads',
		async (type) => {
			const { loadContainerSheets } = await import('../browser/mount-prompt');
			const sheets = await loadContainerSheets(type);
			expect(sheets.map((sheet) => sheet.id)).toEqual(
				CONTAINER_SHEET_IDS[type]
			);
		}
	);
});
