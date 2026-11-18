import { hosted, manifest } from '@inth/sdk/modes';
/**
 * Tests for `defineConsentConfig`: validation, defaults and freezing. The
 * checks run where Next.js first evaluates the config, on the server, so
 * these run in Node.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { defineConsentConfig } from '../config';
import { testing } from '../testing';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe('defineConsentConfig', () => {
	test('returns a frozen config carrying every field', () => {
		const scripts = [
			{ category: 'measurement' as const, id: 'tag', src: '/t.js' },
		];
		const config = defineConsentConfig({
			journey: 'tab',
			mode: manifest({ resolve: 'browser' }),
			projectUrl: 'https://consent.example.com',
			routePrefix: '/api/consent/',
			scripts,
		});

		expect(config).toEqual({
			journey: 'tab',
			mode: { resolve: 'browser', type: 'manifest' },
			projectUrl: 'https://consent.example.com',
			routePrefix: '/api/consent',
			scripts,
		});
		expect(Object.isFrozen(config)).toBe(true);
	});

	test('reads the backend URL from NEXT_PUBLIC_INTH_PROJECT_URL', () => {
		vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', 'https://env.example.com');

		expect(defineConsentConfig().projectUrl).toBe('https://env.example.com');
	});

	test('names NEXT_PUBLIC_INTH_PROJECT_URL in the missing-URL error', () => {
		vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', '');
		expect(() => defineConsentConfig()).toThrow(
			/^@inth\/nextjs: manifest\(\) needs a backend URL: .* Set NEXT_PUBLIC_INTH_PROJECT_URL at build time, or `projectUrl` in inth.config.ts.$/u
		);
	});

	test('needs no backend URL for testing()', () => {
		vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', '');

		expect(defineConsentConfig({ mode: testing() })).toEqual({
			mode: { type: 'testing' },
		});
		expect(() => defineConsentConfig({ mode: hosted() })).toThrow(
			/NEXT_PUBLIC_INTH_PROJECT_URL/u
		);
		expect(() => defineConsentConfig({})).toThrow(
			/NEXT_PUBLIC_INTH_PROJECT_URL/u
		);
		expect(() => defineConsentConfig()).toThrow(
			/NEXT_PUBLIC_INTH_PROJECT_URL/u
		);
	});

	test('proxy needs routePrefix', () => {
		expect(() =>
			defineConsentConfig({
				projectUrl: 'https://consent.example.com',
				proxy: true,
			})
		).toThrow(
			'@inth/nextjs: `proxy` sends saves through the consent route, so it needs `routePrefix`.'
		);
		expect(
			defineConsentConfig({
				projectUrl: 'https://consent.example.com',
				proxy: true,
				routePrefix: '/api/inth/',
			})
		).toMatchObject({
			projectUrl: 'https://consent.example.com',
			proxy: true,
			routePrefix: '/api/inth',
		});
	});

	test.each(['/', '//'])(
		'rejects routePrefix %s, with or without proxy',
		(routePrefix) => {
			for (const proxy of [false, true]) {
				expect(() =>
					defineConsentConfig({
						projectUrl: 'https://consent.example.com',
						proxy,
						routePrefix,
					})
				).toThrow(
					"@inth/nextjs: `routePrefix` can't be '/': a consent route at the site root would catch every page. Use a path such as '/api/inth'."
				);
			}
		}
	);

	test('accepts relative paths and absolute http(s) URLs', () => {
		expect(() =>
			defineConsentConfig({
				mode: manifest({
					manifestUrl: 'http://localhost:3000/api/consent/manifest',
				}),
				projectUrl: '/api/inth',
			})
		).not.toThrow();
	});

	test.each([
		['empty projectUrl', { projectUrl: '' }],
		['bare path', { projectUrl: 'api/inth' }],
		['protocol-relative URL', { projectUrl: '//consent.example.com' }],
		['non-http scheme', { projectUrl: 'ftp://consent.example.com' }],
		['bare routePrefix', { projectUrl: '/api/inth', routePrefix: 'api/inth' }],
		[
			'invalid manifestUrl',
			{ mode: manifest({ manifestUrl: 'manifest' }), projectUrl: '/api/inth' },
		],
		['removed testing option shape', { mode: { type: 'without-network' } }],
		['unknown mode', { mode: { type: 'custom' }, projectUrl: '/api/inth' }],
		['unknown journey', { journey: 'session', projectUrl: '/api/inth' }],
	])('rejects %s', (_label, input) => {
		expect(() => defineConsentConfig(input as never)).toThrow(TypeError);
	});
});
