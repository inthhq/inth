/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { corsPreflightReasons } from '../../../__tests__/fixtures/cors-safelist';
import { createHostedTransport } from '../../../transports/hosted';
import type { KernelJourney } from '../../../types';
import { buildPrefetchScript, primePrefetchedInitialData } from '../prefetch';

const legacyPolicy = { id: 'legacy', model: 'opt-in', ui: { mode: 'banner' } };
const payload = {
	policyResolution: { policy: null, status: 'no-match', version: 1 },
};
const response = (
	body: Record<string, unknown> = payload,
	contract: string | null = '1'
) =>
	new Response(
		JSON.stringify({
			branding: 'inth',
			location: { countryCode: null, regionCode: null },
			translations: { language: 'en', translations: {} },
			...body,
		}),
		{ headers: contract === null ? {} : { 'x-inth-policy-contract': contract } }
	);
beforeEach(() => {
	delete (window as Window & { __inthInitialDataPromises?: unknown })
		.__inthInitialDataPromises;
	delete (window as Window & { __inthExperiment?: unknown }).__inthExperiment;
	delete (window as JourneyWindow).__inthJourney;
	localStorage.clear();
	Object.defineProperty(navigator, 'globalPrivacyControl', {
		configurable: true,
		value: false,
	});
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
type JourneyWindow = Window & { __inthJourney?: KernelJourney };
// The runtime's init carries the journey the early request claimed.
const context = {
	get journey() {
		return (window as JourneyWindow).__inthJourney;
	},
	overrides: {},
	user: null,
};
const withoutJourney = { overrides: {}, user: null };

describe('hosted browser prefetch consumption', () => {
	it.each([{ country: 'DE' }, { region: 'CA' }, { language: 'fr' }])(
		'does not treat omitted runtime inputs as matching %j',
		async (overrides) => {
			const fetch = vi
				.fn()
				.mockImplementation(() => Promise.resolve(response()));
			vi.stubGlobal('fetch', fetch);
			await primePrefetchedInitialData({ overrides, projectUrl: '/api/inth' });
			await createHostedTransport({ projectUrl: '/api/inth' }).init(context);
			expect(fetch).toHaveBeenCalledTimes(2);
		}
	);

	it('consumes the generated script response once and preserves protocol negotiation', async () => {
		const fetch = vi.fn().mockImplementation(() => Promise.resolve(response()));
		vi.stubGlobal('fetch', fetch);
		// Execute the actual beforeInteractive script, including its window registry.
		window.eval(buildPrefetchScript({ projectUrl: '/api/inth' }));
		const transport = createHostedTransport({ projectUrl: '/api/inth' });
		expect(fetch).toHaveBeenCalledTimes(1);
		const first = await transport.init?.(context);
		expect(first?.policyResolution).toEqual(payload.policyResolution);
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0] ?? [];
		expect(new URL(url).searchParams.get('contract')).toBe('1');
		// A cross-origin backend answers this without a CORS preflight.
		expect(corsPreflightReasons(init)).toEqual([]);
		await transport.init?.(context);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("sends init through a custom fetch instead of using the page's response", async () => {
		const pageFetch = vi
			.fn()
			.mockImplementation(() => Promise.resolve(response()));
		vi.stubGlobal('fetch', pageFetch);
		window.eval(buildPrefetchScript({ projectUrl: '/api/inth' }));
		// A wrapper that signs or routes requests has to see `/init`.
		const signed = vi
			.fn()
			.mockImplementation(() => Promise.resolve(response()));
		await createHostedTransport({
			fetch: signed,
			projectUrl: '/api/inth',
		}).init?.(context);
		expect(pageFetch).toHaveBeenCalledTimes(1);
		expect(signed).toHaveBeenCalledTimes(1);
	});

	it.each([
		['1', 'invalid-payload'],
		['99', 'unsupported-contract'],
	])(
		'keeps a producer %s declaration when its early response is consumed',
		async (contract, reason) => {
			const fetch = vi
				.fn()
				.mockResolvedValue(response({ policy: legacyPolicy }, contract));
			vi.stubGlobal('fetch', fetch);
			await primePrefetchedInitialData({ projectUrl: '/api/inth' });
			const result = await createHostedTransport({
				projectUrl: '/api/inth',
			}).init?.(context);
			expect(result?.policyResolution).toMatchObject({
				reason,
				status: 'failed',
			});
			expect(fetch).toHaveBeenCalledTimes(1);
		}
	);

	it('rejects cached responses that predate the policy contract', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(response({ policy: legacyPolicy }, null))
		);
		await primePrefetchedInitialData({ projectUrl: '/api/inth' });
		const result = await createHostedTransport({
			projectUrl: '/api/inth',
		}).init?.(context);
		expect(result?.policyResolution).toMatchObject({
			reason: 'unsupported-contract',
			status: 'failed',
		});
	});

	it('retries once after a failed early request', async () => {
		const fetch = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue(response());
		vi.stubGlobal('fetch', fetch);
		await primePrefetchedInitialData({ projectUrl: '/api/inth' });
		await createHostedTransport({ projectUrl: '/api/inth' }).init?.(context);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('does not reuse a request for different geo or a custom init route', async () => {
		const fetch = vi.fn().mockImplementation(() => Promise.resolve(response()));
		vi.stubGlobal('fetch', fetch);
		await primePrefetchedInitialData({
			overrides: { country: 'DE' },
			projectUrl: '/api/inth',
		});
		await createHostedTransport({ projectUrl: '/api/inth' }).init?.({
			...context,
			overrides: { country: 'FR' },
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		await createHostedTransport({
			initUrl: '/other/init',
			projectUrl: '/api/inth',
		}).init?.(context);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('sends the request within init() when nothing was prefetched', async () => {
		const fetch = vi.fn().mockResolvedValue(response());
		vi.stubGlobal('fetch', fetch);
		const sent = createHostedTransport({ projectUrl: '/api/inth' }).init?.(
			context
		);
		// A provider sends init from its first render; the request has to be
		// out by the time the call returns, not a microtask later.
		expect(fetch).toHaveBeenCalledTimes(1);
		expect((await sent)?.policyResolution).toEqual(payload.policyResolution);
	});

	it('the inline script accepts exactly boolean true for GPC', async () => {
		Object.defineProperty(navigator, 'globalPrivacyControl', {
			configurable: true,
			value: '1',
		});
		const fetch = vi.fn().mockResolvedValue(response());
		vi.stubGlobal('fetch', fetch);
		window.eval(buildPrefetchScript({ projectUrl: '/api/inth' }));
		const entries = Object.values(
			(
				window as Window & {
					__inthInitialDataPromises?: Record<
						string,
						{ requestContext: { gpc: boolean } }
					>;
				}
			).__inthInitialDataPromises ?? {}
		);
		expect(entries.map((entry) => entry.requestContext.gpc)).toEqual([false]);
		// Detected GPC is never sent: browsers drop a script's `Sec-GPC`.
		expect(fetch.mock.calls[0]?.[1].headers).toEqual({});
		await Promise.resolve();
	});

	describe('journey', () => {
		it('sends its own /init without a journey when the early request sent one', async () => {
			const fetch = vi
				.fn()
				.mockImplementation(() => Promise.resolve(response()));
			vi.stubGlobal('fetch', fetch);
			window.eval(buildPrefetchScript({ projectUrl: '/api/inth' }));
			await createHostedTransport({ projectUrl: '/api/inth' }).init(
				withoutJourney
			);
			expect(fetch).toHaveBeenCalledTimes(2);
			const [url] = fetch.mock.calls[1] ?? [];
			expect(new URL(url, location.origin).searchParams.has('journey')).toBe(
				false
			);
		});

		it('reuses an early request built with journey: false', async () => {
			const fetch = vi
				.fn()
				.mockImplementation(() => Promise.resolve(response()));
			vi.stubGlobal('fetch', fetch);
			window.eval(
				buildPrefetchScript({ journey: false, projectUrl: '/api/inth' })
			);
			await createHostedTransport({ projectUrl: '/api/inth' }).init(
				withoutJourney
			);
			expect(fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('banner experiment arm', () => {
		const experiment = {
			arms: { bar: {}, floating: {} },
			id: 'banner-shape',
		};
		const running = (arm: string) => ({
			...context,
			experiment: { arm, id: 'banner-shape' },
		});
		const prefetchBar = () => {
			const fetch = vi
				.fn()
				.mockImplementation(() => Promise.resolve(response()));
			vi.stubGlobal('fetch', fetch);
			window.eval(
				buildPrefetchScript({
					experiment: { ...experiment, arm: 'bar' },
					projectUrl: '/api/inth',
				})
			);
			return fetch;
		};

		it('reuses an early request that sent the arm this init runs', async () => {
			const fetch = prefetchBar();
			await createHostedTransport({ projectUrl: '/api/inth' }).init(
				running('bar')
			);
			expect(fetch).toHaveBeenCalledTimes(1);
		});

		it.each([
			['another arm', running('floating')],
			['no arm', context],
		])(
			'sends its own /init when the early request sent %s',
			async (_label, ctx) => {
				const fetch = prefetchBar();
				await createHostedTransport({ projectUrl: '/api/inth' }).init(ctx);
				expect(fetch).toHaveBeenCalledTimes(2);
			}
		);

		it('sends its own /init for an arm the early request did not send', async () => {
			const fetch = vi
				.fn()
				.mockImplementation(() => Promise.resolve(response()));
			vi.stubGlobal('fetch', fetch);
			window.eval(buildPrefetchScript({ projectUrl: '/api/inth' }));
			await createHostedTransport({ projectUrl: '/api/inth' }).init(
				running('bar')
			);
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		it('reuses initial data that does not say which arm it carried', async () => {
			const fetch = vi.fn();
			vi.stubGlobal('fetch', fetch);
			const transport = createHostedTransport({
				initialData: Promise.resolve({
					init: await response().json(),
					producerPolicyContract: '1',
				}),
				projectUrl: '/api/inth',
			});
			await transport.init(running('bar'));
			expect(fetch).not.toHaveBeenCalled();
		});
	});
});
