/**
 * @vitest-environment jsdom
 *
 * Adapters: a manifest's `adapter` field names code the SDK ships, which a
 * runtime from `withAdapters` loads and runs.
 */
import { describe, expect, it, vi } from 'vite-plus/test';

import type { ScriptCallbackInfo } from '../../libs/script-loader/types';
import type { RemoteManifestRuntime } from '../../modules/script-loader/types';
import * as sentry from '../adapters/sentry';
import * as runtime from '../index';

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
	// Its steps touch no window root; the adapter's own code is not steps.
	globals: [],
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

const base = (): RemoteManifestRuntime => ({
	parseResolvedManifest: runtime.parseResolvedManifest,
	resolvedManifestToScript: runtime.resolvedManifestToScript,
});

const loadSentry = () => Promise.resolve(sentry.sentryAdapter);

/** A runtime from `withAdapters` that has loaded the Sentry adapter. */
const adapterRuntime = async () => {
	const adapted = runtime.withAdapters(base(), loadSentry);
	await adapted.prepare?.([sentryManifest()]);
	return adapted;
};

const reasonFrom = (adapted: RemoteManifestRuntime, value: unknown) => {
	const parsed = adapted.parseResolvedManifest(value);
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
	it("is refused by the runtime's own parser, which runs no adapters", () => {
		expect(runtime.parseResolvedManifest(sentryManifest())).toEqual({
			ok: false,
			reason: 'it has the unknown field adapter',
		});
	});

	it('refuses an adapter this SDK does not ship', async () => {
		const adapted = await adapterRuntime();

		expect(
			reasonFrom(adapted, sentryManifest({ id: 'acme', options: {} }))
		).toBe('it names the adapter "acme", which this SDK does not have');
		// Not an inherited name either.
		expect(
			reasonFrom(adapted, sentryManifest({ id: 'constructor', options: {} }))
		).toBe('it names the adapter "constructor", which this SDK does not have');
	});

	it('refuses an adapter field that is not an id with options', async () => {
		const adapted = await adapterRuntime();

		for (const adapter of [
			'sentry',
			{ id: 'sentry' },
			{ id: 'sentry', options: [] },
			{ id: 'sentry', options: {}, src: 'https://evil.example/a.js' },
		]) {
			expect(reasonFrom(adapted, sentryManifest(adapter))).toBe(
				'its adapter is not an id with options'
			);
		}
	});

	it('refuses an adapter that is not loaded, and says why one failed to', async () => {
		const adapted = runtime.withAdapters(base(), () =>
			Promise.reject(new Error('offline'))
		);

		expect(reasonFrom(adapted, sentryManifest())).toBe(
			'its sentry adapter is not loaded'
		);

		await adapted.prepare?.([sentryManifest()]);

		expect(reasonFrom(adapted, sentryManifest())).toBe(
			'its sentry adapter did not load: offline'
		);
	});

	it('accepts the manifest once the adapter loaded, and checks the rest with the runtime', async () => {
		const adapted = await adapterRuntime();

		expect(adapted.parseResolvedManifest(sentryManifest())).toEqual({
			manifest: sentryManifest(),
			ok: true,
		});
		expect(reasonFrom(adapted, { ...sentryManifest(), vendor: '' })).toBe(
			'it names no vendor'
		);
	});

	it('checks the roots of its own steps against its globals', async () => {
		const adapted = await adapterRuntime();
		const queue = { name: 'sentryQueue', type: 'setGlobal', value: [] };

		expect(
			reasonFrom(adapted, { ...sentryManifest(), setupSteps: [queue] })
		).toBe(
			'setupSteps has a setGlobal step that uses the global sentryQueue, which globals does not declare'
		);
		expect(
			reasonFrom(adapted, {
				...sentryManifest(),
				globals: ['sentryQueue'],
				setupSteps: [queue],
			})
		).toBeUndefined();
		expect(
			reasonFrom(adapted, { ...sentryManifest(), globals: undefined })
		).toEqual(expect.stringContaining('globals'));
	});

	it("refuses options the adapter's validator refuses", async () => {
		const adapted = await adapterRuntime();
		const withOptions = (overrides: Record<string, unknown>) =>
			reasonFrom(
				adapted,
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
	it('hands the script built from the rest of the manifest to the adapter', async () => {
		const adapted = await adapterRuntime();
		const script = adapted.resolvedManifestToScript(sentryManifest() as never);

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

	it('starts it in the browser only, even with an inline start for a server render', async () => {
		const build = runtime.createManifestScriptFactory(
			() => ({ code: '/* start */' }) as never
		);
		const script = vi.fn(sentry.sentryAdapter.script);
		const adapted = runtime.withAdapters(
			{ ...base(), resolvedManifestToScript: build },
			() => Promise.resolve({ ...sentry.sentryAdapter, script })
		);
		await adapted.prepare?.([sentryManifest()]);
		const { adapter: _adapter, ...plain } = sentryManifest();

		expect(
			adapted.resolvedManifestToScript(sentryManifest() as never).serverStart
		).toBeUndefined();
		// The adapter never sees the server start of the script it is handed.
		expect(script.mock.calls[0]?.[0]).not.toHaveProperty('serverStart');
		expect(build(plain as never).serverStart).toBeTypeOf('function');
	});
});

describe('withAdapters', () => {
	it('loads nothing for manifests that name no adapter, or one this SDK does not ship', () => {
		const load = vi.fn();
		const adapted = runtime.withAdapters(base(), load);

		expect(adapted.prepare?.([{ vendor: 'acme' }, null])).toBeUndefined();
		expect(
			adapted.prepare?.([sentryManifest({ id: 'acme', options: {} })])
		).toBeUndefined();
		expect(load).not.toHaveBeenCalled();
	});

	it('loads each named adapter once', async () => {
		const load = vi.fn(loadSentry);
		const adapted = runtime.withAdapters(base(), load);

		await adapted.prepare?.([sentryManifest(), sentryManifest()]);

		expect(load).toHaveBeenCalledExactlyOnceWith('sentry');
		expect(adapted.parseResolvedManifest(sentryManifest()).ok).toBe(true);
		expect(adapted.prepare?.([sentryManifest()])).toBeUndefined();
	});

	it('tries a failed load again for a later list', async () => {
		const load = vi
			.fn<(id: string) => Promise<typeof sentry.sentryAdapter>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(sentry.sentryAdapter);
		const adapted = runtime.withAdapters(base(), load);

		await adapted.prepare?.([sentryManifest()]);
		expect(adapted.parseResolvedManifest(sentryManifest()).ok).toBe(false);

		await adapted.prepare?.([sentryManifest()]);
		expect(adapted.parseResolvedManifest(sentryManifest()).ok).toBe(true);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('runs the same adapters in the runtime the earlier prepare moves to', async () => {
		const moved = vi.fn(runtime.resolvedManifestToScript);
		const load = vi.fn(loadSentry);
		const adapted = runtime.withAdapters(
			{
				...base(),
				prepare: () =>
					Promise.resolve({ ...base(), resolvedManifestToScript: moved }),
			},
			load
		);

		const next = await adapted.prepare?.([sentryManifest()]);
		next?.resolvedManifestToScript(sentryManifest() as never);

		expect(next?.parseResolvedManifest(sentryManifest()).ok).toBe(true);
		expect(moved).toHaveBeenCalledOnce();
		expect(load).toHaveBeenCalledOnce();
		// Later lists load adapters into it too.
		expect(next?.prepare).toBeTypeOf('function');
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
