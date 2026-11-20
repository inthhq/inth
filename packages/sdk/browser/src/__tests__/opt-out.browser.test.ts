/**
 * Real-browser checks for the opt-out confirmation view and preference-centre
 * opt-out status and GPC locks: layout, light and dark themes, motion, focus
 * restoration, and real pointer/keyboard interaction.
 */
import { clearBrowserConsentStorage } from '@inth/conformance/suite';
import { policyRulePresets } from '@inth/sdk-core';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestingConsentClient } from '../testing-global';
import type { ConsentClient, ConsentUIOptions } from '../types';
import { mountConsentUI } from '../ui/mount';

const clients: ConsentClient[] = [];

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	clearBrowserConsentStorage();
	document.body.replaceChildren();
});

const startClient = async function startClient(options: {
	gpc?: boolean;
	ui?: ConsentUIOptions;
}): Promise<ConsentClient> {
	const client = createTestingConsentClient(
		{
			consentCategories: ['functionality', 'marketing', 'measurement'],
			overrides: { country: 'US', gpc: options.gpc ?? false, region: 'CA' },
			policy: [
				{
					...policyRulePresets.usPrivacyStatesOptOut(),
					prompt: 'notice',
				},
			],
			ui: { colorScheme: 'light', disableAnimation: true, ...options.ui },
		},
		{ mountUI: mountConsentUI, pkg: '@inth/sdk/test' }
	);
	clients.push(client);
	client.start();
	await client.ready();
	return client;
};

describe('opt-out UI in Chromium', () => {
	it('renders the confirmation view in light and dark themes with zero animations when disabled', async () => {
		const light = await startClient({
			ui: { colorScheme: 'light', disableAnimation: true },
		});
		void light.optOut();
		const lightRoot = light.ui?.root;
		await expect
			.poll(() =>
				lightRoot?.querySelector<HTMLElement>(
					'[data-testid="opt-out-confirmation-card"]'
				)
			)
			.toBeTruthy();
		const lightCard = lightRoot?.querySelector<HTMLElement>(
			'[data-testid="opt-out-confirmation-card"]'
		) as HTMLElement;
		const lightRect = lightCard.getBoundingClientRect();
		expect(lightRect.width).toBeGreaterThan(200);
		expect(lightRect.height).toBeGreaterThan(100);
		const lightBg = getComputedStyle(lightCard).backgroundColor;
		expect(lightCard.getAnimations()).toEqual([]);
		light.dispose();
		clearBrowserConsentStorage();

		const dark = await startClient({
			ui: { colorScheme: 'dark', disableAnimation: true },
		});
		void dark.optOut();
		const darkRoot = dark.ui?.root;
		await expect
			.poll(() =>
				darkRoot?.querySelector<HTMLElement>(
					'[data-testid="opt-out-confirmation-card"]'
				)
			)
			.toBeTruthy();
		const darkCard = darkRoot?.querySelector<HTMLElement>(
			'[data-testid="opt-out-confirmation-card"]'
		) as HTMLElement;
		const darkBg = getComputedStyle(darkCard).backgroundColor;
		expect(darkBg).not.toBe(lightBg);
	});

	it('moves focus into the confirmation view on open and returns it to the triggering link on Done', async () => {
		const link = document.createElement('button');
		link.type = 'button';
		link.setAttribute('data-inth-action', 'opt-out');
		link.textContent = 'Do Not Sell or Share My Personal Information';
		document.body.append(link);

		const client = await startClient({
			ui: { colorScheme: 'light', disableAnimation: true },
		});
		const root = client.ui?.root as ShadowRoot;

		link.focus();
		expect(document.activeElement).toBe(link);
		link.click();

		await expect
			.poll(() =>
				root.querySelector<HTMLButtonElement>(
					'[data-testid="opt-out-confirmation-done-button"]'
				)
			)
			.toBeTruthy();
		const doneButton = root.querySelector<HTMLButtonElement>(
			'[data-testid="opt-out-confirmation-done-button"]'
		) as HTMLButtonElement;
		await expect.poll(() => root.activeElement).toBe(doneButton);

		doneButton.click();
		await expect
			.poll(() =>
				root.querySelector('[data-testid="opt-out-confirmation-root"]')
			)
			.toBeNull();
		await expect.poll(() => document.activeElement).toBe(link);
	});

	it('renders the GPC status line and disabled switches in the preference dialog', async () => {
		const client = await startClient({
			gpc: true,
			ui: { colorScheme: 'dark', disableAnimation: true },
		});
		client.openDialog();
		const root = client.ui?.root as ShadowRoot;

		await expect
			.poll(() =>
				root.querySelector<HTMLElement>(
					'[data-testid="consent-widget-opt-out-status"]'
				)
			)
			.toBeTruthy();
		const status = root.querySelector<HTMLElement>(
			'[data-testid="consent-widget-opt-out-status"]'
		) as HTMLElement;
		expect(status.textContent).toBe('Opt-out preference signal honored');
		expect(status.getBoundingClientRect().height).toBeGreaterThan(20);

		const marketing = root.querySelector<HTMLButtonElement>(
			'[data-testid="consent-widget-switch-marketing"]'
		) as HTMLButtonElement;
		expect(marketing.disabled).toBe(true);
		expect(marketing.getAttribute('aria-checked')).toBe('false');
		marketing.click();
		expect(marketing.getAttribute('aria-checked')).toBe('false');
	});
});
