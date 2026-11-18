/**
 * The snapshot a deferred client root shows the banner from must be the one
 * the engine's kernel computes from the same prefetched `/init`, or the
 * banner would change when the engine attaches.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createConsentKernel } from '../../kernel/index';
import type { PrefetchedInitialData } from '../../libs/prefetch/prefetch';
import { PREFETCH_WINDOW_KEY } from '../../libs/prefetch/window-key';
import { mapInitOutputToInitResponse } from '../../transports/init-output';
import { hosted } from '../../transports/mode';
import {
	findPrefetchedInit,
	findPrefetchedInitFor,
	pendingSnapshot,
	primeInitRequest,
	snapshotFromPrefetchedInit,
} from '../deferred-snapshot';
import init from './fixtures/hosted-init-gb.json' with { type: 'json' };

const NOW = Date.UTC(2026, 10, 2, 12);
const categories = ['necessary', 'measurement', 'marketing'] as const;
const prefetched = (
	payload: unknown = init,
	contract: string | null = '1'
): PrefetchedInitialData =>
	({
		init: payload,
		producerPolicyContract: contract,
	}) as PrefetchedInitialData;

const engineSnapshot = async function engineSnapshot() {
	const kernel = createConsentKernel({
		consentCategories: [...categories],
		initialPolicyPending: true,
		now: NOW,
		transport: {
			init: () =>
				Promise.resolve(
					mapInitOutputToInitResponse(
						init as Parameters<typeof mapInitOutputToInitResponse>[0],
						{},
						{ producerContract: 1 }
					) as never
				),
		},
	});
	await kernel.commands.init();
	const snapshot = kernel.getSnapshot();
	kernel.dispose();
	return snapshot;
};

describe('snapshotFromPrefetchedInit', () => {
	test('carries the script registry list a prefetched init holds', () => {
		const scriptSources = {
			posthog: {
				integrity: 'sha384-posthog',
				src: 'https://acme.inth.app/scripts/posthog@0123456789abcdef.js',
			},
		};
		const shell = snapshotFromPrefetchedInit(
			prefetched({ ...init, scriptRegistry: { sources: scriptSources } }),
			{ consentCategories: [...categories] },
			NOW
		);
		expect(shell?.scriptRegistry?.sources).toEqual(scriptSources);
	});

	test('matches what the kernel computes from the same response', async () => {
		const shell = snapshotFromPrefetchedInit(
			prefetched(),
			{ consentCategories: [...categories] },
			NOW
		);
		const engine = await engineSnapshot();
		expect(shell?.activeUI).toBe('banner');
		for (const key of [
			'activeUI',
			'branding',
			'consentCategories',
			'effectivePermissions',
			'evaluationPolicy',
			'hosting',
			'location',
			'model',
			'policyRule',
			'promptRequirement',
			'resolution',
			'restrictions',
			'translations',
		] as const) {
			expect(shell?.[key], key).toEqual(engine[key]);
		}
	});

	test('leaves IAB, vendor and unknown-contract responses to the engine', () => {
		const options = { consentCategories: [...categories] };
		expect(
			snapshotFromPrefetchedInit(prefetched({ ...init, gvl: {} }), options)
		).toBeUndefined();
		expect(
			snapshotFromPrefetchedInit(
				prefetched({ ...init, vendors: [{ id: 'x' }] }),
				options
			)
		).toBeUndefined();
		expect(
			snapshotFromPrefetchedInit(prefetched(init, '2'), options)
		).toBeUndefined();
		expect(snapshotFromPrefetchedInit(undefined, options)).toBeUndefined();
	});
});

test('pendingSnapshot shows nothing and grants nothing', () => {
	const snapshot = pendingSnapshot({ consentCategories: [...categories] });
	expect(snapshot.policyPending).toBe(true);
	expect(snapshot.activeUI).toBe('none');
	expect(snapshot.effectivePermissions.marketing).toBe(false);
});

describe('findPrefetchedInit', () => {
	let view: Record<string, unknown>;
	beforeEach(() => {
		view = { location: { origin: 'https://app.example.com' } };
		vi.stubGlobal('window', view);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const store = (projectUrl: string) => {
		const promise = Promise.resolve(prefetched());
		view[PREFETCH_WINDOW_KEY] = {
			key: {
				promise,
				requestContext: {
					country: null,
					credentials: 'same-origin',
					gpc: false,
					language: null,
					projectUrl,
					region: null,
				},
			},
		};
		return promise;
	};

	test('finds the request the hosted transport will take, without taking it', () => {
		const promise = store('https://consent.example.com');
		const mode = hosted({ projectUrl: 'https://consent.example.com/' });
		expect(findPrefetchedInit(mode)).toBe(promise);
		expect(findPrefetchedInit(mode)).toBe(promise);
	});

	test('takes the request sent under the GPC signal the transport reads', () => {
		const context = (gpc: boolean) => ({
			country: null,
			credentials: 'same-origin',
			gpc,
			language: null,
			projectUrl: 'https://consent.example.com',
			region: null,
		});
		const withoutSignal = Promise.resolve(prefetched());
		const withSignal = Promise.resolve(prefetched());
		view[PREFETCH_WINDOW_KEY] = {
			off: { promise: withoutSignal, requestContext: context(false) },
			on: { promise: withSignal, requestContext: context(true) },
		};
		const mode = hosted({ projectUrl: 'https://consent.example.com' });
		// No signal in the browser: the request sent without one.
		expect(findPrefetchedInit(mode)).toBe(withoutSignal);
		// An override picks the request sent under it.
		expect(findPrefetchedInit(mode, { gpc: true })).toBe(withSignal);
		// The browser's signal, as the hosted transport's matcher reads it.
		view.navigator = { globalPrivacyControl: true };
		expect(findPrefetchedInit(mode)).toBe(withSignal);
		expect(findPrefetchedInit(mode, { gpc: false })).toBe(withoutSignal);
		// A request under the other signal alone is not read.
		view[PREFETCH_WINDOW_KEY] = {
			off: { promise: withoutSignal, requestContext: context(false) },
		};
		expect(findPrefetchedInit(mode)).toBeUndefined();
	});

	test('ignores another backend, another location, and custom init URLs', () => {
		store('https://consent.example.com');
		expect(
			findPrefetchedInit(hosted({ projectUrl: 'https://other.example.com' }))
		).toBeUndefined();
		expect(
			findPrefetchedInit(
				hosted({ projectUrl: 'https://consent.example.com' }),
				{
					country: 'US',
				}
			)
		).toBeUndefined();
		expect(
			findPrefetchedInit(
				hosted({
					initUrl: '/api/init',
					projectUrl: 'https://consent.example.com',
				})
			)
		).toBeUndefined();
		expect(
			findPrefetchedInit(
				hosted({ fetch, projectUrl: 'https://consent.example.com' })
			)
		).toBeUndefined();
	});
});

describe('snapshotFromPrefetchedInit with stored records', () => {
	const options = { consentCategories: [...categories] };
	const fresh = snapshotFromPrefetchedInit(prefetched(), options, NOW);
	const choice = (fingerprint: string) => ({
		categories: Object.fromEntries(
			(fresh?.evaluationPolicy.scope ?? []).map((category) => [
				category,
				{
					basis: { fingerprint, kind: 'choice-v1' as const },
					confirmedAt: NOW - 60_000,
					value: true,
				},
			])
		),
		version: 3 as const,
	});

	test('evaluates a choice made under the same policy, as hydration does', () => {
		const stored = snapshotFromPrefetchedInit(
			prefetched(),
			{
				...options,
				records: {
					choice: choice(fresh?.evaluationPolicy.choice.fingerprint ?? ''),
				} as never,
			},
			NOW
		);
		expect(fresh?.evaluationPolicy.scope.length).toBeGreaterThan(0);
		expect(stored?.activeUI).toBe('none');
		for (const category of fresh?.evaluationPolicy.scope ?? []) {
			expect(stored?.effectivePermissions[category], category).toBe(true);
		}
	});

	test('grants nothing from a choice made under another policy', () => {
		const stored = snapshotFromPrefetchedInit(
			prefetched(),
			{ ...options, records: { choice: choice('another-policy') } as never },
			NOW
		);
		expect(stored?.activeUI).toBe('banner');
		expect(stored?.effectivePermissions.marketing).toBe(false);
	});

	test('carries the GPC signal', () => {
		const signalled = snapshotFromPrefetchedInit(
			prefetched(),
			{ ...options, gpc: true },
			NOW
		);
		expect(signalled?.privacySignals.gpc.detected).toBe(true);
	});
});

describe('findPrefetchedInitFor and primeInitRequest', () => {
	let view: Record<string, unknown>;
	beforeEach(() => {
		view = { location: { origin: 'https://app.example.com' } };
		vi.stubGlobal('window', view);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('finds a request by backend URL, relative or absolute', () => {
		const promise = Promise.resolve(prefetched());
		view[PREFETCH_WINDOW_KEY] = {
			key: {
				promise,
				requestContext: {
					country: null,
					credentials: 'same-origin',
					gpc: false,
					language: null,
					projectUrl: 'https://app.example.com/api/c15t',
					region: null,
				},
			},
		};
		expect(findPrefetchedInitFor('/api/c15t')).toBe(promise);
		expect(findPrefetchedInitFor('https://app.example.com/api/c15t/')).toBe(
			promise
		);
		expect(findPrefetchedInitFor('/api/other')).toBeUndefined();
	});

	test('starts nothing for an experiment, which the engine assigns', () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		expect(
			primeInitRequest({
				experiment: { arms: ['a', 'b'], id: 'test' } as never,
				projectUrl: 'https://consent.example.com',
			})
		).toBeUndefined();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
