import {
	buildConsentSessionReport,
	createConsentManifestPolicyPack,
} from '@inth/sdk-schema/types';
import type { ConsentManifest } from '@inth/sdk-schema/types';
import { describe, expect, test, vi } from 'vitest';

import { createV1ManifestTransport } from '../../transports/v1/manifest';
import { reportV1ConsentSession } from '../../transports/v1/session-report';
import {
	forwardSessionReportHeaders,
	isSpeculativeRequest,
	resolveSessionReportProjectUrl,
} from '../session-report';

const manifest: ConsentManifest = {
	branding: 'inth',
	policyPacks: [
		createConsentManifestPolicyPack({
			categories: ['marketing'],
			id: 'eu-opt-in',
			match: { countries: ['DE'], fallback: true },
			model: 'opt-in',
			prompt: 'choice',
			scopeMode: 'strict',
			validity: { choiceDays: 365 },
		}),
	],
	revision: 'rev-1',
	schemaVersion: 2,
	tenantId: 'tenant_1',
	translations: {
		i18n: {
			defaultProfile: 'default',
			messages: {
				default: {
					fallbackLanguage: 'en',
					translations: { en: { common: { acceptAll: 'Accept all' } } },
				},
			},
		},
	},
};

const resolveInit = async (
	overrides: { country?: string; gpc?: boolean } = {}
) => {
	const transport = createV1ManifestTransport({
		projectUrl: 'https://consent.example.com',
		snapshot: manifest,
	});
	const response = await transport.init({
		overrides: { country: 'DE', language: 'de', ...overrides },
		user: null,
	});
	return response;
};

const readBody = (call: unknown[] | undefined) => {
	if (!call) {
		throw new Error('expected a fetch call');
	}
	return JSON.parse((call[1] as RequestInit).body as string) as Record<
		string,
		unknown
	>;
};

describe('buildConsentSessionReport', () => {
	test('describes a matched resolution and the inputs it ran on', async () => {
		const init = await resolveInit();
		const report = buildConsentSessionReport({
			adapter: '@inth/nextjs',
			init: init as never,
			inputs: { country: 'DE', gpc: true, region: null },
			manifest,
			source: 'route',
		});
		expect(report).toMatchObject({
			adapter: '@inth/nextjs',
			country: 'DE',
			gpc: true,
			language: 'en',
			policy: { id: 'eu-opt-in', matchedBy: 'country', model: 'opt-in' },
			region: null,
			resolution: 'matched',
			revision: 'rev-1',
			source: 'route',
			tenantId: 'tenant_1',
		});
		expect(typeof report.policy?.fingerprint).toBe('string');
	});

	test('records no policy when nothing matched', () => {
		const report = buildConsentSessionReport({
			init: {
				policyResolution: { policy: null, status: 'no-match', version: 1 },
				translations: { language: 'en' },
			} as never,
			manifest: { revision: 'rev-1' },
			source: 'render',
		});
		expect(report.policy).toBeNull();
		expect(report.resolution).toBe('no-match');
		expect(report.gpc).toBe(false);
		expect(Object.hasOwn(report, 'tenantId')).toBe(false);
	});
});

describe('resolveSessionReportProjectUrl', () => {
	test('accepts only an explicit absolute backend', () => {
		expect(
			resolveSessionReportProjectUrl({
				projectUrl: 'https://consent.example.com/',
			})
		).toBe('https://consent.example.com');
		// A relative URL cannot be fetched from a server, and the app's own
		// proxy route would count the visitor twice on the way through.
		expect(resolveSessionReportProjectUrl({ projectUrl: '/api/inth' })).toBe(
			undefined
		);
		expect(resolveSessionReportProjectUrl({})).toBe(undefined);
	});
});

describe('forwardSessionReportHeaders', () => {
	test('ignores a caller-supplied x-inth-client-ip', () => {
		// A visitor can send the report header to a public init route, so the
		// address always comes from the proxy chain.
		expect(
			forwardSessionReportHeaders(
				new Headers({
					'x-forwarded-for': '203.0.113.42',
					'x-inth-client-ip': '198.51.100.7',
				})
			)
		).toEqual({ 'x-inth-client-ip': '203.0.113.42' });
	});

	test('derives the client IP from the proxy chain and copies the user agent, never cookies', () => {
		const forwarded = forwardSessionReportHeaders(
			new Headers({
				cookie: 'session=secret',
				'user-agent': 'Mozilla/5.0',
				'x-forwarded-for': '203.0.113.42, 10.0.0.1',
			})
		);
		expect(forwarded).toEqual({
			'user-agent': 'Mozilla/5.0',
			'x-inth-client-ip': '203.0.113.42',
		});
	});

	test('reads a Node-style header record regardless of casing', () => {
		expect(
			forwardSessionReportHeaders({
				Cookie: 'a=b',
				'User-Agent': ['UA'],
				'X-Forwarded-For': '203.0.113.42',
			})
		).toEqual({ 'user-agent': 'UA', 'x-inth-client-ip': '203.0.113.42' });
	});
});

describe('reportV1ConsentSession', () => {
	const JOURNEY_ID = '3b241101-e2bb-4255-8caf-4136c566a962';
	const journeyURL = `https://shop.example.com/api/inth/init?journey=${JOURNEY_ID}&journeyScope=page&stored=1`;

	test('reads the journey from the request URL, with the Origin host as property', async () => {
		const init = await resolveInit();
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 204 }));
		await reportV1ConsentSession({
			fetch: fetchSpy,
			headers: new Headers({ origin: 'https://www.example.org' }),
			init: init as never,
			manifest,
			projectUrl: 'https://consent.example.com',
			source: 'route',
			url: journeyURL,
		});
		expect(readBody(fetchSpy.mock.calls[0]).journey).toEqual({
			id: JOURNEY_ID,
			prompt: 'stored',
			property: 'www.example.org',
			scope: 'page',
			storedChoice: true,
		});
	});

	test('an explicit journey wins over the request URL', async () => {
		const init = await resolveInit();
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 204 }));
		const explicit = {
			id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
			scope: 'tab',
			storedChoice: false,
		} as const;
		await reportV1ConsentSession({
			fetch: fetchSpy,
			init: init as never,
			journey: explicit,
			manifest,
			projectUrl: 'https://consent.example.com',
			source: 'render',
			url: journeyURL,
		});
		expect(readBody(fetchSpy.mock.calls[0]).journey).toEqual({
			...explicit,
			prompt: 'due',
		});
	});

	test('posts the report with the visitor headers only', async () => {
		const init = await resolveInit();
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 204 }));
		const registered: Promise<void>[] = [];

		await reportV1ConsentSession({
			adapter: '@inth/svelte',
			fetch: fetchSpy,
			headers: new Headers({
				cookie: 'inth=secret',
				'user-agent': 'UA',
				'x-forwarded-for': '203.0.113.42',
			}),
			init: init as never,
			inputs: { country: 'DE', gpc: false },
			manifest,
			projectUrl: 'https://consent.example.com',
			source: 'route',
			waitUntil: (task) => {
				registered.push(task);
			},
		});

		expect(registered).toHaveLength(1);
		const [url, request] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://consent.example.com/v1/consent/sessions');
		expect(request.method).toBe('POST');
		const headers = request.headers as Record<string, string>;
		expect(headers['content-type']).toBe('application/json');
		expect(headers['x-inth-client-ip']).toBe('203.0.113.42');
		expect(headers['user-agent']).toBe('UA');
		expect(headers).not.toHaveProperty('cookie');
		expect(headers).not.toHaveProperty('x-inth-version');
		expect(readBody(fetchSpy.mock.calls[0])).toMatchObject({
			adapter: '@inth/svelte',
			country: 'DE',
			revision: 'rev-1',
			source: 'route',
		});
	});

	test('never rejects, and never fetches without an absolute backend', async () => {
		const init = await resolveInit();
		const failing = vi.fn().mockRejectedValue(new Error('backend down'));
		await expect(
			reportV1ConsentSession({
				fetch: failing,
				init: init as never,
				manifest,
				projectUrl: 'https://consent.example.com',
				source: 'render',
			})
		).resolves.toBeUndefined();
		expect(failing).toHaveBeenCalledTimes(1);

		const unused = vi.fn();
		await reportV1ConsentSession({
			fetch: unused,
			init: init as never,
			manifest,
			projectUrl: '/api/inth',
			source: 'render',
		});
		expect(unused).not.toHaveBeenCalled();
	});
});

describe('isSpeculativeRequest', () => {
	test('recognises prefetch and prerender signals from browsers, CDNs and Next', () => {
		const speculative: Record<string, string>[] = [
			{ 'sec-purpose': 'prefetch' },
			{ 'sec-purpose': 'prefetch;prerender' },
			{ purpose: 'prefetch' },
			{ 'x-moz': 'prefetch' },
			{ 'next-router-prefetch': '1' },
		];
		for (const headers of speculative) {
			expect(isSpeculativeRequest(new Headers(headers))).toBe(true);
		}
		expect(isSpeculativeRequest(new Headers({ accept: 'text/html' }))).toBe(
			false
		);
		expect(isSpeculativeRequest(undefined)).toBe(false);
	});

	test('a speculative request sends no report', async () => {
		const init = await resolveInit();
		const fetchSpy = vi.fn();
		await reportV1ConsentSession({
			fetch: fetchSpy,
			headers: new Headers({ 'next-router-prefetch': '1' }),
			init: init as never,
			manifest,
			projectUrl: 'https://consent.example.com',
			source: 'render',
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('session report lifetime hook', () => {
	test('a throwing waitUntil never reaches the caller', async () => {
		const init = await resolveInit();
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 204 }));
		await expect(
			reportV1ConsentSession({
				fetch: fetchSpy,
				init: init as never,
				manifest,
				projectUrl: 'https://consent.example.com',
				source: 'route',
				waitUntil: () => {
					throw new Error('after() called outside a request scope');
				},
			})
		).resolves.toBeUndefined();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});

describe('a session report never blocks the resolution', () => {
	test('the init resolves while the report is still in flight', async () => {
		// A backend that never answers must not hold the visitor's init: the
		// report is detached, and the transport returns without it.
		let settle: (() => void) | undefined;
		const pending = new Promise<Response>((resolve) => {
			settle = () => resolve(new Response(null, { status: 204 }));
		});
		const fetchSpy = vi.fn().mockReturnValue(pending);
		const registered: Promise<void>[] = [];
		const transport = createV1ManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://consent.example.com',
			report: {
				source: 'render',
				waitUntil: (task) => {
					registered.push(task);
				},
			},
			snapshot: manifest,
		});

		const response = await transport.init({
			overrides: { country: 'DE' },
			user: null,
		});
		expect(response.policyResolution?.status).toBe('matched');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(registered).toHaveLength(1);

		let done = false;
		void registered[0]?.then(() => {
			done = true;
		});
		await Promise.resolve();
		expect(done).toBe(false);
		settle?.();
		await registered[0];
		expect(done).toBe(true);
	});

	test('a non-2xx answer and a timeout both resolve without rejecting', async () => {
		const init = await resolveInit();
		const refused = vi
			.fn()
			.mockResolvedValue(new Response('nope', { status: 500 }));
		await expect(
			reportV1ConsentSession({
				fetch: refused,
				init: init as never,
				manifest,
				projectUrl: 'https://consent.example.com',
				source: 'route',
			})
		).resolves.toBeUndefined();

		// The request carries an abort signal so a hanging backend cannot hold
		// a `waitUntil` slot open; a fetch aborted by it resolves like any
		// other failure.
		const timedOut = vi.fn((_url: string, request: RequestInit) => {
			expect(request.signal).toBeInstanceOf(AbortSignal);
			return Promise.reject(
				new DOMException('The operation timed out.', 'TimeoutError')
			);
		});
		await expect(
			reportV1ConsentSession({
				fetch: timedOut as unknown as typeof globalThis.fetch,
				init: init as never,
				manifest,
				projectUrl: 'https://consent.example.com',
				source: 'route',
			})
		).resolves.toBeUndefined();
		expect(timedOut).toHaveBeenCalledTimes(1);
	});

	test('hands waitUntil the same promise it returns', async () => {
		const init = await resolveInit();
		const registered: Promise<void>[] = [];
		const returned = reportV1ConsentSession({
			fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
			init: init as never,
			manifest,
			projectUrl: 'https://consent.example.com',
			source: 'route',
			waitUntil: (task) => {
				registered.push(task);
			},
		});
		expect(registered[0]).toBe(returned);
		await returned;
	});

	test('a HEAD probe sends no report; a GET in any case does', async () => {
		const init = await resolveInit();
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 204 }));
		await reportV1ConsentSession({
			fetch: fetchSpy,
			init: init as never,
			manifest,
			method: 'HEAD',
			projectUrl: 'https://consent.example.com',
			source: 'route',
		});
		expect(fetchSpy).not.toHaveBeenCalled();

		await reportV1ConsentSession({
			fetch: fetchSpy,
			init: init as never,
			manifest,
			method: 'get',
			projectUrl: 'https://consent.example.com',
			source: 'route',
		});
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});

describe('the manifest transport report option', () => {
	test('reports after each init with the transport backend and headers', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 204 }));
		const transport = createV1ManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://consent.example.com',
			report: {
				adapter: '@inth/nextjs',
				headers: { cookie: 'inth=secret', 'x-forwarded-for': '203.0.113.42' },
				source: 'render',
			},
			snapshot: manifest,
		});

		await transport.init({
			overrides: { country: 'DE', gpc: true, language: 'de' },
			user: null,
		});
		// The report is detached; let it land.
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});

		const call = fetchSpy.mock.calls.find(
			([url]) => url === 'https://consent.example.com/v1/consent/sessions'
		);
		expect(call).toBeDefined();
		const headers = ((call as unknown[])[1] as RequestInit).headers as Record<
			string,
			string
		>;
		expect(headers['x-inth-client-ip']).toBe('203.0.113.42');
		expect(headers).not.toHaveProperty('cookie');
		expect(readBody(call)).toMatchObject({
			adapter: '@inth/nextjs',
			country: 'DE',
			gpc: true,
			policy: { id: 'eu-opt-in' },
			source: 'render',
		});
	});

	test('sends nothing without the option', async () => {
		const fetchSpy = vi.fn();
		const transport = createV1ManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://consent.example.com',
			snapshot: manifest,
		});
		await transport.init({ overrides: { country: 'DE' }, user: null });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
