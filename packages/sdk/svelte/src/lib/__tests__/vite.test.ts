import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createConsentManifestPolicyPack } from '@inth/sdk/schema/types';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { MODULE_PRELOAD_PLACEHOLDERS } from '../kit/module-preload';
import { consentManifest, resolveChunkHrefs } from '../vite';

/** The module-preload plugin `consentManifest()` includes. */
const preloadPlugin = () => consentManifest()[1];

const CORE = '/app/node_modules/@inth/sdk/lib/core/dist/modules';

const chunk = (
	fileName: string,
	moduleIds: string[],
	isEntry = false
): { type: 'chunk' } => ({
	fileName,
	isEntry,
	moduleIds,
	type: 'chunk',
});

const CLIENT_BUNDLE = {
	'_app/immutable/chunks/a.js': chunk('_app/immutable/chunks/a.js', [
		`${CORE}/script-loader/loader.js`,
		`${CORE}/network-blocker/blocker.js`,
		`${CORE}/loader-and-blocker.js`,
	]),
	'_app/immutable/chunks/e.js': chunk('_app/immutable/chunks/e.js', [
		'/app/node_modules/@inth/svelte/dist/deferred/engine.js',
		'/app/node_modules/@inth/svelte/dist/owned-runtime.js',
	]),
	'_app/immutable/entry/app.js': chunk(
		'_app/immutable/entry/app.js',
		[`${CORE}/script-loader/tools.js`],
		true
	),
	'style.css': { type: 'asset' },
};

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe('Svelte manifest module', () => {
	test.each([
		{ app: 'Svelte single-page app', plugins: [], snapshotInBrowser: true },
		{
			app: 'SvelteKit app',
			plugins: [{ name: 'vite-plugin-sveltekit-setup' }],
			snapshotInBrowser: false,
		},
	])(
		'a $app gets the snapshot in the browser: $snapshotInBrowser',
		async ({ plugins, snapshotInBrowser }) => {
			const root = await mkdtemp(path.join(tmpdir(), 'inth-svelte-manifest-'));
			directories.push(root);
			const [plugin] = consentManifest({
				fetch: () =>
					Promise.resolve(
						Response.json({
							branding: 'inth',
							revision: 'svelte-build',
							schemaVersion: 2,
						})
					),
				projectUrl: 'https://consent.example.com',
			});
			await plugin.configResolved({ command: 'serve', plugins, root });
			const load = (consumer: 'client' | 'server') =>
				plugin.load.call(
					{ environment: { config: { consumer } } },
					plugin.resolveId('@inth/sdk/generated') as string
				);
			expect((await load('client'))?.includes('svelte-build')).toBe(
				snapshotInBrowser
			);
			expect(await load('server')).toContain('svelte-build');
		}
	);
});

describe('location advice', () => {
	const regional = () =>
		Promise.resolve(
			Response.json({
				branding: 'inth',
				policyPacks: [
					createConsentManifestPolicyPack({
						id: 'regional',
						match: { countries: ['DE'] },
						model: 'opt-in',
						prompt: 'choice',
					}),
				],
				revision: 'svelte-regional',
				schemaVersion: 2,
			})
		);
	test.each([
		{ app: 'a Svelte single-page app', plugins: [], warns: true },
		{
			app: 'SvelteKit, which resolves on the server',
			plugins: [{ name: 'vite-plugin-sveltekit-setup' }],
			warns: false,
		},
	])(
		'suggests the hosted backend for a location-based policy in $app: $warns',
		async ({ plugins, warns }) => {
			const warn = vi.fn();
			const [plugin] = consentManifest({
				fetch: regional,
				projectUrl: 'https://consent.example.com',
			});
			plugin.configResolved({
				command: 'build',
				logger: { info: vi.fn(), warn },
				plugins,
				root: tmpdir(),
			});
			const source = await plugin.load.call(
				{ environment: { config: { consumer: 'server' } } },
				plugin.resolveId('@inth/sdk/generated') as string
			);
			await plugin.renderChunk(source as string);
			expect(
				warn.mock.calls.some(([message]) =>
					/^@inth\/svelte\/vite: .*location.*projectUrl/u.test(String(message))
				)
			).toBe(warns);
		}
	);
});

describe('resolveChunkHrefs', () => {
	test('finds the loader-and-blocker and engine chunks under the served base', () => {
		expect(resolveChunkHrefs(CLIENT_BUNDLE, '/docs')).toEqual({
			engine: '/docs/_app/immutable/chunks/e.js',
			'loader-and-blocker': '/docs/_app/immutable/chunks/a.js',
		});
	});

	test('names no URL for a module the entry chunk carries', () => {
		const bundle = {
			'app.js': chunk(
				'app.js',
				[
					`${CORE}/script-loader/loader.js`,
					`${CORE}/network-blocker/blocker.js`,
					`${CORE}/loader-and-blocker.js`,
				],
				true
			),
		};
		expect(resolveChunkHrefs(bundle, '')).toEqual({
			engine: '',
			'loader-and-blocker': '',
		});
	});
});

describe('consentManifest module preload', () => {
	const setup = async function setup() {
		const root = await mkdtemp(path.join(tmpdir(), 'inth-preload-'));
		directories.push(root);
		const server = path.join(root, '.svelte-kit', 'output', 'server');
		await mkdir(path.join(server, 'chunks'), { recursive: true });
		const file = path.join(server, 'chunks', 'hooks.js');
		await writeFile(
			file,
			`const hrefs = ${JSON.stringify(MODULE_PRELOAD_PLACEHOLDERS)};`
		);
		const plugin = preloadPlugin();
		const configure = (ssr: boolean) =>
			plugin.configResolved({
				build: { ssr },
				plugins: [
					{
						api: {
							options: { kit: { outDir: '.svelte-kit', paths: { base: '' } } },
						},
						name: 'vite-plugin-sveltekit-setup',
					},
				],
				root,
			});
		return { configure, file, plugin };
	};

	test('writes the client chunk URLs into the server output', async () => {
		const { configure, file, plugin } = await setup();
		configure(false);
		await plugin.writeBundle.call({}, {}, CLIENT_BUNDLE);
		expect(await readFile(file, 'utf8')).toBe(
			`const hrefs = ${JSON.stringify({
				engine: '/_app/immutable/chunks/e.js',
				'loader-and-blocker': '/_app/immutable/chunks/a.js',
			})};`
		);
	});

	test('leaves the server output alone during the server build', async () => {
		const { configure, file, plugin } = await setup();
		configure(true);
		await plugin.writeBundle.call({}, {}, CLIENT_BUNDLE);
		configure(false);
		await plugin.writeBundle.call(
			{ environment: { name: 'ssr' } },
			{},
			CLIENT_BUNDLE
		);
		expect(await readFile(file, 'utf8')).toContain(
			MODULE_PRELOAD_PLACEHOLDERS['loader-and-blocker']
		);

		await plugin.writeBundle.call(
			{ environment: { name: 'client' } },
			{},
			CLIENT_BUNDLE
		);
		expect(await readFile(file, 'utf8')).toContain(
			'/_app/immutable/chunks/a.js'
		);
	});

	test('reads SvelteKit 3 options, which are not nested under kit', async () => {
		const { file } = await setup();
		const plugin = preloadPlugin();
		plugin.configResolved({
			build: {},
			plugins: [
				{
					api: { options: { outDir: '.svelte-kit', paths: { base: '/app' } } },
					name: 'vite-plugin-sveltekit-setup',
				},
			],
			root: path.resolve(path.dirname(file), '../../../..'),
		});
		await plugin.writeBundle.call(
			{ environment: { name: 'client' } },
			{},
			CLIENT_BUNDLE
		);
		expect(await readFile(file, 'utf8')).toContain(
			'/app/_app/immutable/chunks/a.js'
		);
	});

	test('does nothing outside SvelteKit', async () => {
		const { file } = await setup();
		const plugin = preloadPlugin();
		plugin.configResolved({
			build: {},
			plugins: [],
			root: path.dirname(file),
		});
		await plugin.writeBundle.call({}, {}, CLIENT_BUNDLE);
		expect(await readFile(file, 'utf8')).toContain(
			MODULE_PRELOAD_PLACEHOLDERS['loader-and-blocker']
		);
	});
});

describe('Svelte backend URL variables', () => {
	/** The `projectUrl` the generated module exports, for the given env. */
	const resolveProjectUrl = async (
		env: Record<string, unknown>,
		options: { projectUrl?: string } = {}
	) => {
		const root = await mkdtemp(path.join(tmpdir(), 'inth-env-'));
		try {
			const [plugin] = consentManifest({
				...options,
				fetch: vi
					.fn<typeof globalThis.fetch>()
					.mockRejectedValue(new Error('unreachable')),
				onBuildError: 'runtime',
			});
			await plugin.configResolved({
				command: 'serve',
				env,
				logger: { info: () => undefined, warn: () => undefined },
				root,
			});
			const source = String(
				await plugin.load.call(
					{ environment: { config: { consumer: 'server' } } },
					plugin.resolveId('@inth/sdk/generated') as string
				)
			);
			return {
				env,
				projectUrl: /export const projectUrl = "(?<url>[^"]*)";/u.exec(source)
					?.groups?.url,
			};
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	};
	const C15T = 'https://inth.example.com';
	const INTH = 'https://inth.example.com';

	test('PUBLIC_INTH_PROJECT_URL alone gives the backend URL', async () => {
		const { projectUrl } = await resolveProjectUrl({
			PUBLIC_INTH_PROJECT_URL: INTH,
		});
		expect(projectUrl).toBe(INTH);
	});

	test('either Inth variable beats either c15t variable', async () => {
		const { projectUrl } = await resolveProjectUrl({
			PUBLIC_C15T_BACKEND_URL: C15T,
			PUBLIC_INTH_PROJECT_URL: INTH,
			VITE_C15T_BACKEND_URL: C15T,
		});
		expect(projectUrl).toBe(INTH);
		const vite = await resolveProjectUrl({
			PUBLIC_C15T_BACKEND_URL: C15T,
			VITE_INTH_PROJECT_URL: INTH,
		});
		expect(vite.projectUrl).toBe(INTH);
	});

	test('VITE_C15T_BACKEND_URL alone gives the backend URL as VITE_INTH_PROJECT_URL', async () => {
		const { projectUrl, env } = await resolveProjectUrl({
			VITE_C15T_BACKEND_URL: C15T,
		});
		expect(projectUrl).toBe(C15T);
		expect(env.VITE_INTH_PROJECT_URL).toBe(C15T);
	});

	test('VITE_INTH_PROJECT_URL wins when both are set', async () => {
		const { projectUrl } = await resolveProjectUrl({
			VITE_C15T_BACKEND_URL: C15T,
			VITE_INTH_PROJECT_URL: INTH,
		});
		expect(projectUrl).toBe(INTH);
	});

	test('an explicit projectUrl beats both variables', async () => {
		const { projectUrl } = await resolveProjectUrl(
			{ VITE_C15T_BACKEND_URL: C15T, VITE_INTH_PROJECT_URL: INTH },
			{ projectUrl: 'https://option.example.com' }
		);
		expect(projectUrl).toBe('https://option.example.com');
	});
});

describe('consentManifest first-load chunk', () => {
	const plugin = () => consentManifest()[3];
	const ROLLDOWN = {
		environment: { name: 'client' },
		meta: { rolldownVersion: '1.0.0', watchMode: false },
	};
	interface Group {
		name: string;
		test: RegExp;
	}
	const groupsOf = (options: unknown): Group[] =>
		(options as { codeSplitting: { groups: Group[] } }).codeSplitting.groups;

	test("groups the modules InthProvider's first load shares with the engine", () => {
		const options = plugin().outputOptions.call(ROLLDOWN, {
			codeSplitting: { groups: [{ name: 'app', test: /x/u }] },
		});
		const groups = groupsOf(options);

		expect(groups.map((group) => group.name)).toEqual(['app', 'inth']);
		const { test: matches } = groups[1] as Group;
		for (const id of [
			'/app/node_modules/@inth/sdk/lib/core/dist/libs/vendor-listing.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/libs/experiment-presentation.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/modules/vendor-allowed.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/surface-actions/instant-commit.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/translations/defaults.js',
			'/app/node_modules/@inth/sdk/lib/translations/dist/translations/en.js',
			'C:\\app\\node_modules\\@inth\\sdk\\lib\\ui\\dist\\utils\\text-direction.js',
			'\0vite/preload-helper.js',
		]) {
			expect(matches.test(id)).toBe(true);
		}
		// The engine, the commit path and other packages stay where they are.
		// The group puts every module it matches in the first-load chunk, so
		// the vendor resolution, experiment assignment, record evaluation and
		// cookie writes the engine shares with the commit path stay out.
		for (const id of [
			'/app/node_modules/@inth/sdk/lib/core/dist/kernel/index.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/modules/persistence/index.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/libs/vendors.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/libs/experiment.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/libs/experiment-storage.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/libs/cookie/operations.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/modules/has.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/consent-record/evaluate.js',
			'/app/node_modules/@inth/sdk/lib/core/dist/translations/index.js',
			'/app/node_modules/@inth/sdk/lib/translations/dist/languages/de.js',
			'/app/node_modules/@inth/svelte/dist/deferred/commit.js',
			'/app/node_modules/other/dist/libs/vendors.js',
			'/app/node_modules/other/vite/preload-helper.js',
		]) {
			expect(matches.test(id)).toBe(false);
		}
	});

	test('leaves Rollup, the server build and an app that chunks by hand alone', () => {
		expect(
			plugin().outputOptions.call(
				{ environment: { name: 'client' }, meta: { watchMode: false } },
				{}
			)
		).toBeUndefined();
		expect(
			plugin().outputOptions.call(
				{ ...ROLLDOWN, environment: { name: 'ssr' } },
				{}
			)
		).toBeUndefined();
		for (const options of [
			{ manualChunks: () => null },
			{ advancedChunks: {} },
			{ codeSplitting: false },
			{ inlineDynamicImports: true },
		]) {
			expect(plugin().outputOptions.call(ROLLDOWN, options)).toBeUndefined();
		}
	});
});
