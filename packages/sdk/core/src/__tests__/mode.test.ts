import { writePolicyResolutionWire } from '@inth/sdk-schema/types';
import type { ConsentManifest } from '@inth/sdk-schema/types';
/**
 * The `hosted()` transport factory and the data factories from
 * `@inth/sdk/modes`.
 */
import { describe, expect, test, vi } from 'vitest';

import type { SavePayload } from '../index';
import * as modes from '../modes';
import type { ManifestModeOptions } from '../modes';
import { readHostedMode } from '../transports/hosted-modes';
import { hosted } from '../transports/mode';
import type { ProviderTransportContext } from '../transports/mode';
import { matchedResolution, optInRule } from './fixtures/kernel-fixtures';

const context: ProviderTransportContext = {
	prefetch: {},
	translations: { language: 'en', translations: {} as never },
};

const payload: SavePayload = {
	choice: {
		categories: {
			marketing: {
				basis: { fingerprint: 'test-choice', kind: 'choice-v1' },
				confirmedAt: 1_700_000_000_000,
				value: false,
			},
		},
		version: 3,
	},
	confirmed: { actionAt: 1_700_000_000_000, categories: { marketing: false } },
	consentAction: 'all',
	consents: {
		experience: false,
		functionality: false,
		marketing: false,
		measurement: false,
		necessary: true,
	},
	givenAt: 1_700_000_000_000,
	model: 'opt-in',
	overrides: {},
	policySnapshotToken: null,
	subject: { subjectId: 'sub_test' },
	subjectId: 'sub_test',
	uiSource: 'banner',
	user: null,
};

describe('hosted()', () => {
	test('reports its kind and builds a transport for the backend URL', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
		const mode = hosted({
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			projectUrl: '/api/c15t/',
		});

		expect(mode.kind).toBe('hosted');
		await mode(context).save?.(payload);
		expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/c15t/subjects');
	});

	test('forwards initUrl and assertDecisionInputs to the hosted transport', async () => {
		const init = {
			branding: 'c15t',
			hasConsented: false,
			location: { countryCode: 'DE', regionCode: 'BE' },
			policy: {
				consentDefaults: {},
				expiryDays: 365,
				id: 'eu-opt-in',
				model: 'opt-in',
				scopeMode: 'strict',
				uiMode: 'banner',
			},
			policyResolution: writePolicyResolutionWire(
				matchedResolution(optInRule({ id: 'eu-opt-in' }))
			),
			resolvedOverrides: { country: 'DE', language: 'de', region: 'BE' },
			translations: { language: 'de', translations: {} as never },
		};
		const fetchSpy = vi.fn(
			(input: string | URL | Request, _options?: RequestInit) =>
				Promise.resolve(
					new Response(
						JSON.stringify(
							String(input).startsWith('/api/consent/init?')
								? init
								: { ok: true }
						)
					)
				)
		);
		const mode = hosted({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/api/consent/init',
			projectUrl: 'https://backend.example',
		});
		const transport = mode(context);

		await transport.init?.({ overrides: {}, user: null });
		await transport.save?.(payload);

		expect(
			fetchSpy.mock.calls.map(([url]) => String(url).split('?')[0])
		).toEqual(['/api/consent/init', 'https://backend.example/subjects']);
		const body = JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body));
		expect(body).toMatchObject({
			country: 'DE',
			fingerprint: matchedResolution(optInRule({ id: 'eu-opt-in' }))
				.fingerprints.policy,
			language: 'de',
			policyId: 'eu-opt-in',
			region: 'BE',
		});
	});

	test('carries its options as enumerable data', () => {
		const mode = hosted({
			headers: { 'accept-language': 'de' },
			projectUrl: '/api/c15t',
		});

		expect({ ...mode }).toEqual({
			headers: { 'accept-language': 'de' },
			kind: 'hosted',
			projectUrl: '/api/c15t',
			type: 'hosted',
		});
	});

	test('recognizes its own factories, not wrappers that copy them', () => {
		const options = { projectUrl: '/api/c15t' };
		const mode = hosted(options);
		const wrapper = Object.assign(
			(providerContext: ProviderTransportContext) => mode(providerContext),
			mode
		);

		expect(readHostedMode(mode)).toEqual(options);
		expect(wrapper.kind).toBe('hosted');
		expect(wrapper.type).toBe('hosted');
		expect(readHostedMode(wrapper)).toBeUndefined();
	});

	test('asserts decision inputs when initUrl is set, unless told not to', async () => {
		const fetchSpy = vi.fn(() =>
			Promise.resolve(new Response(JSON.stringify({ ok: true })))
		);
		const save = async (options: Partial<Parameters<typeof hosted>[0]>) => {
			fetchSpy.mockClear();
			const transport = hosted({
				fetch: fetchSpy as unknown as typeof globalThis.fetch,
				projectUrl: 'https://backend.example',
				...options,
			})(context);
			// No init has resolved a decision: an asserting transport refuses.
			return await transport.save?.(payload).then(
				() => 'saved',
				() => 'refused'
			);
		};

		expect(await save({})).toBe('saved');
		expect(await save({ initUrl: '/api/c15t/init' })).toBe('refused');
		expect(
			await save({ assertDecisionInputs: false, initUrl: '/api/c15t/init' })
		).toBe('saved');
		expect(await save({ assertDecisionInputs: true })).toBe('refused');
	});

	test('keeps the options it was called with when the object changes', async () => {
		const fetchSpy = vi.fn(() =>
			Promise.resolve(new Response('{}', { status: 500 }))
		);
		const initialData = Promise.resolve(undefined);
		const options = {
			fetch: fetchSpy as typeof globalThis.fetch,
			headers: { 'accept-language': 'de' },
			initialData,
			projectUrl: 'https://old.example',
		};
		const mode = hosted(options);
		options.projectUrl = 'https://new.example';
		options.headers['accept-language'] = 'fr';

		expect(readHostedMode(mode)).toEqual({
			fetch: fetchSpy,
			headers: { 'accept-language': 'de' },
			initialData,
			projectUrl: 'https://old.example',
		});
		expect(mode.projectUrl).toBe('https://old.example');
		expect(readHostedMode(mode)?.fetch).toBe(fetchSpy);
		expect(readHostedMode(mode)?.initialData).toBe(initialData);

		// `initialData` resolves to nothing, so both inits reach the backend,
		// each with the options as passed.
		const transport = mode(context);
		await transport.init?.({ overrides: {}, user: null }).catch(() => null);
		await transport.init?.({ overrides: {}, user: null }).catch(() => null);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		for (const [url, init] of fetchSpy.mock.calls as unknown as [
			string,
			RequestInit & { headers: Record<string, string> },
		][]) {
			expect(url.split('?')[0]).toBe('https://old.example/init');
			expect(init.headers['accept-language']).toBe('de');
		}
	});
});

describe('@inth/sdk/modes', () => {
	test('returns plain, serializable data', () => {
		const snapshot = { revision: '1', schemaVersion: 2 } as never;
		const all = [
			modes.manifest(),
			modes.manifest({ resolve: 'browser', snapshot }),
		];

		expect(all.map((mode) => mode.type)).toEqual(['manifest', 'manifest']);
		expect(JSON.parse(JSON.stringify(all))).toEqual(all);
		expect(modes.manifest({ source: 'runtime' })).toEqual({
			source: 'runtime',
			type: 'manifest',
		});
	});

	test('rejects a snapshot with a source', () => {
		const snapshot = { revision: '1', schemaVersion: 2 } as ConsentManifest;
		// @ts-expect-error `snapshot` is its own source.
		const both: ManifestModeOptions = { snapshot, source: 'build' };

		expect(both).toBeDefined();
	});
});
