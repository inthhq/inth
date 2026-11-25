import {
	OPT_OUT_CONFIRMATION_STORAGE_KEY,
	policyRulePresets,
} from '@inth/sdk-core';
import type * as Core from '@inth/sdk-core';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import type { ConsentClient, ConsentUIHandle } from '../consent-client.model';
import { createTestingConsentClient as createConsentClient } from '../testing-global';
import { mountConsentUI } from '../ui/mount-consent-ui';

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

const find = (root: ParentNode, testId: string): HTMLElement | null =>
	root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

/** The focused element inside the UI's root, or on the page. */
const focused = (root: ParentNode): Element | null =>
	(root as ShadowRoot).activeElement ?? document.activeElement;

/**
 * The opt-out confirmation: "Your Privacy Choices" opens on the receipt
 * that confirms the opt-out, with focus on it.
 */
const expectConfirmationOnReceipt = async function expectConfirmationOnReceipt(
	client: ConsentClient,
	root: ParentNode
): Promise<void> {
	await vi.waitFor(() => {
		expect(find(root, 'consent-dialog-receipt')).not.toBeNull();
	});
	const receipt = find(root, 'consent-dialog-receipt') as HTMLElement;
	expect(client.getSnapshot().activeUI).toBe('dialog');
	expect(receipt.getAttribute('data-open')).toBe('true');
	expect(receipt.textContent).toMatch(/opted out/iu);
	await vi.waitFor(() => {
		expect(focused(root)).toBe(receipt);
	});
	expect(find(root, 'opt-out-confirmation-root')).toBeNull();
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

		// Does not flash the confirmation open before the reload.
		expect(find(first.root, 'consent-dialog-root')).toBeNull();
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBe('1');

		await vi.waitFor(() => {
			expect(reload).toHaveBeenCalledOnce();
		});
		expect(onBeforeConsentRevocationReload).toHaveBeenCalledOnce();
		expect(
			onBeforeConsentRevocationReload.mock.calls[0]?.[0].preferences.marketing
		).toBe(false);
		expect(find(first.root, 'consent-dialog-root')).toBeNull();
		expect(first.client.getSnapshot().activeUI).not.toBe('dialog');

		// Persistence wrote the opt-out record before the reload fired.
		await vi.waitFor(() => {
			expect(localStorage.getItem('inth-opt-out')).not.toBeNull();
		});
		first.client.dispose();
		reload.mockClear();

		// Next load after reload: the confirmation opens once, as Your Privacy
		// Choices on its receipt, records nothing again, clears the marker, and
		// does not reload again.
		const second = await startClient();
		const onRecorded = vi.fn();
		second.client.kernel.events.on('opt-out:recorded', onRecorded);

		await expectConfirmationOnReceipt(second.client, second.root);
		expect(second.client.getSnapshot().optOut).not.toBeNull();
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
		expect(find(third.root, 'consent-dialog-root')).toBeNull();
		expect(third.client.getSnapshot().activeUI).not.toBe('dialog');
	});

	it('ignores a pending confirmation marker when no opt-out is held on the new document', async () => {
		sessionStorage.setItem(OPT_OUT_CONFIRMATION_STORAGE_KEY, '1');
		const { client, root } = await startClient();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(find(root, 'consent-dialog-root')).toBeNull();
		expect(client.getSnapshot().activeUI).not.toBe('dialog');
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
	});

	it('opens confirmation immediately without reloading when reloadOnConsentRevoked is false', async () => {
		const { client, root } = await startClient({
			reloadOnConsentRevoked: false,
		});
		await client.optOut();
		await expectConfirmationOnReceipt(client, root);
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(reload).not.toHaveBeenCalled();
	});
});
