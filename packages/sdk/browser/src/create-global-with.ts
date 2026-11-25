import type {
	AllConsentNames,
	ConsentSnapshot,
	HasCondition,
	KernelHosting,
	KernelUser,
	Unsubscribe,
} from '@inth/sdk-core';
import type { ConsentRuntimeGPPFactory } from '@inth/sdk-core/runtime';
import type { DevToolsInstance } from '@inth/sdk-dev-tools';

import type {
	ConsentClient,
	ConsentClientEventMap,
	ScriptTagClientOptions,
	ConsentUIHandle,
	ConsentUIOptions,
} from './consent-client.model';
import type { PublishDevToolsLauncher } from './create-browser-dev-tools';
import type { CreateConsentClientContext } from './create-consent-client-with';
import { createDeferred } from './create-deferred';
import { GLOBAL_NAME } from './global-name';
import {
	adoptBoot,
	adoptedBoot,
	releaseBoot,
	withInitPrefetch,
} from './init/adopt-boot';
import { readBoot } from './init/read-boot';
import {
	mergeClientOptions,
	readPageOptions,
	readScriptOptions,
} from './script-tag-options.model';
import { version } from './version';

/** A call queued before the script loaded: `[method, ...args]`. */
export type QueuedCall = [method: string, ...args: unknown[]];

/**
 * `window.inth`, the one global the script-tag builds use.
 *
 * Before the tag loads it is a plain array of queued calls:
 *
 * ```html
 * <script>
 *   window.inth = window.inth || [];
 *   inth.push(['config', { consentCategories: ['measurement'] }]);
 *   inth.push(['on', 'consent', (snapshot) => console.log(snapshot)]);
 * </script>
 * ```
 *
 * The tag replaces it with this object and replays the queue in order.
 * Actions such as `openDialog` or `acceptAll` wait for the client and its
 * policy; unsupported methods are skipped with a warning.
 * Before `init()` the read methods throw and `on()`/`ready()` wait; after
 * it everything proxies to the page's client. `version`, `pkg`, `mode` and
 * `hosting` keep the shape `@inth/sdk/engine` installs for devtools.
 */
export interface GlobalApiBase {
	/** Package version. */
	readonly version: string;
	/** Package name. */
	readonly pkg: string;
	/** Transport kind, once initialised. */
	readonly mode: string | null;
	/**
	 * Who runs the backend, `'inth'` or `'self-hosted'`, once `/v1/consent/init` has
	 * reported it. `null` before then and for backends that do not say.
	 */
	readonly hosting: KernelHosting | null;
	/** The page's client, once initialised. */
	readonly client: ConsentClient | null;
	/**
	 * Add options before `init()`. Later calls win over earlier ones, and
	 * all of them win over the tag's `data-*` attributes. After `init()`
	 * it warns and does nothing.
	 */
	config: (options: ScriptTagClientOptions) => void;
	/**
	 * Create and start the page's client. A second call returns the
	 * existing one.
	 *
	 * @param options - Client options layered over the tag's attributes and
	 * every queued `config`.
	 */
	init: (options?: ScriptTagClientOptions) => ConsentClient;
	/**
	 * Run once the client exists, immediately if it already does. Safe to
	 * call before `init()`; `inth.devtools.js` mounts through this.
	 *
	 * @returns A function that cancels the call if it has not run yet.
	 */
	onInit: (listener: (client: ConsentClient) => void) => Unsubscribe;
	/**
	 * Supply the GPP implementation. `inth.gpp.js` calls this, before or
	 * after `init()`; the client mounts `__gpp` once it arrives unless the
	 * page set `gpp: false`.
	 *
	 * @param module - The `createGPP` export of `@inth/sdk/iab/gpp`.
	 * @internal
	 */
	provideGPP: (module: { createGPP: ConsentRuntimeGPPFactory }) => void;
	/**
	 * Run `[method, ...args]` calls the same way as calls queued before the
	 * tag loaded, so `window.inth = window.inth || []; inth.push([...])`
	 * works whether the snippet runs before or after the tag. Unsupported
	 * methods are skipped with a warning.
	 *
	 * @param calls - One or more `[method, ...args]` arrays.
	 * @returns The number of calls received.
	 */
	push: (...calls: unknown[]) => number;
	/** The DevTools panel, once `inth.devtools.js` has mounted it. */
	devtools: DevToolsInstance | null;
	/**
	 * Offer a DevTools panel's launcher to the stock trigger, which then
	 * shows a DevTools button and docks the panel. `inth.devtools.js` is a
	 * separate bundle with its own copy of the launcher slot, so it
	 * publishes through this one, the copy the trigger reads. Absent from
	 * builds without the stock UI.
	 *
	 * @internal
	 */
	publishDevToolsLauncher?: PublishDevToolsLauncher;
	/** Resolves once the policy is resolved. Safe to call before `init()`. */
	ready: () => Promise<ConsentSnapshot>;
	/** Listen for a client event. Safe to call before `init()`. */
	on: <EventName extends keyof ConsentClientEventMap>(
		event: EventName,
		listener: (payload: ConsentClientEventMap[EventName]) => void
	) => Unsubscribe;
	getSnapshot: () => ConsentSnapshot;
	subscribe: (listener: (snapshot: ConsentSnapshot) => void) => Unsubscribe;
	has: (condition: HasCondition<AllConsentNames>) => boolean;
	hasConsented: () => boolean;
	/** See {@link ConsentClient.getDeclaredVendors}. */
	getDeclaredVendors: ConsentClient['getDeclaredVendors'];
	/** See {@link ConsentClient.getOptOutState}. */
	getOptOutState: ConsentClient['getOptOutState'];
	/** See {@link ConsentClient.getVendorChoice}. */
	getVendorChoice: ConsentClient['getVendorChoice'];
	/** See {@link ConsentClient.isVendorAllowed}. */
	isVendorAllowed: ConsentClient['isVendorAllowed'];
	acceptAll: ConsentClient['acceptAll'];
	rejectAll: ConsentClient['rejectAll'];
	save: ConsentClient['save'];
	saveIAB: ConsentClient['saveIAB'];
	dismissNotice: ConsentClient['dismissNotice'];
	optOut: ConsentClient['optOut'];
	showBanner: () => void;
	openDialog: () => void;
	closeDialog: () => void;
	setLanguage: (code: string) => void;
	identify: (user: KernelUser) => Promise<void>;
	/** See {@link ConsentClient.syncUserConsent}. */
	syncUserConsent: ConsentClient['syncUserConsent'];
	mountUI: (options?: ConsentUIOptions) => ConsentUIHandle;
	/** See {@link ConsentClient.processIframes}. */
	processIframes: () => void;
	dispose: () => void;
}

/** Takeovers of an init script's stand-in still waiting on its `/v1/consent/init`. */
const takeovers = new WeakMap<GlobalApiBase, Promise<void>>();

type GlobalWindow = Window & {
	[GLOBAL_NAME]?: GlobalApiBase | QueuedCall[] | unknown;
};

/** Queued methods that configure or observe the client, run in place. */
const QUEUE_SETUP_METHODS: ReadonlySet<string> = new Set([
	'config',
	'init',
	'on',
	'onInit',
	'provideGPP',
]);

/** Queued methods that need a client; attached as soon as it exists. */
const QUEUE_INIT_METHODS: ReadonlySet<string> = new Set(['subscribe']);

/**
 * Queued methods that act on consent or the UI. They wait for the policy
 * to resolve, so a queued `openDialog` is not replaced by the banner the
 * resolution derives, and `acceptAll` knows which model to save.
 */
const QUEUE_ACTION_METHODS: ReadonlySet<string> = new Set([
	'acceptAll',
	'closeDialog',
	'dismissNotice',
	'identify',
	'mountUI',
	'openDialog',
	'optOut',
	'processIframes',
	'rejectAll',
	'save',
	'saveIAB',
	'setLanguage',
	'showBanner',
	'syncUserConsent',
]);

/**
 * What a page queued about the account before its client existed, with no
 * consent or UI action ahead: the last `identify` user, and whether any
 * action came first.
 */
interface EarlyAccount {
	user?: unknown;
	afterAction: boolean;
}

/** Each API's {@link EarlyAccount}, until its client exists. */
const earlyAccounts = new WeakMap<GlobalApiBase, EarlyAccount>();

const earlyAccountOf = (api: GlobalApiBase): EarlyAccount => {
	let early = earlyAccounts.get(api);
	if (!early) {
		early = { afterAction: false };
		earlyAccounts.set(api, early);
	}
	return early;
};

const queuedName = function queuedName(call: unknown): string {
	return Array.isArray(call) && typeof call[0] === 'string'
		? call[0]
		: String(call);
};

const reportQueuedFailure = function reportQueuedFailure(
	call: unknown,
	error: unknown
): void {
	// oxlint-disable-next-line no-console -- Authoring-time diagnostic.
	console.error(
		`@inth/sdk: queued inth.${queuedName(call)}() failed; continuing with the rest of the queue.`,
		error
	);
};

/**
 * Run one queued call against the API, reporting a throw or a rejected
 * promise instead of letting it stop the calls behind it.
 */
const runQueued = async function runQueued(
	api: GlobalApiBase,
	call: QueuedCall
): Promise<void> {
	const [method, ...args] = call;
	const fn = (api as unknown as Record<string, unknown>)[method];
	// The init script's stand-in waits on some calls' results.
	const { settle } = call as QueuedCall & {
		settle?: (result: unknown, failed?: boolean) => void;
	};
	try {
		const result = await (fn as (...params: unknown[]) => unknown).apply(
			api,
			args
		);
		settle?.(result);
	} catch (error) {
		if (settle) {
			settle(error, true);
			return;
		}
		reportQueuedFailure(call, error);
	}
};

/**
 * Settle a queued call that became a client option once the client is
 * ready, for the init script's stand-in waiting on its result.
 */
const settleAtReady = async function settleAtReady(
	api: GlobalApiBase,
	call: QueuedCall
): Promise<void> {
	const { settle } = call as QueuedCall & {
		settle?: (result: unknown, failed?: boolean) => void;
	};
	if (!settle) {
		return;
	}
	try {
		await api.ready();
	} catch (error) {
		settle(error, true);
		return;
	}
	settle(undefined);
};

/** The pending consent and UI actions for one API. */
interface ActionChain {
	/** Settles once every batch reserved so far has finished. */
	tail: Promise<void>;
	/** Set by `dispose()`. Batches that have not run yet stop. */
	cancelled: boolean;
}

/**
 * Each API's action chain. Every batch of queued actions runs after the
 * batch before it settles, so actions from separate `push()` calls keep
 * their order.
 */
const actionChains = new WeakMap<GlobalApiBase, ActionChain>();

/**
 * Reserve the next place in the API's action chain for a batch of consent
 * and UI actions. The batch runs once it is released, every earlier batch
 * has finished and the policy has resolved. Reserving before the batch is
 * filled keeps its place ahead of any `push()` made while it is filled.
 *
 * @param actions - The batch. It is read when the batch runs, so the
 * caller can keep adding to it until it calls the returned function.
 * @returns A function that releases the batch.
 */
const reserveActions = function reserveActions(
	api: GlobalApiBase,
	actions: readonly QueuedCall[]
): () => void {
	let chain = actionChains.get(api);
	if (!chain) {
		chain = { cancelled: false, tail: Promise.resolve() };
		actionChains.set(api, chain);
	}
	const current = chain;
	const previous = current.tail;
	const released = createDeferred<undefined>();
	const run = async function run(): Promise<void> {
		// `runQueued` reports its own failures, so the chain never rejects.
		await previous;
		await released.promise;
		if (current.cancelled || actions.length === 0) {
			return;
		}
		try {
			await api.ready();
		} catch {
			// The actions still run; the client reports its own errors.
		}
		for (const call of actions) {
			if (current.cancelled) {
				return;
			}
			// oxlint-disable-next-line no-await-in-loop -- Queue order is the contract.
			await runQueued(api, call);
		}
	};
	current.tail = run();
	return function release() {
		released.resolve(undefined);
	};
};

/**
 * Drop every batch still waiting in the API's action chain, so none of it
 * runs against a disposed client or the one a later `init()` creates.
 * Batches pushed afterwards start a new chain.
 */
const cancelActions = function cancelActions(api: GlobalApiBase): void {
	const chain = actionChains.get(api);
	if (chain) {
		chain.cancelled = true;
		actionChains.delete(api);
	}
	earlyAccounts.delete(api);
};

/**
 * Replay the calls a page pushed onto `window.inth` before the script
 * loaded. `config`, `init`, `on` and `onInit` run in place, `subscribe`
 * attaches once the client exists, and consent and UI actions run in
 * queue order once the policy has resolved, after any actions from
 * earlier `push()` calls. Anything else is skipped with a warning. A
 * call that throws is reported and the rest still run.
 */
const replayQueue = function replayQueue(
	api: GlobalApiBase,
	queue: readonly unknown[]
): void {
	const actions: QueuedCall[] = [];
	// Reserve before the setup calls run: a ready listener that `init()`
	// fires can push actions of its own, and those belong after these.
	const releaseActions = reserveActions(api, actions);
	for (const call of queue) {
		const method = Array.isArray(call) ? call[0] : undefined;
		if (typeof method !== 'string') {
			// oxlint-disable-next-line no-console -- Authoring-time diagnostic.
			console.warn(
				'@inth/sdk: skipped a queued inth entry that is not [method, ...args].',
				call
			);
			continue;
		}
		const queued = call as QueuedCall;
		const [, value] = queued;
		const early = api.client === null ? earlyAccountOf(api) : null;
		if (QUEUE_SETUP_METHODS.has(method)) {
			void runQueued(api, queued);
		} else if (
			method === 'syncUserConsent' &&
			early !== null &&
			!early.afterAction
		) {
			// The client starts with the account's consent, and with the user
			// a queued `identify` names, instead of releasing scripts the
			// account denied. `identify` itself still runs as an action.
			api.config(
				early.user === undefined
					? { userConsent: value as ScriptTagClientOptions['userConsent'] }
					: {
							user: early.user as KernelUser,
							userConsent: value as ScriptTagClientOptions['userConsent'],
						}
			);
			void settleAtReady(api, queued);
		} else if (QUEUE_INIT_METHODS.has(method)) {
			api.onInit(() => {
				void runQueued(api, queued);
			});
		} else if (QUEUE_ACTION_METHODS.has(method)) {
			if (early !== null) {
				if (method === 'identify') {
					early.user = value;
				} else {
					early.afterAction = true;
				}
			}
			actions.push(queued);
		} else {
			// oxlint-disable-next-line no-console -- Authoring-time diagnostic.
			console.warn(
				`@inth/sdk: inth.push(['${method}', ...]) is not supported before the tag loads and was skipped. Call it from inth.onInit() instead.`
			);
		}
	}
	releaseActions();
};

/**
 * Put the API on `window.inth`, replaying in order any calls a page queued
 * on the array that was there before the script loaded. See `replayQueue`
 * for when each kind of call runs.
 */
export const installGlobal = function installGlobal<Api extends GlobalApiBase>(
	api: Api
): Api {
	if (typeof window === 'undefined') {
		return api;
	}
	const target = window as GlobalWindow;
	const existing = target[GLOBAL_NAME];
	const boot = readBoot();
	if (boot) {
		// The init script's stand-in: take over its calls, banner and choice,
		// once it has read its `/v1/consent/init` answer for this client to start from.
		const takeOver = (): void => {
			target[GLOBAL_NAME] = api;
			adoptBoot(boot);
			boot.attach(api);
			replayQueue(api, boot.calls.splice(0));
		};
		if (boot.settled) {
			// oxlint-disable-next-line promise/prefer-await-to-then -- Install stays synchronous.
			takeovers.set(api, boot.settled.then(takeOver));
		} else {
			takeOver();
		}
		return api;
	}
	// Another copy of this API, from a tag loaded twice.
	if (
		existing !== null &&
		typeof existing === 'object' &&
		'init' in existing &&
		typeof existing.init === 'function' &&
		'client' in existing
	) {
		return existing as Api;
	}
	target[GLOBAL_NAME] = api;
	if (Array.isArray(existing)) {
		replayQueue(api, existing);
	}
	return api;
};

/**
 * Build the global API object.
 *
 * @param context - Entry-point wiring (UI mounter, package name).
 * @param supportedMode - When set, reject incompatible script-tag modes.
 * @returns The API, not yet installed on `window`.
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function -- The API surface is one object.
export const createGlobalWith = function createGlobalWith(
	context: CreateConsentClientContext,
	createClient: (
		options: ScriptTagClientOptions,
		context: CreateConsentClientContext
	) => ConsentClient,
	supportedMode?: 'hosted' | 'testing',
	readOptions: (
		script: Element | null
	) => ScriptTagClientOptions = readScriptOptions
): GlobalApiBase {
	// `currentScript` points at this bundle only while it is executing.
	// Manual init may run in another script or an event callback later.
	// Loaded by the init script, the options are on the init script's tag.
	const script =
		readBoot()?.script ??
		(typeof document === 'undefined' ? null : document.currentScript);
	const explicitMode = script?.getAttribute('data-mode');
	if (
		supportedMode &&
		explicitMode !== undefined &&
		explicitMode !== null &&
		explicitMode !== supportedMode
	) {
		throw new Error(
			`@inth/sdk/${supportedMode}: data-mode must be '${supportedMode}' when using this bundle.`
		);
	}
	const scriptOptions = readOptions(script);
	let client: ConsentClient | null = null;
	// Resolved by `inth.gpp.js`. Until then a client's GPP waits; pages
	// without the add-on never load it.
	const gppModule = createDeferred<{ createGPP: ConsentRuntimeGPPFactory }>();
	const clientContext: CreateConsentClientContext = {
		...context,
		defaultGPP: true,
		loadGPP: () => gppModule.promise,
		scriptTag: true,
	};
	// Replaced on dispose, so `ready()` and `on()` after a re-init wait for
	// the new client instead of answering from the disposed one.
	let clientReady = createDeferred<ConsentClient>();
	const pendingListeners = new Set<(created: ConsentClient) => void>();
	const queuedConfig: ScriptTagClientOptions[] = [];

	const require = function require(): ConsentClient {
		if (!client) {
			throw new Error(
				'@inth/sdk: call inth.init() first, or wait for inth.ready().'
			);
		}
		return client;
	};

	const api: GlobalApiBase = {
		acceptAll: () => require().acceptAll(),
		get client() {
			return client;
		},
		closeDialog: () => {
			require().closeDialog();
		},
		config(options) {
			if (client) {
				// oxlint-disable-next-line no-console -- Authoring-time diagnostic.
				console.warn(
					'@inth/sdk: inth.config() after init() has no effect; queue it before the tag or pass it to init().'
				);
				return;
			}
			queuedConfig.push(options);
		},
		devtools: null,
		dismissNotice: () => require().dismissNotice(),
		dispose: () => {
			api.devtools?.destroy();
			api.devtools = null;
			cancelActions(api);
			client?.dispose();
			releaseBoot();
			// Keep queued defaults for re-init, including backend-injected
			// manifests and URLs that are not present on the script tag.
			client = null;
			clientReady = createDeferred<ConsentClient>();
			pendingListeners.clear();
		},
		getDeclaredVendors: () => require().getDeclaredVendors(),
		getOptOutState: () => require().getOptOutState(),
		getSnapshot: () => require().getSnapshot(),
		getVendorChoice: () => require().getVendorChoice(),
		has: (condition) => require().has(condition),
		hasConsented: () => require().hasConsented(),
		get hosting() {
			return client?.getSnapshot().hosting ?? null;
		},
		identify: (user) => require().identify(user),
		init(options) {
			if (client) {
				return client;
			}
			const configs = options ? [...queuedConfig, options] : queuedConfig;
			const resolved = withInitPrefetch(
				configs.reduce(mergeClientOptions, scriptOptions)
			);
			const created = createClient(resolved, clientContext);
			// A synchronous ready listener can dispose and replace the deferred.
			const initializingClientReady = clientReady;
			client = created;
			for (const attach of pendingListeners) {
				attach(created);
			}
			pendingListeners.clear();
			created.start();
			initializingClientReady.resolve(created);
			return created;
		},
		isVendorAllowed: (vendorId) => require().isVendorAllowed(vendorId),
		get mode() {
			return client?.mode ?? null;
		},
		mountUI: (options) => require().mountUI(options),
		on(event, listener) {
			if (client) {
				return client.on(event, listener);
			}
			let unsubscribe: Unsubscribe | null = null;
			const attach = function attach(created: ConsentClient): void {
				unsubscribe = created.on(event, listener);
			};
			pendingListeners.add(attach);
			return function off() {
				pendingListeners.delete(attach);
				unsubscribe?.();
			};
		},
		onInit(listener) {
			let cancelled = false;
			const attach = async function attach(): Promise<void> {
				const resolvedClient = await clientReady.promise;
				if (!cancelled) {
					listener(resolvedClient);
				}
			};
			void attach();
			return function off() {
				cancelled = true;
			};
		},
		openDialog: () => {
			require().openDialog();
		},
		optOut: () => require().optOut(),
		pkg: context.pkg ?? '@inth/sdk',
		processIframes: () => {
			require().processIframes();
		},
		provideGPP(module) {
			gppModule.resolve(module);
		},
		publishDevToolsLauncher: context.publishDevToolsLauncher,
		push(...calls) {
			replayQueue(api, calls);
			return calls.length;
		},
		async ready() {
			const resolvedClient = await clientReady.promise;
			return resolvedClient.ready();
		},
		rejectAll: () => require().rejectAll(),
		save: (consents) => require().save(consents),
		saveIAB: () => require().saveIAB(),
		setLanguage: (code) => {
			require().setLanguage(code);
		},
		showBanner: () => {
			require().showBanner();
		},
		subscribe: (listener) => require().subscribe(listener),
		syncUserConsent: (value) => require().syncUserConsent(value),
		version,
	};
	return api;
};

/**
 * Initialise from the script tag unless the page opted out.
 *
 * @returns The client, or `null` when the page asked to init itself.
 */
export const autoInit = function autoInit(
	api: GlobalApiBase
): ConsentClient | null {
	if (typeof document === 'undefined') {
		return null;
	}
	const waiting = takeovers.get(api);
	if (waiting) {
		// oxlint-disable-next-line promise/prefer-await-to-then -- Returns synchronously.
		void waiting.then(() => {
			takeovers.delete(api);
			autoInit(api);
		});
		return null;
	}
	const boot = adoptedBoot();
	const { manual } = readPageOptions(boot?.script ?? document.currentScript);
	// A stand-in the page disposed before the engine arrived: the page
	// calls `init()` itself when it wants a client again.
	if (manual || api.client || boot?.disposed) {
		return api.client;
	}
	return api.init();
};
