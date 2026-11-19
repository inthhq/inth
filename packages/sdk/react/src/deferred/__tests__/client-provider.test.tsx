/**
 * `ConsentProvider` for client-rendered pages: the page renders before the
 * consent engine, the stock banner renders from the prefetched `/init`, a
 * tap hides it at once and the engine applies the choice, and a returning
 * visitor gets the engine straight away.
 */
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { PREFETCH_WINDOW_KEY } from '../../../../core/src/libs/page-globals';
import init from '../../../../core/src/runtime/__tests__/fixtures/hosted-init-gb.json' with { type: 'json' };
import { ConsentBanner } from '../../components/prompt';
import { useSnapshot } from '../../hooks';
import { createConsentProvider } from '../client-provider';

/** Holds the engine's module until a test releases it. */
const engineGate = (() => {
	let release: () => void = () => undefined;
	let promise = Promise.resolve();
	return {
		hold() {
			promise = new Promise<void>((resolve) => {
				release = resolve;
			});
		},
		release: () => release(),
		wait: () => promise,
	};
})();

const ConsentProvider = createConsentProvider(async () => {
	await engineGate.wait();
	return import('../client-engine');
});

const BACKEND = 'https://consent.test';
const consentCategories = ['necessary', 'measurement', 'marketing'] as const;

/** Marketing as the page's `useSnapshot()` effect saw it, in order. */
const effects: boolean[] = [];

const Probe = () => {
	const snapshot = useSnapshot();
	useEffect(() => {
		effects.push(snapshot.effectivePermissions.marketing);
	}, [snapshot]);
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-marketing={String(snapshot.effectivePermissions.marketing)}
			data-testid="probe"
		/>
	);
};

let answer: (value: unknown) => void = () => undefined;
const fetchMock = vi.fn(() =>
	Promise.resolve(
		new Response('{}', {
			headers: { 'content-type': 'application/json' },
			status: 200,
		})
	)
);

const requestContext = {
	country: null,
	credentials: 'same-origin',
	gpc: false,
	language: null,
	projectUrl: BACKEND,
	region: null,
};

/** What the inline prefetch script stores, before `/init` answers. */
const prefetch = function prefetch() {
	const promise = new Promise((resolve) => {
		answer = (value) =>
			resolve({
				...(value as object),
				metadata: { experiment: null, journey: null, requestContext },
			});
	});
	(window as unknown as Record<string, unknown>)[PREFETCH_WINDOW_KEY] = {
		key: { promise, requestContext },
	};
};

const initRequests = () =>
	fetchMock.mock.calls.filter(([url]) => String(url).includes('/init'));

const clearStorage = function clearStorage() {
	for (const pair of document.cookie.split('; ')) {
		const [name] = pair.split('=');
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	localStorage.clear();
};

const stored = () =>
	/(?:^|; )inth=/u.test(document.cookie) ||
	localStorage.getItem('inth') !== null;

const renderPage = (
	callbacks?: Parameters<typeof ConsentProvider>[0] extends {
		options?: infer O;
	}
		? O extends { callbacks?: infer C }
			? C
			: never
		: never
) =>
	render(
		<ConsentProvider
			options={{
				callbacks,
				consentCategories: [...consentCategories],
				journey: false,
				projectUrl: BACKEND,
			}}
		>
			<Probe />
			<ConsentBanner />
		</ConsentProvider>
	);

beforeEach(() => {
	fetchMock.mockClear();
	// The transport reads the page's prefetch only with the global `fetch`.
	vi.stubGlobal('fetch', fetchMock);
	clearStorage();
	prefetch();
});

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(window, PREFETCH_WINDOW_KEY);
	clearStorage();
});

const subjectSaves = () =>
	fetchMock.mock.calls.filter(([url]) => String(url).includes('/subjects'));

// First in the file: the provider loads its engine once per page.
test('Accept before the engine commits without it; the engine sends the save once', async () => {
	engineGate.hold();
	// The hero still loading: only the tap may start anything.
	const hero = document.createElement('img');
	hero.setAttribute('fetchpriority', 'high');
	Object.defineProperty(hero, 'complete', { value: false });
	document.body.append(hero);
	const onChoiceRecorded = vi.fn();
	const onPermissionsChanged = vi.fn();
	const screen = await renderPage({ onChoiceRecorded, onPermissionsChanged });
	answer({ init, producerPolicyContract: '1' });
	const accept = screen.getByTestId('consent-banner-accept-button');
	await expect.element(accept).toBeVisible();
	// What the page's effect had seen when the task after the click began.
	const seen = new Promise<boolean[]>((resolve) => {
		window.addEventListener(
			'click',
			() => {
				setTimeout(() => resolve([...effects]), 0);
			},
			{ capture: true, once: true }
		);
	});
	await accept.click();
	expect((await seen).at(-1)).toBe(true);
	// Recorded with the engine's module still held.
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-marketing', 'true');
	// Stored and announced once the commit chunk completes the commit.
	await vi.waitFor(() => {
		expect(stored()).toBe(true);
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	});
	expect(onPermissionsChanged).toHaveBeenCalledTimes(1);
	expect(subjectSaves()).toEqual([]);

	engineGate.release();
	await vi.waitFor(() => expect(subjectSaves()).toHaveLength(1), {
		timeout: 5000,
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 300);
	});
	expect(subjectSaves()).toHaveLength(1);
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	expect(onPermissionsChanged).toHaveBeenCalledTimes(1);
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-marketing', 'true');
	expect(initRequests()).toEqual([]);
	hero.remove();
});

test('a network blocker turned off leaves the engine deferred', async () => {
	// Held: an eager root could not render its page at all.
	engineGate.hold();
	const screen = await render(
		<ConsentProvider
			options={{
				consentCategories: [...consentCategories],
				journey: false,
				networkBlocker: { enabled: false, rules: [] },
				projectUrl: BACKEND,
			}}
		>
			<Probe />
			<ConsentBanner />
		</ConsentProvider>
	);
	const probe = screen.getByTestId('probe');
	await expect.element(probe).toHaveAttribute('data-active-ui', 'none');

	answer({ init, producerPolicyContract: '1' });
	await expect
		.element(screen.getByTestId('consent-banner-accept-button'))
		.toBeVisible();
	engineGate.release();
});

test('the page renders before /init answers, and the banner from its answer', async () => {
	const screen = await renderPage();
	const probe = screen.getByTestId('probe');
	await expect.element(probe).toHaveAttribute('data-active-ui', 'none');
	expect(
		document.querySelector('[data-testid="consent-banner-root"]')
	).toBeNull();

	answer({ init, producerPolicyContract: '1' });
	await expect
		.element(screen.getByTestId('consent-banner-accept-button'))
		.toBeVisible();
	await expect.element(probe).toHaveAttribute('data-active-ui', 'banner');
});

test('Accept hides the banner at once, and the engine applies it', async () => {
	const screen = await renderPage();
	answer({ init, producerPolicyContract: '1' });
	const accept = screen.getByTestId('consent-banner-accept-button');
	await expect.element(accept).toBeVisible();
	await accept.click();
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-marketing', 'true');
	expect(
		document.querySelector('[data-testid="consent-banner-root"]')
	).toBeNull();
	await vi.waitFor(() => expect(stored()).toBe(true), { timeout: 5000 });
	// The engine took the same prefetched answer: no `/init` of its own.
	expect(initRequests()).toEqual([]);
});

test('a returning visitor gets the stored choice without a banner', async () => {
	// A choice saved on an earlier visit.
	const first = await renderPage();
	answer({ init, producerPolicyContract: '1' });
	await first.getByTestId('consent-banner-reject-button').click();
	await vi.waitFor(() => expect(stored()).toBe(true), { timeout: 5000 });
	first.unmount();

	prefetch();
	const screen = await renderPage();
	answer({ init, producerPolicyContract: '1' });
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-active-ui', 'none');
	await new Promise((resolve) => {
		setTimeout(resolve, 200);
	});
	expect(
		document.querySelector('[data-testid="consent-banner-root"]')
	).toBeNull();
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-marketing', 'false');
});
