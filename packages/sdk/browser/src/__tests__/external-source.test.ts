import type { ConsentState } from '@inth/sdk-core';
import { expect, test, vi } from 'vite-plus/test';

import { createTestingConsentClient as createConsentClient } from '../testing-global';

test('browser client delegates preferences and loads scripts only for external grants', async () => {
	let permissions: Partial<ConsentState> | null = null;
	let notify = () => {};
	const detach = vi.fn();
	const openPreferences = vi.fn();
	const source = {
		getPermissions: () => permissions,
		openPreferences,
		subscribe: (listener: () => void) => {
			notify = listener;
			return detach;
		},
	};
	const loaded = vi.fn();
	const removed = vi.fn();
	const script = {
		callbackOnly: true as const,
		category: 'measurement' as const,
		id: 'external-tracker',
		onConsentChange: removed,
		onLoad: loaded,
	};

	const client = createConsentClient({
		consentSource: source,
		iframeBlocker: false,
		scripts: [script],
	});
	const ready = vi.fn();
	client.on('ready', ready);
	client.start();
	try {
		await expect(client.ready()).resolves.toMatchObject({
			externalPermissions: { measurement: false },
		});
		expect(ready).toHaveBeenCalledOnce();
		expect(loaded).not.toHaveBeenCalled();
		permissions = { measurement: true };
		notify();
		await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
		client.openDialog();
		expect(openPreferences).toHaveBeenCalledTimes(1);
		expect(client.getSnapshot().activeUI).toBe('none');
		permissions = null;
		notify();
		expect(client.getSnapshot().effectivePermissions.measurement).toBe(false);
		expect(removed).toHaveBeenLastCalledWith(
			expect.objectContaining({ hasConsent: false })
		);
		expect(client.getSnapshot().explicitChoice).toBeNull();
	} finally {
		client.dispose();
	}
	expect(detach).toHaveBeenCalledTimes(1);
});

test('optOut() under an external source opens its preferences and records nothing here', async () => {
	const openPreferences = vi.fn();
	const client = createConsentClient({
		consentSource: {
			getPermissions: () => ({ marketing: true }),
			openPreferences,
			subscribe: () => () => undefined,
		},
		iframeBlocker: false,
	});
	client.start();
	try {
		await client.ready();
		// The source connects after the client is ready.
		await vi.waitFor(() =>
			expect(client.getSnapshot().externalPermissions?.marketing).toBe(true)
		);

		await expect(client.optOut()).resolves.toEqual({
			ok: false,
			reason: 'not-available',
		});

		expect(openPreferences).toHaveBeenCalledTimes(1);
		expect(client.getSnapshot().optOut).toBeNull();
		expect(client.getSnapshot().activeUI).toBe('none');
	} finally {
		client.dispose();
	}
});
