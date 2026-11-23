/**
 * `clientMode()` turns mode data into the transport a server-framework root
 * uses. The init paths load on demand; these tests inject the loaders and
 * check what each mode sends, and when.
 */
import { createConsentManifestPolicyPack } from '@inth/sdk-schema/types';
import type { ConsentManifest } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { optInRule } from '../../__tests__/fixtures/kernel-fixtures';
import { primePrefetchedInitialData } from '../../libs/prefetch/prefetch';
import { hosted, manifest } from '../../modes';
import { createBrowserManifestTransport } from '../../transports/manifest-browser';
import type { ProviderTransportContext } from '../../transports/mode';
import { recordAnswer } from '../../transports/v1/__tests__/fixtures';
import { createV1HostedTransport } from '../../transports/v1/hosted';
import type { InitContext, KernelTransport, SavePayload } from '../../consent-kernel.model';
import {
	clientMode,
	lazyBrowserManifest,
	lazyHosted,
	lazyTesting,
} from '../client-mode';
import type {
	LoadHostedModule,
	LoadManifestBrowserModule,
	LoadTestingModule,
} from '../client-mode';

const context = {
	prefetch: {},
	translations: { language: 'en', translations: {} },
} as unknown as ProviderTransportContext;

/** A request URL without the query Inth adds to `/v1/consent/init`. */
const pathOf = (url: unknown): string => String(url).split('?')[0] ?? '';

const initContext = (overrides: InitContext['overrides'] = {}): InitContext =>
	({ overrides, user: null }) as unknown as InitContext;

const jsonResponse = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json' },
		status: 200,
	});

const everywhereManifest: ConsentManifest = {
	branding: 'inth',
	policyPacks: [
		createConsentManifestPolicyPack({
			...optInRule({ id: 'everywhere' }),
			match: { isDefault: true },
		}),
	],
	revision: '1',
	schemaVersion: 2,
};

const fetchSpy = vi.fn((_url: string, init?: RequestInit) =>
	Promise.resolve(jsonResponse(recordAnswer(init)))
);

const originalFetch = globalThis.fetch;

beforeEach(() => {
	fetchSpy.mockReset();
	fetchSpy.mockImplementation((_url, init) =>
		Promise.resolve(jsonResponse(recordAnswer(init)))
	);
	globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe('clientMode()', () => {
	test("defaults to manifest mode, the server frameworks' default", () => {
		expect({
			...clientMode(undefined, {
				projectUrl: 'https://backend.example',
				routePrefix: '/api/inth',
			}),
		}).toEqual({ kind: 'manifest', type: 'manifest' });
	});

	test('hosted() asks the backend /v1/consent/init', async () => {
		const mode = clientMode(hosted(), {
			projectUrl: 'https://backend.example',
		});

		expect(mode.kind).toBe('hosted');
		fetchSpy.mockImplementation(() => Promise.reject(new Error('offline')));
		await mode(context)
			.init?.(initContext())
			.catch(() => undefined);
		expect(pathOf(fetchSpy.mock.calls[0]?.[0])).toBe(
			'https://backend.example/v1/consent/init'
		);
	});

	test('carries the mode data', () => {
		expect({ ...clientMode(manifest(), { projectUrl: '' }) }).toEqual({
			kind: 'manifest',
			type: 'manifest',
		});
		expect(
			clientMode({ type: 'testing' }, { projectUrl: '/api/inth' }).kind
		).toBe('offline');
		expect(
			clientMode(manifest({ resolve: 'browser' }), { projectUrl: '' }).kind
		).toBe('manifest');
	});

	test('manifest() re-inits through the route prefix and asserts the decision', async () => {
		const mode = clientMode(manifest(), {
			projectUrl: 'https://backend.example',
			routePrefix: '/api/inth/',
		});
		const transport = mode(context);

		// No init has resolved a decision, and the payload carries none.
		await expect(
			transport.save?.({ subjectId: 'sub_1' } as unknown as SavePayload)
		).rejects.toThrow('cannot save before init resolved a policy decision');

		fetchSpy.mockImplementation(() => Promise.reject(new Error('offline')));
		await transport.init?.(initContext()).catch(() => undefined);
		expect(pathOf(fetchSpy.mock.calls[0]?.[0])).toBe(
			'/api/inth/v1/consent/init'
		);
	});

	test('manifest() without a route prefix inits against the backend, unasserted', async () => {
		const transport = clientMode(manifest(), {
			projectUrl: 'https://backend.example',
		})(context);

		fetchSpy.mockImplementation(() => Promise.reject(new Error('offline')));
		await transport.init?.(initContext()).catch(() => undefined);

		expect(pathOf(fetchSpy.mock.calls[0]?.[0])).toBe(
			'https://backend.example/v1/consent/init'
		);
	});

	test('manifest() never saves to a route prefix it was not given as the backend', () => {
		// A consent route without a proxy answers `GET` only, so a save posted
		// to it would 404 or 405 after the visitor chose.
		expect(() =>
			clientMode(manifest({ snapshot: everywhereManifest }), {
				routePrefix: '/api/inth',
			})
		).toThrow('`projectUrl` is required');
		expect(() =>
			clientMode(
				manifest({ resolve: 'browser', snapshot: everywhereManifest }),
				{ routePrefix: '/api/inth' }
			)
		).toThrow('`projectUrl` is required');
	});

	test('manifest() saves through a forwarding route passed as the backend', async () => {
		const transport = clientMode(manifest(), {
			projectUrl: '/api/inth',
			routePrefix: '/api/inth',
		})(context);

		await transport.save?.({
			choice: { categories: {}, version: 3 },
			confirmed: { actionAt: 1, categories: {} },
			consents: { necessary: true },
			decisionInputs: { fingerprint: 'f', policyId: 'p' },
			idempotencyKey: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1d',
			subjectId: 'sub_1',
		} as unknown as SavePayload);

		expect(pathOf(fetchSpy.mock.calls[0]?.[0])).toBe(
			'/api/inth/v1/consent/records'
		);
	});

	test('a testing value needs no backend URL', () => {
		expect(clientMode({ type: 'testing' }).kind).toBe('offline');
		expect(
			clientMode({ type: 'testing' }, { routePrefix: '/api/inth' }).kind
		).toBe('offline');
	});

	test('throws when there is no backend URL', () => {
		expect(() => clientMode(undefined)).toThrow('`projectUrl` is required');
		expect(() => clientMode(hosted())).toThrow('`projectUrl` is required');
		expect(() => clientMode(manifest())).toThrow('`projectUrl` is required');
	});

	test('returns a transport factory unchanged, warning for an implementation', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const implementation = Object.assign(() => ({}), {
			kind: 'hosted' as const,
		});

		expect(clientMode(implementation)).toBe(implementation);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('`mode` is the hosted() transport itself')
		);
	});
});

describe('lazyHosted()', () => {
	test('a save goes out at once, without loading the init path', async () => {
		const load = vi.fn<LoadHostedModule>(() =>
			Promise.reject(new Error('the init path must not load'))
		);
		const transport = lazyHosted(
			{ projectUrl: 'https://backend.example' },
			load
		)(context);

		await transport.save?.({
			choice: { categories: {}, version: 3 },
			confirmed: { actionAt: 1, categories: {} },
			consents: { necessary: true },
			idempotencyKey: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1d',
			subjectId: 'sub_1',
		} as unknown as SavePayload);

		expect(load).not.toHaveBeenCalled();
		expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
			'https://backend.example/v1/consent/records'
		);
	});

	test('the first init sends /init while the init path loads, and the transport reads it', async () => {
		fetchSpy.mockImplementationOnce(() =>
			Promise.resolve(
				jsonResponse({
					branding: 'inth',
					location: { countryCode: 'DE', regionCode: null },
					translations: { language: 'de', translations: { common: {} } },
				})
			)
		);
		let release: () => void = () => undefined;
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		const load = vi.fn<LoadHostedModule>(async () => {
			await released;
			return { createV1HostedTransport };
		});
		const transport = lazyHosted(
			{ projectUrl: 'https://backend.example' },
			load
		)(context);

		const pending = transport.init?.(
			initContext({ country: 'DE', language: 'de' })
		);
		await Promise.resolve();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		const sent = new URL(String(url));
		expect(`${sent.origin}${sent.pathname}`).toBe(
			'https://backend.example/v1/consent/init'
		);
		expect(sent.searchParams.get('country')).toBe('DE');
		// Only `Accept` and `Accept-Language`: no CORS preflight.
		expect(init?.headers).toEqual({
			accept: 'application/json',
			'accept-language': 'de',
		});
		expect(init?.credentials).toBe('same-origin');
		release();
		await pending;
		// The loaded transport took the early response.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	test("the first init takes the page script's early response", async () => {
		fetchSpy.mockImplementation(() =>
			Promise.resolve(
				jsonResponse({
					branding: 'inth',
					location: { countryCode: 'DE', regionCode: null },
					translations: { language: 'en', translations: { common: {} } },
				})
			)
		);
		await primePrefetchedInitialData({
			journey: false,
			projectUrl: 'https://backend.example',
		});
		const transport = lazyHosted(
			{ projectUrl: 'https://backend.example' },
			() => Promise.resolve({ createV1HostedTransport })
		)(context);

		await transport.init?.(initContext());

		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	test('with a banner experiment arm, the first init sends one /v1/consent/init', async () => {
		fetchSpy.mockImplementation(() =>
			Promise.resolve(
				jsonResponse({
					branding: 'inth',
					location: { countryCode: 'DE', regionCode: null },
					translations: { language: 'en', translations: { common: {} } },
				})
			)
		);
		const transport = lazyHosted(
			{ projectUrl: 'https://backend.example' },
			() => Promise.resolve({ createV1HostedTransport })
		)(context);

		await transport.init?.({
			...initContext(),
			experiment: { arm: 'compact', id: 'banner-copy' },
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const sent = new URL(String(fetchSpy.mock.calls[0]?.[0]));
		expect(sent.searchParams.toString()).toContain('compact');
	});

	test('sends no early /init with init headers, which the transport filters', async () => {
		const init = vi.fn(() => Promise.resolve({}));
		const transport = lazyHosted(
			{
				headers: { 'accept-language': 'de' },
				projectUrl: 'https://backend.example',
			},
			() =>
				Promise.resolve({
					createV1HostedTransport: () =>
						({ init }) as unknown as ReturnType<typeof createV1HostedTransport>,
				})
		)(context);

		await transport.init?.(initContext());

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(init).toHaveBeenCalledTimes(1);
	});

	test('the first init reads initialData and sends no /v1/consent/init', async () => {
		const transport = clientMode(manifest(), {
			initialData: Promise.resolve({
				init: {
					branding: 'inth',
					location: { countryCode: 'DE', regionCode: null },
					translations: { language: 'en', translations: { common: {} } },
				},
			} as never),
			projectUrl: 'https://backend.example',
			routePrefix: '/api/inth',
		})(context);

		const response = await transport.init?.(initContext());

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(JSON.stringify(response)).toContain('"countryCode":"DE"');
	});

	test('a failed chunk load is retried on the next init', async () => {
		const init = vi.fn(() => Promise.resolve({}));
		const load = vi
			.fn<LoadHostedModule>()
			.mockRejectedValueOnce(new Error('chunk failed'))
			.mockResolvedValueOnce({
				createV1HostedTransport: () =>
					({ init }) as unknown as ReturnType<typeof createV1HostedTransport>,
			});
		fetchSpy.mockImplementation(() => Promise.reject(new Error('offline')));
		const transport = lazyHosted({ projectUrl: '/api/inth' }, load)(context);

		await expect(transport.init?.(initContext())).rejects.toThrow(
			'chunk failed'
		);
		await transport.init?.(initContext());

		expect(load).toHaveBeenCalledTimes(2);
		expect(init).toHaveBeenCalledTimes(1);
	});
});

describe('lazyTesting()', () => {
	test('loads its transport on first init, once', async () => {
		const transportInit = vi.fn(() => Promise.resolve({}));
		const build = vi.fn(
			() => () => ({ init: transportInit }) as KernelTransport
		);
		const load = vi.fn<LoadTestingModule>(() =>
			Promise.resolve({
				testingTransport: build as unknown as Awaited<
					ReturnType<LoadTestingModule>
				>['testingTransport'],
			})
		);
		const transport = lazyTesting('@inth/nextjs/testing', {}, load)(context);

		expect(load).not.toHaveBeenCalled();
		await transport.init?.(initContext());
		await transport.init?.(initContext());

		expect(load).toHaveBeenCalledTimes(1);
		expect(build).toHaveBeenCalledWith('@inth/nextjs/testing', {});
		expect(transportInit).toHaveBeenCalledTimes(2);
	});

	test('the loaded transport throws in a production build', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const transport = lazyTesting('@inth/nextjs/testing')(context);

		await expect(transport.init?.(initContext())).rejects.toThrow(
			'testing() from @inth/nextjs/testing is for tests and does not run in production'
		);
		vi.unstubAllEnvs();
	});
});

describe('lazyBrowserManifest()', () => {
	test('starts the resolver chunk and the manifest request when built', async () => {
		fetchSpy.mockImplementation((url: string) =>
			Promise.resolve(
				String(url) === '/api/inth/v1/consent/manifest'
					? jsonResponse(everywhereManifest)
					: jsonResponse({ subjectId: 'sub_saved' })
			)
		);
		const load = vi.fn<LoadManifestBrowserModule>(() =>
			Promise.resolve({ createBrowserManifestTransport })
		);
		const transport = clientMode(manifest({ resolve: 'browser' }), {
			projectUrl: 'https://backend.example',
			routePrefix: '/api/inth',
		});
		const built = lazyBrowserManifest(
			{
				manifestUrl: '/api/inth/v1/consent/manifest',
				projectUrl: 'https://backend.example',
			},
			load
		)(context);

		expect(transport.kind).toBe('manifest');
		expect(load).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
			'/api/inth/v1/consent/manifest',
		]);

		const response = await built.init?.(initContext({ country: 'DE' }));

		expect(load).toHaveBeenCalledTimes(1);
		// The resolver read the early manifest response.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(response?.policyResolution).toMatchObject({ status: 'matched' });
	});

	const resolvedPrefetch = {
		initialPolicyResolution: { status: 'matched' },
	} as unknown as ProviderTransportContext['prefetch'];

	const routeManifest = () =>
		fetchSpy.mockImplementation((url: string) =>
			Promise.resolve(
				String(url) === '/api/inth/v1/consent/manifest'
					? jsonResponse(everywhereManifest)
					: jsonResponse({ subjectId: 'sub_saved' })
			)
		);

	const build = (
		transportContext: ProviderTransportContext,
		load: LoadManifestBrowserModule
	) =>
		lazyBrowserManifest(
			{
				manifestUrl: '/api/inth/v1/consent/manifest',
				projectUrl: 'https://backend.example',
			},
			load
		)(transportContext);

	test('a server state with a policy starts neither until an init needs them', async () => {
		routeManifest();
		const load = vi.fn<LoadManifestBrowserModule>(() =>
			Promise.resolve({ createBrowserManifestTransport })
		);
		const built = build({ ...context, prefetch: resolvedPrefetch }, load);

		expect(load).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();

		const response = await built.init?.(initContext());

		expect(load).toHaveBeenCalledTimes(1);
		expect(response?.policyResolution).toMatchObject({ status: 'matched' });
	});

	test('a later init sends the manifest request while the resolver loads', async () => {
		routeManifest();
		const chunk =
			Promise.withResolvers<Awaited<ReturnType<LoadManifestBrowserModule>>>();
		const built = build(
			{ ...context, prefetch: resolvedPrefetch },
			() => chunk.promise
		);

		const response = built.init?.(initContext());

		expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
			'/api/inth/v1/consent/manifest',
		]);
		chunk.resolve({ createBrowserManifestTransport });
		expect((await response)?.policyResolution).toMatchObject({
			status: 'matched',
		});
		// The resolver read the early manifest response.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	// The streamed init answers from the policy whether or not the state
	// is marked pending, so neither would be read.
	test('a streamed state with a policy marked pending starts neither', async () => {
		const load = vi.fn<LoadManifestBrowserModule>(() =>
			Promise.resolve({ createBrowserManifestTransport })
		);
		const pendingPolicy = {
			...resolvedPrefetch,
			initialPolicyPending: true,
		} as ProviderTransportContext['prefetch'];
		const stream = Promise.withResolvers<typeof pendingPolicy>();
		build({ ...context, pendingPrefetch: stream.promise }, load);
		stream.resolve(pendingPolicy);
		await stream.promise;
		await Promise.resolve();

		expect(load).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('a streamed state with a policy starts neither', async () => {
		const load = vi.fn<LoadManifestBrowserModule>(() =>
			Promise.resolve({ createBrowserManifestTransport })
		);
		const stream = Promise.withResolvers<typeof resolvedPrefetch>();
		build({ ...context, pendingPrefetch: stream.promise }, load);
		stream.resolve(resolvedPrefetch);
		await stream.promise;
		await Promise.resolve();

		expect(load).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('a streamed state without a policy starts both once it arrives', async () => {
		routeManifest();
		const load = vi.fn<LoadManifestBrowserModule>(() =>
			Promise.resolve({ createBrowserManifestTransport })
		);
		const stream = Promise.withResolvers<undefined>();
		const built = build({ ...context, pendingPrefetch: stream.promise }, load);

		expect(load).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();

		stream.resolve(undefined);
		await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
		expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
			'/api/inth/v1/consent/manifest',
		]);

		const response = await built.init?.(initContext());

		// The resolver read the early manifest response.
		expect(load).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(response?.policyResolution).toMatchObject({ status: 'matched' });
	});

	test('a snapshot needs no manifest request', async () => {
		const transport = lazyBrowserManifest(
			{ projectUrl: 'https://backend.example', snapshot: everywhereManifest },
			() => Promise.resolve({ createBrowserManifestTransport })
		)(context);

		await transport.init?.(initContext());

		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
