/**
 * @vitest-environment jsdom
 */
import type { SSRInitialData } from '@inth/sdk-core/runtime/deferred-snapshot';
import { afterEach, expect, test } from 'vite-plus/test';

import {
	readPolicyCache,
	updatePolicyCacheRegistry,
	writePolicyCache,
} from '../init/policy-cache';

afterEach(() => {
	window.localStorage.clear();
});

test('keeps the script registry list with the cached policy', () => {
	const scriptSources = {
		posthog: {
			integrity: 'sha384-posthog',
			src: 'https://acme.inth.app/scripts/posthog@0123456789abcdef.js',
		},
	};
	writePolicyCache('https://acme.inth.app', undefined, {
		init: {
			policyResolution: { status: 'unconfigured' },
			scriptRegistry: { sources: scriptSources },
		},
	} as unknown as SSRInitialData);

	const cached = readPolicyCache('https://acme.inth.app')?.init as
		| { scriptRegistry?: { sources?: unknown } }
		| undefined;
	expect(cached?.scriptRegistry?.sources).toEqual(scriptSources);
});

const PROJECT = 'https://acme.inth.app';
const pixelList = {
	load: [{ id: 'meta-pixel', integration: 'metaPixel', manifest: {} }],
};
const answer = (scriptRegistry: unknown) =>
	({
		init: { policyResolution: { status: 'unconfigured' }, scriptRegistry },
	}) as unknown as SSRInitialData;
const cachedRegistry = () =>
	(readPolicyCache(PROJECT)?.init as { scriptRegistry?: unknown } | undefined)
		?.scriptRegistry;

test('keeps the last list when an answer says the registry is unavailable', () => {
	writePolicyCache(PROJECT, undefined, answer(pixelList));

	writePolicyCache(PROJECT, undefined, answer({ unavailable: true }));

	expect(cachedRegistry()).toEqual(pixelList);
});

test('replaces the cached list with the one the engine has now', () => {
	writePolicyCache(PROJECT, undefined, answer(pixelList));

	updatePolicyCacheRegistry(PROJECT, undefined, { load: [] });
	expect(cachedRegistry()).toEqual({ load: [] });

	// An engine whose init carried no registry clears it.
	updatePolicyCacheRegistry(PROJECT, undefined, null);
	expect(cachedRegistry()).toBeUndefined();
});

test('leaves the cache alone for an unavailable registry or another backend', () => {
	writePolicyCache(PROJECT, undefined, answer(pixelList));

	updatePolicyCacheRegistry(PROJECT, undefined, { unavailable: true });
	updatePolicyCacheRegistry('https://other.inth.app', undefined, { load: [] });

	expect(cachedRegistry()).toEqual(pixelList);
	expect(readPolicyCache('https://other.inth.app')).toBeUndefined();
});

test('writes no entry from the engine when none was cached', () => {
	updatePolicyCacheRegistry(PROJECT, undefined, pixelList);

	expect(readPolicyCache(PROJECT)).toBeUndefined();
});
