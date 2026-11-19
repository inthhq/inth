/**
 * The plain-Vue Vite plugin, and the runtime specifiers the package resolves
 * itself. The published dist ships `.js`, so the `imports` targets are
 * checked against the emitted `dist/` tree when the package is built, as it
 * always is under `turbo run test`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONSENT_CHUNK_GROUP } from '@inth/sdk/build';
import { createConsentManifestPolicyPack } from '@inth/sdk/schema/types';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { describe, expect, it, vi } from 'vitest';

import { consentManifest } from '../vite';

const packageDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const distVitePath = join(packageDir, 'dist/vite.mjs');

describe('Vue manifest module', () => {
	it('serves the snapshot to the browser of a Vue single-page app', async () => {
		const root = await mkdtemp(join(tmpdir(), 'inth-vue-manifest-'));
		try {
			const plugin = consentManifest({
				fetch: vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
					Promise.resolve(
						Response.json({
							branding: 'inth',
							revision: 'vue-build',
							schemaVersion: 2,
						})
					)
				),
				projectUrl: 'https://consent.example.com',
			});
			await plugin.configResolved({ command: 'serve', root });
			const source = await plugin.load.call(
				{ environment: { config: { consumer: 'client' } } },
				plugin.resolveId('@inth/sdk/generated') as string
			);
			expect(source).toContain('vue-build');
			expect(existsSync(join(root, 'src/inth-manifest.ts'))).toBe(false);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

describe('Vue production builds', () => {
	const modesPath = join(packageDir, 'src/runtime/modes.ts');
	/** Builds an app entry that imports the Vue plugin's modes. */
	const buildApp = async (source: string, fetch: typeof globalThis.fetch) => {
		const root = await mkdtemp(join(tmpdir(), 'inth-vue-build-'));
		try {
			const entry = join(root, 'entry.ts');
			await writeFile(entry, source.replace('MODES', modesPath));
			const output = (await build({
				build: {
					minify: false,
					rollupOptions: { input: entry },
					write: false,
				},
				configFile: false,
				logLevel: 'silent',
				plugins: [
					consentManifest({
						fetch,
						projectUrl: 'https://unreachable.invalid',
					}),
				],
				root,
			})) as Rollup.RollupOutput;
			return output.output
				.map((chunk) => (chunk.type === 'chunk' ? chunk.code : ''))
				.join('\n');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	};
	const unreachable = () =>
		vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new TypeError('fetch failed'));

	it('builds an app that uses the hosted backend while the backend is down', async () => {
		const fetch = unreachable();
		await buildApp(
			"import { selectedMode } from 'MODES';\nexport const mode = selectedMode({ projectUrl: '/api/inth' });\n",
			fetch
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('builds a manifest() app with no snapshot while the backend is down', async () => {
		const fetch = unreachable();
		await expect(
			buildApp(
				"import { manifest } from 'MODES';\nexport const mode = manifest();\n",
				fetch
			)
		).resolves.toBeDefined();
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe('location advice', () => {
	it('suggests the hosted backend when a manifest() build bundles a policy that depends on location', async () => {
		const warn = vi.fn();
		const plugin = consentManifest({
			fetch: vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
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
						revision: 'vue-regional',
						schemaVersion: 2,
					})
				)
			),
			projectUrl: 'https://consent.example.com',
		});
		plugin.configResolved({
			command: 'build',
			logger: { info: vi.fn(), warn },
			root: tmpdir(),
		});
		const source = await plugin.load.call(
			undefined,
			plugin.resolveId('@inth/sdk/generated') as string
		);
		await plugin.renderChunk(source as string);
		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/^@inth\/vue\/vite: .*location.*projectUrl/u)
		);
	});
});

interface PackageImports {
	imports: Record<string, { default: string; types: string }>;
}

describe('consentManifest()', () => {
	it('keeps the packages that ship .vue files out of dependency pre-bundling', () => {
		const { optimizeDeps } = consentManifest().config();

		expect(optimizeDeps.exclude).toEqual(
			expect.arrayContaining(['@inth/sdk/generated', '@inth/vue'])
		);
	});

	it('groups the consent modules into one chunk in a single-page app build', () => {
		const { build: buildOptions } = consentManifest().config.call(
			{ meta: { rolldownVersion: '1.2.0' } },
			{},
			{ isSsrBuild: false }
		);

		expect(buildOptions?.rolldownOptions.output.codeSplitting.groups).toEqual([
			CONSENT_CHUNK_GROUP,
		]);
	});
});

describe('runtime specifiers', () => {
	// `#imports` and `#inth/composables` resolve through the package's own
	// `imports` field in a plain Vue app, so it needs no resolver plugin.
	// Nuxt aliases both first.
	it.runIf(existsSync(distVitePath))(
		'point at runtime modules the build emits',
		() => {
			const { imports } = JSON.parse(
				readFileSync(join(packageDir, 'package.json'), 'utf8')
			) as PackageImports;

			expect(Object.keys(imports).sort()).toEqual([
				'#imports',
				'#inth/composables',
			]);
			for (const target of Object.values(imports)) {
				expect(existsSync(join(packageDir, target.default))).toBe(true);
				expect(existsSync(join(packageDir, target.types))).toBe(true);
			}
		}
	);
});

describe('Vue backend URL variables', () => {
	/** The `projectUrl` the generated module exports, for the given env. */
	const resolveProjectUrl = async (
		env: Record<string, unknown>,
		options: { projectUrl?: string } = {}
	) => {
		const root = await mkdtemp(join(tmpdir(), 'inth-env-'));
		try {
			const plugin = consentManifest({
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

	it('VITE_C15T_BACKEND_URL alone gives the backend URL as VITE_INTH_PROJECT_URL', async () => {
		const { projectUrl, env } = await resolveProjectUrl({
			VITE_C15T_BACKEND_URL: C15T,
		});
		expect(projectUrl).toBe(C15T);
		expect(env.VITE_INTH_PROJECT_URL).toBe(C15T);
	});

	it('VITE_INTH_PROJECT_URL wins when both are set', async () => {
		const { projectUrl } = await resolveProjectUrl({
			VITE_C15T_BACKEND_URL: C15T,
			VITE_INTH_PROJECT_URL: INTH,
		});
		expect(projectUrl).toBe(INTH);
	});

	it('an explicit projectUrl beats both variables', async () => {
		const { projectUrl } = await resolveProjectUrl(
			{ VITE_C15T_BACKEND_URL: C15T, VITE_INTH_PROJECT_URL: INTH },
			{ projectUrl: 'https://option.example.com' }
		);
		expect(projectUrl).toBe('https://option.example.com');
	});
});
