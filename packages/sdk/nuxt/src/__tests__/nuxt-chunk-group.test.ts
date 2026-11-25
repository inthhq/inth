/**
 * The Nuxt module puts the Inth code a page's entry imports statically into
 * one chunk, so the first load makes one request for it instead of one per
 * module the consent engine shares with the page.
 */
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

import {
	nuxtConsentChunkGroup,
	nuxtConsentConfigChunkGroup,
} from '../consent-chunk-group.model';
import {
	consentPackageDirs,
	groupConsentChunks,
} from '../group-consent-chunks';

describe('nuxtConsentChunkGroup', () => {
	const workspace = '/repo/packages/sdk/core';
	const group = nuxtConsentChunkGroup([workspace]);

	test('matches an installed inth package', () => {
		expect(
			group.test.test(
				'/app/node_modules/.pnpm/@inth+core@3/node_modules/@inth/sdk/lib/core/dist/libs/has.js'
			)
		).toBe(true);
	});

	test('matches a linked package by its real directory', () => {
		expect(group.test.test(`${workspace}/dist/libs/has.js`)).toBe(true);
	});

	test("leaves the app's own packages alone", () => {
		expect(group.test.test('/repo/packages/core-ui/dist/index.js')).toBe(false);
		expect(group.test.test('/app/packages/sdk/ui/dist/index.js')).toBe(false);
	});

	test('groups only what the first load imports', () => {
		expect(group.tags).toEqual(['$initial']);
	});
});

describe('nuxtConsentConfigChunkGroup', () => {
	const group = nuxtConsentConfigChunkGroup(['/repo/packages/sdk/schema']);

	test.each([
		'/app/node_modules/@inth/vue/dist/runtime/composables/config.js',
		'/app/node_modules/.pnpm/@inth+ui@3/node_modules/@inth/sdk/lib/ui/dist/utils/theme-slots.js',
		'/repo/packages/sdk/schema/dist/config/defaults.js',
	])('matches %s', (id) => {
		expect(group.test.test(id)).toBe(true);
	});

	test.each([
		'/app/node_modules/@inth/vue/dist/runtime/composables/use-consent.js',
		'/app/src/composables/config.js',
		'/other/packages/sdk/schema/dist/config/defaults.js',
	])('leaves %s alone', (id) => {
		expect(group.test.test(id)).toBe(false);
	});
});

test('consentPackageDirs finds @inth/sdk and @inth/vue from the module', () => {
	const dirs = consentPackageDirs(join(import.meta.dirname, '..', 'module.ts'));
	expect(dirs).toContain(
		realpathSync(join(import.meta.dirname, '..', '..', '..', 'vue'))
	);
	expect(dirs.length).toBeGreaterThan(1);
	// Nothing to find from a directory without them.
	const empty = mkdtempSync(join(tmpdir(), 'inth-chunk-group-'));
	expect(consentPackageDirs(join(empty, 'index.js'))).toEqual([]);
});

describe('groupConsentChunks', () => {
	const plugin = groupConsentChunks(['/repo/packages/sdk/core']);
	const rolldown = { meta: { rolldownVersion: '1.2.11' } };
	interface GroupsBuild {
		rolldownOptions: { output: { codeSplitting: { groups: unknown[] } } };
	}
	/** Calls the plugin's `config` hook as Vite would, with `this` set. */
	const runConfig = (
		context: unknown,
		config: Record<string, unknown>,
		env: { isSsrBuild?: boolean }
	) =>
		(
			plugin.config as unknown as (
				this: unknown,
				config: Record<string, unknown>,
				env: { isSsrBuild?: boolean }
			) =>
				| {
						build?: GroupsBuild;
						environments?: { client: { build: GroupsBuild } };
				  }
				| undefined
		).call(context, config, env);

	test('adds the group to a client build', () => {
		const config = runConfig(rolldown, {}, { isSsrBuild: false });
		expect(
			config?.build?.rolldownOptions.output.codeSplitting.groups
		).toHaveLength(2);
		expect(config?.environments).toBe(undefined);
	});

	test('scopes the groups to the client environment of a shared config', () => {
		// Nuxt 5, and Nuxt 4 with `compatibilityVersion: 5`, build the client
		// and the server from one Vite config, whose `config` hook runs once
		// without `isSsrBuild`. Groups on `build` would reach the server
		// build, where they break Nuxt's server-styles chunks.
		const config = runConfig(
			rolldown,
			{ environments: { client: {}, ssr: {} } },
			{}
		);
		expect(config?.build).toBe(undefined);
		expect(
			config?.environments?.client.build.rolldownOptions.output.codeSplitting
				.groups
		).toHaveLength(2);
	});

	test('leaves the server build and an app that splits its own chunks', () => {
		expect(runConfig(rolldown, {}, { isSsrBuild: true })).toBe(undefined);
		expect(
			runConfig(
				rolldown,
				{ build: { rolldownOptions: { output: { codeSplitting: {} } } } },
				{}
			)
		).toBe(undefined);
	});

	test('leaves a Rollup build alone', () => {
		expect(runConfig({ meta: {} }, {}, {})).toBe(undefined);
	});
});
