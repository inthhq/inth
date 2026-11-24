/**
 * `ConsentGPP` from `@inth/react/gpp`: it mounts `window.__gpp` on the
 * provider's kernel and removes it on unmount.
 */
import type { ProviderTransportFactory } from '@inth/sdk/engine';
import type { GPPPingData } from '@inth/sdk/iab/gpp';
import { createConsentRuntime } from '@inth/sdk/runtime';
import { policyRulePresets } from '@inth/sdk/schema/types';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-react';

import { ConsentGPP } from '../gpp';
import { InthProvider } from '../provider';
import { offlineMode } from './fixtures/transport-mode';

const mode = offlineMode([
	{ ...policyRulePresets.californiaOptOut(), match: { isDefault: true } },
]);
const overrides = { country: 'US', region: 'CA' };

const ping = (): GPPPingData | undefined => {
	let data: GPPPingData | undefined;
	window.__gpp?.('ping', (result) => {
		data = result as GPPPingData;
	});
	return data;
};

afterEach(() => {
	delete window.__gpp;
	vi.restoreAllMocks();
});

test('mounts __gpp on the provider kernel and unmount removes it', async () => {
	const screen = await render(
		<InthProvider options={{ mode, overrides, persistence: false }}>
			<ConsentGPP
				optOutCategories={['marketing']}
				usFallback="none"
			/>
		</InthProvider>
	);

	await vi.waitFor(() =>
		expect(ping()).toMatchObject({
			applicableSections: [8],
			cmpStatus: 'loaded',
			signalStatus: 'ready',
			supportedAPIs: expect.not.arrayContaining(['7:usnat']),
		})
	);

	await screen.unmount();
	expect(window.__gpp).toBeUndefined();
});

test('mounts on a borrowed runtime too', async () => {
	const runtime = createConsentRuntime({ mode, overrides, persistence: false });
	runtime.start();
	const screen = await render(
		<InthProvider runtime={runtime}>
			<ConsentGPP />
		</InthProvider>
	);

	await vi.waitFor(() =>
		expect(ping()).toMatchObject({
			applicableSections: [8],
			supportedAPIs: expect.arrayContaining(['7:usnat', '8:usca']),
		})
	);
	await screen.unmount();
	runtime.dispose();
});

test('logs a mount failure and leaves the app rendered', async () => {
	const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	// createGPP rejects a CMP ID that is neither 1 nor a registered ID.
	const screen = await render(
		<InthProvider options={{ mode, overrides, persistence: false }}>
			<ConsentGPP cmpId={-1} />
			<span>app</span>
		</InthProvider>
	);

	await expect.element(screen.getByText('app')).toBeVisible();
	expect(error).toHaveBeenCalledWith(
		'inth: GPP was not installed.',
		expect.objectContaining({ message: expect.stringContaining('cmpId') })
	);
	expect(window.__gpp).toBeUndefined();
	await screen.unmount();
});

test('installs __gpp within a microtask of the first init()', async () => {
	// `manifest()` from `@inth/sdk` relies on this: before it answers a
	// visitor whose location it does not know, it waits one microtask and
	// asks the backend instead when `__gpp` exists by then.
	const seen: { atInit?: boolean; afterMicrotask?: boolean } = {};
	const watching: ProviderTransportFactory = Object.assign(
		(context: Parameters<ProviderTransportFactory>[0]) => {
			const transport = mode.transport(context);
			return {
				...transport,
				init: (ctx: Parameters<typeof transport.init>[0]) => {
					seen.atInit ??= typeof window.__gpp === 'function';
					return Promise.resolve().then(() => {
						seen.afterMicrotask ??= typeof window.__gpp === 'function';
						return transport.init(ctx);
					});
				},
			};
		},
		{ kind: 'custom' as const }
	);
	const screen = await render(
		<InthProvider options={{ mode: watching, overrides, persistence: false }}>
			<ConsentGPP />
		</InthProvider>
	);

	await vi.waitFor(() => expect(seen.afterMicrotask).toBe(true));
	expect(seen.atInit).toBe(false);
	await screen.unmount();
});
