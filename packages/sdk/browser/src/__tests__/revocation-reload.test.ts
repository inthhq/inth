import {
	OPT_OUT_CONFIRMATION_STORAGE_KEY,
	policyRulePresets,
} from '@inth/sdk-core';
import type * as Core from '@inth/sdk-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestingConsentClient as createConsentClient } from '../testing-global';
import type { ConsentClient, ConsentUIHandle } from '../types';
import { mountConsentUI } from '../ui/mount';

const reload = vi.hoisted(() => vi.fn());
// oxlint-disable-next-line anti-slop/no-module-mocking -- jsdom cannot perform navigation on `window.location.reload`. The factory returns the real module and records the reload instead.
vi.mock('@inth/sdk-core', async (importOriginal) => {
	const actual = await importOriginal<typeof Core>();
	return {
		...actual,
		watchRevocationReload: (options: Core.RevocationReloadOptions) =>
			actual.watchRevocationReload({ ...options, reload }),
	};
});

const clients: ConsentClient[] = [];

const clearCookies = function clearCookies(): void {
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

const optOutNoticePolicy = [
	{
		...policyRulePresets.usPrivacyStatesOptOut(),
		prompt: 'notice' as const,
	},
];

const startClient = async function startClient(
	options: Parameters<typeof createConsentClient>[0] = {}
): Promise<{ client: ConsentClient; root: ParentNode }> {
	const client = createConsentClient(
		{
			consentCategories: ['functionality', 'marketing', 'measurement'],
			overrides: { country: 'US', region: 'CA' },
			policy: optOutNoticePolicy,
			ui: { disableAnimation: true, styles: false },
			...options,
		},
		{ mountUI: mountConsentUI, pkg: '@inth/sdk/test' }
	);
	clients.push(client);
	client.start();
	await client.ready();
	return { client, root: (client.ui as ConsentUIHandle).root };
};

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	reload.mockClear();
	localStorage.clear();
	sessionStorage.clear();
	clearCookies();
	document.body.replaceChildren();
});

describe('browser revocation reload and opt-out confirmation', () => {
	it('reloads once after rejecting granted categories under an opt-out policy', async () => {
		const onBeforeConsentRevocationReload = vi.fn();
		const { client } = await startClient({
			callbacks: { onBeforeConsentRevocationReload },
			policy: [
				{
					...policyRulePresets.usPrivacyStatesOptOut(),
					prompt: 'choice',
				},
			],
		});
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(true);

		await client.rejectAll();
		await vi.waitFor(() => {
			expect(reload).toHaveBeenCalledOnce();
		});
		expect(onBeforeConsentRevocationReload).toHaveBeenCalledOnce();
		expect(
			onBeforeConsentRevocationReload.mock.calls[0]?.[0].preferences.marketing
		).toBe(false);
	});

	it('reloads once from the opt-out link, defers confirmation across the reload, shows it once on the next load, and not on the load after that', async () => {
		const onBeforeConsentRevocationReload = vi.fn();
		const link = document.createElement('button');
		link.type = 'button';
		link.setAttribute('data-inth-action', 'opt-out');
		link.textContent = 'Do Not Sell or Share My Personal Information';
		document.body.append(link);

		const first = await startClient({
			callbacks: { onBeforeConsentRevocationReload },
		});
		expect(first.client.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);

		link.click();

		// Does not flash the confirmation view open before the reload.
		expect(
			first.root.querySelector('[data-testid="opt-out-confirmation-root"]')
		).toBeNull();
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBe('1');

		await vi.waitFor(() => {
			expect(reload).toHaveBeenCalledOnce();
		});
		expect(onBeforeConsentRevocationReload).toHaveBeenCalledOnce();
		expect(
			onBeforeConsentRevocationReload.mock.calls[0]?.[0].preferences.marketing
		).toBe(false);
		expect(
			first.root.querySelector('[data-testid="opt-out-confirmation-root"]')
		).toBeNull();

		// Persistence wrote the opt-out record before the reload fired.
		await vi.waitFor(() => {
			expect(localStorage.getItem('inth-opt-out')).not.toBeNull();
		});
		first.client.dispose();
		reload.mockClear();

		// Next load after reload: confirmation opens once with the honored status,
		// records nothing again, clears the marker, and does not reload again.
		const second = await startClient();
		const onRecorded = vi.fn();
		second.client.kernel.events.on('opt-out:recorded', onRecorded);

		await vi.waitFor(() => {
			expect(
				second.root.querySelector('[data-testid="opt-out-confirmation-root"]')
			).not.toBeNull();
		});
		expect(
			second.root.querySelector('[data-testid="opt-out-confirmation-status"]')
				?.textContent
		).toBe('Opt-out request honored');
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
		expect(onRecorded).not.toHaveBeenCalled();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(reload).not.toHaveBeenCalled();
		second.client.dispose();

		// Load after that: marker is gone, so confirmation does not open.
		const third = await startClient();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(
			third.root.querySelector('[data-testid="opt-out-confirmation-root"]')
		).toBeNull();
	});

	it('ignores a pending confirmation marker when no opt-out is held on the new document', async () => {
		sessionStorage.setItem(OPT_OUT_CONFIRMATION_STORAGE_KEY, '1');
		const { root } = await startClient();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(
			root.querySelector('[data-testid="opt-out-confirmation-root"]')
		).toBeNull();
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
	});

	it('opens confirmation immediately without reloading when reloadOnConsentRevoked is false', async () => {
		const { client, root } = await startClient({
			reloadOnConsentRevoked: false,
		});
		await client.optOut();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-out-confirmation-root"]')
			).not.toBeNull();
		});
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(reload).not.toHaveBeenCalled();
	});
});
