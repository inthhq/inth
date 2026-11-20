import type { ConsentSnapshot } from '@inth/sdk/engine';
import { onDemandRuntimeModules } from '@inth/sdk/runtime/on-demand';
import {
	EARLY_TAP_ROOT,
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '@inth/sdk/runtime/page-globals';
import { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
import type { Theme } from '@inth/sdk/ui/theme';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { promptClassNames } from '../banner/class-names';
import { buildPrompt } from '../browser/render-prompt';
import { CONSENT_BOOT_ATTRIBUTE, startDeferredClient } from '../browser/shell';
import { boot, registerRuntimeModules } from '../client';
import type { AstroConsentClient } from '../client';
import * as reactPanelSurface from '../components/islands/panel-surface';
import * as vuePanelSurface from '../components/islands/panel-surface.vue';
import { resolveOptions } from '../integration';
import { snapshotFromConfig } from '../server';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions } from '../types';
import { registerDialogAdapter, registerDialogSurface } from '../ui/adapter';
import { reactDialogAdapter } from '../ui/react';
import { vueDialogAdapter } from '../ui/vue';
import '@inth/vue/vue-plugin';

import { testResolution, testRule } from './policy-fixture';
import { ISLAND_RENDER_TIMEOUT } from './react-dialog-island';

registerRuntimeModules(onDemandRuntimeModules);

const OPT_OUT_RULE = {
	...testRule,
	id: 'astro_us_ca',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

const cleanup: (() => Promise<void> | void)[] = [];

const resetEarlyTapGlobals = (): void => {
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const host = window as unknown as Record<
		string,
		{ stop?: () => void } | undefined
	>;
	host[EARLY_TAPS_WINDOW_KEY]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
};

beforeAll(() => {
	window.matchMedia ??= (query: string) =>
		({
			addEventListener: () => undefined,
			addListener: () => undefined,
			dispatchEvent: () => false,
			matches: false,
			media: query,
			onchange: null,
			removeEventListener: () => undefined,
			removeListener: () => undefined,
		}) as MediaQueryList;
});

afterEach(async () => {
	for (const step of cleanup.splice(0).reverse()) {
		// oxlint-disable-next-line no-await-in-loop -- Tear down in reverse mount order.
		await step();
	}
	resetEarlyTapGlobals();
	(window as unknown as Record<string, unknown>).__inthAstroConfig = undefined;
	localStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
		}
	}
});

const mountBannerAndClient = (
	ui: 'react' | 'vue',
	options: Partial<InthAstroOptions> = {},
	rule: typeof OPT_OUT_RULE | typeof testRule = OPT_OUT_RULE
): AstroConsentClient => {
	if (ui === 'react') {
		registerDialogAdapter('react', () => Promise.resolve(reactDialogAdapter));
		registerDialogSurface('react', () => Promise.resolve(reactPanelSurface));
	} else {
		registerDialogAdapter('vue', () => Promise.resolve(vueDialogAdapter));
		registerDialogSurface('vue', () => Promise.resolve(vuePanelSurface));
	}

	(window as unknown as Record<string, unknown>).__inthAstroConfig = {
		initialPolicyResolution: testResolution(rule),
		initialRecords: {},
		initialTranslations: { language: 'en', translations: {} },
		now: Date.now(),
	};
	const resolved = resolveOptions({
		consentCategories: ['necessary', 'measurement', 'marketing'],
		disableAnimation: true,
		mode: testingMode({ policy: [rule] }),
		ui,
		...options,
	});
	const client = boot(resolved);
	const nodes = buildPrompt(
		client.getConsent(),
		{ classNames: promptClassNames, props: { disableAnimation: true } },
		resolved
	);
	for (const node of nodes) {
		node.hidden = false;
		document.body.append(node);
		cleanup.push(() => node.remove());
	}
	cleanup.push(() => {
		client.dispose();
		document.getElementById('inth-dialog-host')?.remove();
	});
	return client;
};

describe.each(['react', 'vue'] as const)(
	'one-step opt-out confirmation on the %s island',
	(ui) => {
		it('records the opt-out in one click, shows the confirmation view, closes on Done/Escape, and opens preferences', async () => {
			const theme: Theme = {
				slots: {
					optOutConfirmationCard: 'brand-opt-out-card',
					optOutConfirmationStatus: 'brand-opt-out-status',
				},
			};
			const client = mountBannerAndClient(ui, { theme });

			const bannerLink = document.querySelector<HTMLButtonElement>(
				'[data-testid="consent-banner-right-link-opt-out"]'
			);
			expect(bannerLink).not.toBeNull();
			bannerLink?.click();

			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="opt-out-confirmation-root"]')
					).not.toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);

			const snapshot = client.getConsent();
			expect(snapshot.optOut).toMatchObject({ method: 'button' });
			expect(snapshot.effectivePermissions.marketing).toBe(false);
			expect(snapshot.effectivePermissions.measurement).toBe(false);

			const card = document.querySelector(
				'[data-testid="opt-out-confirmation-card"]'
			);
			const status = document.querySelector(
				'[data-testid="opt-out-confirmation-status"]'
			);
			const done = document.querySelector<HTMLButtonElement>(
				'[data-testid="opt-out-confirmation-done-button"]'
			);
			expect(card?.classList).toContain('brand-opt-out-card');
			expect(status?.classList).toContain('brand-opt-out-status');
			expect(status?.getAttribute('role')).toBe('status');
			expect(status?.textContent).toContain('Opt-out request honored');
			expect(card?.querySelectorAll('button')).toHaveLength(1);
			expect(done).not.toBeNull();

			// Close via Done.
			done?.click();
			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="opt-out-confirmation-root"]')
					).toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);

			// Re-open via a persistent footer opt-out link when already opted out:
			// records nothing new and returns focus to that link on Done.
			const recordedAt = client.getConsent().optOut?.recordedAt;
			const footerLink = document.createElement('button');
			footerLink.type = 'button';
			footerLink.setAttribute('data-inth-action', 'opt-out');
			footerLink.setAttribute('data-right', 'opt-out');
			footerLink.textContent = 'Do Not Sell or Share My Personal Information';
			document.body.append(footerLink);
			cleanup.push(() => footerLink.remove());

			footerLink.focus();
			footerLink.click();

			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="opt-out-confirmation-root"]')
					).not.toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);
			expect(client.getConsent().optOut?.recordedAt).toBe(recordedAt);

			document
				.querySelector<HTMLButtonElement>(
					'[data-testid="opt-out-confirmation-done-button"]'
				)
				?.click();
			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="opt-out-confirmation-root"]')
					).toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);
			expect(document.activeElement).toBe(footerLink);

			// Escape closes the confirmation view.
			footerLink.click();
			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="opt-out-confirmation-root"]')
					).not.toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);
			document.dispatchEvent(
				new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
			);
			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="opt-out-confirmation-root"]')
					).toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);

			// Preferences link opens the full preference dialog.
			footerLink.click();
			await vi.waitFor(
				() =>
					expect(
						document.querySelector(
							'[data-testid="opt-out-confirmation-preferences-link"]'
						)
					).not.toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);
			document
				.querySelector<HTMLElement>(
					'[data-testid="opt-out-confirmation-preferences-link"]'
				)
				?.click();
			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="consent-dialog-root"]')
					).not.toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);
			expect(
				document.querySelector('[data-testid="opt-out-confirmation-root"]')
			).toBeNull();
		});

		it('opens the preference dialog instead of opting out under a non-opt-out rule', async () => {
			const client = mountBannerAndClient(ui, {}, testRule);
			const footerLink = document.createElement('button');
			footerLink.type = 'button';
			footerLink.setAttribute('data-inth-action', 'opt-out');
			footerLink.textContent = 'Do Not Sell or Share My Personal Information';
			document.body.append(footerLink);
			cleanup.push(() => footerLink.remove());

			footerLink.click();

			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="consent-dialog-root"]')
					).not.toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);
			expect(client.getConsent().optOut).toBeNull();
			expect(
				document.querySelector('[data-testid="opt-out-confirmation-root"]')
			).toBeNull();
		});
	}
);

describe('browser-rendered banner optOutLink variants', () => {
	const renderLinkFor = (
		variant: 'do-not-sell' | 'privacy-choices' | 'california-privacy-choices'
	) => {
		const resolved = resolveOptions({
			consentCategories: ['necessary', 'measurement', 'marketing'],
			mode: testingMode({ policy: [OPT_OUT_RULE] }),
			presentation: { optOutLink: variant },
		});
		const snapshot = snapshotFromConfig({
			consentCategories: resolved.consentCategories,
			initialPolicyResolution: testResolution(OPT_OUT_RULE),
			initialRecords: {},
			initialTranslations: { language: 'en', translations: {} },
			now: Date.now(),
		});
		const [root] = buildPrompt(
			snapshot,
			{ classNames: promptClassNames, props: {} },
			resolved
		);
		return root?.querySelector(
			'[data-testid="consent-banner-right-link-opt-out"]'
		);
	};

	it('renders the default do-not-sell title without an icon', () => {
		const link = renderLinkFor('do-not-sell');
		expect(link?.getAttribute('data-inth-action')).toBe('opt-out');
		expect(link?.getAttribute('data-opt-out-variant')).toBe('do-not-sell');
		expect(link?.textContent).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		expect(link?.querySelector('svg')).toBeNull();
	});

	it.each([
		['privacy-choices', 'Your Privacy Choices'],
		['california-privacy-choices', 'Your California Privacy Choices'],
	] as const)(
		'renders %s with its title and decorative CPPA icon',
		(variant, title) => {
			const link = renderLinkFor(variant);
			expect(link?.getAttribute('data-inth-action')).toBe('opt-out');
			expect(link?.getAttribute('data-opt-out-variant')).toBe(
				'privacy-choices'
			);
			expect(link?.textContent).toBe(title);
			const svg = link?.querySelector('svg');
			expect(svg).not.toBeNull();
			expect(svg?.getAttribute('aria-hidden')).toBe('true');
		}
	);
});

describe('early tap replay for the opt-out link', () => {
	it('replays a tap recorded before the shell boots as a durable opt-out', async () => {
		registerDialogAdapter('react', () => Promise.resolve(reactDialogAdapter));
		registerDialogSurface('react', () => Promise.resolve(reactPanelSurface));

		const options = resolveOptions({
			consentCategories: ['necessary', 'measurement', 'marketing'],
			disableAnimation: true,
			mode: testingMode({ policy: [OPT_OUT_RULE] }),
			ui: 'react',
		});
		const config = {
			initialPolicyResolution: testResolution(OPT_OUT_RULE),
			initialRecords: {},
			initialTranslations: { language: 'en', translations: {} },
			now: Date.now(),
		};
		const snapshot: ConsentSnapshot = snapshotFromConfig({
			...config,
			consentCategories: options.consentCategories,
		});

		const configBlock = document.createElement('script');
		configBlock.type = 'application/json';
		configBlock.setAttribute('data-inth-config', '');
		configBlock.textContent = JSON.stringify(config);
		document.body.append(configBlock);
		cleanup.push(() => configBlock.remove());

		const bootBlock = document.createElement('script');
		bootBlock.type = 'application/json';
		bootBlock.setAttribute(CONSENT_BOOT_ATTRIBUTE, '');
		bootBlock.textContent = JSON.stringify({ d: false, s: snapshot });
		document.body.append(bootBlock);
		cleanup.push(() => bootBlock.remove());

		const [banner] = buildPrompt(
			snapshot,
			{ classNames: promptClassNames, props: { disableAnimation: true } },
			options
		);
		if (!banner) {
			throw new Error('Expected banner node');
		}
		banner.hidden = false;
		document.body.append(banner);
		cleanup.push(() => banner.remove());
		expect(document.querySelector(EARLY_TAP_ROOT)).toBe(banner);

		// Run the inline early-tap script and click the opt-out link before boot.
		// oxlint-disable-next-line eslint/no-new-func, typescript/no-implied-eval -- Exercises the inline script string.
		new Function(EARLY_CONSENT_TAP_SCRIPT)();
		const link = banner.querySelector<HTMLButtonElement>(
			'[data-testid="consent-banner-right-link-opt-out"]'
		);
		link?.click();
		expect(document.getElementById(EARLY_TAP_STYLE_ID)).not.toBeNull();

		const client = startDeferredClient(options, () =>
			Promise.resolve({ boot })
		);
		cleanup.push(() => {
			client?.dispose();
			document.getElementById('inth-dialog-host')?.remove();
		});

		await vi.waitFor(() => {
			expect(client?.getConsent().optOut).toMatchObject({ method: 'button' });
			expect(
				document.querySelector('[data-testid="opt-out-confirmation-root"]')
			).not.toBeNull();
		}, ISLAND_RENDER_TIMEOUT);
		expect(client?.getConsent().effectivePermissions.marketing).toBe(false);
		expect(client?.getConsent().effectivePermissions.measurement).toBe(false);
		expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull();
	});
});
