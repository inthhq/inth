import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { consentManifest } from '../build';

const directories: string[] = [];

type Plugin = ReturnType<typeof consentManifest>;

/** What `@c15t/core/generated` holds in one Vite environment. */
const loadGenerated = (plugin: Plugin, consumer: 'client' | 'server') =>
	plugin.load.call(
		{ environment: { config: { consumer } } },
		plugin.resolveId('@c15t/core/generated') as string
	);

/**
 * What a production chunk that reads every export ends up with: the module
 * as loaded, with the stand-ins filled in after tree-shaking.
 */
const buildGenerated = async (
	plugin: Plugin,
	consumer: 'client' | 'server'
): Promise<string> => {
	const source = (await loadGenerated(plugin, consumer)) as string;
	return (await plugin.renderChunk(source))?.code ?? source;
};

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe('TanStack Start manifest generation', () => {
	test('serves the snapshot to the server and keeps it out of the client', async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-tanstack-manifest-'));
		directories.push(root);
		const fetchSpy = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(
				Response.json({
					branding: 'c15t',
					revision: 'tanstack-build',
					schemaVersion: 2,
				})
			)
		);
		const plugin = consentManifest({
			fetch: fetchSpy,
			projectUrl: 'https://consent.example.com',
		});
		await plugin.configResolved({ root });
		expect(await buildGenerated(plugin, 'server')).toContain('tanstack-build');
		const client = await buildGenerated(plugin, 'client');
		expect(client).not.toContain('tanstack-build');
		expect(client).toContain('export const snapshot = undefined;');
		expect(client).toContain(
			'export const projectUrl = "https://consent.example.com";'
		);
	});

	const createRoot = async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-tanstack-manifest-'));
		directories.push(root);
		return root;
	};
	const failingFetch = () =>
		vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error('backend unavailable'));

	test('vite dev warns and serves an undefined snapshot when the fetch fails', async () => {
		const root = await createRoot();
		const logger = { info: vi.fn(), warn: vi.fn() };
		const plugin = consentManifest({
			fetch: failingFetch(),
			projectUrl: 'https://consent.example.com',
		});
		await plugin.configResolved({ command: 'serve', logger, root });
		expect(await loadGenerated(plugin, 'server')).toContain(
			'export const snapshot = undefined;'
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'@c15t/tanstack-start/build: could not fetch the consent manifest from https://consent.example.com/manifest during dev (backend unavailable). The server fetches it at runtime instead'
			)
		);
	});

	test('vite build warns and bundles an undefined snapshot when the fetch fails', async () => {
		const root = await createRoot();
		const logger = { info: vi.fn(), warn: vi.fn() };
		const plugin = consentManifest({
			fetch: failingFetch(),
			projectUrl: 'https://consent.example.com',
		});
		await plugin.configResolved({ command: 'build', logger, root });
		expect(await buildGenerated(plugin, 'server')).toContain(
			'export const snapshot = void 0;'
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('during the build (backend unavailable)')
		);
	});

	test("with onBuildError: 'fail', vite build stops when the fetch fails", async () => {
		const root = await createRoot();
		const plugin = consentManifest({
			fetch: failingFetch(),
			onBuildError: 'fail',
			projectUrl: 'https://consent.example.com',
		});
		plugin.configResolved({ command: 'build', root });
		await expect(buildGenerated(plugin, 'server')).rejects.toThrow(
			"during the build (backend unavailable). Set `C15T_ON_BUILD_ERROR=runtime` (or `onBuildError: 'runtime'`) to deploy with runtime fetching."
		);
	});

	test('reads VITE_C15T_BACKEND_URL when projectUrl is left out', async () => {
		const root = await createRoot();
		const fetchSpy = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(
				Response.json({
					branding: 'c15t',
					revision: 'tanstack-build',
					schemaVersion: 2,
				})
			)
		);
		const plugin = consentManifest({ fetch: fetchSpy });
		plugin.configResolved({
			command: 'build',
			env: { VITE_C15T_BACKEND_URL: 'https://env.example.com' },
			root,
		});
		await buildGenerated(plugin, 'server');
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://env.example.com/manifest',
			expect.any(Object)
		);
	});

	test('skips the fetch for a relative projectUrl', async () => {
		const root = await createRoot();
		const fetchSpy = failingFetch();
		const logger = { info: vi.fn(), warn: vi.fn() };
		const plugin = consentManifest({
			fetch: fetchSpy,
			projectUrl: '/api/c15t',
		});
		await plugin.configResolved({ command: 'build', logger, root });
		const server = await buildGenerated(plugin, 'server');
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(server).toContain('export const snapshot = void 0;');
	});
});

describe('TanStack Start manifest backend URL', () => {
	const manifestResponse = () =>
		vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(
				Response.json({
					branding: 'c15t',
					revision: 'tanstack-build',
					schemaVersion: 2,
				})
			)
		);

	const tempRoot = async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-tanstack-manifest-'));
		directories.push(root);
		return root;
	};

	test('exposes an explicit projectUrl to the app when the variable is unset', async () => {
		const fetchSpy = manifestResponse();
		const env: Record<string, unknown> = {};
		await consentManifest({
			fetch: fetchSpy,
			projectUrl: 'https://consent.example.com',
		}).configResolved({ env, root: await tempRoot() });
		expect(env.VITE_C15T_BACKEND_URL).toBe('https://consent.example.com');
	});

	test('keeps a variable the app already set', async () => {
		const fetchSpy = manifestResponse();
		const env: Record<string, unknown> = {
			VITE_C15T_BACKEND_URL: '/api/c15t',
		};
		const plugin = consentManifest({
			fetch: fetchSpy,
			projectUrl: 'https://consent.example.com',
		});
		plugin.configResolved({ env, root: await tempRoot() });
		await buildGenerated(plugin, 'server');
		expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
			'https://consent.example.com/manifest'
		);
		expect(env.VITE_C15T_BACKEND_URL).toBe('/api/c15t');
	});

	test("with onBuildError: 'fail', vite build fails without a backend URL", async () => {
		const plugin = consentManifest({ onBuildError: 'fail' });
		plugin.configResolved({
			command: 'build',
			env: {},
			root: await tempRoot(),
		});
		await expect(buildGenerated(plugin, 'server')).rejects.toThrow(
			/VITE_C15T_BACKEND_URL \(or VITE_INTH_PROJECT_URL\)/u
		);
	});

	test('vite dev warns without a backend URL', async () => {
		const root = await tempRoot();
		const logger = { info: vi.fn(), warn: vi.fn() };
		const plugin = consentManifest();
		await plugin.configResolved({
			command: 'serve',
			env: {},
			logger,
			root,
		});
		expect(await loadGenerated(plugin, 'server')).toContain(
			'export const snapshot = undefined;'
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('VITE_C15T_BACKEND_URL')
		);
	});
});

describe('TanStack Start backend URL variables', () => {
	/** The `projectUrl` the generated module exports, for the given env. */
	const resolveProjectUrl = async (
		env: Record<string, unknown>,
		options: { projectUrl?: string } = {}
	) => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-inth-env-'));
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
					plugin.resolveId('@c15t/core/generated') as string
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
	const INTH = 'https://inth.example.com';
	const C15T = 'https://c15t.example.com';

	test('VITE_INTH_PROJECT_URL alone gives the backend URL', async () => {
		const { projectUrl, env } = await resolveProjectUrl({
			VITE_INTH_PROJECT_URL: INTH,
		});
		expect(projectUrl).toBe(INTH);
		expect(env.VITE_C15T_BACKEND_URL).toBe(INTH);
	});

	test('VITE_C15T_BACKEND_URL wins when both are set', async () => {
		const { projectUrl } = await resolveProjectUrl({
			VITE_C15T_BACKEND_URL: C15T,
			VITE_INTH_PROJECT_URL: INTH,
		});
		expect(projectUrl).toBe(C15T);
	});

	test('an explicit projectUrl beats both variables', async () => {
		const { projectUrl } = await resolveProjectUrl(
			{ VITE_C15T_BACKEND_URL: C15T, VITE_INTH_PROJECT_URL: INTH },
			{ projectUrl: 'https://option.example.com' }
		);
		expect(projectUrl).toBe('https://option.example.com');
	});
});

describe('TanStack Start first-paint sheets', () => {
	const importer =
		'/app/node_modules/.pnpm/@c15t+react@3/node_modules/@c15t/react/dist/components/prompt/atoms/root.js';
	/** What `consentManifest()` resolves `id` to in one Vite environment. */
	const resolveSheet = async (
		id: string,
		consumer: 'client' | 'server',
		from = importer
	) => {
		const resolve = vi.fn((specifier: string) =>
			Promise.resolve({ id: `/resolved/${specifier}` })
		);
		const result = await consentManifest().resolveId.call(
			{ environment: { config: { consumer } }, resolve },
			id,
			from
		);
		return { resolve, result };
	};

	test('the browser loads the banner sheets the server already inlined', async () => {
		const names = ['tokens', 'button', 'banner'];
		const resolved = await Promise.all(
			names.map((name) =>
				resolveSheet(`@c15t/ui/styles/sheets/${name}`, 'client')
			)
		);
		expect(resolved.map(({ result }) => result)).toEqual(
			names.map((name) => `/resolved/@c15t/ui/styles/sheets/${name}-deferred`)
		);
	});

	test('the server keeps the sheet text it inlines', async () => {
		const { resolve, result } = await resolveSheet(
			'@c15t/ui/styles/sheets/banner',
			'server'
		);
		expect(result).toBeUndefined();
		expect(resolve).not.toHaveBeenCalled();
	});

	test('sheets no server render inlines keep their text', async () => {
		const dialog = await resolveSheet(
			'@c15t/ui/styles/sheets/dialog',
			'client'
		);
		expect(dialog.result).toBeUndefined();
		const ownImport = await resolveSheet(
			'@c15t/ui/styles/sheets/banner',
			'client',
			'/app/src/theme.ts'
		);
		expect(ownImport.result).toBeUndefined();
	});
});
