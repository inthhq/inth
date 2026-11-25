/**
 * @vitest-environment jsdom
 *
 * `remoteScripts` loads the integrations a project added on the Inth
 * server, which arrive as manifests on `scriptRegistry.load`.
 */
import {
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import {
	matchedResolution,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import { MANIFEST_RUNTIME_LEVEL } from '../../manifest-runtime/level';
import type { ScriptLoaderDebugEvent } from '../../modules/script-loader/types';
import { rootNeedsEngine } from '../../surface-actions/plain-scripts';
import type { ProviderTransportFactory } from '../../transports/mode';
import {
	createConsentProviderRuntime,
	createConsentRuntime as createRuntime,
	defaultRuntimeModules,
} from '../index';
import { createConsentRuntimeWith as createRuntimeWith } from '../runtime-with-modules';
import type { ConsentRuntime, ConsentRuntimeOptions } from '../types';

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

/**
 * Runtimes a test made and has not disposed. A test that fails before its
 * own `dispose()` leaves one running, and its late tags would fail the next
 * tests, so `afterEach` disposes what is left.
 */
const live = new Set<ConsentRuntime>();
const track = (runtime: ConsentRuntime): ConsentRuntime => {
	const { dispose } = runtime;
	live.add(runtime);
	runtime.dispose = () => {
		live.delete(runtime);
		dispose();
	};
	return runtime;
};
const createConsentRuntime = (...args: Parameters<typeof createRuntime>) =>
	track(createRuntime(...args));
const createConsentRuntimeWith = (
	...args: Parameters<typeof createRuntimeWith>
) => track(createRuntimeWith(...args));

// The first test would otherwise pay for the cold import of the manifest
// runtime inside its one-second wait.
beforeAll(async () => {
	await import('../../manifest-runtime/index');
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
	for (const runtime of live) {
		runtime.dispose();
	}
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

	test('skips an entry a script in code already loads when its built script has another ID', async () => {
		vi.resetModules();
		const base = await import('../../manifest-runtime/index');
		const onDebug = vi.fn<(event: ScriptLoaderDebugEvent) => void>();
		const code: Script = {
			category: 'marketing',
			id: 'acme-pixel',
			src: 'https://cdn.acme.example/own-copy.js',
		};
		const runtime = createConsentRuntimeWith(
			{
				enabled: false as const,
				mode: quietMode,
				persistence: false,
				prefetch: {
					initialScriptRegistry: {
						load: load(acmeManifest({ alwaysLoad: true })),
					},
				},
				remoteScripts: true,
				scriptLoader: { onDebug },
				scripts: [code],
			},
			{
				...defaultRuntimeModules,
				// Registers under its own ID, as Default Forms' adapter does.
				loadManifestRuntime: () =>
					Promise.resolve({
						...base,
						resolvedManifestToScript: (manifest) => {
							const script = base.resolvedManifestToScript(manifest);
							return { ...script, id: `${script.id}-sdk` };
						},
					}),
			}
		);
		runtime.start();

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

	test('skips an entry whose manifest requires a later runtime level, before declaring anything', async () => {
		const onDebug = vi.fn<(event: ScriptLoaderDebugEvent) => void>();
		const runtime = createConsentRuntimeWith(
			{
				mode: quietMode,
				persistence: false,
				prefetch: {
					initialPolicyPending: false,
					initialPolicyResolution: matchedResolution(
						optInRule({ id: 'opt-in' })
					),
					initialScriptRegistry: {
						load: load(
							acmeManifest({
								category: 'experience',
								requires: MANIFEST_RUNTIME_LEVEL + 1,
							})
						),
					},
				},
				remoteScripts: true,
				scriptLoader: { onDebug },
			},
			defaultRuntimeModules
		);
		runtime.start();

		const snapshot = runtime.kernel.getSnapshot();
		expect(snapshot.consentCategories ?? []).not.toContain('experience');
		expect(snapshot.vendors?.declared ?? []).not.toContainEqual(
			expect.objectContaining({ id: 'acme-pixel' })
		);
		await vi.waitFor(() =>
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'error',
					message: expect.stringContaining('runtime level'),
					scriptId: 'acme-pixel',
				})
			)
		);
		expect(document.head.querySelectorAll('script')).toHaveLength(0);
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

	test('keeps the running setup when a later init changes a manifest but not its file, as a rerendered helper does', async () => {
		const withAccount = (account: string) =>
			load(
				acmeManifest({
					alwaysLoad: true,
					setupSteps: [
						{
							queue: 'acmeQueue',
							type: 'pushToQueue',
							value: ['init', account],
						},
					],
				})
			);
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const runtime = createConsentRuntime({
			enabled: true,
			mode: initMode(() => answer.promise),
			persistence: false,
			prefetch: {
				initialPolicyPending: true,
				initialPolicyResolution: matchedResolution(optInRule({ id: 'opt-in' })),
				initialScriptRegistry: { load: withAccount('ACME-OLD') },
			},
			remoteScripts: true,
		});
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));

		const [tag] = tags();

		answer.resolve({ scriptRegistry: { load: withAccount('ACME-NEW') } });
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		const queue = (window as { acmeQueue?: unknown[] }).acmeQueue;
		expect(queue).toContainEqual(['init', 'ACME-OLD']);
		expect(queue).not.toContainEqual(['init', 'ACME-NEW']);
		expect(tags()).toHaveLength(1);
		expect(tags()[0]).toBe(tag);
		runtime.dispose();
	});

	test('keeps the running script when a later init changes only its category', async () => {
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const runtime = createConsentRuntime({
			enabled: true,
			mode: initMode(() => answer.promise),
			persistence: false,
			prefetch: {
				initialPolicyPending: true,
				// Opt-out allows every category, so both lists' categories hold.
				initialPolicyResolution: matchedResolution(
					optOutRule({ id: 'opt-out' })
				),
				initialScriptRegistry: {
					load: load(acmeManifest({ category: 'measurement' })),
				},
			},
			remoteScripts: true,
		});
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		const [tag] = tags();

		answer.resolve({
			policyResolution: {
				...matchedResolution(optOutRule({ id: 'opt-out' })),
				version: 1,
			},
			scriptRegistry: { load: load(acmeManifest({ category: 'marketing' })) },
		});
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		expect(tags()).toHaveLength(1);
		expect(tags()[0]).toBe(tag);
		expect(
			(window as { acmeQueue?: unknown[] }).acmeQueue?.filter(
				(item) => JSON.stringify(item) === JSON.stringify(['init', 'ACME-1'])
			)
		).toHaveLength(1);
		runtime.dispose();
	});

	test('keeps a started script whose rebuilt script has its own disposer when a later init changes its manifest', async () => {
		vi.resetModules();
		const base = await import('../../manifest-runtime/index');
		const disposed = vi.fn();
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const withAccount = (account: string) =>
			load(
				acmeManifest({
					alwaysLoad: true,
					setupSteps: [
						{
							queue: 'acmeQueue',
							type: 'pushToQueue',
							value: ['init', account],
						},
					],
				})
			);
		const runtime = createConsentRuntimeWith(
			{
				enabled: true,
				mode: initMode(() => answer.promise),
				persistence: false,
				prefetch: {
					initialPolicyPending: true,
					initialPolicyResolution: matchedResolution(
						optInRule({ id: 'opt-in' })
					),
					initialScriptRegistry: { load: withAccount('ACME-OLD') },
				},
				remoteScripts: true,
			},
			{
				...defaultRuntimeModules,
				// Each build gets its own disposer, as an adapter's script does.
				loadManifestRuntime: () =>
					Promise.resolve({
						...base,
						resolvedManifestToScript: (manifest) => ({
							...base.resolvedManifestToScript(manifest),
							onDispose: () => {
								disposed();
							},
						}),
					}),
			}
		);
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		const [tag] = tags();

		answer.resolve({ scriptRegistry: { load: withAccount('ACME-NEW') } });
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		expect(disposed).not.toHaveBeenCalled();
		expect(tags()).toHaveLength(1);
		expect(tags()[0]).toBe(tag);
		expect((window as { acmeQueue?: unknown[] }).acmeQueue).not.toContainEqual([
			'init',
			'ACME-NEW',
		]);
		runtime.dispose();
	});

	test('keeps a started script registered under an ID other than its entry when a later init changes its manifest', async () => {
		vi.resetModules();
		const base = await import('../../manifest-runtime/index');
		const disposed = vi.fn();
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const withAccount = (account: string) =>
			load(
				acmeManifest({
					alwaysLoad: true,
					setupSteps: [
						{
							queue: 'acmeQueue',
							type: 'pushToQueue',
							value: ['init', account],
						},
					],
				})
			);
		const runtime = createConsentRuntimeWith(
			{
				enabled: true,
				mode: initMode(() => answer.promise),
				persistence: false,
				prefetch: {
					initialPolicyPending: true,
					initialPolicyResolution: matchedResolution(
						optInRule({ id: 'opt-in' })
					),
					initialScriptRegistry: { load: withAccount('ACME-OLD') },
				},
				remoteScripts: true,
			},
			{
				...defaultRuntimeModules,
				// Registers under its own ID, as Default Forms' adapter does.
				loadManifestRuntime: () =>
					Promise.resolve({
						...base,
						resolvedManifestToScript: (manifest) => {
							const script = base.resolvedManifestToScript(manifest);
							return {
								...script,
								id: `${script.id}-sdk`,
								onDispose: () => {
									disposed();
								},
							};
						},
					}),
			}
		);
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		const [tag] = tags();

		answer.resolve({ scriptRegistry: { load: withAccount('ACME-NEW') } });
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		expect(disposed).not.toHaveBeenCalled();
		expect(tags()[0]).toBe(tag);
		runtime.dispose();
	});

	test('does not keep a skipped entry because a code script with its ID started', async () => {
		const onDebug = vi.fn<(event: ScriptLoaderDebugEvent) => void>();
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const withAccount = (account: string, overrides = {}) =>
			load(
				acmeManifest({
					setupSteps: [
						{
							queue: 'acmeQueue',
							type: 'pushToQueue',
							value: ['init', account],
						},
					],
					...overrides,
				})
			);
		const options = {
			enabled: true,
			mode: initMode(() => answer.promise),
			persistence: false,
			prefetch: {
				initialPolicyPending: true,
				initialPolicyResolution: matchedResolution(optInRule({ id: 'opt-in' })),
				initialScriptRegistry: {
					load: withAccount('ACME-OLD', { alwaysLoad: true }),
				},
			},
			remoteScripts: true,
			scriptLoader: { onDebug },
		} satisfies Parameters<typeof createConsentProviderRuntime>[0];
		const runtime = createConsentProviderRuntime(
			{
				...options,
				scripts: [
					{
						alwaysLoad: true,
						category: 'marketing',
						id: 'acme-pixel',
						src: 'https://cdn.acme.example/own-copy.js',
					},
				],
			},
			defaultRuntimeModules
		);
		runtime.start();
		await vi.waitFor(() =>
			expect(tags('https://cdn.acme.example/own-copy.js')).toHaveLength(1)
		);
		// The server entry was built and skipped: code wins.
		await vi.waitFor(() =>
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'skipped', scriptId: 'acme-pixel' })
			)
		);

		// The new list waits for marketing, which opt-in denies.
		answer.resolve({ scriptRegistry: { load: withAccount('ACME-NEW') } });
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await runtime.update({ ...options, scripts: [] });
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		expect(tags()).toHaveLength(0);
		expect(
			(window as { acmeQueue?: unknown[] }).acmeQueue ?? []
		).not.toContainEqual(['init', 'ACME-OLD']);
		runtime.dispose();
	});

	test('shares one script between two runtimes that list the same entry, so one denial holds for both', async () => {
		vi.resetModules();
		const base = await import('../../manifest-runtime/index');
		const seen: { hasConsent: boolean; registrations: number }[] = [];
		const modules = {
			...defaultRuntimeModules,
			loadManifestRuntime: () =>
				Promise.resolve({
					...base,
					resolvedManifestToScript: (
						manifest: Parameters<typeof base.resolvedManifestToScript>[0]
					) => {
						const script = base.resolvedManifestToScript(manifest);
						const record = (info: ScriptCallbackInfo) => {
							seen.push({
								hasConsent: info.hasConsent,
								registrations: info.registrations?.length ?? 1,
							});
						};
						return {
							...script,
							onConsentChange: record,
							onLoad: record,
						};
					},
				}),
		};
		const start = (rule: ReturnType<typeof optInRule>) => {
			const runtime = createConsentRuntimeWith(
				{
					enabled: true,
					// Init never answers, so each keeps its prefetched policy.
					mode: initMode(
						() =>
							new Promise(() => {
								// Never settles.
							})
					),
					persistence: false,
					prefetch: {
						initialPolicyPending: false,
						initialPolicyResolution: matchedResolution(rule),
						// Loads before a choice, so the runtime that denies it registers
						// too, as Adobe Target's script does.
						initialScriptRegistry: {
							load: load(acmeManifest({ alwaysLoad: true })),
						},
					},
					remoteScripts: true,
				},
				modules
			);
			runtime.start();
			return runtime;
		};
		// Opt-out allows marketing; opt-in denies it until a choice.
		const allows = start(optOutRule({ id: 'opt-out' }));
		const denies = start(optInRule({ id: 'opt-in' }));
		expect(allows.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		expect(denies.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		tags()[0]?.dispatchEvent(new Event('load'));
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		expect(tags()).toHaveLength(1);
		expect(seen.length).toBeGreaterThan(0);
		expect(seen.at(-1)).toEqual({ hasConsent: false, registrations: 2 });

		await denies.kernel.commands.save('all');
		await vi.waitFor(() =>
			expect(seen.at(-1)).toEqual({ hasConsent: true, registrations: 2 })
		);
		allows.dispose();
		denies.dispose();
	});

	test('gives a remote script no other loader shares its own consents and registration', async () => {
		vi.resetModules();
		const base = await import('../../manifest-runtime/index');
		const seen: {
			consents: Record<string, boolean>;
			hasConsent: boolean;
			registration: symbol | undefined;
		}[] = [];
		const disposedWith: (symbol | undefined)[] = [];
		const runtime = createConsentRuntimeWith(
			{
				enabled: true,
				mode: initMode(
					() =>
						new Promise(() => {
							// Never settles.
						})
				),
				persistence: false,
				prefetch: {
					initialPolicyPending: false,
					initialPolicyResolution: matchedResolution(
						optInRule({ id: 'opt-in' })
					),
					initialScriptRegistry: {
						load: load(
							acmeManifest({ alwaysLoad: true, category: 'measurement' })
						),
					},
				},
				remoteScripts: true,
			},
			{
				...defaultRuntimeModules,
				loadManifestRuntime: () =>
					Promise.resolve({
						...base,
						resolvedManifestToScript: (
							manifest: Parameters<typeof base.resolvedManifestToScript>[0]
						) => ({
							...base.resolvedManifestToScript(manifest),
							onConsentChange: (info: ScriptCallbackInfo) => {
								seen.push({
									consents: { ...info.consents },
									hasConsent: info.hasConsent,
									registration: info.registration,
								});
							},
							onDispose: (info: ScriptCallbackInfo) => {
								disposedWith.push(info.registration);
							},
						}),
					}),
			}
		);
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));

		// Marketing allowed, its own category (measurement) still denied.
		await runtime.kernel.commands.save({ marketing: true });
		await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
		const last = seen.at(-1);
		expect(last?.hasConsent).toBe(false);
		expect(last?.consents.marketing).toBe(true);
		expect(typeof last?.registration).toBe('symbol');

		runtime.dispose();
		expect(disposedWith).toEqual([last?.registration]);
	});

	test('keeps a started callback-only script when a later init changes only its category to one still allowed', async () => {
		vi.resetModules();
		const base = await import('../../manifest-runtime/index');
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const consentSeen: boolean[] = [];
		const starts = vi.fn();
		const disposed = vi.fn();
		const runtime = createConsentRuntimeWith(
			{
				enabled: true,
				mode: initMode(() => answer.promise),
				persistence: false,
				prefetch: {
					initialPolicyPending: true,
					// Opt-out allows every category, so both lists' categories hold.
					initialPolicyResolution: matchedResolution(
						optOutRule({ id: 'opt-out' })
					),
					initialScriptRegistry: {
						load: load(acmeManifest({ category: 'measurement' })),
					},
				},
				remoteScripts: true,
			},
			{
				...defaultRuntimeModules,
				// A callback-only script with its own disposer, as Zaraz's is.
				loadManifestRuntime: () =>
					Promise.resolve({
						...base,
						resolvedManifestToScript: (
							manifest: Parameters<typeof base.resolvedManifestToScript>[0]
						) => {
							const { src: _src, ...script } =
								base.resolvedManifestToScript(manifest);
							return {
								...script,
								callbackOnly: true,
								onBeforeLoad: starts,
								onConsentChange: (info: ScriptCallbackInfo) => {
									consentSeen.push(info.hasConsent);
								},
								onDispose: disposed,
							};
						},
					}),
			}
		);
		runtime.start();
		await vi.waitFor(() => expect(starts).toHaveBeenCalledOnce());

		answer.resolve({
			policyResolution: {
				...matchedResolution(optOutRule({ id: 'opt-out' })),
				version: 1,
			},
			scriptRegistry: {
				load: load(acmeManifest({ category: 'marketing' })),
			},
		});
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		expect(disposed).not.toHaveBeenCalled();
		expect(starts).toHaveBeenCalledOnce();
		expect(consentSeen).not.toContain(false);
		runtime.dispose();
	});

	test('stops a running script when a later init moves it to a denied category', async () => {
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const runtime = createConsentRuntime({
			enabled: true,
			mode: initMode(() => answer.promise),
			persistence: false,
			prefetch: {
				initialPolicyPending: true,
				initialPolicyResolution: matchedResolution(
					optOutRule({ id: 'opt-out' })
				),
				initialScriptRegistry: {
					load: load(acmeManifest({ category: 'measurement' })),
				},
			},
			reloadOnConsentRevoked: false,
			remoteScripts: true,
		});
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		await runtime.kernel.commands.save({
			marketing: false,
			measurement: true,
		});

		answer.resolve({
			policyResolution: {
				...matchedResolution(optOutRule({ id: 'opt-out' })),
				version: 1,
			},
			scriptRegistry: { load: load(acmeManifest({ category: 'marketing' })) },
		});

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

	test('starts from the cached list when its own init says the registry is unavailable', async () => {
		const runtime = createConsentRuntimeWith(
			{
				mode: initMode(() =>
					Promise.resolve({
						policyResolution: {
							...matchedResolution(optOutRule({ id: 'opt-out' })),
							version: 1,
						},
						scriptRegistry: { unavailable: true },
					})
				),
				persistence: false,
				remoteScripts: true,
			},
			{
				...defaultRuntimeModules,
				readCachedScriptRegistry: () => ({ load: load() }),
			}
		);
		runtime.start();

		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		expect(runtime.kernel.getSnapshot().scriptRegistry?.load).toHaveLength(1);
		runtime.dispose();
	});

	test('keeps the list it holds over the cached one when init says unavailable', async () => {
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const cached = vi.fn(() => ({ load: [] }));
		const runtime = createConsentRuntimeWith(
			{
				mode: initMode(() => answer.promise),
				persistence: false,
				prefetch: {
					initialPolicyPending: true,
					initialPolicyResolution: matchedResolution(
						optInRule({ id: 'opt-in' })
					),
					initialScriptRegistry: {
						load: load(acmeManifest({ alwaysLoad: true })),
					},
				},
				remoteScripts: true,
			},
			{ ...defaultRuntimeModules, readCachedScriptRegistry: cached }
		);
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));

		answer.resolve({ scriptRegistry: { unavailable: true } });

		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		expect(runtime.kernel.getSnapshot().scriptRegistry?.load).toHaveLength(1);
		expect(tags()).toHaveLength(1);
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
		const queue = () => (window as { acmeQueue?: unknown[] }).acmeQueue ?? [];
		const remoteSetups = queue().length;
		expect(remoteSetups).toBeGreaterThan(0);

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

		// With the code script gone, the remote entry mounts again and runs
		// its setup a second time.
		await runtime.update({ ...options, scripts: [] });
		await vi.waitFor(() =>
			expect(queue().length).toBeGreaterThan(remoteSetups)
		);
		await vi.waitFor(() => expect(tags()).toHaveLength(1));
		runtime.dispose();
	});

	test('forgets a code update that failed validation, so a later list still applies', async () => {
		const answer = Promise.withResolvers<Record<string, unknown>>();
		const options = {
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
		} satisfies Parameters<typeof createConsentProviderRuntime>[0];
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		runtime.start();
		await vi.waitFor(() => expect(tags()).toHaveLength(1));

		// Code claims the remote entry with a script whose check fails.
		await Promise.resolve(
			runtime.update({
				...options,
				scripts: [
					{
						category: 'marketing',
						id: 'acme-pixel',
						src: ACME_SRC,
						validate: () => {
							throw new Error('rejected');
						},
					},
				],
			})
		).catch(() => undefined);

		// The server then drops the entry.
		answer.resolve({ scriptRegistry: { load: [] } });

		await vi.waitFor(() => expect(tags()).toHaveLength(0));
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

	const otherEntry = {
		id: 'other-pixel',
		integration: 'otherPixel',
		manifest: acmeManifest({
			bootstrapSteps: [],
			loadScript: {
				async: true,
				src: 'https://cdn.other.example/pixel.js',
				type: 'loadScript',
			},
			setupSteps: [],
			vendor: 'other-pixel',
			vendorDetails: {
				name: 'Other Pixel',
				privacyPolicyUrl: 'https://other.example/privacy',
			},
		}),
	};

	test.each([
		['drops it', []],
		// Declaring the new vendor commits a snapshot of its own, which
		// reconciles before the new list is applied unless it already is.
		['swaps it for another', [otherEntry]],
	])(
		'never runs an entry that the answer granting its category %s',
		async (_label, nextLoad) => {
			const answer = Promise.withResolvers<Record<string, unknown>>();
			const runtime = createConsentRuntime({
				mode: initMode(() => answer.promise),
				persistence: false,
				prefetch: {
					initialPolicyPending: true,
					initialPolicyResolution: matchedResolution(
						optInRule({ id: 'opt-in' })
					),
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
				scriptRegistry: { load: nextLoad },
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
		}
	);

	test.each([
		['drops it', []],
		['swaps it for another', [otherEntry]],
	])(
		'never runs a cached entry the registry waits on when init %s',
		async (_label, nextLoad) => {
			const answer = Promise.withResolvers<Record<string, unknown>>();
			const runtime = createConsentRuntime({
				experimentalScriptRegistry: true,
				mode: initMode(() => answer.promise),
				persistence: false,
				prefetch: {
					initialPolicyPending: true,
					initialPolicyResolution: matchedResolution(
						optInRule({ id: 'opt-in' })
					),
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

			answer.resolve({ scriptRegistry: { load: nextLoad } });

			await vi.waitFor(() =>
				expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
			);
			await new Promise((resolve) => {
				setTimeout(resolve, 20);
			});
			expect((window as { acmeQueue?: unknown }).acmeQueue).toBeUndefined();
			expect(tags()).toHaveLength(0);
			runtime.dispose();
		}
	);

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
