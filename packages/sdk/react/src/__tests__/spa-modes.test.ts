import { readHostedMode } from '@inth/sdk/runtime/provider';
import type { ConsentManifest } from '@inth/sdk/schema/types';
/**
 * `manifest()` from `@inth/react` defaults to what the build integration
 * downloaded, served as `@inth/sdk/generated`. Without a build
 * integration that module exports `undefined`, so it needs its source
 * passed in. A provider with only `projectUrl` uses the hosted backend.
 */
import { manifest as browserManifest } from '@inth/sdk/transports/manifest-browser';
import { describe, expect, test } from 'vitest';

import { withBuildDefaults } from '../../../core/src/transports/manifest-browser';
import { manifest } from '../modes';
import { testing } from '../testing';
import { selectedMode } from '../transports/select-mode';

const built: ConsentManifest = {
	branding: 'inth',
	revision: 'built',
	schemaVersion: 2,
};
const build = { projectUrl: 'https://built.example', snapshot: built };

describe('manifest() from @inth/react', () => {
	test('uses the snapshot and backend URL the build downloaded', () => {
		expect(withBuildDefaults({}, build)).toEqual({
			projectUrl: 'https://built.example',
			snapshot: built,
		});
	});

	test('lets options win', () => {
		const own: ConsentManifest = { ...built, revision: 'own' };

		expect(withBuildDefaults({ snapshot: own }, build).snapshot).toBe(own);
		expect(
			withBuildDefaults({ source: 'runtime' }, build).snapshot
		).toBeUndefined();
		expect(withBuildDefaults({ manifestUrl: '/inth/manifest' }, build)).toEqual(
			{ manifestUrl: '/inth/manifest', projectUrl: 'https://built.example' }
		);
		expect(
			withBuildDefaults({ projectUrl: '/api/inth' }, build).projectUrl
		).toBe('/api/inth');
	});

	test("saves to the build's backend when manifestUrl names a CDN", () => {
		const mode = browserManifest(
			withBuildDefaults(
				{ manifestUrl: 'https://cdn.example/policy.json' },
				build
			)
		);

		expect(mode.projectUrl).toBe('https://built.example');
		expect(mode.manifestUrl).toBe('https://cdn.example/policy.json');
		expect(mode.snapshot).toBeUndefined();
	});

	test('carries the resolved options as data', () => {
		const mode = manifest({ projectUrl: '/api/inth', snapshot: built });

		expect(mode.kind).toBe('manifest');
		expect(mode.snapshot).toBe(built);
		expect(mode.projectUrl).toBe('/api/inth');
	});

	test('needs a source when the build set none', () => {
		expect(() => manifest()).toThrow('needs `snapshot`');
	});
});

describe('the mode a provider selects', () => {
	test('is the hosted backend when only projectUrl is set', () => {
		const mode = selectedMode({ projectUrl: '/api/inth' });

		expect(mode?.kind).toBe('hosted');
		expect(mode && readHostedMode(mode)).toEqual({ projectUrl: '/api/inth' });
		// Each render gets the same factory for the same URL.
		expect(selectedMode({ projectUrl: '/api/inth' })).toBe(mode);
	});

	test('is the testing transport over projectUrl', () => {
		const testingMode = testing();

		expect(selectedMode({ mode: testingMode, projectUrl: '/api/inth' })).toBe(
			testingMode.transport
		);
	});

	test('is none without projectUrl or mode', () => {
		expect(selectedMode({})).toBeUndefined();
	});
});
