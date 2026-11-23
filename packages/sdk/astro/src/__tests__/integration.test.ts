import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from '@babel/parser';
import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '@inth/sdk/schema/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildInlineCodeHashes } from '../build-astro-csp';
import {
	LOCALS_TYPES,
	inth,
	createOwnEntryResolver,
	inferUIAdapter,
	resolveClientEntrypoint,
	resolveOptions,
	toClientOptions,
} from '../integration';
import { hosted as hostedMode, manifest as manifestMode } from '../mode';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions } from '../inth-options.model';

interface SetupCalls {
	addMiddleware: ReturnType<typeof vi.fn>;
	injectRoute: ReturnType<typeof vi.fn>;
	injectScript: ReturnType<typeof vi.fn>;
	logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
	updateConfig: ReturnType<typeof vi.fn>;
}

// `manifest()` mode fetches a build snapshot by default. Keep tests that
// don't stub `fetch` themselves off the network, and let their builds fall
// back to runtime fetching. Tests of the failure policy clear the variable.
beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.reject(new Error('offline in tests')))
	);
	vi.stubEnv('INTH_ON_BUILD_ERROR', 'runtime');
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

const resolveOwnEntry = await createOwnEntryResolver();

const INLINE_MANIFEST = await buildConsentManifestFromConfig({
	branding: 'inth',
	policyRules: [policyRulePresets.europeOptIn()],
});

/** How an injected module reads in the page script. */
const specifier = (entry: string): string =>
	JSON.stringify(resolveOwnEntry(entry));

const runSetup = async function runSetup(
	options: InthAstroOptions,
	config: Record<string, unknown> = {},
	command: 'build' | 'dev' | 'preview' | 'sync' = 'build'
) {
	const integration = inth(options);
	const calls: SetupCalls = {
		addMiddleware: vi.fn(),
		injectRoute: vi.fn(),
		injectScript: vi.fn(),
		logger: { info: vi.fn(), warn: vi.fn() },
		updateConfig: vi.fn(),
	};
	await integration.hooks['astro:config:setup']?.({
		...calls,
		command,
		config,
	} as unknown as Parameters<
		NonNullable<(typeof integration)['hooks']['astro:config:setup']>
	>[0]);
	return { calls, integration };
};

/** The `virtual:inth/engine` module setup serves to the build. */
const engineSource = function engineSource(calls: SetupCalls): string {
	const [config] = calls.updateConfig.mock.calls[0] as [
		{
			vite: {
				plugins: { name: string; load?: (id: string) => string | undefined }[];
			};
		},
	];
	const plugin = config.vite.plugins.find(({ name }) => name === 'inth:engine');
	return plugin?.load?.('\0virtual:inth/engine') ?? '';
};

/** Run setup, then return `astro:config:done` to call, the way Astro does. */
const runDone = async function runDone(
	options: InthAstroOptions,
	integrationNames: string[],
	adapter?: { name: string },
	command = 'build'
) {
	const integrations = integrationNames.map((name) => ({ name }));
	const { integration } = await runSetup(
		options,
		{ adapter, integrations },
		command as 'build'
	);
	const logger = { error: vi.fn(), warn: vi.fn() };
	const injectTypes = vi.fn();
	const run = async () =>
		await integration.hooks['astro:config:done']?.({
			config: { adapter, integrations },
			injectTypes,
			logger,
		} as unknown as Parameters<
			NonNullable<(typeof integration)['hooks']['astro:config:done']>
		>[0]);
	return Object.assign(run, { injectTypes, logger });
};

describe('createOwnEntryResolver', () => {
	it('resolves a dependency entry point to a file, for sites that cannot see it', () => {
		// Under pnpm, a site that installed `@inth/astro` has no `@inth/sdk` at
		// its root, so Astro could not resolve the bare specifier from there.
		const path = resolveOwnEntry('@inth/sdk/ui/styles.css');
		expect(isAbsolute(path)).toBe(true);
		expect(existsSync(path)).toBe(true);
	});

	it('keeps a specifier it cannot resolve', () => {
		expect(resolveOwnEntry('@inth/astro/not-an-entry')).toBe(
			'@inth/astro/not-an-entry'
		);
	});
});

describe('toClientOptions', () => {
	it("gives the browser core's copy of the mode", () => {
		const projectUrl = 'https://consent.example.com';
		const browserResolved = toClientOptions(
			resolveOptions({
				mode: manifestMode({ resolve: 'browser', snapshot: INLINE_MANIFEST }),
				projectUrl,
			})
		);
		// The browser resolves the policy itself, from the snapshot.
		expect(browserResolved.mode).toMatchObject({ snapshot: INLINE_MANIFEST });
		const serverResolved = toClientOptions(
			resolveOptions({
				mode: manifestMode({ snapshot: INLINE_MANIFEST }),
				projectUrl,
			})
		);
		expect(serverResolved.mode).toEqual({ type: 'manifest' });
	});
});

describe('resolveOptions', () => {
	it.each(['build', 'dev'] as const)(
		'keeps the %s snapshot in server options only',
		async (command) => {
			const fetch = vi.fn<typeof globalThis.fetch>(() =>
				Promise.resolve(Response.json(INLINE_MANIFEST))
			);
			vi.stubGlobal('fetch', fetch);
			try {
				const { calls } = await runSetup(
					{
						mode: manifestMode(),
						onBuildError: 'fail',
						projectUrl: 'https://consent.example.com',
					},
					{},
					command
				);
				const update = calls.updateConfig.mock.calls[0]?.[0];
				const [plugin] = update.vite.plugins;
				const source = plugin.load('\0virtual:inth/options', { ssr: true });
				expect(source).toContain(JSON.stringify(INLINE_MANIFEST.revision));
				expect(source).toContain('"schemaVersion":2');
				for (const loadOptions of [undefined, { ssr: false }]) {
					const clientSource = plugin.load(
						'\0virtual:inth/options',
						loadOptions
					);
					const clientOptions = JSON.parse(
						clientSource.replace(/^export default /u, '').replace(/;$/u, '')
					);
					expect(clientOptions.mode).toEqual({ type: 'manifest' });
					expect(clientOptions.projectUrl).toBe('https://consent.example.com');
					expect(clientOptions.routePrefix).toBe('/api/inth');
					expect(clientSource).not.toContain(INLINE_MANIFEST.revision);
				}
				expect(fetch).toHaveBeenCalledTimes(1);
			} finally {
				vi.unstubAllGlobals();
			}
		}
	);

	it.each([
		{ error: '503', response: () => new Response(null, { status: 503 }) },
		{
			error: 'invalid consent manifest',
			response: () => Response.json({ error: 'not a manifest' }),
		},
	])(
		"onBuildError: 'fail' stops the build on $error",
		async ({ response, error }) => {
			vi.stubEnv('INTH_ON_BUILD_ERROR', '');
			vi.stubGlobal(
				'fetch',
				vi.fn(() => Promise.resolve(response()))
			);
			try {
				await expect(
					runSetup({
						mode: manifestMode(),
						onBuildError: 'fail',
						projectUrl: 'https://consent.example.com',
					})
				).rejects.toThrow(error);
			} finally {
				vi.unstubAllGlobals();
			}
		}
	);

	it('preview never fetches a new build snapshot', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		vi.stubGlobal('fetch', fetch);
		try {
			await runSetup(
				{
					mode: manifestMode(),
					onBuildError: 'fail',
					projectUrl: 'https://consent.example.com',
				},
				{},
				'preview'
			);
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	/** The server options `virtual:inth/options` exports after setup. */
	const serverOptionsSource = (calls: SetupCalls): string => {
		const [update] = calls.updateConfig.mock.calls[0] ?? [];
		const [plugin] = update.vite.plugins;
		return plugin.load('\0virtual:inth/options', { ssr: true });
	};

	it('manifest() bundles a build snapshot by default', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(Response.json(INLINE_MANIFEST))
		);
		vi.stubGlobal('fetch', fetch);
		const { calls } = await runSetup({
			mode: manifestMode(),
			projectUrl: 'https://consent.example.com',
		});
		expect(fetch).toHaveBeenCalledWith(
			'https://consent.example.com/v1/consent/manifest',
			expect.anything()
		);
		expect(serverOptionsSource(calls)).toContain(
			JSON.stringify(INLINE_MANIFEST.revision)
		);
		expect(calls.logger.warn).not.toHaveBeenCalled();
	});

	it('bundles an absolute manifestUrl for a static site saving on its own origin', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(Response.json(INLINE_MANIFEST))
		);
		vi.stubGlobal('fetch', fetch);
		const { calls } = await runSetup({
			mode: manifestMode({
				manifestUrl: 'https://cdn.example.com/m.json',
				resolve: 'browser',
			}),
			projectUrl: '',
		});
		expect(fetch).toHaveBeenCalledWith(
			'https://cdn.example.com/m.json',
			expect.anything()
		);
		expect(serverOptionsSource(calls)).toContain(
			JSON.stringify(INLINE_MANIFEST.revision)
		);
	});

	it('leaves a relative manifestUrl to the server instead of bundling the backend manifest', async () => {
		const sitePolicy = await buildConsentManifestFromConfig({
			branding: 'inth',
			policyRules: [policyRulePresets.worldOptOutNoPrompt()],
		});
		expect(sitePolicy.revision).not.toBe(INLINE_MANIFEST.revision);
		const fetch = vi.fn<typeof globalThis.fetch>((input) =>
			Promise.resolve(
				Response.json(
					String(input) === 'https://consent.example.com/v1/consent/manifest'
						? INLINE_MANIFEST
						: sitePolicy
				)
			)
		);
		vi.stubGlobal('fetch', fetch);
		const { calls } = await runSetup({
			mode: manifestMode({ manifestUrl: '/consent-policy.json' }),
			projectUrl: 'https://consent.example.com',
		});

		expect(fetch).not.toHaveBeenCalled();
		const source = serverOptionsSource(calls);
		expect(source).not.toContain(JSON.stringify(INLINE_MANIFEST.revision));
		expect(source).toContain('"manifestUrl":"/consent-policy.json"');
	});

	it('astro dev warns and keeps going when the default fetch fails', async () => {
		vi.stubEnv('INTH_ON_BUILD_ERROR', '');
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response(null, { status: 503 })))
		);
		const { calls } = await runSetup(
			{ mode: manifestMode(), projectUrl: 'https://consent.example.com' },
			{},
			'dev'
		);
		expect(calls.logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('during dev (/v1/consent/manifest responded 503')
		);
		expect(calls.logger.warn.mock.calls[0]?.[0]).not.toContain('@inth/astro');
		expect(serverOptionsSource(calls)).not.toContain('"schemaVersion"');
	});

	it('astro build warns and fetches at runtime when the default fetch fails', async () => {
		vi.stubEnv('INTH_ON_BUILD_ERROR', '');
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response(null, { status: 503 })))
		);
		const { calls } = await runSetup({
			mode: manifestMode(),
			projectUrl: 'https://consent.example.com',
		});
		expect(calls.logger.warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'during the build (/v1/consent/manifest responded 503'
			)
		);
		expect(serverOptionsSource(calls)).not.toContain('"schemaVersion"');
	});

	it("astro build stops when the fetch fails with onBuildError: 'fail'", async () => {
		vi.stubEnv('INTH_ON_BUILD_ERROR', '');
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response(null, { status: 503 })))
		);
		await expect(
			runSetup({
				mode: manifestMode(),
				onBuildError: 'fail',
				projectUrl: 'https://consent.example.com',
			})
		).rejects.toThrow(
			"@inth/astro: could not fetch the consent manifest from https://consent.example.com/v1/consent/manifest during the build (/v1/consent/manifest responded 503 (server_error)). Set `INTH_ON_BUILD_ERROR=runtime` (or `onBuildError: 'runtime'`) to deploy with runtime fetching."
		);
	});

	it.each([
		['onBuildError', { onBuildError: 'runtime' }, ''],
		['INTH_ON_BUILD_ERROR', { onBuildError: 'fail' }, 'runtime'],
	] as const)(
		'%s runtime lets astro build continue',
		async (_name, settings, fromEnv) => {
			vi.stubEnv('INTH_ON_BUILD_ERROR', fromEnv);
			const { calls } = await runSetup({
				...settings,
				mode: manifestMode(),
				projectUrl: 'https://consent.example.com',
			});
			expect(calls.logger.warn).toHaveBeenCalledTimes(1);
		}
	);

	it("onBuildError: 'fail' stops astro dev", async () => {
		vi.stubEnv('INTH_ON_BUILD_ERROR', '');
		await expect(
			runSetup(
				{
					mode: manifestMode(),
					onBuildError: 'fail',
					projectUrl: 'https://consent.example.com',
				},
				{},
				'dev'
			)
		).rejects.toThrow('during dev (offline in tests)');
	});

	it('reads PUBLIC_INTH_PROJECT_URL when no projectUrl is set', async () => {
		vi.stubEnv('PUBLIC_INTH_PROJECT_URL', 'https://env.example.com');
		const fetch = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(Response.json(INLINE_MANIFEST))
		);
		vi.stubGlobal('fetch', fetch);
		// `inth()` with no options is `manifest()` mode.
		const { calls } = await runSetup({});
		expect(fetch).toHaveBeenCalledWith(
			'https://env.example.com/v1/consent/manifest',
			expect.anything()
		);
		const hosted = await runSetup({ mode: hostedMode() });
		expect(serverOptionsSource(hosted.calls)).toContain(
			'"projectUrl":"https://env.example.com"'
		);
		expect(serverOptionsSource(calls)).toContain('"type":"manifest"');
	});

	it('reads PUBLIC_INTH_PROJECT_URL from .env in the project root', async () => {
		const root = mkdtempSync(join(tmpdir(), 'inth-astro-env-'));
		writeFileSync(
			join(root, '.env'),
			'PUBLIC_INTH_PROJECT_URL=https://dotenv.example.com\n'
		);
		const { calls } = await runSetup(
			{ mode: hostedMode() },
			{ root: pathToFileURL(`${root}/`) }
		);
		expect(serverOptionsSource(calls)).toContain(
			'"projectUrl":"https://dotenv.example.com"'
		);
	});

	it('reads PUBLIC_C15T_BACKEND_URL when the Inth variable is unset', async () => {
		vi.stubEnv('PUBLIC_INTH_PROJECT_URL', undefined);
		vi.stubEnv('PUBLIC_C15T_BACKEND_URL', 'https://inth.example.com');
		const { calls } = await runSetup({ mode: hostedMode() });
		expect(serverOptionsSource(calls)).toContain(
			'"projectUrl":"https://inth.example.com"'
		);
	});

	it('prefers PUBLIC_INTH_PROJECT_URL in .env over PUBLIC_C15T_BACKEND_URL', async () => {
		vi.stubEnv('PUBLIC_INTH_PROJECT_URL', undefined);
		vi.stubEnv('PUBLIC_C15T_BACKEND_URL', 'https://inth.example.com');
		const root = mkdtempSync(join(tmpdir(), 'inth-astro-env-'));
		writeFileSync(
			join(root, '.env'),
			'PUBLIC_INTH_PROJECT_URL=https://inth.example.com\n'
		);
		const { calls } = await runSetup(
			{ mode: hostedMode() },
			{ root: pathToFileURL(`${root}/`) }
		);
		expect(serverOptionsSource(calls)).toContain(
			'"projectUrl":"https://inth.example.com"'
		);
	});

	it('an explicit projectUrl beats both variables', async () => {
		vi.stubEnv('PUBLIC_C15T_BACKEND_URL', 'https://inth.example.com');
		vi.stubEnv('PUBLIC_INTH_PROJECT_URL', 'https://inth.example.com');
		const { calls } = await runSetup({
			mode: hostedMode(),
			projectUrl: 'https://option.example.com',
		});
		expect(serverOptionsSource(calls)).toContain(
			'"projectUrl":"https://option.example.com"'
		);
	});

	it.each([
		[
			'hosted()',
			{ mode: hostedMode(), projectUrl: 'https://consent.example.com' },
		],
		['offline()', { mode: testingMode() }],
		[
			'a relative manifest URL',
			{ mode: manifestMode({ manifestUrl: '/m.json' }), projectUrl: '' },
		],
		[
			"manifest({ source: 'runtime' })",
			{
				mode: manifestMode({ source: 'runtime' }),
				projectUrl: 'https://consent.example.com',
			},
		],
		[
			'a snapshot of its own',
			{
				mode: manifestMode({ snapshot: INLINE_MANIFEST }),
				projectUrl: 'https://consent.example.com',
			},
		],
	] satisfies [string, InthAstroOptions][])(
		'fetches no build snapshot with %s',
		async (_name, options) => {
			const fetch = vi.fn<typeof globalThis.fetch>();
			vi.stubGlobal('fetch', fetch);
			const { calls } = await runSetup(options);
			expect(fetch).not.toHaveBeenCalled();
			expect(calls.logger.warn).not.toHaveBeenCalled();
		}
	);

	it("onBuildError: 'fail' still needs an absolute upstream URL", async () => {
		vi.stubEnv('INTH_ON_BUILD_ERROR', '');
		await expect(
			runSetup({
				mode: manifestMode({ manifestUrl: '/m.json' }),
				onBuildError: 'fail',
				projectUrl: '',
			})
		).rejects.toThrow('absolute upstream URL');
	});

	it('defaults the ui adapter to svelte', () => {
		expect(resolveOptions({ mode: testingMode() }).ui).toBe('svelte');
	});

	it('defaults to manifest() and the /api/inth route prefix', () => {
		const resolved = resolveOptions({
			projectUrl: 'https://consent.example.com',
		});
		expect(resolved.mode).toEqual({ type: 'manifest' });
		expect(resolved.routePrefix).toBe('/api/inth');
	});

	it('trims a routePrefix and drops it for false', () => {
		expect(
			resolveOptions({ mode: testingMode(), routePrefix: '/consent/' })
				.routePrefix
		).toBe('/consent');
		expect(
			resolveOptions({ mode: testingMode(), routePrefix: false })
		).not.toHaveProperty('routePrefix');
		expect(() =>
			resolveOptions({ mode: testingMode(), routePrefix: 'api/inth' })
		).toThrowError(/must be a path that starts with '\/'/u);
	});

	it.each(['/', '//'])('rejects a routePrefix of %s', (routePrefix) => {
		expect(() => resolveOptions({ mode: testingMode(), routePrefix })).toThrow(
			"@inth/astro: `routePrefix` can't be '/': a consent route at the site root would catch every page. Use a path such as '/api/inth'."
		);
	});

	it.each([
		['the default route', {}],
		['routePrefix: false', { routePrefix: false }],
		['a route of its own', { routePrefix: '/consent' }],
	] satisfies [string, InthAstroOptions][])(
		'rejects a snapshot with no backend to save consent to, with %s',
		(_name, options) => {
			// The injected route answers `GET` only, so a save posted to it
			// would get a 404 after the visitor chose.
			expect(() =>
				resolveOptions({
					...options,
					mode: manifestMode({ snapshot: INLINE_MANIFEST }),
				})
			).toThrowError(
				/manifest\(\{ snapshot \}\) still needs a backend URL.*PUBLIC_INTH_PROJECT_URL/u
			);
			expect(
				resolveOptions({
					...options,
					mode: manifestMode({ snapshot: INLINE_MANIFEST }),
					projectUrl: 'https://consent.example.com',
				}).mode.type
			).toBe('manifest');
		}
	);

	it('rejects a function in the serialized options', () => {
		// `JSON.stringify` would drop it, so a `posthog()` helper here used to
		// lose its callbacks without a word.
		expect(() =>
			resolveOptions({
				mode: testingMode(),
				scripts: [
					{ category: 'measurement', id: 'a', onLoad: () => undefined },
				],
			})
		).toThrowError(
			/inth\(\)\.scripts\[0\]\.onLoad is a function.*src\/inth\.client\.ts/u
		);
		expect(() =>
			inth({
				mode: testingMode(),
				networkBlocker: {
					onRequestBlocked: () => undefined,
				} as unknown as InthAstroOptions['networkBlocker'],
			})
		).toThrowError(/networkBlocker\.onRequestBlocked is a function/u);
	});

	it('rejects a transport function as the mode', () => {
		const transport = Object.assign(() => ({}), { kind: 'custom' });
		expect(() =>
			resolveOptions({ mode: transport as unknown as InthAstroOptions['mode'] })
		).toThrowError(
			/`mode` must be manifest\(\) or hosted\(\) from @inth\/astro, or testing\(\)/u
		);
	});

	it.each(['solid', 'constructor', '__proto__'])(
		'rejects unsupported adapter %s',
		(ui) => {
			// A JavaScript astro.config.mjs has no type checking, so this used to
			// surface as a TypeError on an undefined adapter entry.
			const options = { mode: testingMode() };
			Reflect.set(options, 'ui', ui);
			expect(() => resolveOptions(options)).toThrowError(
				/unknown `ui`.*Supported adapters: /u
			);
			expect(resolveOptions({ mode: testingMode(), ui: 'vue' }).ui).toBe('vue');
		}
	);

	it('rejects a bare manifest() with nowhere to save consent', () => {
		// The browser would post saves to the init route's own prefix,
		// `/api/inth/subjects`, where nothing answers.
		expect(() => resolveOptions({ mode: manifestMode() })).toThrowError(
			/manifest\(\) needs a backend URL.*Set PUBLIC_INTH_PROJECT_URL in \.env/u
		);
		expect(() => resolveOptions({ mode: hostedMode() })).toThrowError(
			/hosted\(\) needs a backend URL/u
		);
	});

	it('leaves reading the environment to the setup hook', () => {
		vi.stubEnv('PUBLIC_INTH_PROJECT_URL', 'https://consent.example.com');
		try {
			expect(() => resolveOptions({ mode: manifestMode() })).toThrowError(
				/manifest\(\) needs a backend URL/u
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('keeps an empty projectUrl, which means this origin', () => {
		vi.stubEnv('PUBLIC_INTH_PROJECT_URL', 'https://consent.example.com');
		try {
			expect(
				resolveOptions({
					mode: manifestMode({ manifestUrl: '/m.json' }),
					projectUrl: '',
				})
			).toHaveProperty('projectUrl', '');
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('rejects an empty projectUrl with no manifest to fetch', () => {
		// `''` saves on this origin, but `${projectUrl}/manifest` needs a real
		// URL, and the environment's backend URL does not replace it.
		vi.stubEnv('PUBLIC_INTH_PROJECT_URL', 'https://consent.example.com');
		vi.stubEnv('PUBLIC_C15T_BACKEND_URL', 'https://consent.example.com');
		try {
			expect(() =>
				resolveOptions({ mode: manifestMode(), projectUrl: '' })
			).toThrowError(/gives the server no manifest to fetch/u);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('accepts an empty projectUrl with an inline manifest', () => {
		expect(
			resolveOptions({
				mode: manifestMode({ snapshot: INLINE_MANIFEST }),
				projectUrl: '',
			})
		).toHaveProperty('projectUrl', '');
	});

	it('does not take the manifest for an empty projectUrl from the environment', () => {
		vi.stubEnv('PUBLIC_INTH_PROJECT_URL', 'https://consent.example.com');
		vi.stubEnv('PUBLIC_C15T_BACKEND_URL', 'https://consent.example.com');
		try {
			expect(() =>
				resolveOptions({ mode: manifestMode(), projectUrl: '' })
			).toThrowError(/gives the server no manifest to fetch/u);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('rejects a manifestUrl with nowhere to save consent', () => {
		// The injected routes serve init and manifest; `POST /v1/consent/records` is
		// the backend's, so a `manifestUrl` without one would 404 on save.
		expect(() =>
			resolveOptions({ mode: manifestMode({ manifestUrl: '/m.json' }) })
		).toThrowError(/manifest\(\) needs a backend URL/u);
		expect(
			resolveOptions({
				mode: manifestMode({ manifestUrl: '/m.json' }),
				projectUrl: 'https://consent.example.com',
			})
		).toMatchObject({ projectUrl: 'https://consent.example.com' });
	});

	it('rejects an experiment with no way to resolve its arm on the server', () => {
		// The banner is server HTML the browser only shows or hides, so an
		// arm assigned in the browser would be recorded for a banner the
		// visitor never saw.
		const variants = {
			bar: { prompt: { container: { type: 'banner' as const } } },
		};
		expect(() =>
			resolveOptions({
				experiment: { arms: variants, id: 'banner-shape' },
				mode: testingMode(),
			})
		).toThrowError(/consentMiddleware\(\{ experimentArm \}\)/u);
		// A site that composes the middleware resolves the arm per request.
		expect(
			resolveOptions({
				experiment: { arms: variants, id: 'banner-shape' },
				middleware: false,
				mode: testingMode(),
			}).experiment
		).toMatchObject({ id: 'banner-shape' });
		expect(
			resolveOptions({
				experiment: { arm: 'bar', arms: variants, id: 'banner-shape' },
				mode: testingMode(),
			}).experiment
		).toMatchObject({ arm: 'bar' });
	});

	it('drops build-only options from the serialized shape', () => {
		const resolved = resolveOptions({
			middleware: false,
			mode: testingMode(),
			requireUIIntegration: false,
		});
		expect(resolved).not.toHaveProperty('requireUIIntegration');
	});

	it('normalizes the middleware option', () => {
		expect(resolveOptions({ mode: testingMode() }).middleware).toEqual({
			enabled: true,
			skip: [],
		});
		expect(
			resolveOptions({ middleware: false, mode: testingMode() }).middleware
		).toEqual({ enabled: false, skip: [] });
		expect(
			resolveOptions({
				middleware: { skip: ['/healthz'] },
				mode: testingMode(),
			}).middleware
		).toEqual({ enabled: true, skip: ['/healthz'] });
	});

	it('keeps an explicit ui adapter', () => {
		expect(resolveOptions({ mode: testingMode(), ui: 'react' }).ui).toBe(
			'react'
		);
		expect(resolveOptions({ mode: testingMode(), ui: 'vue' }).ui).toBe('vue');
	});
});

describe('astro:config:setup', () => {
	it("hands Inth's inline hashes to Astro's CSP when the site turned it on", async () => {
		const options: InthAstroOptions = { mode: testingMode() };
		const { calls } = await runSetup(options, { security: { csp: true } });
		const hashes = await buildInlineCodeHashes(resolveOptions(options));
		expect(calls.updateConfig).toHaveBeenCalledWith({
			security: {
				csp: {
					algorithm: 'SHA-256',
					scriptDirective: { hashes: hashes.scripts },
					// The first-paint stylesheet the components inline.
					styleDirective: { hashes: hashes.styles },
				},
			},
		});

		const without = await runSetup(options);
		expect(
			without.calls.updateConfig.mock.calls.some(([update]) =>
				Object.hasOwn(update as object, 'security')
			)
		).toBe(false);
	});

	it('hands the browser the policy hashes when a clientEntrypoint can add inline scripts', async () => {
		const options: InthAstroOptions = {
			clientEntrypoint: 'site/inth.client',
			mode: testingMode(),
		};
		const { calls } = await runSetup(options, {
			security: { csp: { scriptDirective: { hashes: ['sha256-site'] } } },
		});
		const update = calls.updateConfig.mock.calls.find(([value]) =>
			Object.hasOwn(value as object, 'vite')
		)?.[0] as {
			vite: {
				plugins: { load: (id: string) => string }[];
			};
		};
		const loaded = update.vite.plugins[0]?.load('\0virtual:inth/options');
		const parsed = JSON.parse(
			(loaded ?? '').replace(/^export default /u, '').replace(/;$/u, '')
		);

		expect(parsed.csp).toEqual({
			algorithm: 'SHA-256',
			scriptHashes: [
				...(await buildInlineCodeHashes(resolveOptions(options))).scripts,
				'sha256-site',
			],
		});
	});

	it('registers the middleware before user middleware', async () => {
		const { calls } = await runSetup({
			mode: hostedMode(),
			projectUrl: '/api/inth',
		});
		expect(calls.addMiddleware).toHaveBeenCalledWith({
			entrypoint: resolveOwnEntry('@inth/astro/middleware'),
			order: 'pre',
		});
	});

	it('skips the middleware when disabled', async () => {
		const { calls } = await runSetup({
			middleware: false,
			mode: testingMode(),
		});
		expect(calls.addMiddleware).not.toHaveBeenCalled();
	});

	it('injects a stylesheet that declares the Tailwind 4 layer order first', () => {
		// It lands ahead of a site's Tailwind stylesheet, and layers rank by
		// first mention. Declaring `components` alone would rank it below
		// `base`, where preflight strips the banner's padding and borders.
		const css = readFileSync(resolveOwnEntry('@inth/astro/styles.css'), 'utf8');
		const firstStatement = css.replace(/\/\*[\s\S]*?\*\//gu, '').trim();

		expect(firstStatement.split('\n')[0]).toBe(
			'@layer properties, theme, base, components, utilities;'
		);
	});

	it('defers the IAB panel stylesheet and links no CSS on IAB pages', async () => {
		const { calls } = await runSetup({
			iab: { cmpId: 160 },
			mode: testingMode(),
		});
		expect(
			calls.injectScript.mock.calls.some(([stage]) => stage === 'page-ssr')
		).toBe(false);
		const [, boot] = calls.injectScript.mock.calls[0] as [string, string];
		// The preferences dialog links nothing, so IAB links the widget's
		// rules with its own.
		expect(boot).toContain(
			`import iabDialogStyle1 from ${JSON.stringify(`${resolveOwnEntry('@inth/sdk/ui/styles/sheets/iab-dialog.css')}?url`)};`
		);
		expect(boot).toContain(
			"registerDialogStyles([iabDialogStyle0, iabDialogStyle1, iabDialogStyle2], 'iab');"
		);
	});

	it('gives the Svelte IAB dialog the primitives rules it renders its rows with', async () => {
		const { calls } = await runSetup({
			iab: { cmpId: 160 },
			mode: testingMode(),
			ui: 'svelte',
		});
		const [, boot] = calls.injectScript.mock.calls[0] as [string, string];
		// Without them a collapsed purpose, feature or vendor shows open.
		expect(boot).toContain(
			`import iabDialogStyle2 from ${JSON.stringify(`${resolveOwnEntry('@inth/sdk/ui/styles/primitives.css')}?url`)};`
		);
		expect(boot).toContain(
			"registerDialogStyles([iabDialogStyle0, iabDialogStyle1, iabDialogStyle2], 'iab');"
		);
	});

	it.each(['react', 'vue'] as const)(
		"links no primitives rules for the %s IAB dialog, which renders the widget's",
		async (ui) => {
			const { calls } = await runSetup({
				iab: { cmpId: 160 },
				mode: testingMode(),
				ui,
			});
			const [, boot] = calls.injectScript.mock.calls[0] as [string, string];
			expect(boot).not.toContain('primitives.css');
		}
	);

	it('gives the React IAB dialog the widget rules its preferences dialog never links', async () => {
		const { calls } = await runSetup({
			iab: { cmpId: 160 },
			mode: testingMode(),
			ui: 'react',
		});
		const [, boot] = calls.injectScript.mock.calls[0] as [string, string];
		expect(boot).toContain(
			`import iabDialogStyle0 from ${JSON.stringify(`${resolveOwnEntry('@inth/sdk/ui/styles/sheets/widget.css')}?url`)};`
		);
		expect(boot).toContain(
			"registerDialogStyles([iabDialogStyle0, iabDialogStyle1], 'iab');"
		);
	});

	it.each(['react', 'svelte', 'vue'] as const)(
		'links no stylesheet from %s pages without IAB',
		async (ui) => {
			// The components inline the first-paint rules, and the client
			// links the dialog's when it opens: a stylesheet in `<head>`
			// would hold back the first paint.
			const { calls } = await runSetup({ mode: testingMode(), ui });
			expect(
				calls.injectScript.mock.calls.some(([stage]) => stage === 'page-ssr')
			).toBe(false);
		}
	);

	it.each(['react', 'svelte', 'vue'] as const)(
		'registers no preferences stylesheet for the %s dialog, which renders with the sheets the client puts in',
		async (ui) => {
			// The dialog renders with tokens, button, expand and dialog, which
			// the client puts in, and each confirmation it hosts brings or gets
			// the widget's sheets. Neither the widget's stylesheet nor the
			// primitives' is linked for it.
			const { calls } = await runSetup({ mode: testingMode(), ui });
			const [, code] = calls.injectScript.mock.calls[0] as [string, string];
			expect(code).not.toContain('registerDialogStyles(');
			expect(code).not.toContain('widget.css');
			expect(code).not.toContain('primitives.css');
		}
	);

	describe('on a Tailwind CSS 3 site', () => {
		/** A project root whose `tailwindcss` resolves at `version`. */
		const projectWithTailwind = function projectWithTailwind(
			version: string
		): URL {
			const root = mkdtempSync(join(tmpdir(), 'inth-astro-tw-'));
			const tailwind = join(root, 'node_modules', 'tailwindcss');
			mkdirSync(tailwind, { recursive: true });
			writeFileSync(join(root, 'package.json'), '{"name":"site"}');
			writeFileSync(
				join(tailwind, 'package.json'),
				JSON.stringify({ name: 'tailwindcss', version })
			);
			return pathToFileURL(`${root}/`);
		};

		it('links styles.css instead of inlining, so Tailwind builds it', async () => {
			// Tailwind 3 unwraps Inth's layer in the stylesheets it builds;
			// inlined rules would stay layered and lose to its preflight.
			const { calls } = await runSetup(
				{ mode: testingMode(), ui: 'svelte' },
				{ root: projectWithTailwind('3.4.17') }
			);
			const [, boot] = calls.injectScript.mock.calls[0] as [string, string];

			expect(calls.injectScript).toHaveBeenCalledWith(
				'page-ssr',
				`import ${specifier('@inth/astro/styles.css')};`
			);
			expect(boot).not.toContain('sheets/dialog.css');
			expect(boot).not.toContain('primitives.css');
		});

		it('inlines on Tailwind CSS 4', async () => {
			const { calls } = await runSetup(
				{ mode: testingMode() },
				{ root: projectWithTailwind('4.1.0') }
			);
			expect(
				calls.injectScript.mock.calls.some(([stage]) => stage === 'page-ssr')
			).toBe(false);
		});

		it('links both full stylesheets for Tailwind 3 with IAB enabled', async () => {
			const { calls } = await runSetup(
				{ iab: { cmpId: 160 }, mode: testingMode() },
				{ root: projectWithTailwind('3.4.17') }
			);
			expect(calls.injectScript).toHaveBeenCalledWith(
				'page-ssr',
				[
					`import ${specifier('@inth/astro/styles.css')};`,
					`import ${specifier('@inth/astro/iab/styles.css')};`,
				].join('\n')
			);
			const [, boot] = calls.injectScript.mock.calls[0] as [string, string];
			expect(boot).not.toContain('sheets/iab-dialog.css');
			// `styles.css` carries no primitives rules, which Svelte's IAB
			// dialog still needs.
			expect(boot).toContain("registerDialogStyles([iabDialogStyle0], 'iab');");
			expect(boot).toContain('primitives.css');
		});
	});

	it('registers no dialog stylesheets with `styles: false`', async () => {
		const { calls } = await runSetup({
			iab: { cmpId: 160 },
			mode: testingMode(),
			styles: false,
		});
		const [, code] = calls.injectScript.mock.calls[0] as [string, string];
		expect(code).not.toContain('?url');
		expect(code).not.toContain('registerDialogStyles(');
	});

	it('leaves styles to the site with `styles: false`', async () => {
		const { calls } = await runSetup({ mode: testingMode(), styles: false });
		expect(
			calls.injectScript.mock.calls.some(([stage]) => stage === 'page-ssr')
		).toBe(false);
	});

	it('injects a page-level boot script', async () => {
		const { calls } = await runSetup({ mode: testingMode() });
		const [stage, code] = calls.injectScript.mock.calls[0] as [string, string];
		expect(stage).toBe('page');
		expect(code).toContain("import options from 'virtual:inth/options'");
		expect(code).toContain(`from ${specifier('@inth/astro/client')}`);
		expect(code).toContain(
			"startDeferredClient(options, () => import('virtual:inth/engine'));"
		);
		// The engine is not in the first load.
		expect(code).not.toContain('boot(');
		expect(code).not.toMatch(/^import[^;]*Transport/mu);
	});

	it('serves the engine as virtual:inth/engine', async () => {
		const { calls } = await runSetup({ mode: testingMode() });
		const engine = engineSource(calls);
		expect(engine).toContain(`from ${specifier('@inth/astro/client')};`);
		expect(engine).toContain('export { boot };');
	});

	it.each([
		['svelte', '@inth/astro/ui/svelte', 'panel-surface.svelte'],
		['react', '@inth/astro/ui/react', 'panel-surface.tsx'],
		['vue', '@inth/astro/ui/vue', 'panel-surface.vue'],
	] as const)(
		'registers only the %s adapter and island',
		async (ui, adapterModule, surfaceFile) => {
			const { calls } = await runSetup({ mode: testingMode(), ui });
			const [, code] = calls.injectScript.mock.calls[0] as [string, string];

			expect(code).toContain(`registerDialogAdapter(${JSON.stringify(ui)}`);
			expect(code).toContain(`import(${specifier(adapterModule)})`);
			expect(code).toContain(
				`import(${specifier(`@inth/astro/islands/${surfaceFile}`)})`
			);

			// The point of injecting these: a build must never see a specifier
			// for a framework the site did not ask for.
			for (const other of ['svelte', 'react', 'vue'].filter(
				(name) => name !== ui
			)) {
				expect(code).not.toContain(resolveOwnEntry(`@inth/astro/ui/${other}`));
			}
		}
	);

	it.each([
		['offline()', { mode: testingMode() }, {}, 'testingTransport'],
		[
			'hosted() with no adapter',
			{ mode: hostedMode(), projectUrl: 'https://consent.example.com' },
			{},
			'hostedTransport',
		],
		[
			'hosted() with an adapter',
			{ mode: hostedMode(), projectUrl: 'https://consent.example.com' },
			{ adapter: { name: '@astrojs/node' } },
			'lazyTransport',
		],
		[
			'manifest()',
			{
				mode: manifestMode({ source: 'runtime' }),
				projectUrl: 'https://consent.example.com',
			},
			{ adapter: { name: '@astrojs/node' } },
			'lazyTransport',
		],
	] satisfies [string, InthAstroOptions, Record<string, unknown>, string][])(
		'registers the one transport %s needs',
		async (_name, options, config, transport) => {
			const { calls } = await runSetup(options, config);
			const code = engineSource(calls);
			expect(code).toContain(
				`registerTransport, ${transport} } from ${specifier('@inth/astro/client')};`
			);
			expect(code).toContain(`registerTransport(${transport});`);
			const [, page] = calls.injectScript.mock.calls[0] as [string, string];
			expect(page).not.toContain('Transport');
		}
	);

	it('keeps both island specifiers behind import()', async () => {
		const { calls } = await runSetup({ mode: testingMode(), ui: 'react' });
		const [, code] = calls.injectScript.mock.calls[0] as [string, string];
		expect(code).not.toMatch(/^import\s[^;]*@inth\/astro\/(?:ui|islands)\//mu);
	});

	it('loads the script loader on demand for a site without scripts', async () => {
		const { calls } = await runSetup({ mode: testingMode() });
		const code = engineSource(calls);
		expect(code).not.toContain('@inth/sdk/modules/script-loader');
		expect(code).not.toContain('@inth/sdk/modules/network-blocker');
		expect(code).not.toContain('registerRuntimeModules({');
	});

	it('ships the script loader and blocker with the engine when configured', async () => {
		const { calls } = await runSetup({
			mode: testingMode(),
			networkBlocker: {
				rules: [{ category: 'measurement', domain: 'example.com', id: 'ga' }],
			},
			scripts: [
				{ category: 'measurement', id: 'ga', src: 'https://example.com/ga.js' },
			],
		});
		const code = engineSource(calls);
		expect(code).toContain(
			`import { createScriptLoader } from ${specifier('@inth/sdk/modules/script-loader')};`
		);
		expect(code).toContain(
			`import { createNetworkBlocker } from ${specifier('@inth/sdk/modules/network-blocker')};`
		);
		expect(code).toContain(
			'registerRuntimeModules({ createScriptLoader, createNetworkBlocker });'
		);
		// The first load carries neither.
		const [, page] = calls.injectScript.mock.calls[0] as [string, string];
		expect(page).not.toContain('@inth/sdk/modules/');
	});

	it.each([
		['no `iab` option', {}],
		['`iab: false`', { iab: false }],
		['`iab.enabled: false`', { iab: { cmpId: 160, enabled: false } }],
	] as const)('ships no IAB wiring with %s', async (_label, iabOptions) => {
		// The Nuxt module once mounted the CMP for a site that never set `iab`.
		// Here a site without it must not even reach the mount or the
		// `import()` that fetches `@inth/sdk/iab`.
		const { calls } = await runSetup({ mode: testingMode(), ...iabOptions });
		const [, page] = calls.injectScript.mock.calls[0] as [string, string];
		const code = `${page}\n${engineSource(calls)}`;
		expect(code).not.toContain('registerIAB(');
		expect(code).not.toContain(resolveOwnEntry('@inth/sdk/iab'));
		expect(code).not.toContain('mountRuntimeIAB');
	});

	it('registers the IAB wiring with the engine when `iab` is set', async () => {
		const { calls } = await runSetup({
			iab: { cmpId: 160 },
			mode: testingMode(),
		});
		const code = engineSource(calls);
		expect(code).toContain(
			`import { mountRuntimeIAB } from ${specifier('@inth/sdk/runtime/on-demand')};`
		);
		expect(code).toContain(
			`registerIAB({ ...createLazyIABFactory(() => import(${specifier('@inth/sdk/iab')})), mount: mountRuntimeIAB });`
		);
		// `@inth/sdk/iab` stays behind `import()`.
		const staticImports = code
			.split('\n')
			.filter((line) => line.startsWith('import '));
		expect(
			staticImports.some((line) =>
				line.includes(resolveOwnEntry('@inth/sdk/iab'))
			)
		).toBe(false);
	});

	it('keeps what a client entrypoint may configure in the engine', async () => {
		const { calls } = await runSetup({
			clientEntrypoint: 'site/inth.client',
			mode: testingMode(),
		});
		const code = engineSource(calls);
		expect(code).toContain(
			'registerRuntimeModules({ createScriptLoader, createNetworkBlocker, connectConsentSource });'
		);
		// Its blocker rules are not known at build time: on demand, imported
		// on its own so the boot chunk names no other module's chunk.
		expect(code).toContain(
			`import { networkBlockerOnDemand as createNetworkBlocker } from ${specifier('@inth/sdk/runtime/on-demand-factories')};`
		);
		expect(code).not.toContain('@inth/sdk/modules/network-blocker');
	});

	it('threads a client entrypoint into the boot script', async () => {
		const { calls } = await runSetup({
			clientEntrypoint: 'site/inth.client',
			mode: testingMode(),
		});
		const [, code] = calls.injectScript.mock.calls[0] as [string, string];
		expect(code).toContain('import clientOptions from "site/inth.client"');
		expect(code).toContain(
			"startDeferredClient(options, () => import('virtual:inth/engine'), clientOptions);"
		);
	});

	it('resolves a relative client entrypoint from the project root', async () => {
		const root = mkdtempSync(join(tmpdir(), 'inth-astro-client-'));
		mkdirSync(join(root, 'src'));
		writeFileSync(join(root, 'src', 'consent.ts'), 'export default {};');
		const { calls } = await runSetup(
			{ clientEntrypoint: './src/consent.ts', mode: testingMode() },
			{ root: pathToFileURL(`${root}/`) }
		);
		const [, code] = calls.injectScript.mock.calls[0] as [string, string];
		expect(code).toContain(
			`import clientOptions from ${JSON.stringify(join(root, 'src', 'consent.ts'))}`
		);
		await expect(
			runSetup(
				{ clientEntrypoint: './src/missing.ts', mode: testingMode() },
				{ root: pathToFileURL(`${root}/`) }
			)
		).rejects.toThrow(
			/does not exist. Relative paths start from the project root/u
		);
	});

	it('finds src/inth.client.ts on its own', async () => {
		const root = mkdtempSync(join(tmpdir(), 'inth-astro-client-'));
		mkdirSync(join(root, 'src'));
		const file = join(root, 'src', 'inth.client.ts');
		writeFileSync(file, 'export default {};');
		expect(
			await resolveClientEntrypoint(undefined, pathToFileURL(`${root}/`))
		).toBe(file);
		const empty = mkdtempSync(join(tmpdir(), 'inth-astro-client-'));
		expect(
			await resolveClientEntrypoint(undefined, pathToFileURL(`${empty}/`))
		).toBeUndefined();
	});

	it('keeps the client entrypoint path out of the browser options', async () => {
		const { calls } = await runSetup({
			clientEntrypoint: 'site/inth.client',
			mode: testingMode(),
		});
		const [update] = calls.updateConfig.mock.calls[0] ?? [];
		const [plugin] = update.vite.plugins;
		const client = plugin.load('\0virtual:inth/options', { ssr: false });
		expect(client).not.toContain('site/inth.client');
		for (const key of ['middleware', 'clientEntrypoint']) {
			expect(client).not.toContain(`"${key}"`);
		}
		// The engine reads it to add the first-paint rules a page left out.
		expect(client).toContain('"inlineStyles":true');
		expect(plugin.load('\0virtual:inth/options', { ssr: true })).toContain(
			'"clientEntrypoint":"site/inth.client"'
		);
	});

	it('quotes client entrypoints without letting them add statements', async () => {
		const clientEntrypoint = "client'\\file.ts';globalThis.injected=true;//";
		const { calls } = await runSetup({
			clientEntrypoint,
			mode: testingMode(),
		});
		const [, code] = calls.injectScript.mock.calls[0] as [string, string];
		const module = parse(code, { sourceType: 'module' });
		const entrypointImports = module.program.body.filter(
			(statement) =>
				statement.type === 'ImportDeclaration' &&
				statement.specifiers.some(
					(imported) => imported.local.name === 'clientOptions'
				)
		);
		expect(entrypointImports).toHaveLength(1);
		expect(entrypointImports[0]).toMatchObject({
			source: { value: clientEntrypoint },
		});
	});

	it('serves the serialized options from the virtual module', async () => {
		const { calls } = await runSetup({
			consentCategories: ['necessary', 'measurement'],
			gpp: { usApproach: 'national', usFallback: 'none' },
			mode: hostedMode(),
			projectUrl: 'https://consent.example.com',
		});
		const [config] = calls.updateConfig.mock.calls[0] as [
			{
				vite: {
					plugins: {
						resolveId: (id: string) => string;
						load: (id: string) => string;
					}[];
				};
			},
		];
		const [plugin] = config.vite.plugins;
		const resolved = plugin?.resolveId('virtual:inth/options') as string;
		expect(resolved).toBe('\0virtual:inth/options');

		const loaded = plugin?.load(resolved) as string;
		const parsed = JSON.parse(
			loaded.replace(/^export default /u, '').replace(/;$/u, '')
		);
		expect(parsed.mode).toEqual({ type: 'hosted' });
		expect(parsed.projectUrl).toBe('https://consent.example.com');
		expect(parsed.consentCategories).toEqual(['necessary', 'measurement']);
		expect(parsed.gpp).toEqual({ usApproach: 'national', usFallback: 'none' });
	});

	it("shims Nuxt's #imports for the vue adapter only", async () => {
		const withVue = await runSetup({ mode: testingMode(), ui: 'vue' });
		const [vueConfig] = withVue.calls.updateConfig.mock.calls[0] as [
			{ vite: { plugins: { name: string }[] } },
		];
		expect(vueConfig.vite.plugins.map((plugin) => plugin.name)).toEqual([
			'inth:options',
			'inth:engine',
			'inth:class-maps-without-css',
			'@inth/vue',
		]);

		const withSvelte = await runSetup({ mode: testingMode() });
		const [svelteConfig] = withSvelte.calls.updateConfig.mock.calls[0] as [
			{ vite: { plugins: { name: string }[] } },
		];
		expect(svelteConfig.vite.plugins.map((plugin) => plugin.name)).toEqual([
			'inth:options',
			'inth:engine',
			'inth:class-maps-without-css',
		]);
	});

	it('injects one catch-all route in manifest mode', async () => {
		const { calls } = await runSetup({
			mode: manifestMode(),
			projectUrl: 'https://consent.example.com',
			routePrefix: '/consent',
		});
		expect(calls.injectRoute).toHaveBeenCalledTimes(1);
		expect(calls.injectRoute).toHaveBeenCalledWith({
			entrypoint: resolveOwnEntry('@inth/astro/api'),
			pattern: '/consent/[...path]',
			prerender: false,
		});
	});

	it('prerenders the route for browser resolution on a site with no adapter', async () => {
		const options: InthAstroOptions = {
			mode: manifestMode({ resolve: 'browser' }),
			projectUrl: 'https://consent.example.com',
		};
		const { calls } = await runSetup(options);
		expect(calls.injectRoute).toHaveBeenCalledWith(
			expect.objectContaining({
				pattern: '/api/inth/[...path]',
				prerender: true,
			})
		);
		const withAdapter = await runSetup(options, {
			adapter: { name: '@astrojs/node' },
		});
		expect(withAdapter.calls.injectRoute).toHaveBeenCalledWith(
			expect.objectContaining({ prerender: false })
		);
	});

	it.each([
		['hosted mode', { mode: hostedMode(), projectUrl: '/api/inth' }],
		['offline mode', { mode: testingMode() }],
		[
			'routePrefix: false',
			{
				mode: manifestMode(),
				projectUrl: 'https://consent.example.com',
				routePrefix: false,
			},
		],
	] satisfies [string, InthAstroOptions][])(
		'injects no route with %s',
		async (_name, options) => {
			const { calls } = await runSetup(options);
			expect(calls.injectRoute).not.toHaveBeenCalled();
		}
	);
});

describe('astro:config:done', () => {
	/** Run setup for `command`, then done, the way Astro does. */
	const runForCommand = (
		options: InthAstroOptions,
		command: string,
		adapter?: { name: string }
	) => runDone(options, ['@astrojs/svelte'], adapter, command);
	const MANIFEST: InthAstroOptions = {
		mode: manifestMode(),
		projectUrl: 'https://consent.example.com',
	};

	it('names the injected route when a build has no adapter', async () => {
		const done = await runForCommand(MANIFEST, 'build');
		await expect(done()).rejects.toThrowError(
			/on-demand route at \/api\/inth\/\[\.\.\.path\], which needs a server adapter.*hosted\(\) or manifest\(\{ resolve: 'browser' \}\)/u
		);
	});

	it("lets manifest({ resolve: 'browser' }) build without an adapter", async () => {
		const done = await runForCommand(
			{ ...MANIFEST, mode: manifestMode({ resolve: 'browser' }) },
			'build'
		);
		await expect(done()).resolves.toBeUndefined();
	});

	it('adds the App.Locals type for Astro.locals.inth', async () => {
		const done = await runForCommand(MANIFEST, 'dev');
		await done();
		expect(done.injectTypes).toHaveBeenCalledWith({
			content: expect.stringMatching(
				/inth: import\('@inth\/astro'\)\.InthLocals;/u
			),
			filename: 'locals.d.ts',
		});
		expect(LOCALS_TYPES).toMatch(/^declare namespace App \{/u);
	});

	it.each(['dev', 'sync'])(
		'lets `astro %s` run without an adapter, as Astro does',
		async (command) => {
			const done = await runForCommand(MANIFEST, command);
			await expect(done()).resolves.toBeUndefined();
		}
	);

	it('lets manifest mode build with an adapter', async () => {
		const done = await runForCommand(MANIFEST, 'build', {
			name: '@astrojs/node',
		});
		await expect(done()).resolves.toBeUndefined();
	});

	it('lets manifest mode build statically with `routePrefix: false`', async () => {
		const done = await runForCommand(
			{ ...MANIFEST, routePrefix: false },
			'build'
		);
		await expect(done()).resolves.toBeUndefined();
	});

	it.each([
		['svelte', '@astrojs/svelte'],
		['react', '@astrojs/react'],
		['vue', '@astrojs/vue'],
	] as const)(
		'fails clearly when %s is selected without %s',
		async (ui, astroIntegration) => {
			const run = await runDone({ mode: testingMode(), ui }, []);
			await expect(run()).rejects.toThrowError(
				new RegExp(`ui: "${ui}" needs ${astroIntegration}`, 'u')
			);
		}
	);

	it('names every package to install in the error log', async () => {
		const run = await runDone({ mode: testingMode(), ui: 'react' }, []);
		await expect(run()).rejects.toThrow();
		expect(run.logger.error).toHaveBeenCalledWith(
			expect.stringContaining('@astrojs/react, @inth/react, react, react-dom')
		);
	});

	it.each([
		['svelte', '@astrojs/svelte'],
		['react', '@astrojs/react'],
		['vue', '@astrojs/vue'],
	] as const)(
		'passes when %s has %s installed',
		async (ui, astroIntegration) => {
			const run = await runDone({ mode: testingMode(), ui }, [
				astroIntegration,
			]);
			await expect(run()).resolves.toBeUndefined();
		}
	);

	it('passes for a banner-only site', async () => {
		const run = await runDone(
			{ mode: testingMode(), requireUIIntegration: false },
			[]
		);
		await expect(run()).resolves.toBeUndefined();
	});

	it.each([
		[['@astrojs/react'], 'react'],
		[['@astrojs/vue'], 'vue'],
		[['@astrojs/svelte'], 'svelte'],
		[[], 'svelte'],
		[['@astrojs/svelte', '@astrojs/react'], 'svelte'],
		[['@astrojs/react', '@astrojs/vue'], 'svelte'],
	] as const)('infers ui from %j as %s', (installed, ui) => {
		expect(inferUIAdapter(installed)).toBe(ui);
	});

	it('renders the dialog with the one UI integration the site registers', async () => {
		const { calls } = await runSetup(
			{ mode: testingMode() },
			{ integrations: [{ name: '@astrojs/react' }] }
		);
		const [, code] = calls.injectScript.mock.calls[0] as [string, string];
		expect(code).toContain('registerDialogAdapter("react"');
		expect(code).not.toContain(resolveOwnEntry('@inth/astro/ui/svelte'));

		const explicit = await runSetup(
			{ mode: testingMode(), ui: 'svelte' },
			{ integrations: [{ name: '@astrojs/react' }] }
		);
		const [, explicitCode] = explicit.calls.injectScript.mock.calls[0] as [
			string,
			string,
		];
		expect(explicitCode).toContain('registerDialogAdapter("svelte"');
	});
});
