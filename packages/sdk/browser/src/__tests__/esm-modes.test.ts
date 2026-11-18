// @vitest-environment node
/// <reference types="node" />
/**
 * `init()` from the ES module entries: `projectUrl` with an optional mode,
 * `manifest()` reads what the build integration downloaded, and a page
 * bundles only the mode it imports.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { manifest as browserManifest } from '@inth/sdk-core/transports/manifest-browser';
import type { ConsentManifest } from '@inth/sdk-schema/types';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import { createConsentClient, hosted, manifest } from '../index';
import { testing } from '../testing';
import { withBuildDefaults } from '../transports/manifest';

const builtManifest: ConsentManifest = {
	branding: 'inth',
	revision: 'built',
	schemaVersion: 2,
};
const buildOutput = {
	projectUrl: 'https://built.example',
	snapshot: builtManifest,
};

describe('init() from @inth/sdk', () => {
	it('throws for a mode name', () => {
		expect(() =>
			createConsentClient({
				mode: 'hosted',
				projectUrl: 'https://backend.example',
			} as unknown as Parameters<typeof createConsentClient>[0])
		).toThrow('Mode names like "hosted" work only in the script-tag builds');
	});

	it.each([
		['no mode', {}],
		['hosted()', { mode: hosted() }],
	])('needs a backend URL with %s', (_name, options) => {
		expect(() =>
			createConsentClient(
				options as unknown as Parameters<typeof createConsentClient>[0]
			)
		).toThrow(
			'@inth/sdk: `projectUrl` is required. Set it to your Inth project URL, or use `mode: testing()` from @inth/sdk/testing in tests.'
		);
	});

	it.each([
		['no mode', {}],
		['hosted()', { mode: hosted() }],
	])('asks the hosted backend with %s', (_name, options) => {
		const client = createConsentClient({
			projectUrl: 'https://backend.example',
			...options,
			ui: false,
		});
		expect(client.mode).toBe('hosted');
	});

	it('needs no backend URL for testing() or a disabled client', () => {
		expect(createConsentClient({ mode: testing(), ui: false }).mode).toBe(
			'testing'
		);
		expect(createConsentClient({ enabled: false, ui: false }).mode).toBe(
			'hosted'
		);
	});
});

describe('manifest() from @inth/sdk', () => {
	it('uses the snapshot and backend URL the build downloaded', () => {
		expect(withBuildDefaults({}, buildOutput)).toEqual(buildOutput);
	});

	it('lets options win, and fetches at runtime with source: runtime', () => {
		expect(
			withBuildDefaults({ source: 'runtime' }, buildOutput).snapshot
		).toBeUndefined();
		expect(
			withBuildDefaults({ manifestUrl: '/api/inth/manifest' }, buildOutput)
		).toEqual({
			manifestUrl: '/api/inth/manifest',
			projectUrl: 'https://built.example',
		});
		expect(
			withBuildDefaults({ projectUrl: 'https://own.example' }, buildOutput)
				.projectUrl
		).toBe('https://own.example');
	});

	it("saves to the build's backend when manifestUrl names a CDN", () => {
		const mode = browserManifest(
			withBuildDefaults(
				{ manifestUrl: 'https://cdn.example/policy.json' },
				buildOutput
			)
		);
		expect(mode.projectUrl).toBe('https://built.example');
		expect(mode.manifestUrl).toBe('https://cdn.example/policy.json');
		expect(mode.snapshot).toBeUndefined();
	});

	it('carries the resolved options as data', () => {
		const mode = manifest({ projectUrl: '', snapshot: builtManifest });
		expect(mode.kind).toBe('manifest');
		expect(mode.snapshot).toBe(builtManifest);
	});

	it('needs a source when the build set none', () => {
		expect(() => manifest()).toThrow('needs `snapshot`');
	});
});

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Bundles an entry for the browser the way an app's bundler would. */
const bundle = async function bundle(contents: string): Promise<string> {
	const result = await build({
		bundle: true,
		format: 'esm',
		logLevel: 'silent',
		platform: 'browser',
		stdin: { contents, loader: 'ts', resolveDir: SOURCE_DIR },
		write: false,
	});
	return result.outputFiles.map((file) => file.text).join('\n');
};

/** A rule id in `recommendedPolicyRules()`, the testing default pack. */
const TESTING_POLICY = 'quebec_opt_in';
/** The error `testing()` throws in a production build. */
const TESTING_ERROR = 'is for tests and does not run in production';
/** An error the manifest resolver throws (`@inth/sdk/schema`). */
const RESOLVER = 'Unsupported pack field';

describe('first-load JavaScript of @inth/sdk', () => {
	it.each([
		['no mode', "import { init } from './index';\ninit({ projectUrl: '/c' });"],
		[
			'hosted()',
			"import { hosted, init } from './index';\ninit({ projectUrl: '/c', mode: hosted() });",
		],
	])(
		'bundles neither testing() nor the resolver with %s',
		async (_, entry) => {
			const code = await bundle(entry);
			expect(code).not.toContain(TESTING_POLICY);
			expect(code).not.toContain(TESTING_ERROR);
			expect(code).not.toContain(RESOLVER);
		},
		60_000
	);

	it('bundles the resolver but not testing() for manifest()', async () => {
		const code = await bundle(
			"import { init, manifest } from './index';\ninit({ projectUrl: '/c', mode: manifest() });"
		);
		expect(code).not.toContain(TESTING_POLICY);
		expect(code).toContain(RESOLVER);
	}, 60_000);

	it('bundles the pack and the production check for testing()', async () => {
		const code = await bundle(
			"import { init } from './index';\nimport { testing } from './testing';\ninit({ mode: testing() });"
		);
		expect(code).toContain(TESTING_POLICY);
		expect(code).toContain(TESTING_ERROR);
	}, 60_000);
});
