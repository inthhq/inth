import { readHostedMode } from '@c15t/core/runtime/provider';
/**
 * `manifest()` from `c15t/react` defaults to what the build integration
 * downloaded, served as `@c15t/core/generated`. Without a build
 * integration that module exports `undefined`, so it needs its source
 * passed in. A provider with only `backendURL` uses the hosted backend.
 */
import { manifest as browserManifest } from '@c15t/core/transports/manifest-browser';
import type { ConsentManifest } from '@c15t/schema/types';
import { describe, expect, test } from 'vitest';

import { manifest } from '../modes';
import { testing } from '../testing';
import { withBuildDefaults } from '../transports/manifest';
import { selectedMode } from '../transports/select-mode';

const built: ConsentManifest = {
	branding: 'c15t',
	revision: 'built',
	schemaVersion: 2,
};
const build = { backendURL: 'https://built.example', snapshot: built };

describe('manifest() from c15t/react', () => {
	test('uses the snapshot and backend URL the build downloaded', () => {
		expect(withBuildDefaults({}, build)).toEqual({
			backendURL: 'https://built.example',
			snapshot: built,
		});
	});

	test('lets options win', () => {
		const own: ConsentManifest = { ...built, revision: 'own' };

		expect(withBuildDefaults({ snapshot: own }, build).snapshot).toBe(own);
		expect(
			withBuildDefaults({ source: 'runtime' }, build).snapshot
		).toBeUndefined();
		expect(withBuildDefaults({ manifestURL: '/c15t/manifest' }, build)).toEqual(
			{ backendURL: 'https://built.example', manifestURL: '/c15t/manifest' }
		);
		expect(
			withBuildDefaults({ backendURL: '/api/c15t' }, build).backendURL
		).toBe('/api/c15t');
	});

	test("saves to the build's backend when manifestURL names a CDN", () => {
		const mode = browserManifest(
			withBuildDefaults(
				{ manifestURL: 'https://cdn.example/policy.json' },
				build
			)
		);

		expect(mode.backendURL).toBe('https://built.example');
		expect(mode.manifestURL).toBe('https://cdn.example/policy.json');
		expect(mode.snapshot).toBeUndefined();
	});

	test('carries the resolved options as data', () => {
		const mode = manifest({ backendURL: '/api/c15t', snapshot: built });

		expect(mode.kind).toBe('manifest');
		expect(mode.snapshot).toBe(built);
		expect(mode.backendURL).toBe('/api/c15t');
	});

	test('needs a source when the build set none', () => {
		expect(() => manifest()).toThrow('needs `snapshot`');
	});
});

describe('the mode a provider selects', () => {
	test('is the hosted backend when only backendURL is set', () => {
		const mode = selectedMode({ backendURL: '/api/c15t' });

		expect(mode?.kind).toBe('hosted');
		expect(mode && readHostedMode(mode)).toEqual({ backendURL: '/api/c15t' });
		// Each render gets the same factory for the same URL.
		expect(selectedMode({ backendURL: '/api/c15t' })).toBe(mode);
	});

	test('is the testing transport over backendURL', () => {
		const testingMode = testing();

		expect(selectedMode({ backendURL: '/api/c15t', mode: testingMode })).toBe(
			testingMode.transport
		);
	});

	test('is none without backendURL or mode', () => {
		expect(selectedMode({})).toBeUndefined();
	});
});
