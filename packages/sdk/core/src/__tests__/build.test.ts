import { readFileSync } from 'node:fs';
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	stat,
	utimes,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createConsentManifestPolicyPack } from '@inth/sdk-schema/types';
import { build, resolveConfig } from 'vite';
import type { Rollup } from 'vite';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	CONSENT_CHUNK_GROUP,
	consentManifest,
	createConsentManifestPlugin,
	GENERATED_MODULE_ID,
	legacyEnvName,
	loadBuildManifest,
	MANIFEST_CACHE_DIR,
	readBuildEnv,
	readBuildEnvEntry,
	writeManifestCacheModule,
} from '../build';

const MANIFEST_FIXTURE = {
	branding: 'inth',
	revision: 'build-test',
	schemaVersion: 2,
};

const directories: string[] = [];
const createRoot = async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'inth-manifest-')));
	directories.push(root);
	return root;
};

const optionsFor = (rootDir: string) => ({
	fetch: vi
		.fn<typeof globalThis.fetch>()
		.mockImplementation(() => Promise.resolve(Response.json(MANIFEST_FIXTURE))),
	projectUrl: 'https://consent.example.com',
	rootDir,
});

const createLogger = () => ({ info: vi.fn(), warn: vi.fn() });

afterEach(async () => {
	vi.unstubAllEnvs();
	await Promise.all(
		directories.splice(0).map((path) =>
			rm(path, {
				force: true,
				recursive: true,
			})
		)
	);
});

/** Builds `source` as the app entry with the plugin and returns the code. */
const buildEntry = async (
	root: string,
	plugin: ReturnType<typeof consentManifest>,
	source: string,
	options: { ssr?: boolean } = {}
): Promise<string> => {
	await mkdir(join(root, 'src'), { recursive: true });
	const entry = join(root, 'src/entry.js');
	await writeFile(entry, source);
	const output = (await build({
		build: {
			minify: false,
			rollupOptions: { input: entry, preserveEntrySignatures: 'strict' },
			ssr: options.ssr,
			write: false,
		},
		configFile: false,
		logLevel: 'silent',
		plugins: [plugin],
		root,
	})) as Rollup.RollupOutput | Rollup.RollupOutput[];
	const [first] = Array.isArray(output) ? output : [output];
	return (first?.output ?? [])
		.map((chunk) => (chunk.type === 'chunk' ? chunk.code : ''))
		.join('\n');
};

const GENERATED_ENTRY =
	"export { projectUrl, snapshot } from '@inth/sdk/generated';\nexport { snapshot as umbrella } from '@inth/sdk/generated';\n";

describe('@inth/sdk/generated in Vite', () => {
	test('a single-page app build bundles the snapshot and writes no file', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		const code = await buildEntry(
			root,
			consentManifest(options),
			GENERATED_ENTRY
		);
		expect(code).toContain('build-test');
		expect(code).toContain('https://consent.example.com');
		expect(options.fetch).toHaveBeenCalledTimes(1);
		await expect(stat(join(root, 'src/inth-manifest.ts'))).rejects.toThrow();
	});

	test('a build that never reads the snapshot does not fetch the manifest', async () => {
		// hosted() and offline() read the backend URL at most. A backend
		// that is down, or no backend URL, must not stop their builds.
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		// Like a package that exports every mode, of which the app uses one.
		await mkdir(join(root, 'src'), { recursive: true });
		await writeFile(
			join(root, 'src/modes.js'),
			"import { projectUrl, snapshot } from '@inth/sdk/generated';\nexport const hosted = () => ({ projectUrl });\nexport const manifest = () => ({ projectUrl, snapshot });\n"
		);
		const code = await buildEntry(
			root,
			consentManifest(options),
			"import { hosted } from './modes.js';\nexport const mode = hosted();\n"
		);
		expect(options.fetch).not.toHaveBeenCalled();
		expect(code).toContain('https://consent.example.com');
		const withoutURL = await buildEntry(
			root,
			consentManifest({ fetch: options.fetch }),
			"export { projectUrl } from '@inth/sdk/generated';\n"
		);
		expect(withoutURL).toMatch(/\b(?:const|var) projectUrl = void 0;/u);
	});

	test('a build that reads the snapshot bundles an undefined snapshot when the fetch fails', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		const code = await buildEntry(
			root,
			consentManifest(options),
			"import { snapshot } from '@inth/sdk/generated';\nexport const policy = snapshot ?? 'no snapshot';\n"
		);
		expect(code).toContain('no snapshot');
		expect(options.fetch).toHaveBeenCalledTimes(1);
	});

	test("onBuildError: 'fail' stops a build that reads the snapshot when the fetch fails", async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		await expect(
			buildEntry(
				root,
				consentManifest({ ...options, onBuildError: 'fail' }),
				GENERATED_ENTRY
			)
		).rejects.toThrow('during the build (backend unavailable)');
		expect(options.fetch).toHaveBeenCalledTimes(1);
	});

	test('the build failure names source: runtime for a runtime manifestUrl', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		await expect(
			buildEntry(
				root,
				consentManifest({ ...options, onBuildError: 'fail' }),
				GENERATED_ENTRY
			)
		).rejects.toThrow(
			"pass `source: 'runtime'` to this plugin so the build skips this download."
		);
	});

	test("onBuildError: 'runtime' bundles an undefined snapshot when the fetch fails", async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		const code = await buildEntry(
			root,
			consentManifest({ ...options, onBuildError: 'runtime' }),
			"import { snapshot } from '@inth/sdk/generated';\nexport const policy = snapshot ?? 'no snapshot';\n"
		);
		expect(code).not.toContain('__inth_build_snapshot__');
		expect(code).toContain('no snapshot');
		expect(options.fetch).toHaveBeenCalledTimes(1);
	});

	test("source: 'runtime' builds without fetching, for manifest({ manifestUrl })", async () => {
		// The app's manifest() discards the snapshot at runtime, but the
		// bundle still imports it, so only the plugin option can skip the
		// fetch.
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		const code = await buildEntry(
			root,
			consentManifest({ ...options, source: 'runtime' }),
			"import { projectUrl, snapshot } from '@inth/sdk/generated';\nexport const mode = { projectUrl, snapshot: location.hash ? undefined : snapshot };\n"
		);
		expect(options.fetch).not.toHaveBeenCalled();
		expect(code).not.toContain('__inth_build_snapshot__');
		expect(code).toContain('https://consent.example.com');

		const plugin = consentManifest({ ...options, source: 'runtime' });
		await plugin.configResolved({ command: 'serve', root });
		const dev = await plugin.load.call(
			undefined,
			plugin.resolveId(GENERATED_MODULE_ID) as string
		);
		expect(dev).toContain('export const snapshot = undefined;');
		expect(options.fetch).not.toHaveBeenCalled();

		expect(() =>
			consentManifest({ source: 'never' as 'runtime' }).configResolved({
				command: 'build',
				root: '/',
			})
		).toThrow("source must be 'build' or 'runtime'");
	});

	test('a server-rendered framework keeps the snapshot out of the client build', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		const plugin = () =>
			createConsentManifestPlugin(options, {
				envNames: ['VITE_INTH_PROJECT_URL'],
				label: 'test/build',
				serverRendered: true,
			});
		const client = await buildEntry(root, plugin(), GENERATED_ENTRY);
		expect(client).not.toContain('build-test');
		// The backend URL is public, so the browser still gets it.
		expect(client).toContain('https://consent.example.com');
		const server = await buildEntry(root, plugin(), GENERATED_ENTRY, {
			ssr: true,
		});
		expect(server).toContain('build-test');
	});

	test.each([
		['client', true, false],
		['server', true, true],
		['client', false, true],
	] as const)(
		'the %s environment of a server-rendered (%s) app gets the snapshot: %s',
		async (consumer, serverRendered, included) => {
			const root = await createRoot();
			const plugin = createConsentManifestPlugin(optionsFor(root), {
				envNames: [],
				label: 'test/build',
				serverRendered,
			});
			await plugin.configResolved({ command: 'serve', root });
			const id = plugin.resolveId(GENERATED_MODULE_ID);
			expect(id).toBeDefined();
			expect(plugin.resolveId('@inth/sdk/generated')).toBe(id);
			const source = await plugin.load.call(
				{ environment: { config: { consumer } } },
				id as string
			);
			expect(source?.includes('build-test')).toBe(included);
			expect(source).toContain(
				'export const projectUrl = "https://consent.example.com";'
			);
		}
	);

	test('reads the ssr flag where Vite has no environments', async () => {
		const root = await createRoot();
		const plugin = createConsentManifestPlugin(optionsFor(root), {
			envNames: [],
			label: 'test/build',
			serverRendered: true,
		});
		await plugin.configResolved({ command: 'serve', root });
		const id = plugin.resolveId(GENERATED_MODULE_ID) as string;
		expect(await plugin.load.call(undefined, id, { ssr: true })).toContain(
			'build-test'
		);
		expect(await plugin.load.call(undefined, id)).not.toContain('build-test');
	});

	test('a framework can decide from the resolved config', async () => {
		const root = await createRoot();
		const plugin = createConsentManifestPlugin(optionsFor(root), {
			envNames: [],
			label: 'test/build',
			serverRendered: (config) =>
				config.plugins?.some((entry) => entry.name === 'framework') ?? false,
		});
		await plugin.configResolved({ plugins: [{ name: 'framework' }], root });
		const id = plugin.resolveId(GENERATED_MODULE_ID) as string;
		expect(
			await plugin.load.call(
				{ environment: { config: { consumer: 'client' } } },
				id
			)
		).not.toContain('build-test');
	});

	test('keeps the module out of pre-bundling and bundles inth packages on the server', () => {
		const { optimizeDeps, ssr } = consentManifest().config();
		expect(optimizeDeps.exclude).toEqual([GENERATED_MODULE_ID]);
		expect(ssr.noExternal).toEqual(['@inth/sdk']);
	});

	test('serves the generated entry of each package an adapter names', () => {
		const plugin = createConsentManifestPlugin(
			{},
			{ envNames: [], label: 'test', packages: ['@inth/example'] }
		);
		const { optimizeDeps, ssr } = plugin.config();
		expect(optimizeDeps.exclude).toEqual([
			GENERATED_MODULE_ID,
			'@inth/example/generated',
		]);
		expect(ssr.noExternal).toEqual(['@inth/sdk', '@inth/example']);
		expect(plugin.resolveId('@inth/example/generated')).toBe(
			plugin.resolveId(GENERATED_MODULE_ID)
		);
	});

	// A function `serverRendered` used to count as server-rendered in the
	// `config` hook, so a single-page app it described never got the group.
	test.each([
		[false, [CONSENT_CHUNK_GROUP]],
		[true, []],
	])(
		'decides the chunk group from a serverRendered function once the config is resolved (%s)',
		(rendered, groups) => {
			const plugin = createConsentManifestPlugin(
				{ projectUrl: 'https://consent.example.com' },
				{ envNames: [], label: 'test', serverRendered: () => rendered }
			);
			const rolldown = { meta: { rolldownVersion: '1.2.11' } };
			const config = plugin.config.call(rolldown, {}, {});
			plugin.configResolved({
				build: config.build as never,
				command: 'build',
				root: '/app',
			});
			expect(config.build?.rolldownOptions.output.codeSplitting.groups).toEqual(
				groups
			);
		}
	);

	test('puts the inth modules a client entry imports into one chunk', () => {
		const plugin = consentManifest();
		const rolldown = { meta: { rolldownVersion: '1.2.11' } };
		const group = plugin.config.call(rolldown, {}, {}).build?.rolldownOptions
			.output.codeSplitting.groups[0];
		expect(group).toMatchObject({
			includeDependenciesRecursively: false,
			tags: ['$initial'],
		});
		expect(
			group?.test.test('/app/node_modules/@inth/react/dist/index.js')
		).toBe(true);
		expect(
			group?.test.test(
				'/app/node_modules/.pnpm/@inth+sdk@3/node_modules/@inth/sdk/lib/core/dist/runtime.js'
			)
		).toBe(true);
		expect(group?.test.test('/app/node_modules/react/index.js')).toBe(false);
	});

	test('keeps the app chunking for SSR, its own chunking, and older Rolldown', () => {
		const plugin = consentManifest();
		const rolldown = { meta: { rolldownVersion: '1.2.11' } };
		expect(plugin.config.call(rolldown, {}, { isSsrBuild: true }).build).toBe(
			undefined
		);
		expect(
			plugin.config.call(
				rolldown,
				{ build: { rolldownOptions: { output: { codeSplitting: false } } } },
				{}
			).build
		).toBe(undefined);
		expect(
			plugin.config.call({ meta: { rolldownVersion: '1.0.0' } }, {}, {}).build
		).toBe(undefined);
		expect(plugin.config.call({}, {}, {}).build).toBe(undefined);
	});

	test('scopes the group to the client environment of a shared config', () => {
		const plugin = consentManifest();
		const rolldown = { meta: { rolldownVersion: '1.2.11' } };
		// Vite's Environment API: one config for the client and the server
		// build, whose `config` hook runs once, without `isSsrBuild`.
		const shared = plugin.config.call(
			rolldown,
			{ environments: { client: {}, ssr: {} } },
			{}
		);
		expect(shared.build).toBe(undefined);
		expect(
			shared.environments?.client.build.rolldownOptions.output.codeSplitting
				.groups
		).toEqual([CONSENT_CHUNK_GROUP]);
		// The client environment's own chunking opts out too.
		const own = plugin.config.call(
			rolldown,
			{
				environments: {
					client: {
						build: { rolldownOptions: { output: { codeSplitting: false } } },
					},
				},
			},
			{}
		);
		expect(own.build).toBe(undefined);
		expect(own.environments).toBe(undefined);
	});

	test('leaves other modules alone', async () => {
		const plugin = consentManifest();
		expect(plugin.resolveId('@inth/sdk/engine')).toBeUndefined();
		expect(await plugin.load.call(undefined, '/src/app.ts')).toBeUndefined();
	});

	test('preview does not fetch the manifest', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		await resolveConfig(
			{
				configFile: false,
				logLevel: 'silent',
				plugins: [consentManifest(options)],
				root,
			},
			'serve',
			'production',
			'production',
			true
		);
		expect(options.fetch).not.toHaveBeenCalled();
	});

	test('dev serves an undefined snapshot when the fetch fails', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		const logger = createLogger();
		const plugin = consentManifest(options);
		await plugin.configResolved({ command: 'serve', logger, root });
		// Dev fetches when the module is first loaded, not at startup.
		expect(options.fetch).not.toHaveBeenCalled();
		const source = await plugin.load.call(
			undefined,
			plugin.resolveId(GENERATED_MODULE_ID) as string
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringMatching(
				/^@inth\/sdk\/build: could not fetch .* during dev/u
			)
		);
		expect(source).toContain('export const snapshot = undefined;');
	});

	test('reads VITE_INTH_PROJECT_URL from .env and exposes it', async () => {
		const root = await createRoot();
		await writeFile(
			join(root, '.env.production'),
			'VITE_INTH_PROJECT_URL="https://env.example.com/api"\n'
		);
		const { fetch } = optionsFor(root);
		const env: Record<string, unknown> = {};
		const plugin = consentManifest({ fetch });
		await plugin.configResolved({
			command: 'serve',
			env,
			mode: 'production',
			root,
		});
		expect(env.VITE_INTH_PROJECT_URL).toBe('https://env.example.com/api');
		expect(
			await plugin.load.call(
				undefined,
				plugin.resolveId(GENERATED_MODULE_ID) as string
			)
		).toContain('export const projectUrl = "https://env.example.com/api";');
		expect(fetch).toHaveBeenCalledWith(
			'https://env.example.com/api/v1/consent/manifest?manifestLevel=1',
			expect.any(Object)
		);
	});

	describe('VITE_INTH_PROJECT_URL', () => {
		const resolveProjectUrl = async (
			env: Record<string, unknown>,
			options: { projectUrl?: string } = {}
		) => {
			const root = await createRoot();
			const { fetch } = optionsFor(root);
			const plugin = consentManifest({ ...options, fetch });
			await plugin.configResolved({
				command: 'serve',
				env,
				mode: 'production',
				root,
			});
			const source = await plugin.load.call(
				undefined,
				plugin.resolveId(GENERATED_MODULE_ID) as string
			);
			return { fetch, source };
		};

		test('VITE_C15T_BACKEND_URL alone gives the backend URL and sets VITE_INTH_PROJECT_URL', async () => {
			const env: Record<string, unknown> = {
				VITE_C15T_BACKEND_URL: 'https://inth.example.com',
			};
			const { fetch, source } = await resolveProjectUrl(env);
			expect(source).toContain(
				'export const projectUrl = "https://inth.example.com";'
			);
			expect(env.VITE_INTH_PROJECT_URL).toBe('https://inth.example.com');
			expect(fetch).toHaveBeenCalledWith(
				'https://inth.example.com/v1/consent/manifest?manifestLevel=1',
				expect.any(Object)
			);
		});

		test('wins over VITE_C15T_BACKEND_URL when both are set', async () => {
			const { source } = await resolveProjectUrl({
				VITE_C15T_BACKEND_URL: 'https://inth.example.com',
				VITE_INTH_PROJECT_URL: 'https://inth.example.com',
			});
			expect(source).toContain(
				'export const projectUrl = "https://inth.example.com";'
			);
		});

		test('an explicit projectUrl beats both variables', async () => {
			const env: Record<string, unknown> = {
				VITE_C15T_BACKEND_URL: 'https://inth.example.com',
				VITE_INTH_PROJECT_URL: 'https://inth.example.com',
			};
			const { source } = await resolveProjectUrl(env, {
				projectUrl: 'https://option.example.com',
			});
			expect(source).toContain(
				'export const projectUrl = "https://option.example.com";'
			);
		});
	});

	test('suggests the hosted backend when the policy depends on location', async () => {
		const root = await createRoot();
		const regional = {
			...MANIFEST_FIXTURE,
			policyPacks: [
				createConsentManifestPolicyPack({
					id: 'regional',
					match: { countries: ['DE'] },
					model: 'opt-in',
					prompt: 'choice',
				}),
			],
		};
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockImplementation(() => Promise.resolve(Response.json(regional)));
		const logger = createLogger();
		// A production chunk that reads the snapshot: loaded, then rendered.
		const load = async (
			plugin: ReturnType<typeof consentManifest>,
			warnings: ReturnType<typeof createLogger>,
			command: 'build' | 'serve' = 'build'
		) => {
			plugin.configResolved({ command, logger: warnings, root });
			const source = await plugin.load.call(
				undefined,
				plugin.resolveId(GENERATED_MODULE_ID) as string
			);
			await plugin.renderChunk(source as string);
		};
		const devOnly = createLogger();
		await load(
			consentManifest({ fetch, projectUrl: 'https://consent.example.com' }),
			devOnly,
			'serve'
		);
		// Dev loads the module for every mode, so it can't tell.
		expect(devOnly.warn).not.toHaveBeenCalled();
		await load(
			consentManifest({ fetch, projectUrl: 'https://consent.example.com' }),
			logger
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringMatching(
				/^@inth\/sdk\/build: the consent policy depends on the visitor's location.*projectUrl/u
			)
		);

		const everywhere = createLogger();
		await load(consentManifest(optionsFor(root)), everywhere);
		expect(everywhere.warn).not.toHaveBeenCalled();
	});

	test('shares one fetch across loads and environments', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		const plugin = consentManifest(options);
		await plugin.configResolved({ command: 'serve', root });
		const id = plugin.resolveId(GENERATED_MODULE_ID) as string;
		await Promise.all([
			plugin.load.call(undefined, id),
			plugin.load.call(undefined, id, { ssr: true }),
		]);
		expect(options.fetch).toHaveBeenCalledTimes(1);
	});

	test('retries a failed fetch and shares the recovered snapshot', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		options.fetch.mockResolvedValueOnce(
			new Response('unavailable', { status: 503 })
		);
		const plugin = consentManifest({ ...options, onBuildError: 'fail' });
		await plugin.configResolved({ command: 'serve', root });
		const id = plugin.resolveId(GENERATED_MODULE_ID) as string;
		const results = await Promise.allSettled([
			plugin.load.call(undefined, id),
			plugin.load.call(undefined, id),
		]);
		expect(results.map((result) => result.status)).toEqual([
			'rejected',
			'rejected',
		]);
		expect(options.fetch).toHaveBeenCalledTimes(1);
		const [first] = await Promise.all([
			plugin.load.call(undefined, id),
			plugin.load.call(undefined, id),
		]);
		expect(first).toContain('build-test');
		await plugin.load.call(undefined, id);
		expect(options.fetch).toHaveBeenCalledTimes(2);
	});

	test('rejects an unknown onBuildError when Vite starts', () => {
		const plugin = consentManifest({
			onBuildError: 'warn' as 'fail',
		});
		expect(() =>
			plugin.configResolved({ command: 'build', root: '/' })
		).toThrow("onBuildError must be 'runtime' or 'fail'");
	});

	test('warns once when the bundle reads a backend URL that is not set', async () => {
		const root = await createRoot();
		const warn = vi.fn();
		await mkdir(join(root, 'src'), { recursive: true });
		await writeFile(
			join(root, 'src/entry.js'),
			"export { projectUrl } from '@inth/sdk/generated';\n"
		);
		await build({
			build: {
				minify: false,
				rollupOptions: {
					input: join(root, 'src/entry.js'),
					preserveEntrySignatures: 'strict',
				},
				write: false,
			},
			configFile: false,
			customLogger: {
				clearScreen: () => undefined,
				error: () => undefined,
				hasErrorLogged: () => false,
				hasWarned: false,
				info: () => undefined,
				warn,
				warnOnce: () => undefined,
			},
			plugins: [consentManifest({ fetch: optionsFor(root).fetch })],
			root,
		});
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'no backend URL is set. A provider without `projectUrl`'
			)
		);
	});
});

/** Builds `index.html` with `source` as its module script. */
const buildPage = async (
	root: string,
	plugin: ReturnType<typeof consentManifest>,
	source: string,
	options: { cspNonce?: string; warn?: (message: string) => void } = {}
): Promise<string> => {
	await mkdir(join(root, 'src'), { recursive: true });
	await writeFile(join(root, 'src/entry.js'), source);
	await writeFile(join(root, 'src/style.css'), 'body { margin: 0; }\n');
	await writeFile(
		join(root, 'index.html'),
		'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="UTF-8" />\n\t\t<link rel="stylesheet" href="/src/style.css" />\n\t</head>\n\t<body>\n\t\t<script type="module" src="/src/entry.js"></script>\n\t</body>\n</html>\n'
	);
	const warn = options.warn ?? (() => undefined);
	const output = (await build({
		build: { minify: false, write: false },
		configFile: false,
		customLogger: {
			clearScreen: () => undefined,
			error: () => undefined,
			hasErrorLogged: () => false,
			hasWarned: false,
			info: () => undefined,
			warn,
			warnOnce: warn,
		},
		html: options.cspNonce ? { cspNonce: options.cspNonce } : undefined,
		plugins: [plugin],
		root,
	})) as Rollup.RollupOutput | Rollup.RollupOutput[];
	const [first] = Array.isArray(output) ? output : [output];
	const page = first?.output.find((file) => file.fileName === 'index.html');
	return page?.type === 'asset' ? String(page.source) : '';
};

const HOSTED_ENTRY =
	"import { projectUrl } from '@inth/sdk/generated';\nconsole.log(projectUrl);\n";
const PREFETCH_TAG = '<script id="inth-initial-data-prefetch"';

describe('initPrefetch', () => {
	test('puts the /init script after the charset and before the stylesheet by default', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		const html = await buildPage(root, consentManifest(options), HOSTED_ENTRY);
		const tag = html.indexOf(PREFETCH_TAG);
		expect(tag).toBeGreaterThan(html.indexOf('<meta charset="UTF-8" />'));
		expect(tag).toBeLessThan(html.indexOf('rel="stylesheet"'));
		expect(html).toContain('"projectUrl":"https://consent.example.com"');
		expect(html).toContain('"journey":"auto"');
		expect(options.fetch).not.toHaveBeenCalled();
	});

	test('initPrefetch: false leaves the script out', async () => {
		const root = await createRoot();
		const html = await buildPage(
			root,
			consentManifest({ ...optionsFor(root), initPrefetch: false }),
			HOSTED_ENTRY
		);
		expect(html).toContain('rel="stylesheet"');
		expect(html).not.toContain(PREFETCH_TAG);
	});

	test('passes credentials, experiment, journey, overrides and storageKey to the script', async () => {
		const root = await createRoot();
		const html = await buildPage(
			root,
			consentManifest({
				...optionsFor(root),
				initPrefetch: {
					// A browser's init never sends cookies; `omit` passes through.
					credentials: 'omit',
					experiment: {
						arms: { wall: { prompt: { variant: 'wall' } } },
						id: 'banner-shape',
						split: { control: 60, wall: 40 },
					},
					journey: false,
					overrides: { country: 'DE', language: 'de' },
					storageKey: 'shop-consent',
				},
			}),
			HOSTED_ENTRY
		);
		expect(html).toContain('"credentials":"omit"');
		expect(html).toMatch(/[?&]country=DE[&"]/u);
		expect(html).toContain('"language":"de"');
		expect(html).toContain('"journey":null');
		expect(html).toContain('"notice":["shop-consent-notice"');
		expect(html).toContain('"arms":["control","wall"]');
		expect(html).toContain('"weights":[60,40]');
		// Only the arm names reach the page, not what each arm changes.
		expect(html).not.toContain('"variant":"wall"');
	});

	test("carries Vite's html.cspNonce", async () => {
		const root = await createRoot();
		const html = await buildPage(
			root,
			consentManifest({ ...optionsFor(root), initPrefetch: true }),
			HOSTED_ENTRY,
			{ cspNonce: 'n0nce' }
		);
		expect(html).toMatch(
			/<script id="inth-initial-data-prefetch" nonce="n0nce">/u
		);
	});

	test('leaves the script out of a build that bundles the snapshot', async () => {
		// manifest() resolves from the snapshot, so an early /init would
		// be a request the app may never read, counted by the backend.
		const root = await createRoot();
		const warn = vi.fn();
		const html = await buildPage(
			root,
			consentManifest({ ...optionsFor(root), initPrefetch: true }),
			"import { snapshot } from '@inth/sdk/generated';\nconsole.log(snapshot);\n",
			{ warn }
		);
		expect(html).not.toContain(PREFETCH_TAG);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'initPrefetch: the bundle reads the snapshot, as `manifest()` does'
			)
		);
	});

	test('leaves the script out of a manifest() build quietly unless asked for', async () => {
		const root = await createRoot();
		const warn = vi.fn();
		const html = await buildPage(
			root,
			consentManifest(optionsFor(root)),
			"import { snapshot } from '@inth/sdk/generated';\nconsole.log(snapshot);\n",
			{ warn }
		);
		expect(html).not.toContain(PREFETCH_TAG);
		expect(warn).not.toHaveBeenCalledWith(
			expect.stringContaining('initPrefetch')
		);
	});

	test("leaves the script out with source: 'runtime'", async () => {
		const root = await createRoot();
		const warn = vi.fn();
		const html = await buildPage(
			root,
			consentManifest({
				...optionsFor(root),
				initPrefetch: true,
				source: 'runtime',
			}),
			HOSTED_ENTRY,
			{ warn }
		);
		expect(html).not.toContain(PREFETCH_TAG);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("initPrefetch: `source: 'runtime'`")
		);
	});

	test('a server-rendered app warns and adds nothing', async () => {
		const root = await createRoot();
		const logger = createLogger();
		const plugin = createConsentManifestPlugin(
			{ ...optionsFor(root), initPrefetch: true },
			{ envNames: [], label: 'test', serverRendered: true }
		);
		plugin.configResolved({ command: 'build', logger, root });
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('initPrefetch has no effect')
		);
		expect(await plugin.transformIndexHtml('<head></head>')).toBeUndefined();
	});

	test('a page without a <head> keeps the script after the doctype', async () => {
		const plugin = createConsentManifestPlugin(
			{ projectUrl: 'https://consent.example.com' },
			{ envNames: [], label: 'test' }
		);
		plugin.configResolved({
			command: 'build',
			logger: createLogger(),
			root: '/app',
		});
		const html = await plugin.transformIndexHtml(
			'<!doctype html>\n<html lang="en"><body></body></html>'
		);
		expect(html).toMatch(
			/^<!doctype html>\n<html lang="en">\n<script id="inth-initial-data-prefetch"/u
		);
	});

	test('a watch rebuild that stops bundling the snapshot adds the script', async () => {
		const root = await createRoot();
		const plugin = createConsentManifestPlugin(optionsFor(root), {
			envNames: [],
			label: 'test',
		});
		plugin.configResolved({ command: 'build', logger: createLogger(), root });
		const source = await plugin.load.call(
			undefined,
			plugin.resolveId(GENERATED_MODULE_ID) as string
		);
		await plugin.renderChunk(source as string);
		expect(await plugin.transformIndexHtml('<head></head>')).toBeUndefined();
		plugin.buildStart();
		expect(await plugin.transformIndexHtml('<head></head>')).toContain(
			PREFETCH_TAG
		);
	});

	test('a server-rendered app that left the option unset hears nothing', async () => {
		const logger = createLogger();
		const plugin = createConsentManifestPlugin(
			{ projectUrl: 'https://consent.example.com' },
			{ envNames: [], label: 'test', serverRendered: true }
		);
		plugin.configResolved({ command: 'build', logger, root: '/app' });
		expect(logger.warn).not.toHaveBeenCalled();
		expect(await plugin.transformIndexHtml('<head></head>')).toBeUndefined();
	});
});

describe('@inth/sdk/generated typings', () => {
	const packageRoot = resolve(__dirname, '../..');
	const readJSON = (path: string) =>
		JSON.parse(readFileSync(path, 'utf8')) as {
			exports: Record<string, { types: string }>;
		};

	test('the package exports declarations, so type checks pass before any build', () => {
		const { exports } = readJSON(join(packageRoot, 'package.json'));
		expect(exports['./generated']?.types).toBe('./dist-types/generated.d.ts');
		const declarations = readFileSync(
			join(packageRoot, 'dist-types/generated.d.ts'),
			'utf8'
		);
		expect(declarations).toContain(
			'export declare const projectUrl: string | undefined;'
		);
		expect(declarations).toContain(
			'export declare const snapshot: ConsentManifest | undefined;'
		);
	});

	test('@inth/sdk/generated points at them', () => {
		const { exports } = readJSON(resolve(packageRoot, '../sdk/package.json'));
		expect(exports['./generated']?.types).toBe(
			'./lib/core/dist-types/generated.d.ts'
		);
	});

	test('the stand-in module exports undefined without a build integration', async () => {
		expect({ ...(await import('../generated')) }).toEqual({
			projectUrl: undefined,
			snapshot: undefined,
		});
	});
});

describe('node_modules/.cache/inth output', () => {
	const defaultsFor = (rootDir: string) => ({
		command: 'build' as const,
		envNames: ['NEXT_PUBLIC_INTH_PROJECT_URL'],
		importSource: '@inth/nextjs/static',
		label: 'test/build',
		rootDir,
	});

	test('writes the snapshot for servers and a server-only stand-in for browsers', async () => {
		const root = await createRoot();
		const files = await writeManifestCacheModule(
			optionsFor(root),
			defaultsFor(root),
			createLogger()
		);
		const directory = join(root, MANIFEST_CACHE_DIR);
		expect(files).toEqual({
			browser: join(directory, 'manifest.browser.js'),
			server: join(directory, 'manifest.js'),
		});
		const server = await readFile(files.server, 'utf8');
		expect(server).toContain('"revision": "build-test"');
		expect(server).toContain(
			'export const projectUrl = "https://consent.example.com";'
		);
		expect(server).not.toContain('server-only');
		const browser = await readFile(files.browser, 'utf8');
		expect(browser).toContain("import 'server-only';");
		expect(browser).toContain('export const snapshot = undefined;');
		expect(browser).not.toContain('build-test');
		expect(await readFile(join(directory, 'manifest.d.ts'), 'utf8')).toBe(
			[
				"import type { ConsentManifest } from '@inth/nextjs/static';",
				'',
				'export declare const projectUrl: string | undefined;',
				'export declare const snapshot: ConsentManifest | undefined;',
				'',
			].join('\n')
		);
	});

	test('the server module is valid JavaScript with the fetched values', async () => {
		const root = await createRoot();
		const { server } = await writeManifestCacheModule(
			optionsFor(root),
			defaultsFor(root),
			createLogger()
		);
		expect({ ...(await import(server)) }).toEqual({
			projectUrl: 'https://consent.example.com',
			snapshot: MANIFEST_FIXTURE,
		});
	});

	test('does not rewrite an unchanged snapshot but replaces a changed one', async () => {
		const root = await createRoot();
		const options = optionsFor(root);
		const { server } = await writeManifestCacheModule(
			options,
			defaultsFor(root),
			createLogger()
		);
		// A rewrite must change this even on filesystems with coarse timestamps.
		const previousTime = new Date('2000-01-01T00:00:00.000Z');
		await utimes(server, previousTime, previousTime);
		const original = await stat(server);
		await writeManifestCacheModule(options, defaultsFor(root), createLogger());
		expect((await stat(server)).mtimeMs).toBe(original.mtimeMs);
		options.fetch.mockResolvedValue(
			Response.json({ ...MANIFEST_FIXTURE, revision: 'new-revision' })
		);
		await writeManifestCacheModule(options, defaultsFor(root), createLogger());
		expect(await readFile(server, 'utf8')).toContain('new-revision');
	});

	test.each([
		[
			'https://consent.example.com',
			'https://consent.example.com/v1/consent/manifest?manifestLevel=1',
		],
		[
			'https://consent.example.com/',
			'https://consent.example.com/v1/consent/manifest?manifestLevel=1',
		],
		[
			'https://consent.example.com/api/inth///',
			'https://consent.example.com/api/inth/v1/consent/manifest?manifestLevel=1',
		],
		[
			'https://consent.example.com/api/?key=x#config',
			'https://consent.example.com/api/v1/consent/manifest?key=x&manifestLevel=1#config',
		],
	])(
		'fetches /manifest under projectUrl %s',
		async (projectUrl, manifestUrl) => {
			const root = await createRoot();
			const options = optionsFor(root);
			await writeManifestCacheModule(
				{ ...options, projectUrl },
				defaultsFor(root),
				createLogger()
			);
			expect(options.fetch).toHaveBeenCalledWith(
				manifestUrl,
				expect.any(Object)
			);
		}
	);
});

describe('build-time manifest policy', () => {
	const STUB = 'export const snapshot = undefined;';
	const defaultsFor = (rootDir: string, command: 'build' | 'dev') => ({
		command,
		envNames: ['VITE_INTH_PROJECT_URL'],
		importSource: '@inth/sdk/build',
		label: 'test/build',
		rootDir,
	});
	const write = async (
		overrides: Record<string, unknown> = {},
		command: 'build' | 'dev' = 'build',
		extra: { skipReason?: string } = {}
	) => {
		const root = await createRoot();
		const options = { ...optionsFor(root), ...overrides };
		const logger = createLogger();
		let result: { error: Error | undefined; source: string | undefined };
		try {
			const files = await writeManifestCacheModule(
				options,
				{ ...defaultsFor(root, command), ...extra },
				logger
			);
			result = {
				error: undefined,
				source: await readFile(files.server, 'utf8'),
			};
		} catch (error) {
			result = { error: error as Error, source: undefined };
		}
		return { ...result, logger, options, root };
	};
	const refused = () =>
		new TypeError('fetch failed', {
			cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9'), {
				code: 'ECONNREFUSED',
			}),
		});

	test('warns in a production build by default and writes an undefined snapshot', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(refused());
		const { logger, source } = await write({ fetch });
		expect(source).toContain(STUB);
		expect(logger.warn).toHaveBeenCalledWith(
			"could not fetch the consent manifest from https://consent.example.com/v1/consent/manifest?manifestLevel=1 during the build (fetch failed: connect ECONNREFUSED 127.0.0.1:9). The server fetches it at runtime instead, and asks the backend's init while it is unavailable. Set `INTH_ON_BUILD_ERROR=fail` (or `onBuildError: 'fail'`) to stop the build on this error."
		);
	});

	test("onBuildError: 'fail' stops a production build and leaves no file", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(refused());
		const { error, root } = await write({ fetch, onBuildError: 'fail' });
		expect(error?.message).toBe(
			"test/build: could not fetch the consent manifest from https://consent.example.com/v1/consent/manifest?manifestLevel=1 during the build (fetch failed: connect ECONNREFUSED 127.0.0.1:9). Set `INTH_ON_BUILD_ERROR=runtime` (or `onBuildError: 'runtime'`) to deploy with runtime fetching."
		);
		await expect(
			stat(join(root, MANIFEST_CACHE_DIR, 'manifest.js'))
		).rejects.toMatchObject({ code: 'ENOENT' });
	});

	test('warns in dev by default and writes an undefined snapshot', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(refused());
		const { logger, source } = await write({ fetch }, 'dev');
		expect(source).toContain(STUB);
		expect(logger.warn).toHaveBeenCalledWith(
			"could not fetch the consent manifest from https://consent.example.com/v1/consent/manifest?manifestLevel=1 during dev (fetch failed: connect ECONNREFUSED 127.0.0.1:9). The server fetches it at runtime instead, and asks the backend's init while it is unavailable. Set `INTH_ON_BUILD_ERROR=fail` (or `onBuildError: 'fail'`) to stop the build on this error."
		);
	});

	test("onBuildError: 'runtime' falls back in a production build", async () => {
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(new Response(null, { status: 503 }));
		const { logger, source } = await write({ fetch, onBuildError: 'runtime' });
		expect(source).toContain(STUB);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('(/v1/consent/manifest responded 503')
		);
	});

	test("onBuildError: 'fail' stops dev", async () => {
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error('backend unavailable'));
		const { error } = await write({ fetch, onBuildError: 'fail' }, 'dev');
		expect(error?.message).toContain('during dev (backend unavailable)');
	});

	test("INTH_ON_BUILD_ERROR=runtime overrides onBuildError: 'fail'", async () => {
		vi.stubEnv('INTH_ON_BUILD_ERROR', 'runtime');
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error('backend unavailable'));
		const { source } = await write({ fetch, onBuildError: 'fail' });
		expect(source).toContain(STUB);
	});

	test("INTH_ON_BUILD_ERROR=fail overrides onBuildError: 'runtime'", async () => {
		vi.stubEnv('INTH_ON_BUILD_ERROR', 'fail');
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error('backend unavailable'));
		const { error } = await write({ fetch, onBuildError: 'runtime' }, 'dev');
		expect(error?.message).toContain('backend unavailable');
	});

	test('reads C15T_ON_BUILD_ERROR when INTH_ON_BUILD_ERROR is unset', async () => {
		vi.stubEnv('C15T_ON_BUILD_ERROR', 'runtime');
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error('backend unavailable'));
		const { source } = await write({ fetch, onBuildError: 'fail' });
		expect(source).toContain(STUB);
	});

	test('INTH_ON_BUILD_ERROR wins over C15T_ON_BUILD_ERROR', async () => {
		vi.stubEnv('C15T_ON_BUILD_ERROR', 'runtime');
		vi.stubEnv('INTH_ON_BUILD_ERROR', 'fail');
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error('backend unavailable'));
		const { error } = await write({ fetch });
		expect(error?.message).toContain('backend unavailable');
	});

	test('reads INTH_ON_BUILD_ERROR from a .env file', async () => {
		const root = await createRoot();
		await writeFile(join(root, '.env'), 'INTH_ON_BUILD_ERROR=fail\n');
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error('backend unavailable'));
		await expect(
			writeManifestCacheModule(
				{ ...optionsFor(root), fetch },
				defaultsFor(root, 'dev'),
				createLogger()
			)
		).rejects.toThrow('backend unavailable');
	});

	test('names C15T_ON_BUILD_ERROR when its value is unknown', async () => {
		vi.stubEnv('C15T_ON_BUILD_ERROR', 'warn');
		const { error } = await write();
		expect(error?.message).toContain(
			"C15T_ON_BUILD_ERROR must be 'runtime' or 'fail'"
		);
	});

	test('rejects an unknown INTH_ON_BUILD_ERROR or onBuildError', async () => {
		vi.stubEnv('INTH_ON_BUILD_ERROR', 'warn');
		const fromEnv = await write();
		expect(fromEnv.error?.message).toContain(
			"INTH_ON_BUILD_ERROR must be 'runtime' or 'fail'"
		);
		expect(fromEnv.options.fetch).not.toHaveBeenCalled();
		vi.unstubAllEnvs();
		const fromOption = await write({ onBuildError: 'warn' });
		expect(fromOption.error?.message).toContain(
			"onBuildError must be 'runtime' or 'fail'"
		);
	});

	test.each(['/api/inth', 'file:///backend'])(
		'skips the fetch in a production build for projectUrl %j',
		async (projectUrl) => {
			const { logger, options, source } = await write({ projectUrl });
			expect(options.fetch).not.toHaveBeenCalled();
			expect(source).toContain(STUB);
			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining('not an absolute http(s) URL')
			);
		}
	);

	test.each([undefined, ''])(
		"onBuildError: 'fail' stops a production build without a backend URL (%j)",
		async (projectUrl) => {
			const { error, options } = await write({
				onBuildError: 'fail',
				projectUrl,
			});
			expect(error?.message).toBe(
				"test/build: no backend URL is set, so the build cannot fetch the consent manifest. Pass projectUrl or set VITE_INTH_PROJECT_URL. Set `INTH_ON_BUILD_ERROR=runtime` (or `onBuildError: 'runtime'`) to build without a snapshot."
			);
			expect(options.fetch).not.toHaveBeenCalled();
		}
	);

	test.each(['build', 'dev'] as const)(
		'%s warns without a backend URL',
		async (command) => {
			const { logger, source } = await write(
				{ projectUrl: undefined },
				command
			);
			expect(source).toContain(STUB);
			expect(logger.warn).toHaveBeenCalledWith(
				`no backend URL is set, so ${command === 'build' ? 'the build' : 'dev'} cannot fetch the consent manifest. Pass projectUrl or set VITE_INTH_PROJECT_URL. The server fetches it at runtime, or asks the backend's init.`
			);
		}
	);

	test("onBuildError: 'runtime' skips a build without a backend URL with a notice", async () => {
		const { logger, source } = await write({
			onBuildError: 'runtime',
			projectUrl: undefined,
		});
		expect(source).toContain(STUB);
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.info).toHaveBeenCalledWith(
			'skipped the consent manifest fetch because no backend URL is set. Pass projectUrl or set VITE_INTH_PROJECT_URL.'
		);
	});

	test("rejects a relative projectUrl with onBuildError: 'fail'", async () => {
		const { error, options } = await write({
			onBuildError: 'fail',
			projectUrl: '/api/inth',
		});
		expect(error?.message).toContain(
			'build-time manifests require an absolute upstream URL. Pass projectUrl or set VITE_INTH_PROJECT_URL.'
		);
		expect(options.fetch).not.toHaveBeenCalled();
	});

	test.each(['runtime', 'fail'] as const)(
		'a framework skip reason skips the fetch with onBuildError: %s',
		async (onBuildError) => {
			const { logger, options, source } = await write(
				{ onBuildError },
				'build',
				{ skipReason: 'the app has no server' }
			);
			expect(options.fetch).not.toHaveBeenCalled();
			expect(source).toContain(STUB);
			expect(logger.info).toHaveBeenCalledWith(
				'skipped the consent manifest fetch because the app has no server.'
			);
		}
	);
});

describe('framework build snapshot', () => {
	test('keeps an explicit manifest URL intact, including its query', async () => {
		const options = optionsFor(await createRoot());
		const manifestUrl = 'https://consent.example.com/public.json?version=2';
		await loadBuildManifest({ ...options, manifestUrl }, 'test/build');
		expect(options.fetch).toHaveBeenCalledWith(manifestUrl, expect.any(Object));
	});

	test('derives the upstream manifest URL from the backend', async () => {
		const options = optionsFor(await createRoot());
		expect(
			await loadBuildManifest(
				{
					fetch: options.fetch,
					projectUrl: 'https://consent.example.com/api/',
				},
				'test/build'
			)
		).toEqual(MANIFEST_FIXTURE);
		expect(options.fetch).toHaveBeenCalledWith(
			'https://consent.example.com/api/v1/consent/manifest?manifestLevel=1',
			expect.any(Object)
		);
	});

	test.each(['/api/inth/v1/consent/manifest', 'file:///manifest.json', ''])(
		'rejects a source the build cannot fetch: %s',
		(manifestUrl) => {
			expect(() => loadBuildManifest({ manifestUrl }, 'test/build')).toThrow(
				'upstream'
			);
		}
	);
});

describe('build snapshot validation', () => {
	const pack = createConsentManifestPolicyPack({
		id: 'regional',
		match: { countries: ['DE'] },
		model: 'opt-in',
		prompt: 'choice',
	});

	test.each([
		null,
		[],
		{},
		{ ...MANIFEST_FIXTURE, schemaVersion: 1 },
		{ ...MANIFEST_FIXTURE, revision: null },
		{ ...MANIFEST_FIXTURE, branding: 'unknown' },
		{ ...MANIFEST_FIXTURE, hosting: 'unknown' },
		{ ...MANIFEST_FIXTURE, policyPacks: {} },
		{ ...MANIFEST_FIXTURE, policyPacks: [null] },
		{ ...MANIFEST_FIXTURE, policyPacks: [{ ...pack, fingerprints: {} }] },
		{
			...MANIFEST_FIXTURE,
			policyPacks: [{ ...pack, match: {} }],
		},
		{ ...MANIFEST_FIXTURE, translations: { customTranslations: { en: null } } },
		{
			...MANIFEST_FIXTURE,
			translations: { customTranslations: { en: { common: 'invalid' } } },
		},
		{
			...MANIFEST_FIXTURE,
			translations: {
				customTranslations: { en: { common: { acceptAll: {} } } },
			},
		},
		{
			...MANIFEST_FIXTURE,
			translations: { i18n: { messages: { default: { translations: [] } } } },
		},
		{ ...MANIFEST_FIXTURE, iab: { enabled: 'yes' } },
		{ ...MANIFEST_FIXTURE, vendors: [{ id: 'missing-fields' }] },
	])(
		'rejects invalid JSON data before loading or writing: %j',
		async (body) => {
			const options = optionsFor(await createRoot());
			options.fetch.mockImplementation(() =>
				Promise.resolve(Response.json(body))
			);
			await expect(loadBuildManifest(options, 'test/build')).rejects.toThrow(
				'test/build: /v1/consent/manifest returned an invalid consent manifest'
			);
			await expect(
				writeManifestCacheModule(
					{ ...options, onBuildError: 'fail' },
					{
						command: 'build',
						importSource: '@inth/sdk/build',
						label: 'test/build',
						rootDir: options.rootDir,
					},
					createLogger()
				)
			).rejects.toThrow('invalid consent manifest');
			await expect(
				stat(join(options.rootDir, MANIFEST_CACHE_DIR, 'manifest.js'))
			).rejects.toMatchObject({
				code: 'ENOENT',
			});
		}
	);

	test.each(['inth', 'self-hosted'])(
		'preserves backend hosting %s in generated snapshots',
		async (hosting) => {
			const body = { ...MANIFEST_FIXTURE, hosting };
			const options = optionsFor(await createRoot());
			options.fetch.mockImplementation(() =>
				Promise.resolve(Response.json(body))
			);
			await expect(loadBuildManifest(options, 'test/build')).resolves.toEqual(
				body
			);
			const { server } = await writeManifestCacheModule(
				options,
				{
					command: 'build',
					importSource: '@inth/sdk/build',
					label: 'test/build',
					rootDir: options.rootDir,
				},
				createLogger()
			);
			expect(await readFile(server, 'utf8')).toContain(
				`"hosting": "${hosting}"`
			);
		}
	);

	test('accepts a regional manifest and preserves its translation copy', async () => {
		const body = {
			...MANIFEST_FIXTURE,
			policyPacks: [pack],
			translations: {
				i18n: {
					messages: {
						default: {
							translations: {
								de: { common: { acceptAll: 'Alle akzeptieren' } },
							},
						},
					},
				},
			},
		};
		const options = optionsFor(await createRoot());
		options.fetch.mockResolvedValue(Response.json(body));
		await expect(loadBuildManifest(options, 'test/build')).resolves.toEqual(
			body
		);
	});
});

describe('readBuildEnv', () => {
	test('reads the c15t name when the Inth name is unset', () => {
		vi.stubEnv('NEXT_PUBLIC_C15T_BACKEND_URL', 'https://inth.example.com');
		expect(readBuildEnvEntry(['NEXT_PUBLIC_INTH_PROJECT_URL'])).toEqual({
			name: 'NEXT_PUBLIC_C15T_BACKEND_URL',
			value: 'https://inth.example.com',
		});
	});

	test('the Inth name in a .env file beats the c15t name in the environment', async () => {
		const root = await createRoot();
		await writeFile(
			join(root, '.env'),
			'NEXT_PUBLIC_INTH_PROJECT_URL=https://inth.example.com\n'
		);
		vi.stubEnv('NEXT_PUBLIC_C15T_BACKEND_URL', 'https://inth.example.com');
		expect(readBuildEnv(['NEXT_PUBLIC_INTH_PROJECT_URL'], { root })).toBe(
			'https://inth.example.com'
		);
	});

	test('reads every Inth name before any c15t name', () => {
		vi.stubEnv('PUBLIC_C15T_BACKEND_URL', 'https://inth.example.com');
		vi.stubEnv('VITE_INTH_PROJECT_URL', 'https://inth.example.com');
		expect(
			readBuildEnv(['PUBLIC_INTH_PROJECT_URL', 'VITE_INTH_PROJECT_URL'])
		).toBe('https://inth.example.com');
	});

	test('an empty value counts as unset', async () => {
		const root = await createRoot();
		await writeFile(
			join(root, '.env'),
			'NEXT_PUBLIC_INTH_PROJECT_URL=\nNEXT_PUBLIC_C15T_BACKEND_URL=https://inth.example.com\n'
		);
		expect(readBuildEnv(['NEXT_PUBLIC_INTH_PROJECT_URL'], { root })).toBe(
			'https://inth.example.com'
		);
	});
});

describe('readBuildEnv quoting', () => {
	test.each([
		['"https://api.example" # production'],
		["'https://api.example' # production"],
		['"https://api.example"'],
		['https://api.example # production'],
		['https://api.example#production'],
		['https://api.example'],
	])('reads %s as the bare URL', async (value) => {
		const root = await createRoot();
		await writeFile(join(root, '.env'), `PUBLIC_INTH_PROJECT_URL=${value}\n`);
		expect(readBuildEnv(['PUBLIC_INTH_PROJECT_URL'], { root })).toBe(
			'https://api.example'
		);
	});
});

describe('readBuildEnv expansion', () => {
	/** `${name}`, written so it is not a template placeholder here. */
	const ref = (name: string) => `\${${name}}`;

	test.each([
		[ref('BASE'), 'https://api.example'],
		['$BASE', 'https://api.example'],
		[`${ref('BASE')}/inth`, 'https://api.example/inth'],
		['\\$BASE', '$BASE'],
	])('expands %s from another .env line', async (value, expected) => {
		const root = await createRoot();
		await writeFile(
			join(root, '.env'),
			`BASE=https://api.example\nPUBLIC_INTH_PROJECT_URL=${value}\n`
		);
		expect(readBuildEnv(['PUBLIC_INTH_PROJECT_URL'], { root })).toBe(expected);
	});

	test('an Inth name that expands to nothing falls through to the c15t name', async () => {
		const root = await createRoot();
		await writeFile(
			join(root, '.env'),
			`PUBLIC_INTH_PROJECT_URL=${ref('UNSET_BASE')}\nPUBLIC_C15T_BACKEND_URL=https://c15t.example\n`
		);
		expect(readBuildEnv(['PUBLIC_INTH_PROJECT_URL'], { root })).toBe(
			'https://c15t.example'
		);
	});

	test('reads a reference from the process environment first', async () => {
		const root = await createRoot();
		await writeFile(
			join(root, '.env'),
			`BASE=https://file.example\nPUBLIC_INTH_PROJECT_URL=${ref('BASE')}\n`
		);
		vi.stubEnv('BASE', 'https://process.example');
		expect(readBuildEnv(['PUBLIC_INTH_PROJECT_URL'], { root })).toBe(
			'https://process.example'
		);
	});
});

describe('legacyEnvName', () => {
	test.each([
		['INTH_PROJECT_URL', 'C15T_BACKEND_URL'],
		['NUXT_INTH_PROJECT_URL', 'NUXT_C15T_BACKEND_URL'],
		['NEXT_PUBLIC_INTH_PROJECT_URL', 'NEXT_PUBLIC_C15T_BACKEND_URL'],
		['INTH_ON_BUILD_ERROR', 'C15T_ON_BUILD_ERROR'],
		['XINTH_PROJECT_URL', undefined],
		['VITE_API_URL', undefined],
	])('maps %s to %s', (name, legacy) => {
		expect(legacyEnvName(name)).toBe(legacy);
	});
});
