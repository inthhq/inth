import type { ProviderTransportContext } from '@inth/sdk/engine';
import { describe, expect, it, vi } from 'vitest';

import { hosted as hostedMode, manifest as manifestMode } from '../mode';
import { testing as testingMode } from '../testing';
import { hostedTransport, lazyTransport, testingTransport } from '../transport';
import { testRule } from './policy-fixture';

const context: ProviderTransportContext = {
	consentCategories: ['necessary', 'measurement'],
	prefetch: {},
	translations: { language: 'en', translations: {} as never },
};

const BACKEND = 'https://consent.example.com';

describe('modes', () => {
	it('are plain serializable objects', () => {
		expect(JSON.parse(JSON.stringify(hostedMode()))).toEqual({
			type: 'hosted',
		});
		expect(
			JSON.parse(JSON.stringify(testingMode({ policy: [testRule] })))
		).toEqual({ policy: [testRule], type: 'testing' });
		expect(testingMode()).toEqual({ type: 'testing' });
		expect(manifestMode({ source: 'runtime' })).toEqual({
			source: 'runtime',
			type: 'manifest',
		});
	});
});

describe('the page transports', () => {
	it('reports the transport kind for window.inth', () => {
		expect(lazyTransport({ mode: hostedMode(), projectUrl: '/x' }).kind).toBe(
			'hosted'
		);
		expect(hostedTransport({ mode: hostedMode(), projectUrl: '/x' }).kind).toBe(
			'hosted'
		);
		expect(testingTransport({ mode: testingMode() }).kind).toBe('offline');
		expect(
			lazyTransport({ mode: manifestMode(), projectUrl: BACKEND }).kind
		).toBe('manifest');
	});

	it('resolves an offline policy with no network at all', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const transport = testingTransport({
			mode: testingMode({ policy: [testRule] }),
		})(context);
		const response = await transport.init?.({ overrides: {}, user: null });
		expect(response?.policyResolution).toMatchObject({
			policy: { prompt: 'choice' },
			status: 'matched',
		});
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it.each([
		['the injected route', '/api/inth', '/api/inth/init'],
		['the backend without a route', undefined, `${BACKEND}/init`],
	])(
		're-inits manifest mode through %s',
		async (_name, routePrefix, expected) => {
			// The transport captures `globalThis.fetch` when it is built, so the
			// stub has to be in place before the factory runs.
			const fetchImpl = vi.fn(() =>
				Promise.resolve(
					Response.json({
						location: { countryCode: 'DE', regionCode: null },
						policy: { id: 'p', model: 'opt-in', ui: { mode: 'banner' } },
						translations: { language: 'en', translations: {} },
					})
				)
			);
			const restore = globalThis.fetch;
			globalThis.fetch = fetchImpl as unknown as typeof globalThis.fetch;
			try {
				const transport = lazyTransport({
					mode: manifestMode(),
					projectUrl: BACKEND,
					routePrefix,
				})(context);
				await transport.init?.({ overrides: {}, user: null });
			} finally {
				globalThis.fetch = restore;
			}
			expect(fetchImpl).toHaveBeenCalledOnce();
			const [url] = fetchImpl.mock.calls[0] as unknown as [string | URL];
			expect(String(url).split('?')[0]).toBe(expected);
		}
	);

	it('needs a backend URL for hosted mode', () => {
		expect(() => lazyTransport({ mode: hostedMode() })).toThrowError(
			/`projectUrl` is required/u
		);
		expect(
			lazyTransport({ mode: hostedMode(), projectUrl: BACKEND }).kind
		).toBe('hosted');
	});
});
