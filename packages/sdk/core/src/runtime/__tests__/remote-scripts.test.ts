/**
 * @vitest-environment jsdom
 *
 * `remoteScripts` loads the integrations a project added on the Inth
 * server, which arrive as manifests on `scriptRegistry.load`.
 */
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	matchedResolution,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import type { Script } from '../../libs/script-loader/types';
import type { ScriptLoaderDebugEvent } from '../../modules/script-loader/types';
import { rootNeedsEngine } from '../../surface-actions/plain-scripts';
import type { ProviderTransportFactory } from '../../transports/mode';
import {
	createConsentProviderRuntime,
	createConsentRuntime,
	defaultRuntimeModules,
} from '../index';
import { createConsentRuntimeWith } from '../runtime-with-modules';
import type { ConsentRuntimeOptions } from '../types';

const ACME_SRC = 'https://cdn.acme.example/pixel.js';

/** A resolved manifest as the Inth server sends it. */
const acmeManifest = (overrides: Record<string, unknown> = {}) => ({
	afterLoadSteps: [],
	bootstrapSteps: [
		{ ifUndefined: true, name: 'acmeQueue', type: 'setGlobal', value: [] },
	],
	category: 'marketing',
	kind: 'inth.vendor-manifest',
	loadScript: { async: true, src: ACME_SRC, type: 'loadScript' },
	onBeforeLoadDeniedSteps: [],
	onBeforeLoadGrantedSteps: [],
	onConsentChangeSteps: [],
	onConsentDeniedSteps: [],
	onConsentGrantedSteps: [],
	onLoadDeniedSteps: [],
	onLoadGrantedSteps: [],
	schemaVersion: 1,
	setupSteps: [
		{ args: ['init', 'ACME-1'], global: 'acmeQueue', type: 'callGlobal' },
		{ queue: 'acmeQueue', type: 'pushToQueue', value: ['init', 'ACME-1'] },
	],
	vendor: 'acme-pixel',
	vendorDetails: {
		name: 'Acme Pixel',
		privacyPolicyUrl: 'https://acme.example/privacy',
	},
	...overrides,
});

const load = (manifest = acmeManifest()) => [
	{ id: 'acme-pixel', integration: 'acmePixel', manifest },
];

const tags = (src = ACME_SRC) =>
	document.head.querySelectorAll(`script[src="${src}"]`);

const quietMode = transportMode({
	init: () => Promise.resolve({}),
	save: () => Promise.resolve({ ok: true }),
});

const initMode = (answer: () => Promise<Record<string, unknown>>) =>
	transportMode({
		init: answer as never,
		save: () => Promise.resolve({ ok: true }),
	});

/** Consent management off, so every script may load at once. */
const startOff = (
	options: Omit<ConsentRuntimeOptions, 'enabled' | 'mode'> & {
		mode?: ProviderTransportFactory;
	}
) => {
	const runtime = createConsentRuntime({
		enabled: false as const,
		mode: quietMode,
		persistence: false,
		...options,
	});
	runtime.start();
	return runtime;
};

afterEach(() => {
	document.head.innerHTML = '';
	delete (window as { acmeQueue?: unknown }).acmeQueue;
	delete (window as { __inthDebug?: unknown }).__inthDebug;
});

describe('remoteScripts', () => {
	test('loads a listed integration with no script in code, and runs its setup', async () => {
		const runtime = startOff({
			prefetch: { initialScriptRegistry: { load: load() } },
			remoteScripts: true,
		});

		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		expect((window as { acmeQueue?: unknown[] }).acmeQueue).toEqual([
			['init', 'ACME-1'],
		]);
		runtime.dispose();
		expect(tags()).toHaveLength(0);
	});

	test('loads nothing when the site leaves it off', async () => {
		const runtime = startOff({
			prefetch: { initialScriptRegistry: { load: load() } },
		});

		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
		expect(tags()).toHaveLength(0);
		runtime.dispose();
	});

	test('skips an entry a script in code already loads', async () => {
		const onDebug = vi.fn<(event: ScriptLoaderDebugEvent) => void>();
		const codeSetup = vi.fn();
		const code: Script = {
			category: 'marketing',
			id: 'my-acme',
			integration: 'acme-pixel',
			onBeforeLoad: codeSetup,
			src: 'https://cdn.acme.example/own-copy.js',
		};
		const runtime = startOff({
			prefetch: { initialScriptRegistry: { load: load() } },
			remoteScripts: true,
			scriptLoader: { onDebug },
			scripts: [code],
		});

		await vi.waitFor(() =>
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'skipped',
					message: expect.stringContaining('code wins'),
					scriptId: 'acme-pixel',
				})
			)
		);
		expect(tags('https://cdn.acme.example/own-copy.js')).toHaveLength(1);
		expect(tags()).toHaveLength(0);
		expect(codeSetup).toHaveBeenCalledOnce();
		runtime.dispose();
	});

	test.each([
		[
			'a step type the runtime does not know',
			acmeManifest({ setupSteps: [{ code: 'x', type: 'runInlineCode' }] }),
			'runInlineCode',
		],
		[
			'a script that is not https',
			acmeManifest({
				loadScript: { src: '//cdn.acme.example/pixel.js', type: 'loadScript' },
			}),
			'https',
		],
	])(
		'refuses a manifest with %s and reports it',
		async (_label, manifest, reason) => {
			const onDebug = vi.fn<(event: ScriptLoaderDebugEvent) => void>();
			const runtime = startOff({
				prefetch: { initialScriptRegistry: { load: load(manifest) } },
				remoteScripts: true,
				scriptLoader: { onDebug },
			});

			await vi.waitFor(() =>
				expect(onDebug).toHaveBeenCalledWith(
					expect.objectContaining({
						action: 'error',
						message: expect.stringContaining(reason),
						scriptId: 'acme-pixel',
					})
				)
			);
			expect(document.head.querySelectorAll('script')).toHaveLength(0);
			expect((window as { acmeQueue?: unknown }).acmeQueue).toBeUndefined();
			runtime.dispose();
		}
	);

	test.each([
		['a manifest for another vendor', { ...load()[0], id: 'other-pixel' }],
		[
			'a category Inth does not know',
			{ ...load()[0], manifest: acmeManifest({ category: 'advertising' }) },
		],
		['no manifest', { id: 'acme-pixel', integration: 'acmePixel' }],
	])('refuses an entry with %s', async (_label, entry) => {
		const onDebug = vi.fn<(event: ScriptLoaderDebugEvent) => void>();
		const runtime = startOff({
			prefetch: { initialScriptRegistry: { load: [entry] as never } },
			remoteScripts: true,
			scriptLoader: { onDebug },
		});

		await vi.waitFor(() =>
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'error' })
			)
		);
		expect(document.head.querySelectorAll('script')).toHaveLength(0);
		expect(runtime.kernel.getSnapshot().consentCategories ?? []).not.toContain(
			'advertising'
		);
		runtime.dispose();
	});

	test('declares the category and vendor before the manifest runtime loads', () => {
		const runtime = createConsentRuntimeWith(
			{
				mode: quietMode,
				persistence: false,
				prefetch: {
					initialPolicyPending: false,
					initialPolicyResolution: matchedResolution(
						optInRule({ id: 'opt-in' })
					),
					initialScriptRegistry: { load: load() },
				},
				remoteScripts: true,
			},
			{
				...defaultRuntimeModules,
				// Never loads, so only the JSON can have declared anything.
				loadManifestRuntime: () =>
					new Promise(() => {
						// Never settles.
					}),
			}
		);
		runtime.start();

		const snapshot = runtime.kernel.getSnapshot();
		expect(snapshot.consentCategories).toContain('marketing');
		expect(snapshot.vendors?.declared).toContainEqual(
			expect.objectContaining({ id: 'acme-pixel', name: 'Acme Pixel' })
		);
		runtime.dispose();
	});

	test('waits for consent like a script in code', async () => {
		const runtime = createConsentRuntime({
			mode: initMode(() =>
				Promise.resolve({
					policyResolution: {
						...matchedResolution(optInRule({ id: 'opt-in' })),
						version: 1,
					},
					scriptRegistry: { load: load() },
				})
			),
			persistence: false,
			remoteScripts: true,
		});
		runtime.start();
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
		expect(tags()).toHaveLength(0);

		await runtime.kernel.commands.save('all');

		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		runtime.dispose();
	});

	test('removes the script when a later init sends an empty list', async () => {
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const runtime = createConsentRuntime({
			enabled: true,
			mode: initMode(() => answer.promise),
			persistence: false,
			prefetch: {
				initialPolicyPending: true,
				initialPolicyResolution: matchedResolution(optInRule({ id: 'opt-in' })),
				initialScriptRegistry: {
					load: load(acmeManifest({ alwaysLoad: true })),
				},
			},
			remoteScripts: true,
		});
		runtime.start();
		// A cached list loads while init is pending.
		await vi.waitFor(() => expect(tags()).toHaveLength(1));

		answer.resolve({ scriptRegistry: { load: [] } });

		await vi.waitFor(() => expect(tags()).toHaveLength(0));
		runtime.dispose();
	});

	test('keeps the list it had when init says the registry is unavailable', async () => {
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const runtime = createConsentRuntime({
			mode: initMode(() => answer.promise),
			persistence: false,
			prefetch: {
				initialPolicyPending: true,
				initialPolicyResolution: matchedResolution(optInRule({ id: 'opt-in' })),
				initialScriptRegistry: {
					load: load(acmeManifest({ alwaysLoad: true })),
				},
			},
			remoteScripts: true,
		});
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));

		answer.resolve({ scriptRegistry: { unavailable: true } });

		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
		expect(tags()).toHaveLength(1);
		expect(runtime.kernel.getSnapshot().scriptRegistry?.load).toHaveLength(1);
		runtime.dispose();
	});

	test('replaces the remote copy with a fresh lifecycle when code adds the same integration', async () => {
		const options = {
			enabled: false,
			mode: quietMode,
			persistence: false,
			prefetch: { initialScriptRegistry: { load: load() } },
			remoteScripts: true,
		} satisfies Parameters<typeof createConsentProviderRuntime>[0];
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));

		const codeSetup = vi.fn();
		await runtime.update({
			...options,
			scripts: [
				{
					// The same resource as the remote copy: only the origin differs.
					async: true,
					category: 'marketing',
					id: 'acme-pixel',
					onBeforeLoad: codeSetup,
					src: ACME_SRC,
					vendor: 'acme-pixel',
				},
			],
		});

		// Same file, but the code script's own setup runs.
		await vi.waitFor(() => expect(codeSetup).toHaveBeenCalledOnce());
		expect(tags()).toHaveLength(1);

		// With the code script gone, the remote entry mounts again.
		await runtime.update({ ...options, scripts: [] });
		await vi.waitFor(() =>
			expect((window as { acmeQueue?: unknown[] }).acmeQueue).toBeDefined()
		);
		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		runtime.dispose();
	});

	test('applies a registry pin only when its upstream URL is the manifest URL', async () => {
		const pinned = 'https://acme.inth.app/scripts/pixel@abc.js';
		const pin = (upstreamUrl: string) =>
			startOff({
				experimentalScriptRegistry: true,
				prefetch: {
					initialPolicyPending: false,
					initialScriptRegistry: {
						load: load(),
						sources: {
							'acme-pixel': {
								integrity: 'sha384-abc',
								src: pinned,
								upstreamUrl,
							},
						},
					},
				},
				remoteScripts: true,
			});

		const matching = pin(ACME_SRC);
		await vi.waitFor(() => expect(tags(pinned)).toHaveLength(1));
		matching.dispose();
		document.head.innerHTML = '';

		const other = pin('https://eu.acme.example/pixel.js');
		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		expect(tags(pinned)).toHaveLength(0);
		other.dispose();
	});

	test('never runs an entry that the answer granting its category also removes', async () => {
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const runtime = createConsentRuntime({
			mode: initMode(() => answer.promise),
			persistence: false,
			prefetch: {
				initialPolicyPending: true,
				initialPolicyResolution: matchedResolution(optInRule({ id: 'opt-in' })),
				initialScriptRegistry: { load: load() },
			},
			remoteScripts: true,
		});
		runtime.start();
		// The cached entry is built, and waits for marketing.
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(tags()).toHaveLength(0);

		// One answer grants marketing (opt-out) and drops the entry.
		answer.resolve({
			policyResolution: {
				...matchedResolution(optOutRule({ id: 'opt-out' })),
				version: 1,
			},
			scriptRegistry: { load: [] },
		});
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect((window as { acmeQueue?: unknown }).acmeQueue).toBeUndefined();
		expect(tags()).toHaveLength(0);
		runtime.dispose();
	});

	test('never runs a cached entry the registry waits on when init drops it', async () => {
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const runtime = createConsentRuntime({
			experimentalScriptRegistry: true,
			mode: initMode(() => answer.promise),
			persistence: false,
			prefetch: {
				initialPolicyPending: true,
				initialPolicyResolution: matchedResolution(optInRule({ id: 'opt-in' })),
				initialScriptRegistry: {
					load: load(acmeManifest({ alwaysLoad: true })),
				},
			},
			remoteScripts: true,
		});
		runtime.start();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		// It waits for the registry's list.
		expect(tags()).toHaveLength(0);

		answer.resolve({ scriptRegistry: { load: [] } });

		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect((window as { acmeQueue?: unknown }).acmeQueue).toBeUndefined();
		expect(tags()).toHaveLength(0);
		runtime.dispose();
	});

	test('skips an entry whose id a code script uses, whatever its vendor', async () => {
		const onDebug = vi.fn<(event: ScriptLoaderDebugEvent) => void>();
		const runtime = startOff({
			prefetch: { initialScriptRegistry: { load: load() } },
			remoteScripts: true,
			scriptLoader: { onDebug },
			scripts: [
				{
					category: 'marketing',
					id: 'acme-pixel',
					src: 'https://cdn.acme.example/own-copy.js',
					vendor: 'acme-legacy',
				},
			],
		});

		await vi.waitFor(() =>
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'skipped', scriptId: 'acme-pixel' })
			)
		);
		expect(tags()).toHaveLength(0);
		expect(tags('https://cdn.acme.example/own-copy.js')).toHaveLength(1);
		runtime.dispose();
	});

	test('needs the engine from the first render of a root', () => {
		expect(rootNeedsEngine({ options: { remoteScripts: true } })).toBe(true);
		expect(rootNeedsEngine({ options: {} })).toBe(false);
	});
});
