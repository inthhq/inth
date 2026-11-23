/**
 * Real-browser checks for the opt-out confirmation, which opens "Your
 * Privacy Choices" on its receipt, and for the dialog's GPC lock: layout,
 * light and dark themes, motion, focus restoration, and real
 * pointer/keyboard interaction.
 */
import { clearBrowserConsentStorage } from '@inth/conformance/suite';
import {
	OPT_OUT_CONFIRMATION_STORAGE_KEY,
	policyRulePresets,
} from '@inth/sdk-core';
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
	sessionStorage.clear();
	document.body.replaceChildren();
});

const startClient = async function startClient(options: {
	gpc?: boolean;
	reloadOnConsentRevoked?: boolean;
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
			reloadOnConsentRevoked: options.reloadOnConsentRevoked ?? false,
			ui: { colorScheme: 'light', disableAnimation: true, ...options.ui },
		},
		{ mountUI: mountConsentUI, pkg: '@inth/sdk/test' }
	);
	clients.push(client);
	client.start();
	await client.ready();
	return client;
};

const byTestId = <ElementType extends HTMLElement = HTMLElement>(
	client: ConsentClient,
	testId: string
): ElementType | null =>
	client.ui?.root.querySelector<ElementType>(`[data-testid="${testId}"]`) ??
	null;

/** The receipt the opt-out confirmation opens the dialog on. */
const openReceipt = (client: ConsentClient): HTMLElement | null => {
	const receipt = byTestId(client, 'consent-dialog-receipt');
	return receipt?.getAttribute('data-open') === 'true' ? receipt : null;
};

describe('opt-out UI in Chromium', () => {
	it('renders the confirmation dialog in light and dark themes with zero animations when disabled', async () => {
		const light = await startClient({
			ui: { colorScheme: 'light', disableAnimation: true },
		});
		void light.optOut();
		await expect.poll(() => openReceipt(light)).toBeTruthy();
		const lightCard = byTestId(light, 'consent-dialog-card') as HTMLElement;
		const lightRect = lightCard.getBoundingClientRect();
		expect(lightRect.width).toBeGreaterThan(200);
		expect(lightRect.height).toBeGreaterThan(100);
		const lightBg = getComputedStyle(lightCard).backgroundColor;
		expect(lightCard.getAnimations()).toEqual([]);
		expect(byTestId(light, 'opt-out-confirmation-root')).toBeNull();
		light.dispose();
		clearBrowserConsentStorage();

		const dark = await startClient({
			ui: { colorScheme: 'dark', disableAnimation: true },
		});
		void dark.optOut();
		await expect.poll(() => openReceipt(dark)).toBeTruthy();
		const darkCard = byTestId(dark, 'consent-dialog-card') as HTMLElement;
		const darkBg = getComputedStyle(darkCard).backgroundColor;
		expect(darkBg).not.toBe(lightBg);
	});

	it('moves focus to the receipt on open and returns it to the triggering link on Done', async () => {
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

		await expect.poll(() => openReceipt(client)).toBeTruthy();
		const receipt = openReceipt(client) as HTMLElement;
		await expect.poll(() => root.activeElement).toBe(receipt);
		expect(receipt.textContent).toMatch(/opted out/iu);

		const doneButton = byTestId<HTMLButtonElement>(
			client,
			'consent-dialog-done'
		) as HTMLButtonElement;
		doneButton.click();
		await expect.poll(() => byTestId(client, 'consent-dialog-card')).toBeNull();
		await expect.poll(() => document.activeElement).toBe(link);
	});

	it('[GPC-03] renders the GPC note and a disabled Allow in the preference dialog', async () => {
		const client = await startClient({
			gpc: true,
			ui: { colorScheme: 'dark', disableAnimation: true },
		});
		client.openDialog();

		await expect
			.poll(() => byTestId(client, 'consent-dialog-rights-row-sale'))
			.toBeTruthy();
		const row = byTestId(
			client,
			'consent-dialog-rights-row-sale'
		) as HTMLElement;
		expect(row.textContent).toMatch(/Global Privacy Control signal/u);
		expect(row.getBoundingClientRect().height).toBeGreaterThan(20);
		expect(byTestId(client, 'consent-dialog-receipt')?.textContent).toContain(
			'Honoring Global Privacy Control from this browser'
		);

		const allow = byTestId<HTMLButtonElement>(
			client,
			'consent-dialog-right-option-sale-allow'
		) as HTMLButtonElement;
		const protect = byTestId<HTMLButtonElement>(
			client,
			'consent-dialog-right-option-sale-protect'
		) as HTMLButtonElement;
		expect(allow.getAttribute('aria-disabled')).toBe('true');
		expect(allow.getAttribute('aria-pressed')).toBe('false');
		expect(protect.getAttribute('aria-pressed')).toBe('true');
		allow.click();
		expect(allow.getAttribute('aria-pressed')).toBe('false');
		expect(protect.getAttribute('aria-pressed')).toBe('true');
		expect(
			byTestId(client, 'consent-dialog-confirm')
				?.closest('[data-open]')
				?.getAttribute('data-open')
		).toBe('false');
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	it('shows the confirmation once on the next load after a reload and not on the load after that', async () => {
		const first = await startClient({
			reloadOnConsentRevoked: false,
			ui: { colorScheme: 'light', disableAnimation: true },
		});
		await first.optOut();
		await expect.poll(() => openReceipt(first)).toBeTruthy();
		// Wait for persistence to store the opt-out record before tearing down.
		await expect.poll(() => localStorage.getItem('inth-opt-out')).toBeTruthy();
		first.dispose();

		// Simulate the post-reload document carrying the session marker.
		sessionStorage.setItem(OPT_OUT_CONFIRMATION_STORAGE_KEY, '1');
		const second = await startClient({
			reloadOnConsentRevoked: true,
			ui: { colorScheme: 'light', disableAnimation: true },
		});
		const secondRoot = second.ui?.root as ShadowRoot;
		await expect.poll(() => openReceipt(second)).toBeTruthy();
		const receipt = openReceipt(second) as HTMLElement;
		expect(receipt.textContent).toMatch(/opted out/iu);
		await expect.poll(() => secondRoot.activeElement).toBe(receipt);
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
		second.dispose();

		// Third load: marker was cleared, so confirmation does not open again.
		const third = await startClient({
			reloadOnConsentRevoked: true,
			ui: { colorScheme: 'light', disableAnimation: true },
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 30);
		});
		expect(byTestId(third, 'consent-dialog-root')).toBeNull();
		expect(third.getSnapshot().activeUI).not.toBe('dialog');
	});
});
