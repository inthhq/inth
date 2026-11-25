/** @vitest-environment jsdom */
import { createConsentKernel } from '@inth/sdk/engine';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import { createOfflineTransport } from '@inth/sdk/transports';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { gtag } from './vendors/analytics/google-tag';

afterEach(() => {
	vi.useRealTimers();
	document.head.innerHTML = '';
	delete (window as Partial<Window>).gtag;
	delete (window as Partial<Window>).dataLayer;
});

test('Google Consent Mode updates each permission and keeps the GPC denial until the visitor opts back in', async () => {
	const now = Date.now();
	const transport = createOfflineTransport({
		acknowledgeNoRecords: true,
		policyRules: [
			{
				id: 'gcm',
				match: { isDefault: true },
				model: 'opt-out',
				privacySignals: { gpc: { denyCategories: ['marketing'] } },
				prompt: 'choice',
			},
		],
	});
	const kernel = createConsentKernel({ now, transport });
	const commands = vi.fn();
	window.gtag = commands;
	window.dataLayer = [];
	const loader = createScriptLoader({
		kernel,
		scripts: [gtag({ category: 'measurement', id: 'G-TEST' })],
	});
	try {
		await kernel.commands.init();
		await kernel.commands.save({ marketing: true, measurement: true });
		commands.mockClear();
		await kernel.commands.save({ marketing: false });
		expect(commands).toHaveBeenCalledWith(
			'consent',
			'update',
			expect.objectContaining({
				ad_storage: 'denied',
				analytics_storage: 'granted',
				security_storage: 'granted',
			})
		);
		const lastUpdate = () =>
			commands.mock.calls.findLast(
				([command, action]) => command === 'consent' && action === 'update'
			)?.[2];
		kernel.set.privacySignals({ gpc: true });
		await kernel.commands.save({ marketing: true });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(lastUpdate()).toMatchObject({
			ad_storage: 'denied',
			security_storage: 'granted',
		});
		// The signal recorded an opt-out, so the denial outlasts it.
		kernel.set.privacySignals({ gpc: false });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(lastUpdate()).toMatchObject({
			ad_storage: 'denied',
			security_storage: 'granted',
		});
		// Granting the category once the signal is gone lifts the opt-out.
		await kernel.commands.save({ marketing: true });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(lastUpdate()).toMatchObject({
			ad_storage: 'granted',
			security_storage: 'granted',
		});
	} finally {
		loader.dispose();
		kernel.dispose();
	}
});
