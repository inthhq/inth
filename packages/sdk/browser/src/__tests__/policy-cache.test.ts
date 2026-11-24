/**
 * @vitest-environment jsdom
 */
import type { SSRInitialData } from '@inth/sdk-core/runtime/deferred-snapshot';
import { afterEach, expect, test } from 'vite-plus/test';

import { readPolicyCache, writePolicyCache } from '../init/policy-cache';

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
