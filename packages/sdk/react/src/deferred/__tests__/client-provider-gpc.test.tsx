/**
 * `InthProvider` on a client-rendered page in a browser that sends the
 * Global Privacy Control signal: the stand-in reads the `/v1/consent/init` answer
 * under the signal, as the engine does. Under a policy the signal answers
 * for, it shows no banner and leaves the visitor to the engine, where it
 * used to show one and let an Accept grant what the signal denies. Its own
 * file: the provider loads its engine once per page.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { PREFETCH_WINDOW_KEY } from '../../../../core/src/libs/page-globals';
import init from '../../../../core/src/runtime/__tests__/fixtures/hosted-init-gb.json' with { type: 'json' };
import { ConsentBanner } from '../../components/prompt';
import { useSnapshot } from '../../hooks';
import { createConsentProvider } from '../client-provider';

let releaseEngine: () => void = () => undefined;
const engineHeld = new Promise<void>((resolve) => {
	releaseEngine = resolve;
});
let engineRequested: () => void = () => undefined;
/** Resolves once the provider asks for the engine's module. */
const engineAsked = new Promise<void>((resolve) => {
	engineRequested = resolve;
});

const InthProvider = createConsentProvider(async () => {
	engineRequested();
	await engineHeld;
	return import('../client-engine');
});

const BACKEND = 'https://consent.test';

/** The GB policy, denying marketing under the signal. */
const signalled = {
	...init,
	policyResolution: {
		...init.policyResolution,
		policy: {
			...init.policyResolution.policy,
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
		},
	},
};

const Probe = () => {
	const snapshot = useSnapshot();
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-gpc={String(snapshot.privacySignals.gpc.detected)}
			data-marketing={String(snapshot.effectivePermissions.marketing)}
			data-restricted={String(
				snapshot.restrictions.marketing?.includes('gpc') ?? false
			)}
			data-testid="probe"
		/>
	);
};

const fetchMock = vi.fn(() =>
	Promise.resolve(
		new Response('{}', {
			headers: { 'content-type': 'application/json' },
			status: 200,
		})
	)
);

const initRequests = () =>
	fetchMock.mock.calls.filter(([url]) =>
		String(url).includes('/v1/consent/init')
	);

const bannerRoot = () =>
	document.querySelector('[data-testid="consent-banner-root"]');

/** The inline prefetch script's entry, sent under the browser's signal. */
let answer: (value: unknown) => void = () => undefined;
const prefetch = function prefetch() {
	const requestContext = {
		country: null,
		credentials: 'same-origin',
		gpc: true,
		language: null,
		projectUrl: BACKEND,
		region: null,
	};
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

const previousSignal = Object.getOwnPropertyDescriptor(
	navigator,
	'globalPrivacyControl'
);

beforeEach(() => {
	Object.defineProperty(navigator, 'globalPrivacyControl', {
		configurable: true,
		value: true,
	});
	vi.stubGlobal('fetch', fetchMock);
	localStorage.clear();
	prefetch();
});

afterEach(() => {
	releaseEngine();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(window, PREFETCH_WINDOW_KEY);
	localStorage.clear();
	if (previousSignal) {
		Object.defineProperty(navigator, 'globalPrivacyControl', previousSignal);
	} else {
		Reflect.deleteProperty(navigator, 'globalPrivacyControl');
	}
});

test('the stand-in reads the browser signal, and shows no banner the signal answers', async () => {
	const screen = await render(
		<InthProvider
			options={{
				consentCategories: ['necessary', 'measurement', 'marketing'],
				journey: false,
				projectUrl: BACKEND,
			}}
		>
			<Probe />
			<ConsentBanner />
		</InthProvider>
	);
	const probe = screen.getByTestId('probe');
	// Before `/v1/consent/init` answers: the pending state already carries the signal.
	await expect.element(probe).toHaveAttribute('data-gpc', 'true');

	answer({ init: signalled });
	// The stand-in read the answer under the signal, which answers for this
	// visitor: no banner to show, so the engine loads at once. Without the
	// signal it would show the banner first, and an Accept on it would
	// grant marketing.
	await engineAsked;
	expect(bannerRoot()).toBeNull();
	await expect.element(probe).toHaveAttribute('data-active-ui', 'none');
	await expect.element(probe).toHaveAttribute('data-gpc', 'true');
	// The prefetch was sent under the signal, so the provider sent no
	// `/v1/consent/init` of its own.
	expect(initRequests()).toEqual([]);

	// The engine reads the same answer the same way.
	releaseEngine();
	await expect.element(probe).toHaveAttribute('data-restricted', 'true');
	await expect.element(probe).toHaveAttribute('data-active-ui', 'none');
	await expect.element(probe).toHaveAttribute('data-marketing', 'false');
	await expect.element(probe).toHaveAttribute('data-gpc', 'true');
	expect(bannerRoot()).toBeNull();
	expect(initRequests()).toEqual([]);
});
