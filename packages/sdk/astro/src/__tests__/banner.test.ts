import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import ConsentDialogLink from '../components/panel-link.astro';
import ConsentDialog from '../components/panel.astro';
import ConsentBanner from '../components/prompt.astro';
import { resolveOptions } from '../integration';
import type { InthAstroOptions, InthLocals } from '../inth-options.model';
import { hosted as hostedMode } from '../mode';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
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
 * class, so it is left out (`inline-styles.model.test.ts` covers it).
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
				arms: { bar: { prompt: { container: { type: 'banner' } } } },
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
		expect(html).toContain('data-placement="banner-bottom"');
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
		expect(german).not.toBe(english);
		expect(german).toContain('"language":"de"');
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
			{ legalLinks: ['privacyPolicy'] }
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
		const trigger = /<[^>]*data-testid="consent-dialog-link"[^>]*>/u.exec(
			hidden
		)?.[0];
		expect(trigger).toBeDefined();
		expect(trigger).toContain('hidden');
		expect(trigger).toContain('data-inth-surface="trigger"');

		const shown = await container.renderToString(ConsentDialogLink, {
			locals: { inth: await buildLocals() },
		});
		const visible = /<[^>]*data-testid="consent-dialog-link"[^>]*>/u.exec(
			shown
		)?.[0];
		expect(visible).toBeDefined();
		expect(visible).not.toContain('hidden');
	});

	it('labels a ConsentDialogLink without children with the dialog title, as React does', async () => {
		const locals = await buildLocals();
		const title =
			locals.snapshot.translations?.translations?.consentManagerDialog?.title;
		expect(title).toBeTruthy();
		const html = await container.renderToString(ConsentDialogLink, {
			locals: { inth: locals },
		});
		const label =
			/<button[^>]*data-testid="consent-dialog-link"[^>]*>(?<label>[^<]*)<\/button>/u.exec(
				html
			)?.groups?.label;
		expect(label).toBe(title);
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
			/<[^>]*data-testid="consent-dialog-link"[^>]*>/u.exec(trigger)?.[0]
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
			/<[^>]*data-testid="consent-dialog-link"[^>]*>/u.exec(trigger)?.[0]
		).not.toContain('hidden');
	});
});

describe('<ConsentDialogLink right="opt-out" />', () => {
	const optOutLocals = () =>
		buildLocals(
			{
				mode: testingMode({
					policy: [
						{
							...testRule,
							id: 'astro_us_opt_out',
							model: 'opt-out',
							prompt: 'none',
							rights: ['opt-out', 'preferences'],
						},
					],
				}),
				presentation: { optOutLink: 'privacy-choices' },
			},
			{ 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'CA' }
		);
	const icon = (html: string): Element | null =>
		new JSDOM(html).window.document.querySelector(
			'[data-testid="consent-dialog-link"] svg[aria-hidden="true"]'
		);

	it('sizes the CPPA icon, as <PrivacyChoicesLink /> does', async () => {
		const html = await container.renderToString(ConsentDialogLink, {
			locals: { inth: await optOutLocals() },
			props: { right: 'opt-out' },
		});
		// A page that loads no sheet sizing it would let it fill the line.
		expect(icon(html)?.getAttribute('height')).toBe('14');
		expect(icon(html)?.getAttribute('width')).toBe('30');
		expect(icon(html)?.getAttribute('class')).toContain(
			legalLinkStyles.optOutIcon
		);
	});

	it('leaves the icon unsized and unclassed under noStyle', async () => {
		const html = await container.renderToString(ConsentDialogLink, {
			locals: { inth: await optOutLocals() },
			props: { noStyle: true, right: 'opt-out' },
		});
		expect(icon(html)).not.toBeNull();
		expect(icon(html)?.hasAttribute('height')).toBe(false);
		expect(icon(html)?.hasAttribute('class')).toBe(false);
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

		// `null` is an empty list, so the Privacy Choices dialog can tell it
		// from no list and hide its footer link.
		const none = await container.renderToString(ConsentDialog, {
			props: { legalLinks: null },
		});
		expect(none).toMatch(/data-legal-links(?:="")?[\s>]/u);
	});
});
