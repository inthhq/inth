/**
 * The Vue side of the consent runtime.
 *
 * `@inth/sdk/engine`'s provider runtime owns behaviour: the kernel, persistence,
 * the script loader, the blockers, IAB, callbacks, the prefetch adoption
 * and teardown. This module owns expression: it turns the Vue and Nuxt
 * config into runtime options, takes the transport factory the plugin
 * chose as the runtime's `mode`, and exposes the kernel to components as
 * Vue refs. One runtime serves one app; the plugin provides it through
 * `provideVueConsentContext`.
 */
import {
	IABUnavailableError,
	initOutputToKernelConfig,
	policyNeedsIAB,
	watchRevocationReload,
} from '@inth/sdk/engine';
import type {
	ConsentSnapshot,
	HydrationRecords,
	KernelConfig,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import { createIframeBlocker } from '@inth/sdk/modules/iframe-blocker';
import { createPersistence } from '@inth/sdk/modules/persistence';
import type {
	Script,
	ScriptLoaderHandle,
} from '@inth/sdk/modules/script-loader';
import { createWindowDebug } from '@inth/sdk/modules/window-debug';
import {
	createLazyIABFactory,
	isIABConfigured,
	mountRuntimeIAB,
} from '@inth/sdk/runtime';
import type { GPPModuleLoader } from '@inth/sdk/runtime';
import { onDemandRuntimeModules } from '@inth/sdk/runtime/on-demand';
import { createConsentProviderRuntime } from '@inth/sdk/runtime/provider';
import type {
	ConsentProviderRuntime,
	ConsentRuntime,
	ConsentRuntimeModules,
	ConsentRuntimeUpdate,
	RuntimePrefetch,
} from '@inth/sdk/runtime/provider';
import type { ConsentActiveUI } from '@inth/sdk/schema/config';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import { computed, shallowRef } from 'vue';

import {
	reuseDisplayData,
	snapshotToDisplayData,
	toKernelActiveUI,
	toVueActiveUI,
} from './display-data.model';
import type { VueConsentDisplayData } from './display-data.model';
import { pickAllowedInitHeaders } from './init-headers.model';
import type {
	RuntimeConsentConfig,
	VueConsentContextOptions,
	VueConsentKernelContext,
	VueIABHost,
} from './vue-consent-kernel-context.model';
import { withRegisteredScripts } from './with-registered-scripts';

/**
 * The runtime `mode`: the test transport when one is given, otherwise the
 * factory the plugin chose.
 */
const resolveTransportFactory = function resolveTransportFactory(
	mode: ProviderTransportFactory | undefined,
	transport: KernelConfig['transport']
): ProviderTransportFactory {
	if (transport) {
		return Object.assign(() => transport, { kind: 'hosted' as const });
	}
	if (!mode) {
		throw new Error(
			"inth: pass `projectUrl`, such as `app.use(inth, { projectUrl: '/api/inth' })`, or `mode: manifest()` with `manifest` from `@inth/vue/vue-plugin`."
		);
	}
	return mode;
};

/**
 * Records the kernel starts from: the server's cookie read, then what a
 * prefetch named (a subject), then a test's own records.
 */
const mergeRecords = function mergeRecords(
	rawRecords: HydrationRecords | undefined,
	prefetched: HydrationRecords | undefined,
	explicit: HydrationRecords | undefined
): HydrationRecords | undefined {
	if (explicit) {
		return explicit;
	}
	const merged = { ...rawRecords, ...prefetched };
	return Object.keys(merged).length > 0 ? merged : undefined;
};

/**
 * Mount the IAB CMP while the resolved policy uses the `iab` model, through
 * the runtime's IAB mount (publisher options, `normalizeIABOptions`). A
 * backend can return a `cmpId` for every visitor; a visitor whose policy is
 * not IAB gets no `__tcfapi`. A policy that changes away from IAB unmounts
 * the CMP, and a new `cmpId` mounts a new one.
 */
const mountIABUnderIABPolicy: NonNullable<ConsentRuntimeModules['mountIAB']> = (
	options
) => {
	let unmount: (() => void) | null = null;
	let mountedCmpId: number | null = null;
	const sync = () => {
		const snapshot = options.kernel.getSnapshot();
		const cmpId = options.iab.cmpId ?? snapshot.iab?.cmpId;
		const next =
			snapshot.policyRule.model === 'iab' &&
			typeof cmpId === 'number' &&
			Number.isInteger(cmpId) &&
			cmpId > 0
				? cmpId
				: null;
		if (next === mountedCmpId) {
			return;
		}
		unmount?.();
		unmount = null;
		mountedCmpId = next;
		if (next !== null) {
			unmount = mountRuntimeIAB(options);
		}
	};
	sync();
	const unsubscribe = options.kernel.subscribe(sync);
	return () => {
		unsubscribe();
		unmount?.();
		unmount = null;
	};
};

/**
 * The runtime's modules for a Vue app. Persistence, the iframe blocker and
 * `window.__inthDebug` are static: stored choices apply on mount and gated frames
 * pause as soon as the app starts. The script loader, the network blocker
 * (the runtime holds matching requests until it lands), data clearing and
 * a `consentSource` connection load only for apps that configure them,
 * each as one chunk that imports nothing the first load has.
 */
const createVueRuntimeModules =
	function createVueRuntimeModules(): ConsentRuntimeModules {
		return {
			...onDemandRuntimeModules,
			createIframeBlocker,
			createPersistence,
			createWindowDebug,
			mountIAB: mountIABUnderIABPolicy,
			watchRevocationReload,
		};
	};

/**
 * Loads `@inth/sdk/iab/gpp`, only when `gpp` is set. One function for every
 * call, so passing it to the runtime's `update()` never reads as a change.
 */
const loadGPP: GPPModuleLoader = () => import('@inth/sdk/iab/gpp');

/**
 * The runtime options a Vue config maps to. Everything but `mode`,
 * `prefetch` and the IAB factory comes from the config, so a new config
 * can go through `update()` unchanged.
 */
const toRuntimeOptions = function toRuntimeOptions(
	config: RuntimeConsentConfig
): Omit<ConsentRuntimeUpdate, 'createIAB' | 'mode' | 'prefetch'> {
	return {
		callbacks: config.callbacks,
		clearOnRevocation: config.clearOnRevocation,
		consentCategories: config.consentCategories,
		consentSource: config.consentSource,
		experiment: config.experiment,
		experimentalScriptRegistry: config.experimentalScriptRegistry,
		gpp: config.gpp,
		iab: config.iab,
		iframeBlocker: config.iframeBlocker,
		loadGPP,
		networkBlocker: config.networkBlocker,
		nonce: config.nonce,
		pkg: '@inth/vue',
		presentation: config.presentation,
		reloadOnConsentRevoked: config.reloadOnConsentRevoked,
		scripts: config.scripts,
		storageConfig: config.storageConfig,
		theme: config.theme,
		user: config.user,
		userConsent: config.userConsent,
		vendors: config.vendors,
	};
};

const IAB_UNAVAILABLE_FIX: Record<VueIABHost, string> = {
	nuxt: 'Set `inth: { iab: {} }` in nuxt.config.ts, or `iab: { cmpId }` when your backend sends no CMP ID',
	vue: 'Pass `iab` to the Inth plugin, such as `app.use(inth, { iab: {} })`',
};

/**
 * The error a Vue or Nuxt app raises for an `iab` policy without `iab`.
 *
 * @internal
 */
export const createIABUnavailableError = function createIABUnavailableError(
	host: VueIABHost
): IABUnavailableError {
	return new IABUnavailableError('`iab` is not set', IAB_UNAVAILABLE_FIX[host]);
};

const throwUncaught = function throwUncaught(error: unknown): never {
	throw error;
};

/** Decides and reports when an app cannot answer for an `iab` policy. */
interface IABGuard {
	/** Whether the snapshot's policy needs a CMP the app does not mount. */
	isUnavailable: (snapshot: ConsentSnapshot) => boolean;
	/** A fresh error for this app. */
	error: () => IABUnavailableError;
	/** Report the error for the snapshot, once, in a microtask. */
	check: (snapshot: ConsentSnapshot) => void;
}

/**
 * The IAB guard for one context.
 *
 * @param lacksIAB - Whether the app owns its runtime and did not set `iab`.
 */
const createIABGuard = function createIABGuard(
	lacksIAB: boolean,
	options: Pick<VueConsentContextOptions, 'host' | 'onIABUnavailable'>
): IABGuard {
	const host = options.host ?? 'vue';
	const report = options.onIABUnavailable ?? throwUncaught;
	const isUnavailable = (snapshot: ConsentSnapshot) =>
		lacksIAB && policyNeedsIAB(snapshot);
	const error = () => createIABUnavailableError(host);
	let reported = false;
	return {
		check(snapshot) {
			if (reported || !isUnavailable(snapshot)) {
				return;
			}
			reported = true;
			const failure = error();
			// Outside the kernel's listener loop.
			queueMicrotask(() => report(failure));
		},
		error,
		isUnavailable,
	};
};

/**
 * Build the runtime for a Vue app, or wrap the one a host handed in, and
 * expose its kernel as Vue refs.
 *
 * SSR-safe: construction touches no storage and no DOM. Call
 * {@link VueConsentKernelContext.start} in the browser, after hydration
 * when there is server markup, and {@link VueConsentKernelContext.dispose}
 * when the app unmounts.
 *
 * IAB is opt-in. When the visitor's policy uses the `iab` model and the
 * snapshot carries its vendor list, only a CMP can answer for it, and the
 * app mounts one only with `iab`. Without it the context raises an
 * {@link IABUnavailableError}: thrown from here when the server render or
 * the prefetch already resolved the policy, and passed to
 * `onIABUnavailable` when the browser resolves it later. A borrowed
 * runtime's host configures IAB, so it never raises.
 *
 * @throws {IABUnavailableError} When the starting snapshot already needs
 * IAB and `iab` is not set.
 */
// oxlint-disable-next-line max-lines-per-function -- One runtime, its refs and their lifecycle.
export const createVueConsentKernelContext =
	function createVueConsentKernelContext(
		options: VueConsentContextOptions
	): VueConsentKernelContext {
		const { config } = options;
		const borrowed = options.runtime;
		let owned: ConsentProviderRuntime | undefined;
		let createIAB: ConsentRuntimeUpdate['createIAB'];
		if (!borrowed) {
			const headers = pickAllowedInitHeaders(options.headers ?? {});
			const initOutput = options.prefetch ?? config.prefetch;
			const { transport, ...kernelConfig } = options.kernelConfig ?? {};
			const initialConfig =
				options.prefetchState ?? initOutputToKernelConfig(initOutput, headers);
			const rawRecords = options.initialRecords ?? config.initialRecords;
			const prefetch: RuntimePrefetch = {
				...initialConfig,
				...kernelConfig,
				initialRecords: mergeRecords(
					rawRecords,
					initialConfig.initialRecords,
					kernelConfig.initialRecords
				),
				now:
					kernelConfig.now ??
					options.now ??
					rawRecords?.now ??
					initialConfig.now,
			};
			const runtimeOptions = toRuntimeOptions(config);
			// IAB is opt-in. A configured CMP loads `@inth/sdk/iab` on demand, once
			// a policy uses the `iab` model; without `iab` nothing imports it.
			createIAB = isIABConfigured(runtimeOptions.iab)
				? createLazyIABFactory(() => import('@inth/sdk/iab')).create
				: undefined;
			owned = createConsentProviderRuntime(
				{
					...runtimeOptions,
					createIAB,
					mode: resolveTransportFactory(options.mode, transport),
					prefetch,
				},
				createVueRuntimeModules()
			);
		}
		const runtime: ConsentRuntime = borrowed ?? (owned as ConsentRuntime);
		// No `enabled` toggle in the Vue config, so the kernel never swaps.
		const { kernel } = runtime;

		const iabGuard = createIABGuard(
			Boolean(owned) && !isIABConfigured(config.iab),
			options
		);
		// The server render and a prefetched browser start read the same
		// snapshot, so both throw here, before any surface renders.
		if (iabGuard.isUnavailable(kernel.getSnapshot())) {
			owned?.dispose();
			throw iabGuard.error();
		}

		const snapshot = shallowRef(kernel.getSnapshot());
		const iabUnavailable = computed(() =>
			iabGuard.isUnavailable(snapshot.value)
		);
		const unsubscribe = kernel.subscribe((next) => {
			snapshot.value = next;
			iabGuard.check(next);
		});
		const iab = shallowRef(runtime.iab ?? undefined);
		const unsubscribeIab = runtime.subscribe(() => {
			iab.value = runtime.iab ?? undefined;
		});

		const init = computed<VueConsentDisplayData | undefined>((previous) =>
			reuseDisplayData(snapshotToDisplayData(snapshot.value), previous)
		);
		const activeUI = computed<ConsentActiveUI>({
			get: () => toVueActiveUI(snapshot.value.activeUI),
			// Explicit navigation supersedes a pending save.
			set: (value) => showConsentSurface(kernel, toKernelActiveUI(value)),
		});
		const storedConsent = computed(() => snapshot.value.explicitChoice);

		let active = true;
		// Scripts components register. An owned runtime's loader takes them
		// with the config's own through `update()`. A borrowed runtime's
		// scripts are its host's, so the context runs its own loader on that
		// runtime's kernel, created when the first set registers.
		// Keyed per registration, not per array: two components may pass one.
		const registered = new Map<symbol, readonly Script[]>();
		let current = config;
		let borrowedLoader: ScriptLoaderHandle | null = null;
		let borrowedLoading: Promise<void> | null = null;
		const registeredScripts = (): Script[] => [...registered.values()].flat();
		const applyScripts = (): void => {
			if (owned) {
				void (async () => {
					try {
						await owned.update({
							...toRuntimeOptions(
								withRegisteredScripts(current, registered.values())
							),
							createIAB,
						});
					} catch {
						// The update chunk failed to load: the previous options stay.
					}
				})();
				return;
			}
			if (borrowedLoader) {
				borrowedLoader.updateScripts(registeredScripts());
				return;
			}
			if (borrowedLoading || typeof window === 'undefined') {
				return;
			}
			borrowedLoading = (async () => {
				try {
					const { createScriptLoader } =
						await import('@inth/sdk/modules/script-loader');
					// The host starts its runtime: persistence and privacy signals
					// apply then. A loader on the kernel before that would read a
					// snapshot a stored denial has not reached.
					// Nothing announces a start: `runtime.subscribe` reports IAB
					// changes only, and a runtime turned off starts without a
					// commit. An enabled start commits to the kernel (hydration,
					// `init:applied`), which wakes the check at once; a timer
					// covers the rest.
					if (!runtime.started) {
						await new Promise<void>((resolve) => {
							let stops: (() => void)[] = [];
							const check = () => {
								if (!(runtime.started || !active)) {
									return;
								}
								for (const stop of stops.splice(0)) {
									stop();
								}
								resolve();
							};
							const timer = setInterval(check, 50);
							stops = [
								kernel.subscribe(check),
								kernel.events.on('init:applied', check),
								() => clearInterval(timer),
							];
							check();
						});
					}
					if (!active) {
						return;
					}
					borrowedLoader = createScriptLoader({
						kernel,
						nonce: current.nonce,
						scripts: registeredScripts(),
					});
				} catch {
					// The chunk failed to load, or a script's own check threw:
					// the next registration or update tries again.
					borrowedLoading = null;
				}
			})();
		};

		return {
			activeUI,
			clearRecords: () => runtime.clearRecords(),
			dispose() {
				active = false;
				unsubscribeIab();
				unsubscribe();
				borrowedLoader?.dispose();
				borrowedLoader = null;
				// A borrowed runtime belongs to its host.
				owned?.dispose();
			},
			experimentDefinition: owned ? owned.experiment : config.experiment,
			get iab() {
				return iab.value;
			},
			set iab(handle) {
				iab.value = handle;
			},
			iabUnavailable,
			init,
			kernel,
			ownsKernel: Boolean(owned),
			ready: Promise.resolve(),
			registerScripts(scripts) {
				const token = Symbol('registered scripts');
				registered.set(token, scripts);
				applyScripts();
				return {
					dispose: () => {
						if (registered.delete(token)) {
							applyScripts();
						}
					},
					update: (next) => {
						if (!registered.has(token)) {
							return;
						}
						registered.set(token, next);
						applyScripts();
					},
				};
			},
			runtime,
			setLanguage(language) {
				runtime.setLanguage(language);
			},
			setOverrides(overrides) {
				runtime.setOverrides(overrides);
				// Before start, the first init carries them. On the server
				// nothing asks.
				if (typeof window !== 'undefined' && runtime.started) {
					void runtime.reinit();
				}
			},
			snapshot,
			start() {
				if (!owned || owned.started || !active) {
					return;
				}
				owned.start();
			},
			storedConsent,
			update(next) {
				current = next;
				applyScripts();
			},
		};
	};
