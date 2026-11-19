/**
 * In the browser `defineConsentConfig` only normalizes: Next.js has already
 * run its checks on the server and at build time, and browser bundles drop
 * them. The Node suite in `config.test.ts` covers the checks.
 */
import { expect, test } from 'vitest';

import { defineConsentConfig } from '../config';

test('normalizes without checking', () => {
	const config = defineConsentConfig({
		journey: 'session' as never,
		projectUrl: 'https://consent.example.com',
		routePrefix: '/api/inth/',
	});

	expect(config).toEqual({
		journey: 'session',
		projectUrl: 'https://consent.example.com',
		routePrefix: '/api/inth',
	});
	expect(Object.isFrozen(config)).toBe(true);
});
