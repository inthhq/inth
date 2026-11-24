import bannerStyles from '@inth/sdk/ui/styles/components/consent-banner';
import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { promptClassNames } from '../banner/class-names';
import { resolvePromptModel } from '../banner/prompt-model';
import ConsentDialogLink from '../components/panel-link.astro';
import ConsentDialog from '../components/panel.astro';
import ConsentBanner from '../components/prompt.astro';
import { resolveOptions } from '../integration';
import { hosted as hostedMode } from '../mode';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions, InthLocals } from '../types';
import { testRule } from './policy-fixture';

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

// Every Inth surface stays hidden without a matched rule, so the default
// fixture configures one the way a deployment would.
const buildLocals = async function buildLocals(
	options: InthAstroOptions = {
		mode: testingMode({ policy: [testRule] }),
	},
	headers: Record<string, string> = {}
): Promise<InthLocals> {
	return await resolveConsentContext({
		headers: new Headers(headers),
		options: resolveOptions(options),
	});
};

/**
 * The banner's markup. The first-paint stylesheet it inlines names every
 * class, so it is left out (`inline-styles.test.ts` covers it).
 */
const render = async function render(
	locals: InthLocals,
	props: Record<string, unknown> = {}
): Promise<string> {
	const html = await container.renderToString(ConsentBanner, {
		locals: { inth: locals },
		props,
	});
	return html.replace(
		/<style[^>]*data-inth-styles[^>]*>[\s\S]*?<\/style>/gu,
		''
	);
};

describe('<ConsentBanner />', () => {
	it('renders the shared DOM contract', async () => {
		const html = await render(await buildLocals());

		for (const testId of [
			'consent-banner-root',
			'consent-banner-card',
			'consent-banner-header',
			'consent-banner-title',
			'consent-banner-description',
			'consent-banner-footer',
			'consent-banner-accept-button',
			'consent-banner-reject-button',
		]) {
			expect(html).toContain(`data-testid="${testId}"`);
		}
	});

	it('wires the buttons to runtime actions with data attributes only', async () => {
		const html = await render(await buildLocals());
		expect(html).toContain('data-inth-action="accept"');
		expect(html).toContain('data-inth-action="reject"');
		expect(html).toContain('data-inth-action="customize"');
		// The shell itself carries no inline handlers.
		expect(html).not.toContain('onclick=');
	});

	it('inlines the resolved config so the browser skips /v1/consent/init', async () => {
		const html = await render(await buildLocals());
		// A data block: it never runs, so no CSP has to allow it.
		expect(html).toMatch(
			/<script[^>]*type="application\/json"[^>]*data-inth-config[^>]*>\{/u
		);
	});

	it('escapes `<` in the inlined config', async () => {
		const locals = await buildLocals();
		locals.config = {
			...locals.config,
			initialTranslations: {
				language: 'en',
				translations: {
					cookieBanner: { title: '</script><img src=x>' },
				} as never,
			},
		};
		const html = await render(locals);
		expect(html).not.toContain('</script><img src=x>');
		expect(html).toContain('\\u003c/script');
	});

	it('renders nothing when the server says the banner should stay hidden', async () => {
		const locals = await buildLocals();
		locals.shouldShowBanner = false;
		const html = await render(locals);
		expect(html).not.toContain('data-testid="consent-banner-root"');
	});

	it('renders anyway with `force`', async () => {
		const locals = await buildLocals();
		locals.shouldShowBanner = false;
		const html = await render(locals, { force: true });
		expect(html).toContain('data-testid="consent-banner-root"');
	});

	it('renders the host-resolved experiment arm and inlines it', async () => {
		const locals = await buildLocals({
			experiment: {
				arm: 'bar',
				arms: { bar: { prompt: { variant: 'bar' } } },
				id: 'banner-shape',
			},
			mode: testingMode({ policy: [testRule] }),
		});
		expect(locals.snapshot.experiment).toEqual({
			acknowledgedDiagnostics: false,
			arm: 'bar',
			assignedBy: 'host',
			id: 'banner-shape',
		});
		const html = await render(locals);
		expect(html).toContain('data-variant="bar"');
		expect(html).toContain('data-inth-config');
		expect(html).toContain('"initialExperiment"');
	});

	it('honours copy overrides', async () => {
		const html = await render(await buildLocals(), {
			acceptButtonText: 'Yes please',
			title: 'Our cookies',
		});
		expect(html).toContain('Our cookies');
		expect(html).toContain('Yes please');
	});

	it('renders localized copy from the negotiated language', async () => {
		const english = await render(await buildLocals());
		const german = await render(
			await buildLocals(
				{ mode: testingMode({ policy: [testRule] }) },
				{ 'accept-language': 'de' }
			)
		);
		expect(german).toContain('lang="de"');
		expect(german).not.toBe(english);
	});

	describe('entry animation', () => {
		const rootClass = (html: string) =>
			/<div[^>]*class="(?<classes>[^"]*)"[^>]*data-testid="consent-banner-root"/u.exec(
				html
			)?.groups?.classes ?? '';
		const entering = bannerStyles.bannerEntering ?? 'bannerEntering';

		it('plays by default', async () => {
			expect(rootClass(await render(await buildLocals()))).toContain(entering);
		});

		it('is skipped with the `disableAnimation` prop', async () => {
			const html = await render(await buildLocals(), {
				disableAnimation: true,
			});
			expect(rootClass(html)).toContain(bannerStyles.bannerVisible);
			expect(rootClass(html)).not.toContain(entering);
		});

		it('is skipped with the integration option, unless the prop is false', async () => {
			const locals = await buildLocals({
				disableAnimation: true,
				mode: testingMode({ policy: [testRule] }),
			});
			expect(rootClass(await render(locals))).not.toContain(entering);
			expect(
				rootClass(await render(locals, { disableAnimation: false }))
			).toContain(entering);
		});

		it('is skipped with `theme.slots` applied to the same parts', async () => {
			const html = await render(
				await buildLocals({
					mode: testingMode({ policy: [testRule] }),
					presentation: { prompt: { blocking: true } },
					theme: {
						slots: {
							consentBanner: 'brand-banner',
							consentBannerOverlay: {
								className: 'brand-overlay',
								style: { opacity: '0.5' },
							},
						},
					},
				}),
				{ class: 'page-banner', disableAnimation: true }
			);
			const overlay =
				/<[^>]*data-testid="consent-banner-overlay"[^>]*>/u.exec(html)?.[0] ??
				'';

			expect(rootClass(html)).toBe(
				`${bannerStyles.root} ${bannerStyles.bannerVisible} brand-banner page-banner`
			);
			expect(overlay).toContain(
				`class="${bannerStyles.overlay} ${bannerStyles.overlayVisible} brand-overlay"`
			);
			expect(overlay).toContain('style="opacity:0.5"');
			expect(html).not.toContain(entering);
			expect(html).not.toContain(
				bannerStyles.overlayEntering ?? 'overlayEntering'
			);
		});
	});

	it('drops the styling class names with `noStyle`', async () => {
		const html = await render(await buildLocals(), { noStyle: true });
		expect(html).not.toContain('inth-ui-root');
		expect(html).toContain('data-testid="consent-banner-root"');
	});

	it('drops the themed button styles with `noStyle`', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [testRule] }),
				theme: { consentActions: { default: { mode: 'ghost' } } },
			}),
			{ noStyle: true }
		);
		const accept =
			/<button[^>]*data-testid="consent-banner-accept-button"[^>]*>/u.exec(
				html
			)?.[0];
		expect(accept).toBeDefined();
		expect(accept).not.toContain('data-mode=');
		expect(accept).not.toContain('data-variant=');
	});

	it('styles the buttons from `theme.consentActions`', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [testRule] }),
				presentation: { prompt: { primaryActions: ['accept'] } },
				theme: {
					consentActions: {
						customize: { mode: 'ghost', variant: 'neutral' },
						default: { mode: 'filled' },
						primary: { mode: 'stroke', variant: 'primary' },
					},
				},
			})
		);
		const button = (action: string) =>
			new RegExp(
				`<button[^>]*data-testid="consent-banner-${action}-button"[^>]*>`,
				'u'
			).exec(html)?.[0];

		// The React banner's order (`resolveConsentButtonStyle`): the
		// action's own key, then `primary`, then `default`, then stroke.
		expect(button('accept')).toContain('data-mode="stroke"');
		expect(button('accept')).toContain('data-variant="primary"');
		expect(button('reject')).toContain('data-mode="filled"');
		expect(button('reject')).toContain('data-variant="neutral"');
		expect(button('customize')).toContain('data-mode="ghost"');
		expect(button('customize')).toContain('data-variant="neutral"');
	});

	it('adds `theme.slots` classes and styles to the parts they name', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [testRule] }),
				presentation: { prompt: { primaryActions: ['accept'] } },
				theme: {
					slots: {
						buttonPrimary: 'brand-primary',
						buttonSecondary: 'brand-secondary',
						consentBanner: 'brand-banner',
						consentBannerCard: {
							className: 'brand-card',
							style: { '--brand-accent': '#0a66ff', borderTopWidth: '4px' },
						},
						consentBannerDescription: 'brand-description',
						consentBannerFooter: 'brand-footer',
						consentBannerFooterSubGroup: 'brand-group',
						consentBannerHeader: 'brand-header',
						consentBannerTag: 'brand-tag',
						consentBannerTitle: {
							className: 'brand-title',
							noStyle: true,
						},
					},
				},
			})
		);
		const tag = (testId: string) =>
			new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, 'u').exec(html)?.[0];

		expect(tag('consent-banner-card')).toMatch(
			new RegExp(`class="${bannerStyles.card} brand-card"`, 'u')
		);
		expect(tag('consent-banner-card')).toContain(
			'style="--brand-accent:#0a66ff;border-top-width:4px"'
		);
		expect(tag('consent-banner-root')).toContain('brand-banner');
		expect(tag('consent-banner-header')).toContain('brand-header');
		expect(tag('consent-banner-description')).toContain('brand-description');
		expect(tag('consent-banner-footer')).toContain('brand-footer');
		expect(tag('consent-banner-footer-sub-group')).toContain('brand-group');
		expect(tag('consent-banner-branding')).toContain('brand-tag');
		expect(tag('consent-banner-accept-button')).toContain('brand-primary');
		expect(tag('consent-banner-reject-button')).toContain('brand-secondary');
		// A slot with `noStyle` replaces that part's stock classes.
		expect(tag('consent-banner-title')).toContain('class="brand-title"');
	});

	it('applies the host-resolved arm theme slots', async () => {
		const html = await render(
			await buildLocals({
				experiment: {
					arm: 'branded',
					arms: {
						branded: {
							theme: { slots: { consentBannerCard: 'arm-card' } },
						},
					},
					id: 'card-class',
				},
				mode: testingMode({ policy: [testRule] }),
				theme: { slots: { consentBannerTitle: 'brand-title' } },
			})
		);
		const tag = (testId: string) =>
			new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, 'u').exec(html)?.[0];

		expect(tag('consent-banner-card')).toContain('arm-card');
		expect(tag('consent-banner-title')).toContain('brand-title');
	});

	it('adds px to numeric slot lengths and leaves unitless numbers alone', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [testRule] }),
				theme: {
					slots: {
						consentBannerCard: { style: { opacity: 0.5, padding: 8 } },
					},
				},
			})
		);

		expect(
			/<[^>]*data-testid="consent-banner-card"[^>]*>/u.exec(html)?.[0]
		).toContain('style="opacity:0.5;padding:8px"');
	});

	it('keeps `theme.slots` classes with `noStyle`', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [testRule] }),
				theme: { slots: { consentBannerCard: 'brand-card' } },
			}),
			{ noStyle: true }
		);

		expect(
			/<[^>]*data-testid="consent-banner-card"[^>]*>/u.exec(html)?.[0]
		).toContain('class="brand-card"');
	});

	it('renders the branding tag with the shared markup', async () => {
		const html = await render(await buildLocals());
		// Matched as one element: separate `toContain` checks would pass
		// with the testid, the variant and the branding on three different
		// nodes.
		const branding = /<[^>]*data-testid="consent-banner-branding"[^>]*>/u.exec(
			html
		)?.[0];
		expect(branding).toBeDefined();
		expect(branding).toContain('data-variant="banner-tag"');
		expect(branding).toContain('data-branding="inth"');
		expect(html).toContain('Secured by');
		// It sits beside the card, not inside it, so the tag can overlap the
		// card's top edge the way the Svelte and React banners do.
		expect(html.indexOf('consent-banner-branding')).toBeLessThan(
			html.indexOf('consent-banner-card')
		);
	});

	it('labels a legal link without a `label` from the translations', async () => {
		const options: InthAstroOptions = {
			legalLinks: {
				cookiePolicy: { href: '/cookies', label: 'Our cookies' },
				privacyPolicy: { href: '/privacy' },
			},
			mode: testingMode({ policy: [testRule] }),
		};
		const english = await render(await buildLocals(options), {
			legalLinks: ['privacyPolicy', 'cookiePolicy'],
		});
		expect(english).toContain('>Privacy Policy,</a>');
		expect(english).toContain('>Our cookies</a>');
		expect(english).not.toContain('>privacyPolicy</a>');

		const german = await render(
			await buildLocals(options, { 'accept-language': 'de' }),
			{
				legalLinks: ['privacyPolicy'],
			}
		);
		expect(german).toContain('>Datenschutzerklärung</a>');
	});

	it('separates legal links from the description and each other', async () => {
		const options: InthAstroOptions = {
			legalLinks: {
				cookiePolicy: { href: '/cookies', label: 'Cookies' },
				privacyPolicy: { href: '/privacy', label: 'Privacy' },
			},
			mode: testingMode({ policy: [testRule] }),
		};
		const description = (html: string) => {
			const found = new JSDOM(html).window.document.querySelector(
				'[data-testid="consent-banner-description"]'
			);
			if (!found) {
				throw new Error('Missing consent-banner-description');
			}
			return found;
		};

		const styled = description(
			await render(await buildLocals(options), {
				description: 'Copy.',
				legalLinks: ['privacyPolicy', 'cookiePolicy'],
			})
		);
		expect(styled.textContent).toBe('Copy. Privacy, Cookies');
		for (const link of styled.querySelectorAll('a')) {
			expect(link.className).toBe(legalLinkStyles.legalLink);
		}

		const unstyled = description(
			await render(await buildLocals(options), {
				legalLinks: ['privacyPolicy'],
				noStyle: true,
			})
		);
		expect(unstyled.querySelector('a')?.hasAttribute('class')).toBe(false);
	});

	it('resolves a class map built before it carried legal links', async () => {
		const { legalLinks: _omitted, ...olderClassNames } = promptClassNames;
		const locals = await buildLocals({
			legalLinks: { privacyPolicy: { href: '/privacy' } },
			mode: testingMode({ policy: [testRule] }),
		});
		const model = resolvePromptModel({
			classNames: olderClassNames,
			legalLinks: locals.options.legalLinks,
			props: { legalLinks: ['privacyPolicy'] },
			snapshot: locals.snapshot,
		});
		expect(model.classes.legalLink).toBe('');
		expect(model.legalLinks.map((link) => link.key)).toEqual(['privacyPolicy']);
	});

	it('drops the branding tag with `hideBranding`', async () => {
		const html = await render(await buildLocals(), { hideBranding: true });
		expect(html).not.toContain('data-testid="consent-banner-branding"');
	});

	it('fails loudly when the middleware did not run', async () => {
		await expect(
			container.renderToString(ConsentBanner, { locals: {}, props: {} })
		).rejects.toThrowError(/Astro\.locals\.inth/u);
	});
});

describe('<ConsentBanner /> without a resolved policy', () => {
	// An init answer without a policy resolution yields a failed resolution.
	const withoutPolicy = () =>
		resolveConsentContext({
			fetch: vi.fn(() =>
				Response.json({
					location: { countryCode: null, regionCode: null },
					translations: { language: 'en', translations: {} },
				})
			) as never,
			headers: new Headers(),
			options: resolveOptions({
				mode: hostedMode(),
				projectUrl: 'https://consent.example.com',
			}),
			url: 'https://example.com/',
		});

	it('reports that there is no policy to manage', async () => {
		const locals = await withoutPolicy();
		expect(locals.decision.status).toBe('failed');
		expect(locals.hasPolicy).toBe(false);
	});

	it('resolves the recommended pack when no rules are configured', async () => {
		// An unknown location is strict by default: an opt-in choice prompt.
		const locals = await buildLocals({ mode: testingMode() });
		expect(locals.decision.status).toBe('matched');
		expect(locals.snapshot.policyRule.model).toBe('opt-in');
		expect(locals.snapshot.policyRule.prompt).toBe('choice');
		expect(locals.hasPolicy).toBe(true);
		expect(locals.hasConsentUi).toBe(true);
	});

	it('renders no banner, even when forced', async () => {
		const locals = await withoutPolicy();
		const html = await render(locals, { force: true });
		expect(html).not.toContain('data-testid="consent-banner-root"');
		expect(html).not.toContain('data-testid="consent-banner-card"');
	});

	it('hides the dialog trigger until a policy is resolved', async () => {
		const hidden = await container.renderToString(ConsentDialogLink, {
			locals: { inth: await withoutPolicy() },
		});
		const trigger = /<[^>]*data-testid="consent-dialog-trigger"[^>]*>/u.exec(
			hidden
		)?.[0];
		expect(trigger).toBeDefined();
		expect(trigger).toContain('hidden');
		expect(trigger).toContain('data-inth-surface="trigger"');

		const shown = await container.renderToString(ConsentDialogLink, {
			locals: { inth: await buildLocals() },
		});
		const visible = /<[^>]*data-testid="consent-dialog-trigger"[^>]*>/u.exec(
			shown
		)?.[0];
		expect(visible).toBeDefined();
		expect(visible).not.toContain('hidden');
	});
});

describe('<ConsentBanner /> under a notice prompt', () => {
	const noticeLocals = () =>
		buildLocals({
			mode: testingMode({
				policy: [
					{
						...testRule,
						id: 'notice',
						model: 'opt-out',
						prompt: 'notice',
					},
				],
			}),
		});

	it('marks the root with the prompt kind and model', async () => {
		const html = await render(await noticeLocals());
		const root = /<[^>]*data-testid="consent-banner-root"[^>]*>/u.exec(
			html
		)?.[0];
		expect(root).toBeDefined();
		expect(root).toContain('data-prompt="notice"');
		expect(root).toContain('data-model="opt-out"');
	});

	it('renders the opt-out button before an acknowledgement with notice copy', async () => {
		const html = await render(await noticeLocals());

		// The inlined config carries the whole bundle, so read the element.
		const heading =
			/<h2[^>]*data-testid="consent-banner-title"[^>]*>(?<text>[^<]*)<\/h2>/u.exec(
				html
			)?.groups?.text;
		expect(heading).toBe('Privacy notice');

		const optOut = html.indexOf(
			'data-testid="consent-banner-right-link-opt-out"'
		);
		const dismiss = html.indexOf('data-testid="consent-banner-dismiss-button"');
		expect(optOut).toBeGreaterThan(-1);
		expect(dismiss).toBeGreaterThan(optOut);
		// The opt-out control opens the preference center, so it also covers
		// the preferences right and no second button renders.
		expect(html).not.toContain('consent-banner-right-link-preferences');

		expect(html).toContain('data-testid="consent-banner-rights"');
		const optOutButton = /<button[^>]*data-right="opt-out"[^>]*>/u.exec(
			html
		)?.[0];
		expect(optOutButton).toBeDefined();
		// An underlined button keeps acknowledgement as the primary action in the
		// row. It opens the preference center through the same delegated
		// handler as customize.
		expect(optOutButton).toContain('data-action="right"');
		expect(optOutButton).toContain('data-inth-action="customize"');
		expect(optOutButton).toContain(bannerStyles.rightLink);
		expect(optOutButton).not.toContain('data-variant=');
		expect(optOutButton).not.toContain('data-mode=');
		expect(html).toContain('Do not sell or share my data');
		expect(html).toContain('data-action="dismiss"');
		expect(html).toContain('data-inth-action="dismiss"');
		// The only button leads, as it does in the React and Svelte banners.
		expect(
			/<button[^>]*data-action="dismiss"[^>]*>/u.exec(html)?.[0]
		).toContain('data-variant="primary"');
		// Acknowledgement dismisses the notice without recording consent.
		expect(html).toContain('>OK<');
		expect(html).not.toContain('>Dismiss<');
		expect(html).not.toContain('consent-banner-accept-button');
	});

	it('localizes the notice copy and rights from the negotiated language', async () => {
		const html = await render(
			await buildLocals(
				{
					mode: testingMode({
						policy: [
							{ ...testRule, id: 'notice', model: 'opt-out', prompt: 'notice' },
						],
					}),
				},
				{ 'accept-language': 'de' }
			)
		);
		expect(html).toContain('lang="de"');
		const heading =
			/<h2[^>]*data-testid="consent-banner-title"[^>]*>(?<text>[^<]*)<\/h2>/u.exec(
				html
			)?.groups?.text;
		expect(heading).toBeDefined();
		expect(heading).not.toBe('Privacy notice');
		const optOut =
			/<button[^>]*data-right="opt-out"[^>]*>(?<text>[^<]*)<\/button>/u.exec(
				html
			)?.groups?.text;
		expect(optOut).toBe('Meine Daten nicht verkaufen oder weitergeben');
		const dismiss =
			/<button[^>]*data-action="dismiss"[^>]*>(?<text>[^<]*)<\/button>/u.exec(
				html
			)?.groups?.text;
		expect(dismiss).toBe('OK');
	});

	it('renders no rights group when the prompt already covers them', async () => {
		const html = await render(await buildLocals());
		expect(html).toContain('data-prompt="choice"');
		expect(html).toContain('data-model="opt-in"');
		expect(html).not.toContain('data-testid="consent-banner-rights"');
		expect(html).toContain('data-testid="consent-banner-customize-button"');
	});
});

describe('<ConsentBanner /> surface shape', () => {
	const readRoot = (html: string) =>
		/<[^>]*data-testid="consent-banner-root"[^>]*>/u.exec(html)?.[0] ?? '';
	const readCard = (html: string) =>
		/<[^>]*data-testid="consent-banner-card"[^>]*>/u.exec(html)?.[0] ?? '';
	const noticeRule = {
		...testRule,
		id: 'notice',
		model: 'opt-out' as const,
		prompt: 'notice' as const,
	};

	it('renders a notice as a non-blocking floating card', async () => {
		const html = await render(
			await buildLocals({ mode: testingMode({ policy: [noticeRule] }) })
		);
		const root = readRoot(html);
		expect(root).toContain('data-variant="floating"');
		expect(root).toContain('data-position="bottom-left"');
		expect(root).not.toContain('data-blocking');
		expect(html).not.toContain('data-testid="consent-banner-overlay"');
		expect(readCard(html)).not.toContain('aria-modal');
		expect(readCard(html)).toContain('role="region"');
	});

	it('renders a choice as a floating card at the leading bottom corner', async () => {
		const html = await render(await buildLocals());
		const root = readRoot(html);
		expect(root).toContain('data-variant="floating"');
		expect(root).toContain('data-position="bottom-left"');
		expect(root).not.toContain('data-blocking');
		// A choice prompt is non-blocking by default, so the card is a labelled
		// region that never claims modal semantics.
		expect(readCard(html)).not.toContain('aria-modal');
		expect(readCard(html)).toContain('role="region"');
	});

	it('renders a choice as a region when the host turns the focus trap off', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [testRule] }),
				presentation: { prompt: { trapFocus: false } },
			})
		);
		expect(readCard(html)).not.toContain('aria-modal');
		expect(readCard(html)).toContain('role="region"');
	});

	it('renders a blocking choice as a modal dialog', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [testRule] }),
				presentation: { prompt: { blocking: true } },
			})
		);
		expect(readRoot(html)).toContain('data-blocking="true"');
		expect(readCard(html)).toContain('aria-modal="true"');
		expect(readCard(html)).toContain('role="dialog"');
	});

	it('keeps the default and host corners for right-to-left text', async () => {
		const defaulted = await render(
			await buildLocals(
				{ mode: testingMode({ policy: [testRule] }) },
				{ 'accept-language': 'he' }
			)
		);
		expect(readRoot(defaulted)).toContain('dir="rtl"');
		expect(readRoot(defaulted)).toContain('data-position="bottom-left"');

		const kept = await render(
			await buildLocals(
				{
					mode: testingMode({ policy: [testRule] }),
					presentation: { prompt: { position: 'top-left' } },
				},
				{ 'accept-language': 'he' }
			)
		);
		expect(readRoot(kept)).toContain('data-position="top-left"');
	});

	it('renders a notice as a bottom bar when the host asks for one', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [noticeRule] }),
				presentation: { prompt: { variant: 'bar' } },
			})
		);
		const root = readRoot(html);
		expect(root).toContain('data-variant="bar"');
		expect(root).toContain('data-position="bottom"');
		expect(root).not.toContain('data-blocking');
	});

	it('renders a wall as a blocking modal with an overlay', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [testRule] }),
				presentation: { prompt: { variant: 'wall' } },
			})
		);
		const root = readRoot(html);
		expect(root).toContain('data-variant="wall"');
		expect(root).toContain('data-position="center"');
		expect(root).toContain('data-blocking="true"');
		expect(html).toContain('data-testid="consent-banner-overlay"');
		expect(html.indexOf('consent-banner-overlay')).toBeLessThan(
			html.indexOf('consent-banner-root')
		);
		expect(readCard(html)).toContain('aria-modal="true"');
		expect(readCard(html)).toContain('role="dialog"');
	});

	it('never blocks a notice, even when the host asks', async () => {
		const html = await render(
			await buildLocals({
				mode: testingMode({ policy: [noticeRule] }),
				presentation: { prompt: { blocking: true } },
			})
		);
		expect(readRoot(html)).not.toContain('data-blocking');
		expect(html).not.toContain('data-testid="consent-banner-overlay"');
	});
});

describe('<ConsentBanner /> under a none rule', () => {
	/** A regime with no consent law: permitted by default, nothing owed. */
	const noneRule = {
		id: 'astro_world_none',
		match: { isDefault: true },
		model: 'none',
		prompt: 'none',
	} as const;
	const noneLocals = (rights?: ('preferences' | 'disclosure')[]) =>
		buildLocals(
			{
				mode: testingMode({
					policy: [rights ? { ...noneRule, rights } : noneRule],
				}),
			},
			{ 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'SD' }
		);

	it('grants every category and renders no surface when no rights are owed', async () => {
		const locals = await noneLocals();
		expect(locals.decision.status).toBe('matched');
		expect(locals.snapshot.policyRule.model).toBe('none');
		expect(locals.snapshot.effectivePermissions.marketing).toBe(true);
		expect(locals.snapshot.effectivePermissions.measurement).toBe(true);
		expect(locals.hasPolicy).toBe(true);
		expect(locals.hasConsentUi).toBe(false);

		const html = await render(locals, { force: true });
		expect(html).not.toContain('data-testid="consent-banner-root"');

		const trigger = await container.renderToString(ConsentDialogLink, {
			locals: { inth: locals },
		});
		expect(
			/<[^>]*data-testid="consent-dialog-trigger"[^>]*>/u.exec(trigger)?.[0]
		).toContain('hidden');
	});

	it('keeps the trigger when the rule grants the preferences right', async () => {
		const locals = await noneLocals(['preferences']);
		expect(locals.hasConsentUi).toBe(true);
		// No prompt, so the server does not decide to show a banner.
		expect(locals.shouldShowBanner).toBe(false);
		const html = await render(locals);
		expect(html).not.toContain('data-testid="consent-banner-root"');

		const trigger = await container.renderToString(ConsentDialogLink, {
			locals: { inth: locals },
		});
		expect(
			/<[^>]*data-testid="consent-dialog-trigger"[^>]*>/u.exec(trigger)?.[0]
		).not.toContain('hidden');
	});
});

describe('<ConsentDialog />', () => {
	it('carries its legalLinks to the island on the host element', async () => {
		const withLinks = await container.renderToString(ConsentDialog, {
			props: { legalLinks: ['privacyPolicy', 'termsOfService'] },
		});
		expect(withLinks).toContain(
			'data-legal-links="privacyPolicy termsOfService"'
		);

		const without = await container.renderToString(ConsentDialog, {});
		expect(without).not.toContain('data-legal-links');
	});
});
