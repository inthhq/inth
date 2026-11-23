/** @vitest-environment jsdom */
import { afterEach, expect, test, vi } from 'vitest';

import { createNuxtEngineContext } from '../runtime/deferred/engine';
import type { RuntimeConsentConfig } from '../runtime/create-vue-consent-kernel-context';

const disposers: (() => void)[] = [];

afterEach(() => {
	for (const dispose of disposers.splice(0)) {
		dispose();
	}
	vi.unstubAllGlobals();
});

test("a hosted() page's browser init sends the server's consent headers in the query, with no cookies", async () => {
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockRejectedValue(new Error('offline'));
	vi.stubGlobal('fetch', fetch);
	const context = createNuxtEngineContext({
		config: {
			projectUrl: 'https://consent.example.com',
		} as RuntimeConsentConfig,
		headers: { 'cf-ipcountry': 'DE', 'x-inth-region': 'BY' },
		initialRecords: {},
		mode: { type: 'hosted' },
		onIABUnavailable: () => undefined,
		prefetchState: undefined,
		readsRecords: false,
		routePrefix: undefined,
	});
	disposers.push(context.dispose);
	context.start();

	await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
	const [url, init] = fetch.mock.calls[0] ?? [];
	expect([...new Headers(init?.headers).keys()].toSorted()).toEqual(['accept']);
	expect(init?.credentials).toBe('same-origin');
	expect(Object.fromEntries(new URL(String(url)).searchParams)).toMatchObject({
		country: 'DE',
		region: 'BY',
	});
});
