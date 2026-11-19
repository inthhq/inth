import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { withConsentManifest } from '../build';
import { defineConsentConfig } from '../config';

const MANIFEST_FIXTURE = {
	branding: 'inth',
	revision: 'build-test',
	schemaVersion: 2,
};

const CACHE = 'node_modules/.cache/inth';

const directories: string[] = [];

/**
 * The TypeScript the examples install. Next.js 15 reads `tsconfig.json`
 * through its JavaScript API, which this package's TypeScript 7 lacks.
 */
const typescriptDir = dirname(
	createRequire(
		new URL('../../../../../examples/nextjs/package.json', import.meta.url)
	).resolve('typescript/package.json')
);

/**
 * A temporary app root, which `withConsentManifest` reads from the cwd,
 * with TypeScript installed so an `inth.config.ts` can be read.
 */
const createRoot = async () => {
	const root = await mkdtemp(join(tmpdir(), 'inth-manifest-'));
	directories.push(root);
	await mkdir(join(root, 'node_modules'), { recursive: true });
	await symlink(typescriptDir, join(root, 'node_modules/typescript'), 'dir');
	vi.spyOn(process, 'cwd').mockReturnValue(root);
	return root;
};

const optionsFor = () => ({
	fetch: vi
		.fn<typeof globalThis.fetch>()
		.mockImplementation(() => Promise.resolve(Response.json(MANIFEST_FIXTURE))),
	projectUrl: 'https://consent.example.com',
});

const readServerModule = (root: string) =>
	readFile(join(root, CACHE, 'manifest.js'), 'utf8');

afterEach(async () => {
	vi.restoreAllMocks();
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

describe('Next.js build-time manifest', () => {
	test.each(['phase-production-build', 'phase-development-server'])(
		'%s writes the snapshot under node_modules/.cache before returning the existing config',
		async (phase) => {
			const root = await createRoot();
			const options = optionsFor();
			const config = { basePath: '/app', reactStrictMode: true };
			const wrapped = withConsentManifest(config, options);
			expect(await wrapped(phase, { defaultConfig: {} })).toMatchObject(config);
			const source = await readServerModule(root);
			expect(source).toContain(
				'export const projectUrl = "https://consent.example.com";'
			);
			expect(source).toContain(JSON.stringify(MANIFEST_FIXTURE.revision));
			const browser = await readFile(
				join(root, CACHE, 'manifest.browser.js'),
				'utf8'
			);
			expect(browser).toContain("import 'server-only';");
			expect(browser).not.toContain(MANIFEST_FIXTURE.revision);
			// Nothing lands in the app's source tree.
			await expect(stat(join(root, 'inth-manifest.ts'))).rejects.toThrow();
			expect(options.fetch).toHaveBeenCalledTimes(1);
			expect(options.fetch).toHaveBeenCalledWith(
				'https://consent.example.com/manifest',
				expect.any(Object)
			);
		}
	);

	test('supports an async config factory and leaves production startup network-free', async () => {
		await createRoot();
		const options = optionsFor();
		const config = { basePath: '/app' };
		const factory = vi.fn(() => Promise.resolve(config));
		const context = { defaultConfig: {} };
		const wrapped = withConsentManifest(factory, options);
		expect(await wrapped('phase-production-server', context)).toBe(config);
		expect(factory).toHaveBeenCalledWith('phase-production-server', context);
		expect(options.fetch).not.toHaveBeenCalled();
	});

	test('aliases the snapshot for servers and the server-only module for browsers', async () => {
		const root = await createRoot();
		const userWebpack = vi.fn((config: { resolve?: object }) => ({
			...config,
			resolve: { alias: { existing: '/existing.js' } },
		}));
		const wrapped = withConsentManifest(
			{
				turbopack: { resolveAlias: { existing: './existing.js' } },
				webpack: userWebpack,
			},
			optionsFor()
		);
		const config = await wrapped('phase-production-build', {
			defaultConfig: {},
		});
		const server = join(root, CACHE, 'manifest.js');
		const browser = join(root, CACHE, 'manifest.browser.js');
		// Every other package's generated entry re-exports @inth/sdk/generated.
		const specifiers = ['@inth/nextjs/generated', '@inth/sdk/generated'];

		const turbopackAlias = config.turbopack?.resolveAlias ?? {};
		expect(turbopackAlias.existing).toBe('./existing.js');
		for (const specifier of specifiers) {
			expect(turbopackAlias[specifier]).toEqual({
				browser: `./${CACHE}/manifest.browser.js`,
				default: `./${CACHE}/manifest.js`,
			});
		}

		const webpack = config.webpack as NonNullable<typeof config.webpack>;
		const aliasFor = (isServer: boolean) =>
			(
				webpack({}, { isServer } as never) as {
					resolve: { alias: Record<string, string> };
				}
			).resolve.alias;
		expect(aliasFor(true)).toEqual({
			...Object.fromEntries(specifiers.map((name) => [`${name}$`, server])),
			existing: '/existing.js',
		});
		// The server HTML holds these sheets: browsers load each one only
		// for a surface they render first.
		const sheets = [
			'first-paint',
			'tokens',
			'button',
			'banner',
			'trigger',
			'consent-gate',
		];
		expect(aliasFor(false)).toEqual({
			...Object.fromEntries(specifiers.map((name) => [`${name}$`, browser])),
			...Object.fromEntries(
				sheets.map((name) => [
					`@inth/sdk/ui/styles/sheets/${name}$`,
					expect.stringMatching(
						new RegExp(`sheets/${name}-deferred\\.js$`, 'u')
					),
				])
			),
			existing: '/existing.js',
		});
		for (const name of sheets) {
			expect(turbopackAlias[`@inth/sdk/ui/styles/sheets/${name}`]).toEqual({
				browser: expect.stringMatching(
					new RegExp(`sheets/${name}-deferred\\.js$`, 'u')
				),
				default: expect.stringMatching(new RegExp(`sheets/${name}\\.js$`, 'u')),
			});
		}
		expect(userWebpack).toHaveBeenCalledTimes(2);
	});

	test.each(['inth.config.ts', 'inth.config.mjs'])(
		'aliases %s into server and browser bundles',
		async (file) => {
			const root = await createRoot();
			await writeFile(join(root, file), 'export default {};\n');
			const config = await withConsentManifest({}, optionsFor())(
				'phase-development-server',
				{ defaultConfig: {} }
			);

			expect(config.turbopack?.resolveAlias?.['@inth/nextjs/user-config']).toBe(
				`./${file}`
			);
			const webpack = config.webpack as NonNullable<typeof config.webpack>;
			for (const isServer of [true, false]) {
				const resolved = webpack({}, { isServer } as never) as {
					resolve: { alias: Record<string, string> };
				};
				expect(resolved.resolve.alias['@inth/nextjs/user-config$']).toBe(
					join(root, file)
				);
			}
		}
	);

	test('leaves the config stub in place without a inth.config file', async () => {
		await createRoot();
		const config = await withConsentManifest({}, optionsFor())(
			'phase-production-build',
			{ defaultConfig: {} }
		);

		expect(config.turbopack?.resolveAlias).not.toHaveProperty(
			'@inth/nextjs/user-config'
		);
	});

	test('transpiles the inth packages so Pages Router bundles see the alias', async () => {
		await createRoot();
		const config = await withConsentManifest(
			{
				serverExternalPackages: ['@inth/sdk'],
				transpilePackages: ['ui-kit', 'inth'],
			},
			optionsFor()
		)('phase-production-build', { defaultConfig: {} });
		// A package the app keeps external is not also transpiled, which
		// Next.js rejects.
		expect(config.transpilePackages).toEqual([
			'ui-kit',
			'inth',
			'@inth/nextjs',
		]);
	});

	test("with onBuildError: 'fail', next build stops when the fetch fails and leaves the earlier snapshot alone", async () => {
		const root = await createRoot();
		const options = { ...optionsFor(), onBuildError: 'fail' as const };
		const wrapped = withConsentManifest({}, options);
		await wrapped('phase-production-build', { defaultConfig: {} });
		const before = await readServerModule(root);
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		await expect(
			wrapped('phase-production-build', { defaultConfig: {} })
		).rejects.toThrow(
			"@inth/nextjs/build: could not fetch the consent manifest from https://consent.example.com/manifest during the build (backend unavailable). Set `INTH_ON_BUILD_ERROR=runtime` (or `onBuildError: 'runtime'`) to deploy with runtime fetching."
		);
		expect(await readServerModule(root)).toBe(before);
	});

	test('next dev warns and writes an undefined snapshot when the fetch fails', async () => {
		const root = await createRoot();
		const options = optionsFor();
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const config = { basePath: '/app' };
		const wrapped = withConsentManifest(config, options);
		expect(
			await wrapped('phase-development-server', { defaultConfig: {} })
		).toMatchObject(config);
		expect(await readServerModule(root)).toContain(
			'export const snapshot = undefined;'
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'@inth/nextjs/build: could not fetch the consent manifest from https://consent.example.com/manifest during dev (backend unavailable)'
			)
		);
	});

	test.each([
		['onBuildError', { onBuildError: 'runtime' as const }, {}],
		['INTH_ON_BUILD_ERROR', {}, { INTH_ON_BUILD_ERROR: 'runtime' }],
	])('%s runtime lets next build continue', async (_name, setting, env) => {
		for (const [key, value] of Object.entries(env)) {
			vi.stubEnv(key, value);
		}
		const root = await createRoot();
		const options = { ...optionsFor(), ...setting };
		options.fetch.mockRejectedValue(new Error('backend unavailable'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		await withConsentManifest({}, options)('phase-production-build', {
			defaultConfig: {},
		});
		expect(warn).toHaveBeenCalledTimes(1);
		expect(await readServerModule(root)).toContain(
			'export const snapshot = undefined;'
		);
	});

	test('reads NEXT_PUBLIC_INTH_PROJECT_URL when projectUrl is left out', async () => {
		vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', 'https://env.example.com/api');
		const root = await createRoot();
		const { fetch } = optionsFor();
		await withConsentManifest({}, { fetch })('phase-production-build', {
			defaultConfig: {},
		});
		expect(fetch).toHaveBeenCalledWith(
			'https://env.example.com/api/manifest',
			expect.any(Object)
		);
		expect(await readServerModule(root)).toContain(
			'export const projectUrl = "https://env.example.com/api";'
		);
	});

	describe('NEXT_PUBLIC_C15T_BACKEND_URL', () => {
		const C15T = 'https://inth.example.com';
		const INTH = 'https://inth.example.com';
		const build = (options: Parameters<typeof withConsentManifest>[1]) =>
			withConsentManifest({ env: { OTHER: '1' } }, options)(
				'phase-production-build',
				{ defaultConfig: {} }
			);

		test('alone becomes NEXT_PUBLIC_INTH_PROJECT_URL for the build, the config and the bundles', async () => {
			// Unset first, so the copy the wrapper writes is undone afterwards.
			vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', undefined);
			vi.stubEnv('NEXT_PUBLIC_C15T_BACKEND_URL', C15T);
			const root = await createRoot();
			const { fetch } = optionsFor();
			const config = await build({ fetch });
			expect(fetch).toHaveBeenCalledWith(
				`${C15T}/manifest`,
				expect.any(Object)
			);
			expect(await readServerModule(root)).toContain(
				`export const projectUrl = "${C15T}";`
			);
			// Bundles inline the Inth name only, so the browser reads one value.
			expect(config.env).toEqual({
				NEXT_PUBLIC_INTH_PROJECT_URL: C15T,
				OTHER: '1',
			});
			// `defineConsentConfig`, on the server and in the browser.
			expect(defineConsentConfig().projectUrl).toBe(C15T);
		});

		test('reads it from a .env file', async () => {
			vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', undefined);
			vi.stubEnv('NEXT_PUBLIC_C15T_BACKEND_URL', undefined);
			const root = await createRoot();
			await writeFile(
				join(root, '.env'),
				`NEXT_PUBLIC_C15T_BACKEND_URL=${C15T}\n`
			);
			const { fetch } = optionsFor();
			const config = await build({ fetch });
			expect(fetch).toHaveBeenCalledWith(
				`${C15T}/manifest`,
				expect.any(Object)
			);
			expect(config.env?.NEXT_PUBLIC_INTH_PROJECT_URL).toBe(C15T);
		});

		test('loses to NEXT_PUBLIC_INTH_PROJECT_URL when both are set', async () => {
			vi.stubEnv('NEXT_PUBLIC_C15T_BACKEND_URL', C15T);
			vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', INTH);
			await createRoot();
			const { fetch } = optionsFor();
			const config = await build({ fetch });
			expect(fetch).toHaveBeenCalledWith(
				`${INTH}/manifest`,
				expect.any(Object)
			);
			expect(config.env).toEqual({ OTHER: '1' });
			expect(defineConsentConfig().projectUrl).toBe(INTH);
		});

		test('an explicit projectUrl beats both variables', async () => {
			vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', undefined);
			vi.stubEnv('NEXT_PUBLIC_C15T_BACKEND_URL', C15T);
			const root = await createRoot();
			await writeFile(
				join(root, 'inth.config.ts'),
				"export default { projectUrl: 'https://config.example.com', mode: { type: 'manifest' } };\n"
			);
			const { fetch } = optionsFor();
			await build({ fetch });
			expect(fetch).toHaveBeenCalledWith(
				'https://config.example.com/manifest',
				expect.any(Object)
			);
			expect(
				defineConsentConfig({ projectUrl: 'https://config.example.com' })
					.projectUrl
			).toBe('https://config.example.com');
			// The wrapper's own option wins over the config file too.
			fetch.mockClear();
			await build({ fetch, projectUrl: 'https://option.example.com' });
			expect(fetch).toHaveBeenCalledWith(
				'https://option.example.com/manifest',
				expect.any(Object)
			);
		});

		test('names only the Inth variable when neither is set', async () => {
			vi.stubEnv('NEXT_PUBLIC_INTH_PROJECT_URL', undefined);
			vi.stubEnv('NEXT_PUBLIC_C15T_BACKEND_URL', undefined);
			await createRoot();
			const { fetch } = optionsFor();
			await expect(build({ fetch, onBuildError: 'fail' })).rejects.toThrow(
				'Pass projectUrl or set NEXT_PUBLIC_INTH_PROJECT_URL.'
			);
		});
	});

	test.each([
		['hosted()', "{ mode: { type: 'hosted' } }", 'sets hosted()'],
		['testing()', "{ mode: { type: 'testing' } }", 'sets testing()'],
		[
			'manifest({ snapshot })',
			"{ mode: { type: 'manifest', snapshot: { revision: 'own' } } }",
			'manifest({ snapshot })',
		],
		[
			"manifest({ source: 'runtime' })",
			"{ mode: { type: 'manifest', source: 'runtime' } }",
			"manifest({ source: 'runtime' })",
		],
		[
			'an absolute manifest({ manifestUrl })',
			"{ mode: { type: 'manifest', manifestUrl: 'https://cdn.example/policy.json' } }",
			'absolute manifest({ manifestUrl })',
		],
	])(
		'next build skips the fetch when inth.config.ts uses %s',
		async (_mode, exported, reason) => {
			const root = await createRoot();
			await writeFile(
				join(root, 'inth.config.ts'),
				`const config: Record<string, unknown> = ${exported};\nexport default config;\n`
			);
			const options = optionsFor();
			// An unreachable backend must not matter: nothing is fetched.
			options.fetch.mockRejectedValue(new Error('backend unavailable'));
			const info = vi
				.spyOn(console, 'info')
				.mockImplementation(() => undefined);
			const config = await withConsentManifest({}, options)(
				'phase-production-build',
				{ defaultConfig: {} }
			);
			expect(options.fetch).not.toHaveBeenCalled();
			expect(await readServerModule(root)).toContain(
				'export const snapshot = undefined;'
			);
			expect(info).toHaveBeenCalledWith(expect.stringContaining(reason));
			// The config is still aliased into the bundles.
			expect(config.turbopack?.resolveAlias?.['@inth/nextjs/user-config']).toBe(
				'./inth.config.ts'
			);
		}
	);

	test('next build still fetches for manifest() in inth.config.mjs', async () => {
		const root = await createRoot();
		await writeFile(
			join(root, 'inth.config.mjs'),
			"export default { mode: { type: 'manifest' } };\n"
		);
		const options = optionsFor();
		await withConsentManifest({}, options)('phase-production-build', {
			defaultConfig: {},
		});
		expect(options.fetch).toHaveBeenCalledTimes(1);
		expect(await readServerModule(root)).toContain(
			JSON.stringify(MANIFEST_FIXTURE.revision)
		);
	});

	test("fetches from the config's projectUrl when the env leaves it out", async () => {
		const root = await createRoot();
		await writeFile(
			join(root, 'inth.config.ts'),
			"export default { projectUrl: 'https://config.example.com', mode: { type: 'manifest' } };\n"
		);
		const { fetch } = optionsFor();
		await withConsentManifest({}, { fetch })('phase-production-build', {
			defaultConfig: {},
		});
		expect(fetch).toHaveBeenCalledWith(
			'https://config.example.com/manifest',
			expect.any(Object)
		);
		expect(await readServerModule(root)).toContain(
			'export const projectUrl = "https://config.example.com";'
		);
	});

	test('stops the build when defineConsentConfig rejects inth.config.ts', async () => {
		const root = await createRoot();
		const message =
			"@inth/nextjs: defineConsentConfig `journey` must be 'page', 'tab' or false.";
		await writeFile(
			join(root, 'inth.config.ts'),
			`throw new TypeError(${JSON.stringify(message)});\n`
		);
		const options = optionsFor();
		await expect(
			withConsentManifest({}, options)('phase-production-build', {
				defaultConfig: {},
			})
		).rejects.toThrow(message);
		expect(options.fetch).not.toHaveBeenCalled();
	});

	test('warns and fetches as for manifest() when inth.config.ts cannot be read', async () => {
		const root = await createRoot();
		await writeFile(
			join(root, 'inth.config.ts'),
			"throw new Error('config exploded');\n"
		);
		const options = optionsFor();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		await withConsentManifest({}, options)('phase-production-build', {
			defaultConfig: {},
		});
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'@inth/nextjs/build: could not read inth.config.ts'
			)
		);
		expect(String(warn.mock.calls[0]?.[0])).toContain('config exploded');
		expect(options.fetch).toHaveBeenCalledTimes(1);
	});

	test.each(['runtime', 'fail'] as const)(
		"skips the fetch for output: 'export' with onBuildError: %s",
		async (onBuildError) => {
			const root = await createRoot();
			const options = { ...optionsFor(), onBuildError };
			const info = vi
				.spyOn(console, 'info')
				.mockImplementation(() => undefined);
			const wrapped = withConsentManifest({ output: 'export' }, options);
			await wrapped('phase-production-build', { defaultConfig: {} });
			expect(options.fetch).not.toHaveBeenCalled();
			expect(await readServerModule(root)).toContain(
				'export const snapshot = undefined;'
			);
			expect(info).toHaveBeenCalledWith(
				expect.stringContaining("`output: 'export'`")
			);
		}
	);
});
