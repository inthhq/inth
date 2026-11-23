import { createConsentKernel } from '@inth/sdk/engine';
/**
 * Server-render contract for the consent banner.
 *
 * Runs in the `ssr` vitest project (node environment, `svelte`/`node`
 * resolve conditions) so `render()` from `svelte/server` receives
 * server-compiled components. The client project resolves `browser` and
 * would hand it client-compiled output, which throws `effect_orphan`.
 */
import type { ConsentPresentation, KernelConfig } from '@inth/sdk/engine';
import { resolvePolicyRules } from '@inth/sdk/schema/types';
import { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
import { render } from 'svelte/server';
import { describe, expect, test } from 'vitest';

import InthProvider from '../lib/components/inth-provider.svelte';
import { testing } from '../lib/testing';
import type { ConsentManagerOptions } from '../lib/consent-manager-options.model';
import BannerFixture from './fixtures/banner-fixture.svelte';

const BANNER_POLICY = resolvePolicyRules({
	countryCode: null,
	regionCode: null,
	rules: [
		{
			categories: ['marketing', 'measurement'],
			id: 'ssr_policy',
			match: { fallback: true },
			model: 'opt-in',
			prompt: 'choice',
			scopeMode: 'permissive',
		},
	],
});
const savedKernel = createConsentKernel({
	consentCategories: ['marketing', 'measurement'],
	initialPolicyResolution: BANNER_POLICY,
	now: Date.now(),
});
await savedKernel.commands.save('all');
const RETURNING_RECORDS = {
	choice: savedKernel.getSnapshot().explicitChoice,
	now: Date.now(),
};
savedKernel.dispose();

const buildOptions = function buildOptions(
	prefetch: KernelConfig,
	presentation?: ConsentPresentation
): ConsentManagerOptions {
	return {
		mode: testing(),
		persistence: false,
		prefetch,
		presentation,
	} as ConsentManagerOptions;
};

const renderBanner = function renderBanner(
	prefetch: KernelConfig,
	presentation?: ConsentPresentation
): string {
	return render(BannerFixture, {
		props: { options: buildOptions(prefetch, presentation) },
	}).body;
};
const rootTag = function rootTag(html: string): string | undefined {
	return /<div[^>]*data-testid="consent-banner-root"[^>]*>/u.exec(html)?.[0];
};
const NOTICE_POLICY = resolvePolicyRules({
	countryCode: null,
	regionCode: null,
	rules: [
		{
			id: 'notice',
			match: { fallback: true },
			model: 'opt-out',
			prompt: 'notice',
		},
	],
});

describe('consent banner SSR', () => {
	test('renders the banner shell when the prefetched policy says to show it', () => {
		const html = renderBanner({ initialPolicyResolution: BANNER_POLICY });

		expect(html).toContain('data-testid="consent-banner-root"');
		expect(html).toContain('data-testid="consent-banner-accept-button"');
	});

	test('renders in its final visible state, not the pre-animation one', () => {
		const html = renderBanner({ initialPolicyResolution: BANNER_POLICY });
		// Assert against the whole opening tag rather than a bare substring, so
		// an attribute landing on some other element cannot pass this by
		// accident.
		const tag = rootTag(html);

		expect(tag).toBeDefined();
		expect(tag).toMatch(/data-state="open"/u);
		expect(tag).not.toMatch(/data-state="closed"/u);
	});

	test('names its stylesheets in <head> for inthHandle to inline', () => {
		const { head } = render(BannerFixture, {
			props: {
				options: {
					...buildOptions({ initialPolicyResolution: BANNER_POLICY }),
					nonce: 'page-nonce',
				},
			},
		});

		expect(head).toContain(
			'<meta name="inth-styles" content="inth-tokens inth-button inth-surface inth-card nonce=page-nonce"'
		);
	});

	test('puts the early-tap script before the banner, with the nonce', () => {
		const { body } = render(BannerFixture, {
			props: {
				options: {
					...buildOptions({ initialPolicyResolution: BANNER_POLICY }),
					nonce: 'page-nonce',
				},
			},
		});

		const script = body.indexOf(
			'<script data-inth-early-tap nonce="page-nonce">'
		);
		expect(script).toBeGreaterThan(-1);
		expect(body).toContain(EARLY_CONSENT_TAP_SCRIPT);
		expect(script).toBeLessThan(body.indexOf('consent-banner-root'));
	});

	test('names no stylesheet with `styles: false`', () => {
		const { head, body } = render(BannerFixture, {
			props: {
				options: {
					...buildOptions({ initialPolicyResolution: BANNER_POLICY }),
					styles: false,
				},
			},
		});

		expect(body).toContain('data-testid="consent-banner-root"');
		expect(head).not.toContain('inth-styles');
	});

	test('renders nothing for a returning visitor', () => {
		const html = renderBanner({
			initialPolicyResolution: BANNER_POLICY,
			initialRecords: RETURNING_RECORDS,
			now: Date.now(),
		});

		expect(html).not.toContain('data-testid="consent-banner-root"');
	});

	test('renders nothing without a prefetch — the policy is still unresolved', () => {
		const html = renderBanner({});

		expect(html).not.toContain('data-testid="consent-banner-root"');
	});

	test('renders nothing when the policy asks for no surface', () => {
		const html = renderBanner({
			initialPolicyResolution: resolvePolicyRules({
				countryCode: null,
				regionCode: null,
				rules: [
					{
						id: 'none',
						match: { fallback: true },
						model: 'opt-out',
						prompt: 'none',
					},
				],
			}),
		});

		expect(html).not.toContain('data-testid="consent-banner-root"');
	});

	test('puts real copy and real actions in the first HTML', () => {
		const html = renderBanner({ initialPolicyResolution: BANNER_POLICY });

		// Not a placeholder shell: the resolved title and the policy's own
		// allowed actions are already painted before any JS runs.
		expect(html).toContain('We value your privacy');
		expect(html).toContain('data-action="reject"');
		expect(html).toContain('data-action="accept"');
		expect(html).toContain('data-action="customize"');
	});

	test('paints the notice rights and dismiss in the first HTML', () => {
		const html = renderBanner({ initialPolicyResolution: NOTICE_POLICY });
		const tag = rootTag(html);

		expect(tag).toMatch(/data-variant="notice"/u);
		expect(html).toContain('data-testid="consent-banner-right-link-opt-out"');
		expect(html).toContain('data-action="dismiss"');
		expect(html.indexOf('consent-banner-right-link-opt-out')).toBeLessThan(
			html.indexOf('data-action="dismiss"')
		);
		expect(html).not.toContain('data-action="accept"');
	});

	test('marks a choice prompt on the root', () => {
		const tag = rootTag(
			renderBanner({ initialPolicyResolution: BANNER_POLICY })
		);

		expect(tag).toMatch(/data-variant="choice"/u);
	});

	test('paints the resolved container in the first HTML', () => {
		const choiceTag = rootTag(
			renderBanner({ initialPolicyResolution: BANNER_POLICY })
		);
		expect(choiceTag).toMatch(/data-placement="card-start"/u);
		expect(choiceTag).not.toMatch(/data-blocking/u);

		const noticeTag = rootTag(
			renderBanner({ initialPolicyResolution: NOTICE_POLICY })
		);
		expect(noticeTag).toMatch(/data-placement="card-start"/u);
		expect(noticeTag).not.toMatch(/data-blocking/u);

		const bannerTag = rootTag(
			renderBanner(
				{ initialPolicyResolution: NOTICE_POLICY },
				{ prompt: { container: { edge: 'bottom', type: 'banner' } } }
			)
		);
		expect(bannerTag).toMatch(/data-placement="banner-bottom"/u);
	});

	test('[BNR-13] a centred Card paints its backdrop and modal state on the server', () => {
		const html = renderBanner(
			{ initialPolicyResolution: BANNER_POLICY },
			{ prompt: { container: { position: 'center', type: 'card' } } }
		);
		const tag = rootTag(html);

		expect(tag).toMatch(/data-placement="card-center"/u);
		expect(tag).toMatch(/data-blocking="true"/u);
		expect(html).toContain('data-testid="consent-banner-overlay"');
		expect(html).toMatch(
			/aria-modal="true"[^>]*data-testid="consent-banner-shell"/u
		);
	});

	test('the provider alone renders no banner', () => {
		const html = render(InthProvider, {
			props: {
				options: buildOptions({ initialPolicyResolution: BANNER_POLICY }),
			},
		}).body;

		expect(html).not.toContain('consent-banner-root');
	});
});
