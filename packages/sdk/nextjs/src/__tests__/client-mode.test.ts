/**
 * The transport `ConsentRoot` builds for each mode. Behaviour of the lazy
 * transports themselves is pinned in core's client-mode suite.
 */
import { hosted, manifest } from '@inth/sdk/modes';
import { describe, expect, test, vi } from 'vitest';

import { createClientMode } from '../client-mode';
import { testing } from '../testing';

describe('createClientMode', () => {
	test('manifest() when no mode is set', () => {
		const mode = createClientMode(undefined, {
			projectUrl: 'https://consent.example.com',
		});

		expect(mode.kind).toBe('manifest');
	});

	test('hosted() asks the backend', () => {
		const mode = createClientMode(hosted(), {
			projectUrl: 'https://consent.example.com',
		});

		expect(mode.kind).toBe('hosted');
	});

	test('manifest() carries its data', () => {
		const data = manifest({ resolve: 'browser' });
		const mode = createClientMode(data, {
			projectUrl: 'https://consent.example.com',
		});

		expect(mode.kind).toBe('manifest');
		expect({ ...mode }).toMatchObject(data);
	});

	test('a testing value runs the testing transport', () => {
		expect(createClientMode(testing(), {}).kind).toBe('offline');
	});

	test('throws without a backend URL instead of running offline', () => {
		expect(() => createClientMode(manifest(), {})).toThrow(
			'@inth/nextjs: `projectUrl` is required. Set NEXT_PUBLIC_C15T_BACKEND_URL (or NEXT_PUBLIC_INTH_PROJECT_URL), or `projectUrl` in c15t.config.ts.'
		);
		expect(() => createClientMode(undefined, {})).toThrow(
			'`projectUrl` is required'
		);
		// A testing value is the one that needs no backend.
		expect(createClientMode(testing(), {}).kind).toBe('offline');
	});

	test('never saves to a route prefix that was not passed as the backend', () => {
		// Without `proxy` the consent route answers `GET` only.
		expect(() =>
			createClientMode(manifest(), { routePrefix: '/api/c15t' })
		).toThrow('`projectUrl` is required');
		expect(
			createClientMode(manifest(), {
				projectUrl: '/api/c15t',
				routePrefix: '/api/c15t',
			}).kind
		).toBe('manifest');
	});

	test('a transport factory is used as is', () => {
		const custom = Object.assign(vi.fn(), { kind: 'custom' as const });

		expect(createClientMode(custom, {})).toBe(custom);
	});
});
