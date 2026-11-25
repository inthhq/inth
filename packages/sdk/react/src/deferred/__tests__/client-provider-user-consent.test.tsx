/**
 * `InthProvider` for client-rendered pages, given `userConsent` after it
 * mounted, such as from a session fetch: only the engine applies an
 * account's consent document, so a new one loads the engine instead of
 * waiting for the page's priority images.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { PREFETCH_WINDOW_KEY } from '../../../../core/src/libs/page-globals';
import { useSnapshot } from '../../hooks';
import { createConsentProvider } from '../client-provider';

const BACKEND = 'https://consent.test';

const Probe = () => {
	const snapshot = useSnapshot();
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-testid="probe"
		/>
	);
};

const options = (extra: Record<string, unknown> = {}) => ({
	consentCategories: ['necessary', 'measurement', 'marketing'] as (
		| 'necessary'
		| 'measurement'
		| 'marketing'
	)[],
	journey: false as const,
	projectUrl: BACKEND,
	...extra,
});

let hero: HTMLImageElement;

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise(() => {
					// `/v1/consent/init` never answers: the banner stays owed.
				})
		)
	);
	// The hero still loading: nothing but a live change loads the engine.
	hero = document.createElement('img');
	hero.setAttribute('fetchpriority', 'high');
	Object.defineProperty(hero, 'complete', { value: false });
	document.body.append(hero);
});

afterEach(() => {
	hero.remove();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(window, PREFETCH_WINDOW_KEY);
});

const mount = async () => {
	const importEngine = vi.fn(
		() =>
			new Promise<never>(() => {
				// Held: the test only asks whether the provider requested it.
			})
	);
	const InthProvider = createConsentProvider(importEngine);
	const screen = await render(
		<InthProvider options={options()}>
			<Probe />
		</InthProvider>
	);
	await expect.element(screen.getByTestId('probe')).toBeInTheDocument();
	return { InthProvider, importEngine, screen };
};

test('a userConsent given after mount loads the engine', async () => {
	const { InthProvider, importEngine, screen } = await mount();
	const before = importEngine.mock.calls.length;

	await screen.rerender(
		<InthProvider options={options({ userConsent: null })}>
			<Probe />
		</InthProvider>
	);

	await vi.waitFor(() =>
		expect(importEngine.mock.calls.length).toBeGreaterThan(before)
	);
});

test('a render with the same options keeps the engine waiting', async () => {
	const { InthProvider, importEngine, screen } = await mount();
	const before = importEngine.mock.calls.length;

	await screen.rerender(
		<InthProvider options={options()}>
			<Probe />
		</InthProvider>
	);
	await new Promise((resolve) => {
		setTimeout(resolve, 100);
	});

	expect(importEngine.mock.calls.length).toBe(before);
});
