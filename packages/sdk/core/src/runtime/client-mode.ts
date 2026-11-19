import { isProductionBuild } from '../libs/is-production';
/**
 * `@inth/sdk/runtime/client-mode` — turn a consent mode into the transport
 * a server-framework client root uses, keeping every path that page doesn't
 * run out of its first-load JavaScript.
 *
 * Server-framework packages (Next.js, TanStack Start, Nuxt, Astro and
 * SvelteKit) resolve the visitor's state on the server and render the
 * banner with it, so the browser usually never runs init. What first load
 * needs is what a save needs:
 *
 * - `hosted()` and `manifest()` (the default) resolved on the server
 *   statically include only the hosted record transport and the
 *   init-request builder. A re-init loads the hosted transport with
 *   `import()` and sends its first `/init` alongside the chunk request.
 * - `manifest({ resolve: 'browser' })` loads the browser resolver with
 *   `import()`, starting when the transport is built, alongside the
 *   manifest request.
 * - `testing()` from a `/testing` entry loads its transport and the
 *   policy pack with `import()` on first init.
 *
 * No path here statically imports the resolver, a policy pack, the server
 * snapshot or any translation.
 */
import { hasPrefetchedInitialData } from '../libs/prefetch/window-key';
import { trimSlash } from '../libs/url';
import type { ConsentMode, TestingModeOptions } from '../modes';
import { testingOptionsOf } from '../modes';
import type { SSRInitialData } from '../options/ssr';
import type * as ManifestBrowserModule from '../transports/manifest-browser';
import type { BrowserManifestOptions } from '../transports/manifest-browser';
import { createManifestRequestInit } from '../transports/manifest-request';
import type {
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
} from '../transports/mode';
import type * as TestingTransportModule from '../transports/testing';
import type * as HostedModule from '../transports/v1/hosted';
import { createV1InitRequest } from '../transports/v1/init-request';
import { createV1RecordTransport } from '../transports/v1/records';
import { V1_ROUTES } from '../transports/v1/routes';
import type { InitContext, KernelConfig, KernelTransport } from '../types';

/** Where a client root's transport sends requests. */
export interface ClientModeOptions {
	/**
	 * Project URL for saves, and for init with no `mode`. When the
	 * consent route forwards writes,
	 * as with Next.js and TanStack Start's `proxy`, pass the route prefix
	 * here: `routePrefix` alone never receives saves, because a route
	 * without a proxy answers `GET` only.
	 */
	projectUrl?: string;
	/**
	 * Prefix of the app's own consent route, such as `/api/inth`. Manifest
	 * mode re-inits through `${routePrefix}/v1/consent/init`, and browser
	 * resolution fetches `${routePrefix}/v1/consent/manifest`.
	 */
	routePrefix?: string;
	/**
	 * An init response already requested, such as by an inline prefetch
	 * script that ran before hydration. A server-resolved `manifest()` or
	 * the hosted backend answers its first init with it instead of sending
	 * `/init`.
	 */
	initialData?: Promise<SSRInitialData | undefined>;
}

/**
 * Loads the transport that runs init, given the context of the init that
 * triggered the load. Called at most once per successful load; a rejected
 * load is retried on the next init.
 */
export type LoadInitTransport = (ctx: InitContext) => Promise<KernelTransport>;

/** The hosted transport's module, or a stand-in for tests. */
export type LoadHostedModule = () => Promise<
	Pick<typeof HostedModule, 'createV1HostedTransport'>
>;

/** The `testing()` transport's module, or a stand-in for tests. */
export type LoadTestingModule = () => Promise<
	Pick<typeof TestingTransportModule, 'testingTransport'>
>;

/** The browser resolver's module, or a stand-in for tests. */
export type LoadManifestBrowserModule = () => Promise<
	Pick<typeof ManifestBrowserModule, 'createBrowserManifestTransport'>
>;

// Every chunk here is built self-contained; see `lazy-hosted.ts`.
const loadHostedModule: LoadHostedModule = () => import('./lazy-hosted');
const loadTestingModule: LoadTestingModule = () => import('./lazy-offline');
const loadManifestBrowserModule: LoadManifestBrowserModule = () =>
	import('./lazy-manifest-browser');

/**
 * A transport that loads its init path only when init runs.
 *
 * Saves, identity links and subject reads use the same backend routes and
 * request bodies in the hosted and manifest transports. Those transports
 * differ only after their own init remembers decision inputs. When the
 * server already resolved the visitor's state there is no client init, and
 * the kernel's decision inputs on the save payload are the whole policy
 * assertion, so those requests go out through the record transport without
 * waiting for a chunk.
 *
 * @param records - Record transport used until init starts.
 * @param load - Loads the transport that runs init.
 */
const createLazyInitTransport = function createLazyInitTransport(
	records: KernelTransport,
	load: LoadInitTransport
): KernelTransport {
	let transportPromise: Promise<KernelTransport> | undefined;
	const resolver = function resolver(
		ctx: InitContext
	): Promise<KernelTransport> {
		transportPromise ??= (async () => {
			try {
				return await load(ctx);
			} catch (error) {
				// A failed chunk load must not poison every later init/save;
				// the kernel's retry gets a fresh import attempt.
				transportPromise = undefined;
				throw error;
			}
		})();
		return transportPromise;
	};
	// Once init has started loading its transport, keep every request on it
	// so saves carry the decision inputs that init remembered.
	const recordTransport =
		async function recordTransport(): Promise<KernelTransport> {
			return transportPromise ? await transportPromise : records;
		};

	return {
		async identify(user, subjectId) {
			return await (await recordTransport()).identify?.(user, subjectId);
		},
		async init(ctx) {
			const transport = await resolver(ctx);
			return (await transport.init?.(ctx)) ?? {};
		},
		async loadSubjectRecord(subjectId) {
			return (
				(await (await recordTransport()).loadSubjectRecord?.(subjectId)) ?? null
			);
		},
		async save(payload) {
			const transport = await recordTransport();
			if (!transport.save) {
				throw new Error('inth: the init transport cannot save.');
			}
			return await transport.save(payload);
		},
	};
};

/** A request sent before the transport that reads its response loaded. */
interface EarlyRequest {
	url: string;
	init: RequestInit & { headers: Record<string, string> };
	response: Promise<Response>;
}

/** Sends a request now; nothing reading it is not an unhandled rejection. */
const sendEarly = function sendEarly(
	fetch: typeof globalThis.fetch,
	url: string,
	init: EarlyRequest['init']
): EarlyRequest {
	const response = fetch(url, init);
	void (async () => {
		try {
			await response;
		} catch {
			// The transport that reads the response reports the failure.
		}
	})();
	return { init, response, url };
};

const isSameRequest = function isSameRequest(
	early: EarlyRequest,
	input: Parameters<typeof globalThis.fetch>[0],
	init: RequestInit | undefined
): boolean {
	return (
		input === early.url &&
		init?.method === early.init.method &&
		init?.credentials === early.init.credentials &&
		JSON.stringify(init?.headers) === JSON.stringify(early.init.headers)
	);
};

/**
 * Hands the early response to the loaded transport's first request that
 * matches it exactly; every other request goes out through `fetch`.
 */
const withEarlyRequest = function withEarlyRequest(
	fetch: typeof globalThis.fetch,
	early: EarlyRequest
): typeof globalThis.fetch {
	let pending: EarlyRequest | undefined = early;
	const fetchWithEarlyRequest = (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: RequestInit
	): Promise<Response> => {
		if (pending && isSameRequest(pending, input, init)) {
			const { response } = pending;
			pending = undefined;
			return response;
		}
		return fetch(input, init);
	};
	return fetchWithEarlyRequest as typeof globalThis.fetch;
};

/** Options for {@link lazyHosted}. */
export interface LazyHostedOptions {
	/** Project URL for saves, and for init without `initUrl`. */
	projectUrl: string;
	/** Same-origin route that resolves init, such as `/api/inth/init`. */
	initUrl?: string;
	/** Defaults to whether `initUrl` is set. */
	assertDecisionInputs?: boolean;
	/** Headers a server-side caller forwards to init. */
	headers?: Record<string, string>;
	/** Kind reported through `window.__inthDebug.mode`. Defaults to `'hosted'`. */
	kind?: ProviderTransportKind;
	/**
	 * An init response already requested. The first init reads it and sends
	 * no `/init` of its own.
	 */
	initialData?: Promise<SSRInitialData | undefined>;
}

/**
 * Sends the first init request while the hosted transport's chunk loads,
 * so the chunk and `/init` travel in the same round trip. The request is
 * the one the loaded transport builds. Skipped on the server, without
 * `fetch`, with init headers (the loaded transport filters them), and when
 * an inline prefetch script already requested init, which the loaded
 * transport reads instead.
 */
const startEarlyInit = function startEarlyInit(
	options: LazyHostedOptions,
	fetch: typeof globalThis.fetch | undefined,
	ctx: InitContext
): EarlyRequest | undefined {
	if (
		typeof window === 'undefined' ||
		!fetch ||
		options.initialData ||
		(options.headers && Object.keys(options.headers).length > 0) ||
		(!options.initUrl && hasPrefetchedInitialData())
	) {
		return undefined;
	}
	// Carries the whole init context (overrides, experiment arm, journey),
	// as the loaded transport does, so that transport's first request still
	// matches this one and takes its response.
	const request = createV1InitRequest({
		...ctx,
		initUrl: options.initUrl,
		projectUrl: options.projectUrl,
	});
	return sendEarly(fetch, request.url, request.init);
};

/**
 * Hosted transport for a client root. Saves and the other record requests
 * go out at once through the record transport; the init path loads on the
 * first init, which a root with server-resolved state only runs when the
 * provider re-initializes. That first init's `/init` request goes out
 * alongside the chunk request, and the loaded transport reads its response.
 *
 * With `assertDecisionInputs`, a save that carries no decision inputs of its
 * own is refused until init resolved a decision, as in the full transport.
 * Both halves use the `fetch` that was global when the transport was
 * created, as the full transport does.
 *
 * @param options - Backend URL and, for same-origin init, `initUrl`.
 * @param load - Loads the hosted transport's module.
 */
export const lazyHosted = function lazyHosted(
	options: LazyHostedOptions,
	load: LoadHostedModule = loadHostedModule
): ProviderTransportFactory {
	const assertDecisionInputs =
		options.assertDecisionInputs ?? options.initUrl !== undefined;
	return Object.assign(
		(): KernelTransport => {
			const fetch = globalThis.fetch?.bind(globalThis);
			return createLazyInitTransport(
				createV1RecordTransport(
					{ fetch, projectUrl: options.projectUrl },
					assertDecisionInputs
						? {
								inputs: () => undefined,
								pending: () => undefined,
								required: true,
							}
						: undefined
				),
				async (ctx) => {
					const early = startEarlyInit(options, fetch, ctx);
					const { createV1HostedTransport } = await load();
					return createV1HostedTransport({
						assertDecisionInputs,
						fetch: early && fetch ? withEarlyRequest(fetch, early) : fetch,
						headers: options.headers,
						initUrl: options.initUrl,
						initialData: options.initialData,
						// `fetch` here is the global one, as the page's script uses.
						pagePrefetch: true,
						projectUrl: options.projectUrl,
					});
				}
			);
		},
		{ kind: options.kind ?? ('hosted' as const) }
	);
};

/**
 * The `testing()` transport, loaded on first init. It carries the
 * recommended policy pack, so a static import would ship that pack to every
 * page that renders the root with a backend, where it never runs. The
 * loaded chunk throws in production builds, so the check ships only to
 * apps that pass a testing value.
 *
 * @param entry - The testing entry named in the production error.
 * @param options - `iab` picks the pack's IAB TCF variant.
 * @returns A provider transport factory reporting `kind: 'offline'`.
 */
export const lazyTesting = function lazyTesting(
	entry: string,
	options: TestingModeOptions = {},
	load: LoadTestingModule = loadTestingModule
): ProviderTransportFactory {
	return Object.assign(
		(context: ProviderTransportContext): KernelTransport => {
			let transportPromise: Promise<KernelTransport> | undefined;
			const loadTransport = function loadTransport(): Promise<KernelTransport> {
				transportPromise ??= (async () => {
					try {
						const { testingTransport } = await load();
						return testingTransport(entry, options)(context);
					} catch (error) {
						// Let the kernel's retry make a fresh import attempt.
						transportPromise = undefined;
						throw error;
					}
				})();
				return transportPromise;
			};
			return {
				async init(ctx) {
					const transport = await loadTransport();
					return (await transport.init?.(ctx)) ?? {};
				},
			};
		},
		{ kind: 'offline' as const }
	);
};

/** Options for {@link lazyBrowserManifest}. */
export type LazyBrowserManifestOptions = BrowserManifestOptions & {
	/** Project URL for saves and the init fallback. */
	projectUrl: string;
};

/**
 * Whether a server state already holds the policy, the test the runtime
 * uses to skip the first init (`hasResolvedPrefetch`).
 */
const hasPolicy = function hasPolicy(
	config: Partial<KernelConfig> | undefined
): boolean {
	return Boolean(
		config?.initialPolicyResolution && config.initialPolicyPending !== true
	);
};

/**
 * Manifest mode resolved in the browser. The resolver chunk and the
 * manifest request both start when the transport is built, so they load in
 * parallel with the rest of the page; the resolver reads the early
 * response. A server state with a policy answers the first init, so with
 * one neither starts until an init needs them; with a streamed state they
 * start once it arrives without one. Saves before the first init go out
 * through the record transport.
 *
 * @param load - Loads the browser resolver's module.
 * @returns A provider transport factory reporting `kind: 'manifest'`.
 */
export const lazyBrowserManifest = function lazyBrowserManifest(
	options: LazyBrowserManifestOptions,
	load: LoadManifestBrowserModule = loadManifestBrowserModule
): ProviderTransportFactory {
	return Object.assign(
		(context?: ProviderTransportContext): KernelTransport => {
			const fetch =
				options.fetch ??
				(typeof globalThis.fetch === 'function'
					? globalThis.fetch.bind(globalThis)
					: undefined);
			const manifestUrl =
				options.manifestUrl ??
				`${trimSlash(options.projectUrl)}${V1_ROUTES.manifest}`;
			let early: EarlyRequest | undefined;
			let firstLoad: ReturnType<LoadManifestBrowserModule> | undefined;
			let initStarted = false;
			const request = (): EarlyRequest | undefined =>
				fetch && !options.snapshot
					? sendEarly(
							fetch,
							manifestUrl,
							createManifestRequestInit({
								credentials: options.credentials,
								headers: options.headers,
							})
						)
					: undefined;
			const warm = (): void => {
				if (initStarted || typeof window === 'undefined') {
					return;
				}
				early = request();
				const loading = load();
				// Read when init awaits it; until then a failed chunk is handled.
				void (async () => {
					try {
						await loading;
					} catch {
						// Init retries the import.
					}
				})();
				firstLoad = loading;
			};
			// A server state with a policy answers the first init, so the
			// resolver and the manifest are only needed for a later one.
			if (!hasPolicy(context?.prefetch)) {
				const pending = context?.pendingPrefetch;
				if (pending) {
					void (async () => {
						try {
							// The streamed init answers from any state with a
							// policy (`kernelConfigToInitResponse`), pending or not.
							if ((await pending)?.initialPolicyResolution !== undefined) {
								return;
							}
						} catch {
							// The transport's init answers a rejected state.
						}
						warm();
					})();
				} else {
					warm();
				}
			}
			return createLazyInitTransport(
				createV1RecordTransport({
					fetch,
					projectUrl: options.projectUrl,
					property: options.property,
				}),
				async () => {
					initStarted = true;
					// Not warmed: the manifest request goes out while the
					// resolver loads, not after.
					if (!firstLoad) {
						early = request();
					}
					const pending = firstLoad ?? load();
					firstLoad = undefined;
					const { createBrowserManifestTransport } = await pending;
					return createBrowserManifestTransport(
						{
							...options,
							fetch: early && fetch ? withEarlyRequest(fetch, early) : fetch,
							manifestUrl: options.snapshot ? options.manifestUrl : manifestUrl,
						} as BrowserManifestOptions,
						context
					);
				}
			);
		},
		{ kind: 'manifest' as const }
	);
};

let warnedImplementation = false;

/**
 * The transport factory a server-framework client root uses for its
 * options.
 *
 * Takes the data from `@inth/sdk/modes` and the testing entries. With
 * none, the root uses manifest mode, the default of every server
 * framework: the server resolves from the manifest and a browser re-init
 * goes through the consent route, which falls back to the backend's
 * `/init` when the manifest is unavailable. A transport factory is
 * returned unchanged; in development it warns once, because its code is
 * now in the client bundle.
 *
 * @param mode - `manifest()`, `hosted()` or `testing()` data, a transport
 *   factory, or `undefined` for `manifest()`.
 * @param options - Backend URL and the app's consent route prefix.
 * @param testingEntry - The testing entry named in the production error.
 * @returns A provider transport factory that carries the mode's data.
 * @throws {Error} When the mode needs a backend URL and none is set.
 * @example
 * ```ts
 * import { manifest } from '@inth/sdk-core/modes';
 * import { clientMode } from '@inth/sdk-core/runtime/client-mode';
 *
 * const mode = clientMode(manifest(), {
 *   projectUrl: 'https://your-project.inth.app',
 *   routePrefix: '/api/inth',
 * });
 * ```
 */
export const clientMode = function clientMode(
	selected: ConsentMode | ProviderTransportFactory | undefined,
	options: ClientModeOptions = {},
	testingEntry = '@inth/sdk/testing'
): ProviderTransportFactory {
	const mode = selected ?? { type: 'manifest' as const };
	if (typeof mode === 'function') {
		if (!warnedImplementation && !isProductionBuild()) {
			warnedImplementation = true;
			console.warn(
				`inth: \`mode\` is the ${mode.kind}() transport itself, so its code ships in the client bundle. Pass the ${mode.kind}() your framework package exports instead: it is plain data, and the root loads the code only when it runs.`
			);
		}
		return mode;
	}
	const routePrefix =
		options.routePrefix === undefined
			? undefined
			: trimSlash(options.routePrefix);
	if (mode?.type === 'testing') {
		return lazyTesting(testingEntry, testingOptionsOf(mode));
	}
	// Saves never fall back to `routePrefix`: a consent route only forwards
	// writes when the caller says so by passing it as `projectUrl`.
	const { projectUrl } = options;
	if (projectUrl === undefined) {
		throw new Error(
			'inth: `projectUrl` is required. Set it in your config, or use `mode: testing()` from a /testing entry in tests.'
		);
	}
	if (mode.type === 'hosted') {
		return lazyHosted({ initialData: options.initialData, projectUrl });
	}
	if (mode.resolve === 'browser') {
		const {
			resolve: _resolve,
			source: _source,
			type: _type,
			...browser
		} = mode;
		return Object.assign(
			lazyBrowserManifest({
				...browser,
				manifestUrl:
					mode.manifestUrl ??
					(routePrefix === undefined
						? undefined
						: `${routePrefix}${V1_ROUTES.manifest}`),
				projectUrl,
			} as LazyBrowserManifestOptions),
			mode
		);
	}
	return Object.assign(
		lazyHosted({
			initUrl:
				routePrefix === undefined
					? undefined
					: `${routePrefix}${V1_ROUTES.init}`,
			initialData: options.initialData,
			kind: 'manifest',
			projectUrl,
		}),
		mode
	);
};
