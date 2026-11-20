import { useDocuments } from '@inth/react';
import { ServerBootData } from '@inth/react/deferred/engine';
import { useSnapshot } from '@inth/react/hooks';
import { InthProvider as ReactProvider } from '@inth/react/provider';
import type { RuntimeDocuments } from '@inth/sdk/runtime/documents';
/**
 * `useDocuments()` under the TanStack Start `InthProvider`, called while its
 * engine waits for the page's priority images: the call loads the engine
 * and sends one request each, with no consent side effects.
 */
import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { InthProvider } from '../root';
import type { ConsentState } from '../server';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const PROJECT_URL = 'https://consent.example.com';
const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const consentCategories = ['necessary', 'marketing'] as const;
const rule = { categories: ['marketing'], scopeMode: 'permissive' } as const;
const RENDER_ID = 'test-render';
const cleanups: (() => void)[] = [];

const backend = (input: RequestInfo | URL, init?: RequestInit) => {
	const { pathname } = new URL(String(input));
	if (pathname === '/v1/documents/acceptances') {
		const body = JSON.parse(String(init?.body)) as { subjectId: string };
		return Promise.resolve(
			Response.json({
				acceptances: [
					{ acceptedAt: 1, hash: HASH, type: 'terms_us', version: '1' },
				],
				subjectId: body.subjectId,
			})
		);
	}
	if (pathname === '/v1/documents/terms_us/current') {
		return Promise.resolve(
			Response.json({
				document: {
					effectiveDate: '2026-11-18T00:00:00.000Z',
					hash: HASH,
					id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
					isCurrent: true,
					requiresAcceptance: true,
					type: 'terms_us',
					version: '1',
				},
			})
		);
	}
	return Promise.resolve(new Response(null, { status: 503 }));
};

/** The boot data a server render of `state` leaves in the page. */
const leaveBootData = (state: ConsentState): void => {
	const holder = document.createElement('div');
	holder.innerHTML = renderToString(
		<ReactProvider
			options={{
				consentCategories: [...consentCategories],
				mode: transportMode({}),
				prefetch: state,
			}}
		>
			<ServerBootData renderId={RENDER_ID} />
		</ReactProvider>
	);
	const boot = holder.querySelector('script[data-inth-boot]');
	if (!boot) {
		throw new Error('the server render left no boot data');
	}
	document.head.append(boot);
	cleanups.push(() => boot.remove());
};

/** A hero image that is still loading, so the engine waits. */
const loadingHero = (): void => {
	const image = document.createElement('img');
	image.setAttribute('fetchpriority', 'high');
	Object.defineProperty(image, 'complete', { value: false });
	document.body.append(image);
	cleanups.push(() => image.remove());
};

const settle = () =>
	act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 100);
			})
	);

let documents: RuntimeDocuments | undefined;

const Probe = () => {
	const snapshot = useSnapshot();
	const bound = useDocuments();
	useLayoutEffect(() => {
		documents = bound;
	}, [bound]);
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-subject={snapshot.subject?.subjectId ?? ''}
		/>
	);
};

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	localStorage.clear();
	Reflect.deleteProperty(window, '__inthRender');
	Reflect.deleteProperty(window, '__inthEndedRenders');
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	vi.restoreAllMocks();
	localStorage.clear();
});

test('check and accept before the engine loads send one request each and leave consent alone', async () => {
	const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(backend);
	const now = Date.now();
	const state = {
		...policyFixture({}, rule, now),
		now,
		projectUrl: PROJECT_URL,
	} as ConsentState;
	loadingHero();
	leaveBootData(state);
	const container = document.createElement('div');
	document.body.append(container);
	let root: Root | undefined;
	await act(() => {
		root = createRoot(container);
		root.render(
			<InthProvider
				options={{ consentCategories: [...consentCategories] }}
				persistence
				state={state}
			>
				<Probe />
			</InthProvider>
		);
	});
	cleanups.push(() => {
		root?.unmount();
		container.remove();
	});
	const main = () => container.querySelector('main');
	expect(container.querySelector('script[data-inth-boot]')).toBeNull();
	expect(main()?.dataset.activeUi).toBe('banner');

	// The engine attaches as React renders it, so the calls run outside
	// `act()` while the page renders around them.
	let done = false;
	const calling = (async () => {
		const terms = await documents?.check('terms_us');
		await documents?.accept({
			hash: terms?.document.hash ?? '',
			type: 'terms_us',
		});
		done = true;
		return terms?.accepted;
	})();
	// Well inside the 10 s after which the engine loads by itself.
	await vi.waitFor(
		async () => {
			await settle();
			expect(done).toBe(true);
		},
		{ interval: 0, timeout: 1000 }
	);
	const accepted = await calling;

	const calls = fetch.mock.calls.map(([input, init]) => ({
		body: init?.body ? JSON.parse(String(init.body)) : undefined,
		method: init?.method ?? 'GET',
		path: new URL(String(input)).pathname,
	}));
	expect(calls).toEqual([
		{ body: undefined, method: 'GET', path: '/v1/documents/terms_us/current' },
		{
			body: expect.objectContaining({
				acceptances: [{ hash: HASH, type: 'terms_us' }],
				subjectId: main()?.dataset.subject,
			}),
			method: 'POST',
			path: '/v1/documents/acceptances',
		},
	]);
	expect(accepted).toBe(false);
	expect(main()?.dataset.subject).not.toBe('');
	expect(main()?.dataset.activeUi).toBe('banner');
});
