/**
 * A failed engine import is not kept: the next render imports it again,
 * with the engine loading with the page and on a deferred root.
 */
import { Component } from 'react';
import type { ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { PREFETCH_WINDOW_KEY } from '../../../../core/src/libs/prefetch/window-key';
import init from '../../../../core/src/runtime/__tests__/fixtures/hosted-init-gb.json' with { type: 'json' };
import { ConsentBanner } from '../../components/prompt';
import { testing } from '../../testing';
import type * as ClientEngine from '../client-engine';
import { createConsentProvider } from '../client-provider';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	constructor(props: { children: ReactNode }) {
		super(props);
		this.state = { failed: false };
	}

	static getDerivedStateFromError() {
		return { failed: true };
	}

	override render() {
		return this.state.failed ? (
			<p data-testid="failed">failed</p>
		) : (
			this.props.children
		);
	}
}

/** An engine import that fails once, then loads. */
const failingOnce = () =>
	vi
		.fn<() => Promise<typeof ClientEngine>>()
		.mockRejectedValueOnce(new TypeError('Failed to fetch chunk'))
		.mockImplementation(() => import('../client-engine'));

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(window, PREFETCH_WINDOW_KEY);
	document.cookie = 'c15t=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
	localStorage.clear();
});

test('the engine renders after one failed import of its chunk', async () => {
	const importEngine = failingOnce();
	const ConsentProvider = createConsentProvider(importEngine);

	const screen = await render(
		<Boundary>
			<ConsentProvider options={{ mode: testing() }}>
				<p data-testid="page">page</p>
			</ConsentProvider>
		</Boundary>
	);

	await expect.element(screen.getByTestId('page')).toBeVisible();
	expect(importEngine).toHaveBeenCalledTimes(2);
	await screen.unmount();
});

test('an engine import that keeps failing stops after three tries and shows the error', async () => {
	// Fails after a moment, as a missing chunk does over the network.
	const importEngine = vi.fn<() => Promise<typeof ClientEngine>>(
		() =>
			new Promise((_resolve, reject) => {
				setTimeout(() => reject(new TypeError('Failed to fetch chunk')), 50);
			})
	);
	const ConsentProvider = createConsentProvider(importEngine);

	const screen = await render(
		<Boundary>
			<ConsentProvider options={{ mode: testing() }}>
				<p data-testid="page">page</p>
			</ConsentProvider>
		</Boundary>
	);

	await expect
		.element(screen.getByTestId('failed'), { timeout: 5000 })
		.toBeVisible();
	await new Promise((resolve) => {
		setTimeout(resolve, 1500);
	});
	expect(importEngine).toHaveBeenCalledTimes(3);
	await screen.unmount();
});

test('a deferred root loads its engine after one failed import of its chunk', async () => {
	const projectUrl = 'https://consent.test';
	const fetchMock = vi.fn(() =>
		Promise.resolve(
			new Response('{}', {
				headers: { 'content-type': 'application/json' },
				status: 200,
			})
		)
	);
	vi.stubGlobal('fetch', fetchMock);
	// The inline prefetch's `/init` answer: the root defers its engine.
	const requestContext = {
		country: null,
		credentials: 'same-origin',
		gpc: false,
		language: null,
		projectUrl,
		region: null,
	};
	(window as unknown as Record<string, unknown>)[PREFETCH_WINDOW_KEY] = {
		key: {
			promise: Promise.resolve({
				init,
				metadata: { experiment: null, journey: null, requestContext },
				producerPolicyContract: '1',
			}),
			requestContext,
		},
	};
	const importEngine = failingOnce();
	const ConsentProvider = createConsentProvider(importEngine);

	const screen = await render(
		<Boundary>
			<ConsentProvider
				options={{
					consentCategories: ['necessary', 'measurement', 'marketing'],
					journey: false,
					projectUrl,
				}}
			>
				<p data-testid="page">page</p>
				<ConsentBanner />
			</ConsentProvider>
		</Boundary>
	);
	const accept = screen.getByTestId('consent-banner-accept-button');
	await expect.element(accept).toBeVisible();
	// The choice commits without the engine, then the engine loads and
	// sends the save.
	await accept.click();
	await vi.waitFor(
		() => {
			expect(
				fetchMock.mock.calls.filter(([url]) =>
					String(url).includes('/subjects')
				)
			).toHaveLength(1);
		},
		{ timeout: 5000 }
	);
	expect(importEngine).toHaveBeenCalledTimes(2);
	await expect.element(screen.getByTestId('page')).toBeVisible();
	await screen.unmount();
});
