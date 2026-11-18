/**
 * `ConsentProvider` on a client-rendered page whose HTML started no `/init`
 * (no `consentManifest()`): the provider sends the request itself as it
 * first renders, the banner shows from its answer before the engine's
 * module arrives, and the engine takes the same answer. Its own file: the
 * provider loads its engine once per page.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { PREFETCH_WINDOW_KEY } from '../../../../core/src/libs/prefetch/window-key';
import init from '../../../../core/src/runtime/__tests__/fixtures/hosted-init-gb.json' with { type: 'json' };
import { ConsentBanner } from '../../components/prompt';
import { createConsentProvider } from '../client-provider';

let releaseEngine: () => void = () => undefined;
const engineHeld = new Promise<void>((resolve) => {
	releaseEngine = resolve;
});

const ConsentProvider = createConsentProvider(async () => {
	await engineHeld;
	return import('../client-engine');
});

const fetchMock = vi.fn((url: string) =>
	Promise.resolve(
		new Response(JSON.stringify(String(url).includes('/init') ? init : {}), {
			headers: {
				'content-type': 'application/json',
				'x-c15t-policy-contract': '1',
			},
			status: 200,
		})
	)
);

const initRequests = () =>
	fetchMock.mock.calls.filter(([url]) => String(url).includes('/init'));

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	localStorage.clear();
});

afterEach(() => {
	releaseEngine();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(window, PREFETCH_WINDOW_KEY);
	localStorage.clear();
});

test('sends /init itself and shows the banner before the engine; the engine reuses the answer', async () => {
	expect(Reflect.has(window, PREFETCH_WINDOW_KEY)).toBe(false);
	const screen = await render(
		<ConsentProvider
			options={{
				consentCategories: ['necessary', 'measurement', 'marketing'],
				journey: false,
				projectUrl: 'https://consent.test',
			}}
		>
			<ConsentBanner />
		</ConsentProvider>
	);
	// With the engine's module still held.
	await expect
		.element(screen.getByTestId('consent-banner-accept-button'))
		.toBeVisible();
	expect(initRequests()).toHaveLength(1);

	releaseEngine();
	await screen.getByTestId('consent-banner-accept-button').click();
	await vi.waitFor(
		() =>
			expect(
				fetchMock.mock.calls.some(([url]) => String(url).includes('/subjects'))
			).toBe(true),
		{ timeout: 5000 }
	);
	// The engine took the same answer: no second `/init`.
	expect(initRequests()).toHaveLength(1);
});
