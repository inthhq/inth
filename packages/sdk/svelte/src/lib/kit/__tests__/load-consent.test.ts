import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
/**
 * Wiring tests for `loadConsent` on top of `resolveRequestConsent` from
 * `@inth/sdk/server`. The core suite pins the rules (forwarding, budget,
 * self-route guard, deferral, experiment); these check what SvelteKit
 * supplies: the config and inputs `inthHandle` stored, `event.url`,
 * `event.fetch` as the in-process fetch, the platform's `waitUntil`, and
 * SvelteKit's `building` flag.
 */
import { clearManifestCache } from '@inth/sdk/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { testing } from '../../testing';
import { inthHandle } from '../handle';
import { hosted, manifest } from '../index';
import { loadConsent } from '../load-consent';
import { setBuilding } from './app-env';
import { CONSENTED_COOKIE, createEvent } from './event';
import { MANIFEST_FIXTURE } from './manifest-fixture';

const BACKEND = 'https://consent.example.com';

const INIT_PAYLOAD = {
	branding: 'inth',
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: 'DE',
			regionCode: null,
			rules: [
				{
					categories: ['marketing'],
					id: 'eu-opt-in',
					match: { fallback: true, isDefault: true },
					model: 'opt-in',
					prompt: 'choice',
					scopeMode: 'permissive',
				},
			],
		})
	),
	translations: { language: 'de', translations: {} },
};

const answer = () =>
	vi.fn<typeof globalThis.fetch>(() =>
		Promise.resolve(
			new Response(JSON.stringify(INIT_PAYLOAD), {
				headers: { 'x-inth-policy-contract': '1' },
			})
		)
	);

/** Runs `inthHandle` so `event.locals.inth` is populated, as in a real app. */
const withHandle = async function withHandle(
	event: ReturnType<typeof createEvent>,
	options: Parameters<typeof inthHandle>[0] = {}
) {
	await inthHandle(options)({
		event,
		resolve: () => Promise.resolve(new Response()),
	});
	return event;
};

const CUSTOM_COOKIE = CONSENTED_COOKIE.replace('inth=', 'my-consent=');

beforeEach(() => {
	clearManifestCache();
	setBuilding(false);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('loadConsent', () => {
	test.each([false, true])(
		'keeps snapshot session reports alive, platform hook available: %s',
		async (hasPlatformHook) => {
			let finish: ((response: Response) => void) | undefined;
			const fetch = vi.fn<typeof globalThis.fetch>(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					})
			);
			const callerHook = vi.fn();
			const platform = { waitUntil: vi.fn() };
			const event = await withHandle(
				createEvent({ fetch, headers: { 'x-inth-country': 'DE' } }),
				{ projectUrl: BACKEND, snapshot: MANIFEST_FIXTURE }
			);
			if (hasPlatformHook) {
				(event as { platform?: unknown }).platform = { context: platform };
			}
			const { consent } = await loadConsent(event, {
				fetch,
				onBackgroundRevalidate: callerHook,
			});
			expect(consent.prefetch.initialPolicyResolution?.status).toBe('matched');
			expect(fetch).toHaveBeenCalledWith(
				`${BACKEND}/sessions`,
				expect.objectContaining({ method: 'POST' })
			);
			const hook = hasPlatformHook ? platform.waitUntil : callerHook;
			expect(hook).toHaveBeenCalledTimes(1);
			expect(callerHook).toHaveBeenCalledTimes(hasPlatformHook ? 0 : 1);
			expect(platform.waitUntil.mock.contexts[0]).toBe(
				hasPlatformHook ? platform : undefined
			);
			expect(callerHook.mock.calls[0]?.[1]).toBe(
				hasPlatformHook ? undefined : event
			);
			const task = hook.mock.calls[0]?.[0];
			expect(task).toBeInstanceOf(Promise);
			finish?.(new Response(null, { status: 204 }));
			await task;
		}
	);

	test('resolves the snapshot locally and hands the browser the mode without it', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const event = await withHandle(
			createEvent({
				fetch,
				headers: {
					'accept-language': 'de-DE',
					'x-vercel-ip-country': 'DE',
				},
			}),
			{
				mode: manifest({ snapshot: MANIFEST_FIXTURE }),
				projectUrl: BACKEND,
				routePrefix: '/api/inth',
			}
		);
		const { consent } = await loadConsent(event, {
			fetch,
		});
		expect(consent.prefetch.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
			status: 'matched',
		});
		expect(consent.prefetch.initialTranslations?.language).toBe('de');
		expect(consent).toMatchObject({
			mode: { type: 'manifest' },
			projectUrl: BACKEND,
			routePrefix: '/api/inth',
		});
		expect(consent.mode).not.toHaveProperty('snapshot');
		// No policy request; only the session report.
		expect(
			fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
		).toEqual([]);
	});

	test('fetches the manifest from the backend without a snapshot', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(Response.json(MANIFEST_FIXTURE))
		);
		const event = await withHandle(
			createEvent({ fetch, headers: { 'x-inth-country': 'DE' } }),
			{ mode: manifest(), projectUrl: BACKEND }
		);
		const { consent } = await loadConsent(event, {
			fetch,
		});
		expect(fetch.mock.calls[0]?.[0]).toBe(`${BACKEND}/manifest`);
		expect(consent.prefetch.initialPolicyResolution?.policyId).toBe(
			'eu-opt-in'
		);
	});

	test('reads the inputs the handle normalized; per-call inputs win', async () => {
		const event = await withHandle(
			createEvent({
				headers: { cookie: CONSENTED_COOKIE, 'x-inth-country': 'CA' },
			}),
			{ mode: testing() }
		);
		const fromHandle = await loadConsent(event);
		expect(fromHandle.consent.prefetch.initialOverrides?.country).toBe('CA');
		expect(fromHandle.consent.prefetch.initialRecords?.choice).not.toBeNull();

		const perCall = await loadConsent(event, { country: 'DE' });
		expect(perCall.consent.prefetch.initialOverrides?.country).toBe('DE');
	});

	test('keeps the handle cookie name when a per-call input overrides', async () => {
		const event = await withHandle(
			createEvent({ headers: { cookie: CUSTOM_COOKIE } }),
			{ cookieName: 'my-consent', mode: testing() }
		);
		const { consent } = await loadConsent(event, { country: 'DE' });
		expect(consent.prefetch.initialRecords?.choice).not.toBeNull();
	});

	test('a new visitor gets no subject cookie, also for a per-call cookieName', async () => {
		const setCookie = vi.fn();
		const event = await withHandle(
			createEvent({
				headers: { cookie: 'theme=dark' },
				setCookie,
				url: 'https://app.example.com/',
			}),
			{ mode: testing(), storage: { crossSubdomain: true } }
		);
		const first = await loadConsent(event);
		const custom = await loadConsent(event, { cookieName: 'my-consent' });

		expect(setCookie).not.toHaveBeenCalled();
		expect(
			first.consent.prefetch.initialRecords?.subject?.subjectId
		).toBeUndefined();
		expect(first.consent.prefetch.initialRecords?.choice).toBeNull();
		expect(
			custom.consent.prefetch.initialRecords?.subject?.subjectId
		).toBeUndefined();
	});

	test('a testing value resolves nothing on the server and reaches the browser', async () => {
		const fetch = answer();
		const event = await withHandle(
			createEvent({ fetch, headers: { 'x-inth-country': 'DE' } }),
			{ mode: testing() }
		);
		const { consent } = await loadConsent(event, { fetch });
		expect(consent.prefetch.initialPolicyResolution).toBeUndefined();
		expect(consent.mode).toEqual({ type: 'testing' });
		expect(fetch).not.toHaveBeenCalled();
	});

	test('a relative hosted backend resolves against event.url and stays in-process', async () => {
		const fetch = answer();
		const event = await withHandle(
			createEvent({
				fetch,
				headers: {
					host: 'attacker.example',
					'x-forwarded-host': 'attacker.example',
				},
				url: 'http://localhost:5173/',
			}),
			{ mode: hosted(), projectUrl: '/api/self-host' }
		);
		const { consent } = await loadConsent(event);
		expect(String(fetch.mock.calls[0]?.[0]).split('?')[0]).toBe(
			'/api/self-host/init'
		);
		expect(consent.prefetch.initialPolicyResolution?.policyId).toBe(
			'eu-opt-in'
		);
		expect(consent.projectUrl).toBe('/api/self-host');
	});

	test('a cross-origin hosted backend uses the configured fetch', async () => {
		const fetch = answer();
		const eventFetch = answer();
		const event = await withHandle(createEvent({ fetch: eventFetch }), {
			mode: hosted(),
			projectUrl: 'https://api.example.com',
		});
		await loadConsent(event, { fetch });
		expect(eventFetch).not.toHaveBeenCalled();
		expect(String(fetch.mock.calls[0]?.[0]).split('?')[0]).toBe(
			'https://api.example.com/init'
		);
	});

	test('a slow backend renders without a decision', async () => {
		vi.useFakeTimers();
		const event = await withHandle(
			createEvent({
				fetch: (_input, init) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener('abort', () =>
							reject(new DOMException('aborted', 'AbortError'))
						);
					}),
			}),
			{ projectUrl: '/api/self-host' }
		);
		const pending = loadConsent(event);
		await vi.advanceTimersByTimeAsync(500);
		const { consent } = await pending;
		expect(consent.prefetch.initialPolicyResolution).toBeUndefined();
	});

	test('browser resolution leaves the server with the cookie only', async () => {
		const fetch = answer();
		const event = await withHandle(
			createEvent({ fetch, headers: { 'x-inth-country': 'DE' } }),
			{
				mode: manifest({ resolve: 'browser', snapshot: MANIFEST_FIXTURE }),
				projectUrl: BACKEND,
			}
		);
		const { consent } = await loadConsent(event, { fetch });
		expect(fetch).not.toHaveBeenCalled();
		expect(consent.prefetch.initialPolicyResolution).toBeUndefined();
		expect(consent.mode).toMatchObject({ resolve: 'browser' });
	});

	test('a prerender carries no visitor state and makes no request', async () => {
		setBuilding(true);
		const fetch = answer();
		const event = await withHandle(
			createEvent({
				fetch,
				headers: { cookie: CONSENTED_COOKIE, 'x-inth-country': 'DE' },
			}),
			{ projectUrl: BACKEND, routePrefix: '/api/inth' }
		);
		expect((event.locals as { inth: { config: unknown } }).inth.config).toEqual(
			{}
		);
		const { consent } = await loadConsent(event, { fetch });
		expect(fetch).not.toHaveBeenCalled();
		expect(consent).toEqual({
			mode: { type: 'manifest' },
			prefetch: {},
			projectUrl: BACKEND,
			routePrefix: '/api/inth',
		});

		const direct = await loadConsent(
			createEvent({ fetch, headers: { cookie: CONSENTED_COOKIE } }),
			{ fetch }
		);
		expect(direct.consent.prefetch.initialRecords).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
	});
});
