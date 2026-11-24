import { clearManifestCache } from '@inth/sdk/server';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { resolveOptions } from '../integration';
import { hosted as hostedMode } from '../mode';
import { DEFAULT_RESOLVE_TIMEOUT_MS, resolveConsentContext } from '../server';
import type { InthAstroOptions } from '../types';
import { testWire } from './policy-fixture';

const BACKEND = 'https://consent.example.com';

const initResponse = (): Response =>
	Response.json({
		branding: 'inth',
		location: { countryCode: null, regionCode: null },
		policyResolution: testWire(),
		translations: { language: 'en', translations: {} },
	});

/** A fetch whose response arrives only when the test says so. */
const heldFetch = function heldFetch(respond: () => Response) {
	const calls: { url: string; signal?: AbortSignal | null }[] = [];
	const releases: (() => void)[] = [];
	const fetchImpl = vi.fn(
		(input: string | URL | Request, init?: RequestInit) => {
			calls.push({ signal: init?.signal, url: String(input) });
			// oxlint-disable-next-line promise/avoid-new -- A request the test releases by hand.
			return new Promise<Response>((resolve) => {
				releases.push(() => resolve(respond()));
			});
		}
	);
	return {
		calls,
		fetch: fetchImpl as unknown as typeof globalThis.fetch,
		release() {
			for (const release of releases.splice(0)) {
				release();
			}
		},
	};
};

const resolveContext = (
	astroOptions: InthAstroOptions,
	extra: Partial<Parameters<typeof resolveConsentContext>[0]> = {}
) =>
	resolveConsentContext({
		headers: new Headers({ 'x-inth-country': 'DE' }),
		options: resolveOptions(astroOptions),
		url: 'https://site.example.com/',
		...extra,
	});

afterEach(() => {
	vi.useRealTimers();
	clearManifestCache();
});

describe('server resolution budget', () => {
	it('defaults to 500 ms', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const backend = heldFetch(initResponse);
		let settled = false;
		const pending = resolveContext(
			{ mode: hostedMode(), projectUrl: BACKEND },
			{ fetch: backend.fetch }
		).then((value) => {
			settled = true;
			return value;
		});

		await vi.advanceTimersByTimeAsync(DEFAULT_RESOLVE_TIMEOUT_MS - 1);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		const inth = await pending;

		expect(DEFAULT_RESOLVE_TIMEOUT_MS).toBe(500);
		expect(inth.hasPolicy).toBe(false);
		expect(inth.shouldShowBanner).toBe(false);
		expect(inth.config.initialPolicyPending).toBe(true);
	});

	it('lets a per-call timeoutMs override the integration option', async () => {
		const backend = heldFetch(initResponse);
		const started = Date.now();
		const inth = await resolveContext(
			{
				middleware: { timeoutMs: false },
				mode: hostedMode(),
				projectUrl: BACKEND,
			},
			{ fetch: backend.fetch, timeoutMs: 30 }
		);

		expect(Date.now() - started).toBeLessThan(1000);
		expect(inth.hasPolicy).toBe(false);
	});

	it('does not delay offline mode', async () => {
		const inth = await resolveContext({
			middleware: { timeoutMs: 0 },
			mode: { type: 'testing' },
		});

		expect(inth.hasPolicy).toBe(true);
	});
});
