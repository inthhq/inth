/**
 * @vitest-environment jsdom
 *
 * Adapters: a manifest's `adapter` field names code the SDK ships. Each
 * test imports the runtime afresh, since installed adapters are module
 * state.
 */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { ScriptCallbackInfo } from '../../libs/script-loader/types';
import type { RemoteManifestRuntime } from '../../modules/script-loader/types';
import type * as SentryModule from '../adapters/sentry';
import type * as RuntimeModule from '../index';

let runtime: typeof RuntimeModule;
let sentry: typeof SentryModule;

beforeEach(async () => {
	vi.resetModules();
	runtime = await import('../index');
	sentry = await import('../adapters/sentry');
});

const sentryOptions = (overrides: Record<string, unknown> = {}) => ({
	dsn: 'https://public@o0.ingest.sentry.io/0',
	initOptions: { release: 'app@1.0.0', replaysSessionSampleRate: 0.1 },
	loadMode: 'always',
	piiCategory: 'measurement',
	replay: { category: 'measurement', load: true },
	tracing: false,
	version: '11.4.0',
	...overrides,
});

/** A manifest as the Inth server sends one that names the Sentry adapter. */
const sentryManifest = (
	adapter: unknown = { id: 'sentry', options: sentryOptions() }
) => ({
	adapter,
	afterLoadSteps: [],
	alwaysLoad: true,
	bootstrapSteps: [],
	category: { or: ['necessary', 'measurement'] },
	kind: 'inth.vendor-manifest',
	loadScript: {
		async: true,
		attributes: { crossorigin: 'anonymous' },
		src: 'https://browser.sentry-cdn.com/11.4.0/bundle.min.js',
		type: 'loadScript',
	},
	observeConsentBeforeLoad: true,
	onBeforeLoadDeniedSteps: [],
	onBeforeLoadGrantedSteps: [],
	onConsentChangeSteps: [],
	onConsentDeniedSteps: [],
	onConsentGrantedSteps: [],
	onLoadDeniedSteps: [],
	onLoadGrantedSteps: [],
	requires: 4,
	resourceKey: 'sentry-11.4.0-bundle.min.js',
	schemaVersion: 1,
	setupSteps: [],
	vendor: 'sentry',
});

const reason = (value: unknown) => {
	const parsed = runtime.parseResolvedManifest(value);
	return parsed.ok ? undefined : parsed.reason;
};

describe('adapter levels', () => {
	it('runs level 4', () => {
		expect(runtime.MANIFEST_RUNTIME_LEVEL).toBe(4);
	});

	it('reads a manifest that names an adapter at the adapter level', () => {
		const {
			adapter: _adapter,
			requires: _requires,
			...rest
		} = sentryManifest();

		expect(runtime.manifestFeatureLevel(sentryManifest() as never)).toBe(4);
		expect(runtime.manifestFeatureLevel(rest as never)).toBe(2);
	});

	it('reads an adapter this SDK does not ship as a level it cannot run', () => {
		expect(
			runtime.manifestFeatureLevel(
				sentryManifest({ id: 'acme', options: {} }) as never
			)
		).toBe(Infinity);
	});
});

describe('parsing a manifest that names an adapter', () => {
	it('refuses an adapter this SDK does not ship', () => {
		expect(reason(sentryManifest({ id: 'acme', options: {} }))).toBe(
			'it names the adapter "acme", which this SDK does not have'
		);
		// Not an inherited name either.
		expect(reason(sentryManifest({ id: 'constructor', options: {} }))).toBe(
			'it names the adapter "constructor", which this SDK does not have'
		);
	});

	it('refuses an adapter field that is not an id with options', () => {
		for (const adapter of [
			'sentry',
			{ id: 'sentry' },
			{ id: 'sentry', options: [] },
			{ id: 'sentry', options: {}, src: 'https://evil.example/a.js' },
		]) {
			expect(reason(sentryManifest(adapter))).toBe(
				'its adapter is not an id with options'
			);
		}
	});

	it('refuses an adapter that is not loaded, and says why one failed to', () => {
		expect(reason(sentryManifest())).toBe('its sentry adapter is not loaded');

		runtime.installAdapter({ failure: 'offline', id: 'sentry' });

		expect(reason(sentryManifest())).toBe(
			'its sentry adapter did not load: offline'
		);
	});

	it('accepts the manifest once the adapter is installed, and a failure never replaces it', () => {
		runtime.installAdapter(sentry.sentryAdapter);
		runtime.installAdapter({ failure: 'offline', id: 'sentry' });

		expect(runtime.parseResolvedManifest(sentryManifest())).toEqual({
			manifest: sentryManifest(),
			ok: true,
		});
	});

	it("refuses options the adapter's validator refuses", () => {
		runtime.installAdapter(sentry.sentryAdapter);
		const withOptions = (overrides: Record<string, unknown>) =>
			reason(
				sentryManifest({ id: 'sentry', options: sentryOptions(overrides) })
			);

		expect(withOptions({ beforeSend: 'x' })).toBe(
			'its sentry adapter options are wrong: it has the unknown option beforeSend'
		);
		expect(withOptions({ dsn: 'http://public@o0.ingest.sentry.io/0' })).toBe(
			'its sentry adapter options are wrong: its dsn is not an https URL'
		);
		expect(withOptions({ version: '11.4.0/../../evil' })).toBe(
			'its sentry adapter options are wrong: its version is not a version number'
		);
		expect(withOptions({ initOptions: { integrations: [] } })).toBe(
			'its sentry adapter options are wrong: its initOptions has the unknown or wrong option integrations'
		);
		expect(withOptions({ initOptions: { tracesSampleRate: 2 } })).toBe(
			'its sentry adapter options are wrong: its initOptions has the unknown or wrong option tracesSampleRate'
		);
		expect(withOptions({ piiCategory: 'everything' })).toBe(
			'its sentry adapter options are wrong: its piiCategory is not a condition over known categories'
		);
		expect(
			withOptions({
				replay: {
					category: 'measurement',
					load: true,
					options: { maskAllText: 'no' },
				},
			})
		).toBe(
			'its sentry adapter options are wrong: its replay options have the unknown or wrong option maskAllText'
		);
	});
});

describe('building a manifest that names an adapter', () => {
	it('hands the script built from the rest of the manifest to the adapter', () => {
		runtime.installAdapter(sentry.sentryAdapter);
		const script = runtime.resolvedManifestToScript(sentryManifest() as never);

		expect(script).toMatchObject({
			alwaysLoad: true,
			id: 'sentry',
			observeConsentBeforeLoad: true,
			resourceKey: 'sentry-11.4.0-bundle.min.js',
			src: 'https://browser.sentry-cdn.com/11.4.0/bundle.min.js',
		});
		expect(
			Object.keys(script)
				.filter(
					(key) => typeof script[key as keyof typeof script] === 'function'
				)
				.sort()
		).toEqual([
			'onBeforeLoad',
			'onConsentChange',
			'onDispose',
			'onError',
			'onLoad',
		]);
	});

	it('starts it in the browser only, even with an inline start for a server render', () => {
		runtime.installAdapter(sentry.sentryAdapter);
		const inline = vi.fn(() => ({ code: '/* start */' }) as never);
		const build = runtime.createManifestScriptFactory(inline);
		const { adapter: _adapter, ...plain } = sentryManifest();

		expect(build(sentryManifest() as never).serverStart).toBeUndefined();
		expect(build(plain as never).serverStart).toBeTypeOf('function');
	});

	it('throws for an adapter that is not loaded', () => {
		expect(() =>
			runtime.resolvedManifestToScript(sentryManifest() as never)
		).toThrow(
			'Load the sentry adapter before building a manifest that names it.'
		);
	});
});

describe('withAdapters', () => {
	const base = (): RemoteManifestRuntime => ({
		installAdapter: runtime.installAdapter,
		parseResolvedManifest: runtime.parseResolvedManifest,
		resolvedManifestToScript: runtime.resolvedManifestToScript,
	});

	it('loads nothing for manifests that name no adapter, or one this SDK does not ship', () => {
		const load = vi.fn();
		const adapted = runtime.withAdapters(base(), load);

		expect(adapted.prepare?.([{ vendor: 'acme' }, null])).toBeUndefined();
		expect(
			adapted.prepare?.([sentryManifest({ id: 'acme', options: {} })])
		).toBeUndefined();
		expect(load).not.toHaveBeenCalled();
	});

	it('loads each named adapter once and installs it', async () => {
		const load = vi.fn(() => Promise.resolve(sentry.sentryAdapter));
		const adapted = runtime.withAdapters(base(), load);

		await adapted.prepare?.([sentryManifest(), sentryManifest()]);

		expect(load).toHaveBeenCalledExactlyOnceWith('sentry');
		expect(adapted.parseResolvedManifest(sentryManifest()).ok).toBe(true);
		expect(adapted.prepare?.([sentryManifest()])).toBeUndefined();
	});

	it('installs a failed load as a failure, and tries again for a later list', async () => {
		const load = vi
			.fn<(id: string) => Promise<typeof sentry.sentryAdapter>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(sentry.sentryAdapter);
		const adapted = runtime.withAdapters(base(), load);

		await adapted.prepare?.([sentryManifest()]);
		expect(adapted.parseResolvedManifest(sentryManifest())).toEqual({
			ok: false,
			reason: 'its sentry adapter did not load: offline',
		});

		await adapted.prepare?.([sentryManifest()]);
		expect(adapted.parseResolvedManifest(sentryManifest()).ok).toBe(true);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('installs the adapters into the runtime the earlier prepare moves to', async () => {
		const next = { ...base(), installAdapter: vi.fn() };
		const adapted = runtime.withAdapters(
			{
				...base(),
				installAdapter: vi.fn(),
				prepare: () => Promise.resolve(next),
			},
			() => Promise.resolve(sentry.sentryAdapter)
		);

		const moved = await adapted.prepare?.([sentryManifest()]);

		expect(next.installAdapter).toHaveBeenCalledExactlyOnceWith(
			sentry.sentryAdapter
		);
		// Later lists keep loading adapters, into the runtime it moved to.
		expect(moved?.prepare).toBeTypeOf('function');
	});
});

describe('the Sentry adapter', () => {
	const info = (overrides: Partial<ScriptCallbackInfo> = {}) =>
		({
			consents: { measurement: false, necessary: true },
			elementId: 'inth-1',
			hasConsent: true,
			id: 'sentry',
			...overrides,
		}) as ScriptCallbackInfo;

	it('drops the base script server start and keeps its fields', () => {
		const script = sentry.sentryCdnScript(
			{
				category: 'necessary',
				id: 'sentry',
				serverStart: () => undefined,
				src: 'https://x.example/a.js',
			},
			sentryOptions() as never
		);

		expect(script.serverStart).toBeUndefined();
		expect(script.src).toBe('https://x.example/a.js');
	});

	it('initializes Sentry with the DSN and init options once the bundle loads', () => {
		const init = vi.fn();
		(window as { Sentry?: unknown }).Sentry = {
			getClient: () => undefined,
			init,
			setUser: vi.fn(),
		};
		const element = document.createElement('script');
		const script = sentry.sentryCdnScript(
			{ category: 'necessary', id: 'sentry' },
			sentryOptions() as never
		);

		script.onLoad?.(info({ element }));

		expect(init).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				dsn: 'https://public@o0.ingest.sentry.io/0',
				release: 'app@1.0.0',
				replaysSessionSampleRate: 0.1,
			})
		);
		script.onDispose?.(info());
		delete (window as { Sentry?: unknown }).Sentry;
	});

	it('points the default version at its files with their integrity, and another version without', () => {
		expect(sentry.sentryCdnFile('11.4.0', 'replay.min.js')).toEqual({
			integrity:
				'sha384-mwyc35qA4ycC37dBKk3A7bdqEVGlz8Tk4XkoS0DE4B/No3NgDuhHiofBKNu9PPQh',
			src: 'https://browser.sentry-cdn.com/11.4.0/replay.min.js',
		});
		expect(sentry.sentryCdnFile('10.0.0', 'bundle.min.js')).toEqual({
			integrity: undefined,
			src: 'https://browser.sentry-cdn.com/10.0.0/bundle.min.js',
		});
	});
});
