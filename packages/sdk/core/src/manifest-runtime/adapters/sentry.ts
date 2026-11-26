/**
 * The Sentry adapter: runs the Sentry browser SDK under Inth consent. It
 * turns the client off while error monitoring is not allowed, keeps user
 * data, IP inference and the data the SDK collects out of what it sends
 * while that is not allowed, and loads, attaches and stops Session Replay
 * as its permission comes and goes.
 *
 * A manifest from the Inth server names it as `adapter: { id: 'sentry' }`
 * with {@link SentryAdapterOptions}; the `sentry()` helper in
 * `@inth/integrations` builds its script with the same functions, and adds
 * what only a site's own code can pass: its Sentry SDK functions, a user,
 * and an error handler.
 */
import type { AllConsentNames } from '../../consent/consent-types';
import { has } from '../../libs/has';
import type { HasCondition } from '../../libs/has';
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import { isCategoryCondition } from '../../modules/script-loader/category-condition';
import type { ManifestAdapter } from '../adapter';
import { ALL_DENIED } from '../vendor-consent';
import {
	waitForReplayIdle,
	waitForReplayLoad,
	waitForReplayPaint,
} from './replay-scheduler';

/** Recording mode that Sentry Replay reports while it records. */
export type SentryReplayRecordingMode = 'session' | 'buffer';

/**
 * The Sentry Replay methods the adapter uses. The integration returned by
 * `replayIntegration()` from `@sentry/browser` in the supported range
 * `^10.67.0 || ^11.0.0`, or from a framework SDK built on it, matches this
 * shape. These versions support stopping without flushing on withdrawal.
 */
export interface SentryReplay {
	name: string;
	start: () => void;
	startBuffering: () => void;
	stop: (options?: { flush?: boolean }) => Promise<void>;
	/** Sentry flush() can start a recorder that is currently stopped. */
	flush?: (options?: { continueRecording?: boolean }) => Promise<void>;
	getRecordingMode: () => SentryReplayRecordingMode | undefined;
}

/** The part of a Sentry event the adapter changes. */
export interface SentryEvent {
	user?: unknown;
}

/** The parts of a Sentry session that identify the visitor. */
export interface SentrySession {
	did?: unknown;
	ipAddress?: unknown;
	attrs?: { ip_address?: unknown };
}

/** Structural collection settings, whose value shapes differ between SDK versions. */
type SentryDataCollectionOptions = Partial<
	Record<
		| 'userInfo'
		| 'cookies'
		| 'httpHeaders'
		| 'httpBodies'
		| 'urlQueryParams'
		| 'queryParams'
		| 'graphQL'
		| 'genAI'
		| 'databaseQueryData'
		| 'queues'
		| 'stackFrameVariables'
		| 'frameContextLines',
		unknown
	>
>;

/** Envelope items passed to Sentry's final send hook. */
export type SentryEnvelope = readonly [
	unknown,
	(readonly [{ type: string }, unknown])[],
];

/** User data in the shape `Sentry.setUser` accepts. */
export interface SentryUser {
	id?: string | number;
	email?: string;
	username?: string;
	[key: string]: unknown;
}

/**
 * The Sentry client methods the adapter uses. `getClient()` from any Sentry
 * browser SDK returns a matching client.
 */
export interface SentryClient {
	addIntegration: (integration: SentryReplay) => void;
	addEventProcessor: (
		processor: <EventType extends SentryEvent>(event: EventType) => EventType
	) => void;
	captureException: (
		exception: unknown,
		hint?: { captureContext?: { tags?: Record<string, string> } }
	) => unknown;
	/** Preserve app-initiated shutdowns separately from consent denial. */
	close?: (timeout?: number) => PromiseLike<boolean>;
	getDataCollectionOptions?: () => SentryDataCollectionOptions;
	getDsn: () => unknown;
	getIntegrationByName: (name: string) => unknown;
	getOptions: () => { enabled?: boolean };
	getSdkMetadata?: () =>
		| { sdk?: { settings?: { infer_ip?: string } } }
		| undefined;
	/** Replay sends directly through the client transport, bypassing event hooks. */
	getTransport?: () =>
		| {
				// oxlint-disable-next-line typescript/method-signature-style -- Match SDK transport methods across envelope header types.
				send(envelope: SentryEnvelope): PromiseLike<unknown>;
		  }
		| undefined;
	on: {
		(
			hook: 'beforeSendSession',
			callback: (session: SentrySession) => void
		): unknown;
		(
			hook: 'beforeEnvelope',
			callback: (envelope: SentryEnvelope) => void
		): unknown;
	};
}

/** A Sentry integration, without a dependency on a particular SDK package. */
interface SentryIntegration {
	name: string;
}

/** SDK initialization options with Inth's consent integration installed first. */
export interface SentryInitOptions extends Record<string, unknown> {
	integrations: (defaults: SentryIntegration[]) => SentryIntegration[];
}

/** The `window.Sentry` functions a Sentry CDN bundle provides. */
interface SentryGlobal {
	init: (options: Record<string, unknown>) => unknown;
	getClient: () => SentryClient | undefined;
	setUser: (user: SentryUser | null) => void;
	replayIntegration?: (options?: Record<string, unknown>) => unknown;
	browserTracingIntegration?: () => { name: string };
}

interface Permissions {
	errors: boolean;
	pii: boolean;
	replay: boolean;
}

interface ClientGate {
	client?: SentryClient;
	errorsGated: boolean;
	permissions: Permissions;
	getClient: () => SentryClient | undefined;
	getState: (client: SentryClient) => ClientState;
	onChange: (client?: SentryClient, state?: ClientState) => void;
	report: (error: unknown) => void;
}

interface ClientState {
	/** Whether the app left the client enabled. The adapter never enables it past that. */
	enabled: boolean;
	/** Last enabled value written or observed by the adapter. */
	lastEnabled: boolean;
	/** Every active configuration targeting this client, including distinct options. */
	gates: Set<ClientGate>;
	/** Effective error permission, retained for the final gate's removal. */
	errorsAllowed: boolean;
	/** Whether events may carry user data. Read by the event processor. */
	piiAllowed: boolean;
	/** Whether Replay envelopes may leave the browser. */
	replayAllowed: boolean;
	/** Resolved SDK collection settings as the app configured them. */
	collection?: SentryDataCollectionOptions;
	/** The SDK `infer_ip` setting as the app configured it. */
	inferIp?: string;
	/** The `load()` call for this client, shared by every adapter instance. */
	loading?: Promise<SentryReplay>;
	/**
	 * Sampling decision Replay made when it was added, restored on re-grant.
	 * `null` means Replay did not sample this session.
	 */
	mode?: SentryReplayRecordingMode | null;
	/** Settles once the latest `stop()` finishes. */
	stopping?: Promise<void>;
	stopFailed?: boolean;
}

interface ReplayHook {
	name: string;
	callback: unknown;
	unsubscribe: unknown;
}

/** Replay subscribes to different public hooks across supported SDK versions. */
type ReplayHookRegistrar = (name: string, listener: unknown) => unknown;

interface ReplayState {
	client: SentryClient;
	state: ClientState;
	hooks: ReplayHook[];
}

interface GateOptions {
	getClient: () => SentryClient | undefined;
	setUser?: (user: SentryUser | null) => void;
	/** Whether error monitoring waits for `measurement`. */
	errorsGated: boolean;
	/** Whether Inth calls `Sentry.init`, so it sees the client from the start. */
	startsSentry: boolean;
	/** Starts Sentry the first time it may run. */
	start?: () => Promise<void>;
	loadReplay?: () => SentryReplay | Promise<SentryReplay>;
	/** Prefer the initializing CDN configuration's Replay options while it is active. */
	canLoadReplay?: (client: SentryClient) => boolean;
	replayCategory: HasCondition<AllConsentNames>;
	piiCategory: HasCondition<AllConsentNames>;
	user?: () => SentryUser | null | undefined;
	onError?: (error: unknown) => void;
	/** Every registration's state, when several share this script. */
	registrations?: SentryExtras['registrations'];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a vendor may run under `condition`: it holds, and the visitor has
 * not turned the vendor off.
 */
const permitted = (
	info: Pick<ScriptCallbackInfo, 'consents' | 'vendor'>,
	condition: HasCondition<AllConsentNames>
): boolean => info.vendor?.granted !== false && has(condition, info.consents);

/** What only a site's own code passes the adapter. */
export interface SentryExtras {
	/** Receives load, start and Replay failures in place of the client. */
	onError?: (error: unknown) => void;
	/** The user `setUser` gets when user data is allowed. */
	user?: () => SentryUser | null | undefined;
	/**
	 * Every registration's state for `info`, when several registrations
	 * share this script. Each feature runs only when all of them allow it.
	 */
	registrations?: (info: ScriptCallbackInfo) => readonly ScriptCallbackInfo[];
}

const replayName = 'Replay';
const tracingName = 'BrowserTracing';
/** sessionStorage key where Sentry Replay keeps its session. */
const replaySessionKey = 'sentryReplaySession';
const errorsCategory: AllConsentNames = 'measurement';
/** Retry until a late-initialized SDK client appears or the adapter is removed. */
const clientRetryMs = 100;
const errorTags = { 'inth.integration': 'sentry' };
const urlDetailsPattern = /[?#]/u;
const cdnBaseUrl = 'https://browser.sentry-cdn.com';
/** The Sentry SDK version a site gets when it names none. */
export const SENTRY_DEFAULT_VERSION = '11.4.0';
/** Subresource integrity for the files of the default version. */
const defaultIntegrity: Record<string, string> = {
	'bundle.min.js':
		'sha384-yR8WDlaM5tdf6UYPdUkCyZhW0OUuGNnKT8haW281Se9cj9eZP3z+iKwFvivogWnz',
	'bundle.tracing.min.js':
		'sha384-leCZtyH0v+/d38CQgHkDf/buaYk8uIH2vrAwzlLXVLKTcrvUWEUGan36c9ooM12N',
	'replay.min.js':
		'sha384-mwyc35qA4ycC37dBKk3A7bdqEVGlz8Tk4XkoS0DE4B/No3NgDuhHiofBKNu9PPQh',
};

/**
 * A file of the Sentry browser SDK on Sentry's CDN, with its subresource
 * integrity when `version` is the default one.
 */
export const sentryCdnFile = (
	version: string,
	file: 'bundle.min.js' | 'bundle.tracing.min.js' | 'replay.min.js'
): { src: string; integrity?: string } => ({
	integrity:
		version === SENTRY_DEFAULT_VERSION ? defaultIntegrity[file] : undefined,
	src: `${cdnBaseUrl}/${version}/${file}`,
});

// Sentry allows one Replay per page, and an app can recreate this script on
// every render, so Replay bookkeeping lives with the client, not the adapter.
const clientStates = new WeakMap<SentryClient, ClientState>();
/** A reused recorder follows its current client without stacking old guards. */
const replayStates = new WeakMap<SentryReplay, ReplayState>();
// Register mounted gates before SDK initialization, so a later client sees
// every applicable denial even when that gate has no reason to poll for it.
const activeGates = new Set<ClientGate>();
// The same applies to starting Sentry: one start per `getClient`.
const starts = new WeakMap<() => SentryClient | undefined, Promise<void>>();

const isProduction = (): boolean =>
	(globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
		?.NODE_ENV === 'production';

const warn = (message: string): void => {
	if (!isProduction()) {
		console.warn(`[inth] ${message}`);
	}
};

const getSentryGlobal = (): SentryGlobal | undefined =>
	(globalThis as { Sentry?: SentryGlobal }).Sentry;

const isReplay = (value: unknown): value is SentryReplay =>
	typeof value === 'object' &&
	value !== null &&
	'stop' in value &&
	typeof value.stop === 'function' &&
	'start' in value &&
	typeof value.start === 'function' &&
	'startBuffering' in value &&
	typeof value.startBuffering === 'function' &&
	'getRecordingMode' in value &&
	typeof value.getRecordingMode === 'function';

const findReplay = (client: SentryClient): SentryReplay | undefined => {
	const integration = client.getIntegrationByName(replayName);
	return isReplay(integration) ? integration : undefined;
};

/**
 * Remove the Replay session id. Sentry clears it when it stops a recording,
 * but keeps it for a session it did not sample.
 */
const forgetReplaySession = (): void => {
	try {
		globalThis.sessionStorage?.removeItem(replaySessionKey);
	} catch {
		// Storage can be blocked; Sentry then keeps no session either.
	}
};

/** Disable collection through SDK settings while its permission is denied. */
const deniedDataCollection = () => ({
	cookies: false,
	databaseQueryData: false,
	frameContextLines: 0,
	genAI: { inputs: false, outputs: false },
	graphQL: { document: false, variables: false },
	httpBodies: [],
	httpHeaders: { request: false, response: false },
	queryParams: false,
	queues: false,
	stackFrameVariables: false,
	urlQueryParams: false,
	userInfo: false,
});

/** Apply denial or restore the original resolved settings, including allowlists. */
const applyPii = (client: SentryClient, state: ClientState): void => {
	const dataCollection = client.getDataCollectionOptions?.();
	if (dataCollection && state.collection) {
		const denied = deniedDataCollection();
		for (const field of Object.keys(denied) as (keyof typeof denied)[]) {
			if (Object.hasOwn(state.collection, field)) {
				dataCollection[field] = state.piiAllowed
					? state.collection[field]
					: denied[field];
			}
		}
	}
	const settings = client.getSdkMetadata?.()?.sdk?.settings;
	if (settings && state.inferIp !== undefined && state.inferIp !== 'never') {
		settings.infer_ip = state.piiAllowed ? state.inferIp : 'never';
	}
};

const loadScriptElement = (
	src: string,
	integrity?: string,
	nonce?: string
): Promise<void> =>
	new Promise((resolve, reject) => {
		const element = document.createElement('script');
		element.src = src;
		element.async = true;
		element.setAttribute('crossorigin', 'anonymous');
		if (nonce) {
			element.nonce = nonce;
		}
		if (integrity) {
			element.setAttribute('integrity', integrity);
		}
		element.addEventListener('load', () => {
			resolve();
		});
		element.addEventListener('error', () => {
			reject(new Error(`Could not load ${src}`));
		});
		document.head.append(element);
	});

const stripUrlDetails = (url: string): string => {
	const details = url.search(urlDetailsPattern);
	return details === -1 ? url : url.slice(0, details);
};

/** Strip SDK user and HTTP attributes, preserving unrelated telemetry fields. */
const redactCollectedAttributes = (payload: unknown): void => {
	if (!isRecord(payload)) {
		return;
	}
	for (const field of ['attributes', 'data']) {
		const attributes = payload[field];
		if (!isRecord(attributes)) {
			continue;
		}
		for (const key of Object.keys(attributes)) {
			if (
				key.startsWith('user.') ||
				key.startsWith('sentry.user.') ||
				key.startsWith('http.request.header.') ||
				key.startsWith('http.response.header.') ||
				key === 'url.query' ||
				key === 'url.fragment'
			) {
				Reflect.deleteProperty(attributes, key);
			} else if (key === 'url.full' || key === 'http.url') {
				const value = attributes[key];
				if (typeof value === 'string') {
					attributes[key] = stripUrlDetails(value);
				} else if (isRecord(value) && typeof value.value === 'string') {
					value.value = stripUrlDetails(value.value);
				}
			}
		}
	}
};

/** Retain Replay's public client hooks so they can follow a replaced client. */
const withReplayHooks = <Result>(
	replay: SentryReplay,
	setup: () => Result
): Result => {
	const binding = replayStates.get(replay);
	if (!binding) {
		return setup();
	}
	const { client } = binding;
	const { on } = client;
	const register = on as ReplayHookRegistrar;
	client.on = (name, listener) => {
		const unsubscribe = register.call(client, name, listener);
		binding.hooks.push({ callback: listener, name, unsubscribe });
		return unsubscribe;
	};
	try {
		return setup();
	} finally {
		client.on = on;
	}
};

/** Prevent application starts from buffering DOM data during denial or removal. */
const guardReplay = (
	client: SentryClient,
	replay: SentryReplay,
	state: ClientState
): void => {
	const binding = replayStates.get(replay);
	if (binding) {
		if (binding.client !== client) {
			const register = client.on as ReplayHookRegistrar;
			for (const hook of binding.hooks) {
				if (typeof hook.unsubscribe === 'function') {
					hook.unsubscribe();
				}
				hook.unsubscribe = register.call(client, hook.name, hook.callback);
			}
		}
		binding.client = client;
		binding.state = state;
		return;
	}
	replayStates.set(replay, { client, hooks: [], state });
	const allowed = (): boolean => {
		const current = replayStates.get(replay)?.state;
		return Boolean(
			current?.replayAllowed && !current.stopping && !current.stopFailed
		);
	};
	const { flush } = replay;
	if (flush) {
		replay.flush = (options) =>
			allowed()
				? withReplayHooks(replay, () => flush.call(replay, options))
				: Promise.resolve();
	}
	for (const method of ['start', 'startBuffering'] as const) {
		const start = replay[method];
		replay[method] = () => {
			if (allowed()) {
				withReplayHooks(replay, () => start.call(replay));
			}
		};
	}
};

/** Feedback keeps its message, but identifying contact fields require consent. */
const redactFeedback = (contexts: Record<string, unknown>): void => {
	if (isRecord(contexts.feedback)) {
		delete contexts.feedback.contact_email;
		delete contexts.feedback.name;
	}
};

/** HttpContext in older SDKs bypasses collection settings for headers and URLs. */
const redactRequest = (request: unknown): void => {
	if (!isRecord(request)) {
		return;
	}
	for (const field of ['headers', 'cookies', 'data', 'body', 'query_string']) {
		Reflect.deleteProperty(request, field);
	}
	if (typeof request.url === 'string') {
		request.url = stripUrlDetails(request.url);
	}
};

/** Standard SDK breadcrumbs collect URLs independently of collection settings. */
const redactBreadcrumbs = (breadcrumbs: unknown): void => {
	if (!Array.isArray(breadcrumbs)) {
		return;
	}
	for (const breadcrumb of breadcrumbs) {
		if (!isRecord(breadcrumb) || !isRecord(breadcrumb.data)) {
			continue;
		}
		let fields: string[] = [];
		if (breadcrumb.category === 'navigation') {
			fields = ['from', 'to'];
		} else if (
			breadcrumb.type === 'http' ||
			breadcrumb.category === 'fetch' ||
			breadcrumb.category === 'xhr'
		) {
			fields = ['url'];
		}
		for (const field of fields) {
			const url = breadcrumb.data[field];
			if (typeof url === 'string') {
				breadcrumb.data[field] = stripUrlDetails(url);
			}
		}
	}
};

/** Final redaction also catches users added by scope processors or beforeSend. */
const redactEnvelope = (envelope: SentryEnvelope): void => {
	for (const [header, payload] of envelope[1]) {
		if (!isRecord(payload)) {
			continue;
		}
		switch (header.type) {
			case 'event':
			case 'transaction':
			case 'replay_event':
			case 'feedback':
				delete payload.user;
				redactRequest(payload.request);
				redactBreadcrumbs(payload.breadcrumbs);
				if (isRecord(payload.contexts)) {
					redactCollectedAttributes(payload.contexts.trace);
					if (header.type === 'feedback') {
						redactFeedback(payload.contexts);
					}
				}
				if (Array.isArray(payload.spans)) {
					for (const span of payload.spans) {
						redactCollectedAttributes(span);
					}
				}
				break;
			case 'user_report':
				delete payload.email;
				delete payload.name;
				break;
			case 'session':
				delete payload.did;
				if (isRecord(payload.attrs)) {
					delete payload.attrs.ip_address;
				}
				break;
			case 'log':
			case 'trace_metric':
			case 'span':
				redactCollectedAttributes(payload);
				if (Array.isArray(payload.items)) {
					for (const item of payload.items) {
						redactCollectedAttributes(item);
					}
				}
				if (isRecord(payload.ingest_settings)) {
					payload.ingest_settings.infer_ip = 'never';
				}
				break;
			default:
				break;
		}
	}
};

const stopReplay = (
	client: SentryClient,
	state: ClientState,
	report: (error: unknown) => void
): void => {
	const replay = findReplay(client);
	if (
		replay &&
		replayStates.has(replay) &&
		replayStates.get(replay)?.state !== state
	) {
		// Old clients retain their integration reference after a CDN replacement.
		// Their cleanup must not stop the recorder or clear the new session.
		return;
	}
	try {
		if (replay && !state.stopping) {
			// Recording stops synchronously before the promise is returned.
			const pending = replay.stop({ flush: false });
			state.stopping = (async () => {
				try {
					await pending;
					state.stopFailed = false;
				} catch (error) {
					state.stopFailed = true;
					report(error);
				} finally {
					state.stopping = undefined;
				}
			})();
		}
	} catch (error) {
		state.stopFailed = true;
		report(error);
	} finally {
		forgetReplaySession();
	}
};

/** Apply the intersection once, then notify gates without letting them overwrite it. */
const applyClientPermissions = (
	client: SentryClient,
	state: ClientState,
	report: (error: unknown) => void
): void => {
	const gates = [...state.gates];
	const clientOptions = client.getOptions();
	const enabled = clientOptions.enabled !== false;
	// Preserve changes the app makes while Sentry is running.
	if (enabled !== state.lastEnabled) {
		state.enabled = enabled;
	}
	if (gates.length > 0) {
		state.errorsAllowed = gates.every((gate) => gate.permissions.errors);
	}
	clientOptions.enabled = state.enabled && state.errorsAllowed;
	state.lastEnabled = clientOptions.enabled !== false;
	state.piiAllowed =
		gates.length > 0 && gates.every((gate) => gate.permissions.pii);
	state.replayAllowed =
		gates.length > 0 &&
		gates.every((gate) => gate.permissions.replay) &&
		state.piiAllowed &&
		clientOptions.enabled !== false &&
		Boolean(client.getDsn());
	applyPii(client, state);
	if (!state.replayAllowed) {
		stopReplay(client, state, report);
	}
	for (const gate of gates) {
		gate.onChange(client, state);
	}
};

const detachGate = (gate: ClientGate): SentryClient | undefined => {
	const { client } = gate;
	if (!client) {
		return;
	}
	const state = clientStates.get(client);
	state?.gates.delete(gate);
	if (state?.gates.size === 0) {
		state.errorsAllowed = !gate.errorsGated;
	}
	gate.client = undefined;
	gate.onChange();
	return client;
};

/** Discover shared clients before applying any gate, including late SDK initialization. */
const syncClientGates = (
	released?: SentryClient,
	releasedReport?: (error: unknown) => void
): void => {
	const clients = new Map<SentryClient, (error: unknown) => void>();
	if (released && releasedReport) {
		clients.set(released, releasedReport);
	}
	for (const gate of activeGates) {
		try {
			const client = gate.getClient();
			if (client !== gate.client) {
				const previous = detachGate(gate);
				if (previous) {
					clients.set(previous, gate.report);
				}
				if (client) {
					gate.getState(client).gates.add(gate);
					gate.client = client;
				}
			}
			if (gate.client) {
				clients.set(gate.client, gate.report);
			}
		} catch (error) {
			gate.report(error);
			if (gate.client) {
				clients.set(gate.client, gate.report);
			}
		}
	}
	for (const [client, report] of clients) {
		const state = clientStates.get(client);
		if (state) {
			applyClientPermissions(client, state, report);
		}
	}
};

/** Share consent and Replay lifecycle handling between SDK and CDN modes. */
const createGate = (options: GateOptions) => {
	let latest: Permissions | undefined;
	let disposed = false;
	let revision = 0;
	let replayWanted: boolean | undefined;
	let piiWanted: boolean | undefined;
	let clientTimer: ReturnType<typeof setTimeout> | undefined;
	let pendingReplay: AbortController | undefined;

	const report = (error: unknown): void => {
		try {
			if (options.onError) {
				options.onError(error);
			} else {
				options
					.getClient()
					?.captureException(error, { captureContext: { tags: errorTags } });
			}
		} catch {
			// A Sentry failure must never break the consent change.
		}
	};

	const settle = async (pending: Promise<void>): Promise<void> => {
		try {
			await pending;
		} catch (error) {
			report(error);
		}
	};

	const getState = (client: SentryClient): ClientState => {
		const known = clientStates.get(client);
		if (known) {
			return known;
		}
		const collection = client.getDataCollectionOptions?.();
		const state: ClientState = {
			collection: collection ? { ...collection } : undefined,
			enabled: client.getOptions().enabled !== false,
			errorsAllowed: true,
			gates: new Set(),
			inferIp: client.getSdkMetadata?.()?.sdk?.settings?.infer_ip,
			lastEnabled: client.getOptions().enabled !== false,
			piiAllowed: false,
			replayAllowed: false,
		};
		clientStates.set(client, state);
		client.addEventProcessor((event) => {
			if (!state.piiAllowed) {
				delete event.user;
			}
			return event;
		});
		const filterEnvelope = (envelope: SentryEnvelope): void => {
			// stop({ flush: false }) discards the pending segment in supported
			// SDKs. Also block uploads already queued before denial or removal.
			if (!state.replayAllowed || state.stopping) {
				for (let index = envelope[1].length - 1; index >= 0; index -= 1) {
					const type = envelope[1][index]?.[0].type;
					if (type === 'replay_event' || type === 'replay_recording') {
						envelope[1].splice(index, 1);
					}
				}
			}
			if (!state.piiAllowed) {
				redactEnvelope(envelope);
			}
		};
		client.on('beforeEnvelope', filterEnvelope);
		const transport = client.getTransport?.();
		if (transport) {
			const { send } = transport;
			transport.send = (envelope) => {
				filterEnvelope(envelope);
				return send.call(transport, envelope);
			};
		}
		client.on('beforeSendSession', (session) => {
			if (state.piiAllowed) {
				return;
			}
			session.did = undefined;
			session.ipAddress = undefined;
			if (session.attrs) {
				session.attrs.ip_address = undefined;
			}
		});
		// close() can happen while consent already has enabled=false. The
		// option alone cannot distinguish that shutdown from our own denial.
		const { close } = client;
		if (close) {
			client.close = (timeout) => {
				state.enabled = false;
				return close.call(client, timeout);
			};
		}
		if (
			!options.startsSentry &&
			state.collection?.userInfo === true &&
			!has(options.piiCategory, ALL_DENIED)
		) {
			warn(
				'Sentry.init ran before Inth, so its first session can infer the visitor IP address before consent. Pass init to sentry(), or disable SDK collection and filter startup events as described in the Sentry integration guide.'
			);
		}
		const existing = findReplay(client);
		if (existing) {
			guardReplay(client, existing, state);
			state.mode = existing.getRecordingMode() ?? null;
			warn(
				'Sentry Replay was added in Sentry.init, so it loads and may record before consent. Remove replayIntegration() from Sentry.init and let sentry() load Replay instead.'
			);
		}
		return state;
	};

	const isClientEnabled = (client: SentryClient, state: ClientState): boolean =>
		state.enabled &&
		client.getOptions().enabled !== false &&
		Boolean(client.getDsn());

	const gate: ClientGate = {
		errorsGated: options.errorsGated,
		getClient: options.getClient,
		getState,
		onChange: (client, state) => {
			const replayAllowed = state?.replayAllowed ?? false;
			if (replayAllowed !== replayWanted) {
				replayWanted = replayAllowed;
				revision += 1;
				pendingReplay?.abort();
				pendingReplay = undefined;
			}
			// Ownership can become available without changing consent.
			// oxlint-disable-next-line no-use-before-define -- Replay startup synchronizes this gate, so the callbacks depend on each other.
			queueReplay();
			if (!client || !state) {
				piiWanted = undefined;
				return;
			}
			if (options.setUser && state.piiAllowed !== piiWanted) {
				piiWanted = state.piiAllowed;
				try {
					const user = state.piiAllowed ? options.user?.() : null;
					if (user !== undefined) {
						options.setUser(user);
					}
				} catch (error) {
					report(error);
				}
			}
		},
		permissions: { errors: false, pii: false, replay: false },
		report,
	};

	const sync = (): SentryClient | undefined => {
		if (disposed || !latest) {
			return;
		}
		syncClientGates();
		return gate.client;
	};

	const loadReplay = async (
		state: ClientState
	): Promise<SentryReplay | undefined> => {
		const { loadReplay: loadIntegration } = options;
		if (!loadIntegration) {
			return;
		}
		state.loading ??= (async () => await loadIntegration())();
		try {
			const replay = await state.loading;
			if (!isReplay(replay)) {
				throw new Error(
					'replay.load() did not return a Sentry Replay integration. Sentry CDN bundles without Replay return a placeholder; load replay.min.js first.'
				);
			}
			return replay;
		} catch (error) {
			state.loading = undefined;
			throw error;
		}
	};

	const resumeReplay = async (
		replay: SentryReplay,
		state: ClientState,
		signal: AbortSignal,
		allowed: () => boolean
	): Promise<void> => {
		if (replayStates.get(replay)?.state !== state) {
			return;
		}
		if (replay.getRecordingMode() !== undefined) {
			return;
		}
		if (!(await waitForReplayIdle(signal)) || !allowed()) {
			return;
		}
		if (state.mode === 'session') {
			replay.start();
		} else if (state.mode === 'buffer') {
			replay.startBuffering();
		}
	};

	const attachReplay = async (
		client: SentryClient,
		state: ClientState,
		replay: SentryReplay,
		signal: AbortSignal,
		allowed: () => boolean
	): Promise<void> => {
		const previousState = replayStates.get(replay)?.state;
		if (previousState && previousState !== state) {
			await previousState.stopping;
			if (previousState.stopFailed) {
				return;
			}
		}
		if (!allowed()) {
			return;
		}
		if (
			!(await waitForReplayIdle(signal)) ||
			!allowed() ||
			findReplay(client)
		) {
			return;
		}
		guardReplay(client, replay, state);
		withReplayHooks(replay, () => client.addIntegration(replay));
		state.mode = previousState
			? (previousState.mode ?? null)
			: (replay.getRecordingMode() ?? null);
		if (allowed()) {
			await resumeReplay(replay, state, signal, allowed);
		} else {
			stopReplay(client, state, report);
		}
	};

	const startReplay = async (
		startRevision: number,
		signal: AbortSignal
	): Promise<void> => {
		const isCurrent = () =>
			!signal.aborted &&
			!disposed &&
			replayWanted === true &&
			startRevision === revision;
		if (!(await waitForReplayPaint(signal)) || !isCurrent()) {
			return;
		}
		if (!(await waitForReplayLoad(signal)) || !isCurrent()) {
			return;
		}
		const client = sync();
		if (!client || !isCurrent()) {
			return;
		}
		const state = getState(client);
		const allowed = () =>
			isCurrent() &&
			state.gates.has(gate) &&
			state.replayAllowed &&
			options.getClient() === client &&
			isClientEnabled(client, state);
		if (!allowed()) {
			return;
		}
		await state.stopping;
		if (!allowed() || state.stopFailed) {
			return;
		}
		const existing = findReplay(client);
		if (existing) {
			await resumeReplay(existing, state, signal, allowed);
			return;
		}
		if (options.canLoadReplay?.(client) === false) {
			return;
		}
		const replay = await loadReplay(state);
		if (!replay) {
			return;
		}
		await attachReplay(client, state, replay, signal, allowed);
	};

	const queueReplay = (): void => {
		if (pendingReplay || disposed || !replayWanted) {
			return;
		}
		const controller = new AbortController();
		pendingReplay = controller;
		void (async () => {
			try {
				await startReplay(revision, controller.signal);
			} catch (error) {
				report(error);
			} finally {
				if (pendingReplay === controller) {
					pendingReplay = undefined;
				}
			}
		})();
	};

	// Keep the latest permission even when Sentry initializes much later.
	// Only one short retry timer runs, and removal cancels it.
	const retrySync = (): void => {
		if (clientTimer !== undefined || disposed || !latest?.errors) {
			return;
		}
		clientTimer = setTimeout(() => {
			clientTimer = undefined;
			try {
				if (sync()) {
					queueReplay();
				} else {
					retrySync();
				}
			} catch (error) {
				report(error);
			}
		}, clientRetryMs);
	};

	const denyClient = (released?: SentryClient): void => {
		try {
			syncClientGates(released, report);
			const client = options.getClient();
			if (!client) {
				return;
			}
			const existing = clientStates.get(client);
			if (existing && existing.gates.size > 0) {
				return;
			}
			const state = existing ?? getState(client);
			state.errorsAllowed = !options.errorsGated;
			applyClientPermissions(client, state, report);
			options.setUser?.(null);
		} catch (error) {
			report(error);
		}
	};

	const start = async (): Promise<void> => {
		if (!options.start) {
			return;
		}
		let pending = starts.get(options.getClient);
		if (!pending) {
			pending = options.start();
			starts.set(options.getClient, pending);
		}
		try {
			await pending;
		} catch (error) {
			starts.delete(options.getClient);
			throw error;
		}
		if (disposed) {
			denyClient();
		} else if (sync()) {
			queueReplay();
		}
	};

	const update = (info: ScriptCallbackInfo): void => {
		if (disposed) {
			return;
		}
		// Vendor denial overrides every feature condition, including necessary.
		const registrations = options.registrations?.(info) ?? [info];
		const every = (category: HasCondition<AllConsentNames>): boolean =>
			registrations.every((state) => permitted(state, category));
		const errors = !options.errorsGated || every(errorsCategory);
		latest = {
			errors,
			pii: every(options.piiCategory),
			replay: errors && every(options.replayCategory),
		};
		if (!errors) {
			clearTimeout(clientTimer);
			clientTimer = undefined;
		}
		if (typeof document === 'undefined') {
			return;
		}
		gate.permissions = latest;
		activeGates.add(gate);
		if (errors && options.start) {
			void settle(start());
		}
		try {
			if (!sync()) {
				retrySync();
			}
			queueReplay();
		} catch (error) {
			report(error);
		}
	};

	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		revision += 1;
		pendingReplay?.abort();
		pendingReplay = undefined;
		clearTimeout(clientTimer);
		clientTimer = undefined;
		latest = undefined;
		activeGates.delete(gate);
		denyClient(detachGate(gate));
	};

	const initialize = (): void => {
		if (disposed) {
			denyClient();
		} else {
			sync();
		}
	};

	return { dispose, initialize, report, sync, update };
};

type IntegrationsOption =
	| SentryIntegration[]
	| ((defaults: SentryIntegration[]) => SentryIntegration[])
	| undefined;

const isNamed = (value: unknown, name: string): boolean =>
	typeof value === 'object' &&
	value !== null &&
	'name' in value &&
	value.name === name;

/** Install consent before any SDK integration can capture startup data. */
const withConsentInitOptions = (
	initOptions: Record<string, unknown>,
	beforeCapture: () => void
): SentryInitOptions => {
	const integrations = initOptions.integrations as IntegrationsOption;
	return {
		...initOptions,
		integrations: (defaults) => {
			const list =
				typeof integrations === 'function'
					? integrations(defaults)
					: [...defaults, ...(integrations ?? [])];
			return [
				{
					beforeSetup: beforeCapture,
					name: 'InthConsent',
					setup: beforeCapture,
				},
				...list.filter((integration) => integration.name !== 'InthConsent'),
			];
		},
	};
};

const createInitOptions = (
	sentryGlobal: SentryGlobal,
	dsn: string,
	initOptions: Record<string, unknown>,
	tracing: boolean,
	beforeCapture: () => void
): Record<string, unknown> => {
	const integrations = initOptions.integrations as IntegrationsOption;
	return withConsentInitOptions(
		{
			...initOptions,
			dsn,
			// Like Sentry's Loader Script, add tracing when the bundle has it.
			integrations: (defaults: SentryIntegration[]) => {
				let list: SentryIntegration[];
				if (typeof integrations === 'function') {
					list = integrations(defaults);
				} else {
					list = [...defaults, ...(integrations ?? [])];
				}
				if (
					tracing &&
					sentryGlobal.browserTracingIntegration &&
					!list.some((integration) => isNamed(integration, tracingName))
				) {
					list.push(sentryGlobal.browserTracingIntegration());
				}
				return list;
			},
		},
		beforeCapture
	);
};

/** When Sentry runs: always, or only once `measurement` is allowed. */
export type SentryLoadMode = 'always' | 'after-consent';

/**
 * What the adapter needs to run Sentry from its CDN. The Inth server sends
 * these as plain JSON; {@link sentryOptionsProblem} checks them.
 */
export interface SentryAdapterOptions {
	/** The project's DSN, an https URL. */
	dsn: string;
	/** The Sentry SDK version the manifest loads. */
	version: string;
	/** Whether the loaded bundle has tracing, so `init` adds it. */
	tracing: boolean;
	loadMode: SentryLoadMode;
	/** Options for `Sentry.init`. From the Inth server, plain JSON only. */
	initOptions: Record<string, unknown>;
	/** Permission for SDK data collection, user data and IP inference. */
	piiCategory: HasCondition<AllConsentNames>;
	replay: {
		/** Whether Replay may load: its sample rates are above 0. */
		load: boolean;
		/** Permission Replay needs, besides `piiCategory`. */
		category: HasCondition<AllConsentNames>;
		/** Options for the page's first `replayIntegration()`. */
		options?: Record<string, unknown>;
	};
}

const cdnClients = new WeakMap<SentryClient, SentryAdapterOptions>();
const activeCdnConfigurations = new WeakSet<SentryAdapterOptions>();
const loadedCdnBundles = new WeakSet<HTMLScriptElement>();

/**
 * `base`, the script that loads the Sentry bundle, with the hooks that call
 * `Sentry.init` once it loads and keep the client within consent.
 */
export const sentryCdnScript = function sentryCdnScript(
	base: Script,
	options: SentryAdapterOptions,
	extras: SentryExtras = {}
): Script {
	const { dsn, initOptions, tracing, version } = options;
	const replayFile = sentryCdnFile(version, 'replay.min.js');
	let nonce: string | undefined;

	const gate = createGate({
		canLoadReplay: (client) => {
			const owner = cdnClients.get(client);
			return (
				owner === options ||
				(owner !== undefined && !activeCdnConfigurations.has(owner))
			);
		},
		errorsGated: options.loadMode === 'after-consent',
		getClient: () => getSentryGlobal()?.getClient(),
		loadReplay: options.replay.load
			? async () => {
					await loadScriptElement(replayFile.src, replayFile.integrity, nonce);
					return getSentryGlobal()?.replayIntegration?.(
						options.replay.options
					) as SentryReplay;
				}
			: undefined,
		onError: extras.onError,
		piiCategory: options.piiCategory,
		registrations: extras.registrations,
		replayCategory: options.replay.category,
		setUser: (user) => {
			getSentryGlobal()?.setUser(user);
		},
		startsSentry: true,
		user: extras.user,
	});
	const update = (info: ScriptCallbackInfo): void => {
		activeCdnConfigurations.add(options);
		if (info.element) {
			nonce = info.element.nonce || undefined;
		}
		gate.update(info);
	};

	let initialized = false;
	const initialize = (info: ScriptCallbackInfo): void => {
		update(info);
		if (
			initialized ||
			(options.loadMode === 'after-consent' && !info.hasConsent)
		) {
			return;
		}
		const sentryGlobal = getSentryGlobal();
		try {
			// Consent remounts keep their client. A newly adopted configuration
			// initializes once, without replacing it on every consent update.
			const previous = sentryGlobal?.getClient();
			if (sentryGlobal && (!previous || cdnClients.get(previous) !== options)) {
				const previousState = previous && clientStates.get(previous);
				const previousReplay = previous && findReplay(previous);
				sentryGlobal.init(
					createInitOptions(sentryGlobal, dsn, initOptions, tracing, () => {
						gate.initialize();
					})
				);
				const client = sentryGlobal.getClient();
				if (client) {
					const state = clientStates.get(client);
					if (client !== previous && state) {
						// Sentry permits one Replay per page. Transfer even a pending
						// load so a new client cannot construct a second recorder.
						state.loading =
							previousState?.loading ??
							(previousReplay ? Promise.resolve(previousReplay) : undefined);
					}
					cdnClients.set(client, options);
					initialized = true;
				}
			} else if (previous) {
				initialized = true;
			}
		} catch (error) {
			gate.report(error);
		}
		update(info);
	};

	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		onBeforeLoad: update,
		onConsentChange: (info) => {
			if (info.element && loadedCdnBundles.has(info.element)) {
				initialize(info);
			} else {
				update(info);
			}
		},
		onDispose: () => {
			activeCdnConfigurations.delete(options);
			gate.dispose();
		},
		onError: (info) => gate.report(info.error),
		onLoad: (info) => {
			if (info.element) {
				loadedCdnBundles.add(info.element);
			}
			initialize(info);
		},
	};
};

/** What the adapter needs to follow a Sentry SDK the site runs itself. */
export interface SentrySdkSettings extends SentryExtras {
	getClient: () => SentryClient | undefined;
	setUser?: (user: SentryUser | null) => void;
	/** Starts Sentry; with it, Inth calls it once Sentry may run. */
	init?: (options: SentryInitOptions) => unknown;
	initOptions?: Record<string, unknown>;
	/** Whether error monitoring waits for `measurement`. */
	errorsGated: boolean;
	piiCategory: HasCondition<AllConsentNames>;
	replayCategory: HasCondition<AllConsentNames>;
	/** Returns a new Replay integration, the first time Replay is allowed. */
	loadReplay?: () => SentryReplay | Promise<SentryReplay>;
}

/**
 * `base`, a callback-only script, with the hooks that keep the site's own
 * Sentry client within consent, and start it through `init` when given.
 */
export const sentrySdkScript = function sentrySdkScript(
	base: Script,
	settings: SentrySdkSettings
): Script {
	const { init } = settings;
	const gate = createGate({
		...settings,
		start: init
			? async () => {
					if (!settings.getClient()) {
						await init(
							withConsentInitOptions(settings.initOptions ?? {}, () => {
								gate.initialize();
							})
						);
					}
				}
			: undefined,
		startsSentry: init !== undefined,
	});
	return {
		...base,
		onBeforeLoad: gate.update,
		onConsentChange: gate.update,
		onDispose: gate.dispose,
		onLoad: gate.update,
	};
};

const SENTRY_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.]{1,40})?$/u;

/** Each `Sentry.init` option the Inth server may set, by its type. */
const INIT_OPTIONS: Readonly<
	Record<string, 'string' | 'rate' | 'count' | 'boolean'>
> = {
	attachStacktrace: 'boolean',
	debug: 'boolean',
	dist: 'string',
	environment: 'string',
	maxBreadcrumbs: 'count',
	profilesSampleRate: 'rate',
	release: 'string',
	replaysOnErrorSampleRate: 'rate',
	replaysSessionSampleRate: 'rate',
	sampleRate: 'rate',
	tracesSampleRate: 'rate',
};

/** Each `replayIntegration()` option the Inth server may set, by its type. */
const REPLAY_OPTIONS: Readonly<
	Record<string, 'strings' | 'count' | 'boolean'>
> = {
	block: 'strings',
	blockAllMedia: 'boolean',
	ignore: 'strings',
	mask: 'strings',
	maskAllInputs: 'boolean',
	maskAllText: 'boolean',
	maxReplayDuration: 'count',
	minReplayDuration: 'count',
	unblock: 'strings',
	unmask: 'strings',
};

const isType = (value: unknown, type: string): boolean => {
	switch (type) {
		case 'string': {
			return (
				typeof value === 'string' && value.length > 0 && value.length <= 200
			);
		}
		case 'rate': {
			return typeof value === 'number' && value >= 0 && value <= 1;
		}
		case 'count': {
			return Number.isInteger(value) && (value as number) >= 0;
		}
		case 'strings': {
			return (
				Array.isArray(value) && value.every((entry) => isType(entry, 'string'))
			);
		}
		default: {
			return typeof value === 'boolean';
		}
	}
};

/** The first name in `value` that `types` does not list, or with a value of the wrong type. */
const wrongField = (
	value: unknown,
	types: Readonly<Record<string, string>>
): string | undefined =>
	isRecord(value)
		? Object.keys(value).find(
				(name) =>
					!(
						Object.hasOwn(types, name) &&
						isType(value[name], types[name] as string)
					)
			)
		: '(not an object)';

/**
 * A DSN on Sentry's own ingest host, as the Inth server builds one from its
 * parts. A self-hosted Sentry stays npm-only.
 */
const SENTRY_DSN =
	/^https:\/\/[0-9A-Za-z]{1,64}@o\d{1,20}\.ingest(?:\.[a-z]{2,10})?\.sentry\.io\/\d{1,20}$/u;

const matches = (value: unknown, pattern: RegExp): boolean =>
	typeof value === 'string' && pattern.test(value);

const OPTION_NAMES: ReadonlySet<string> = new Set([
	'dsn',
	'initOptions',
	'loadMode',
	'piiCategory',
	'replay',
	'tracing',
	'version',
]);

const REPLAY_NAMES: ReadonlySet<string> = new Set([
	'category',
	'load',
	'options',
]);

/**
 * Why `options` are not {@link SentryAdapterOptions} the Inth server may
 * send, or `undefined`. It refuses any name it does not know, so no option
 * can carry code or a URL other than the DSN, and checks each value's type
 * without converting it.
 */
// oxlint-disable-next-line complexity -- One check per option.
export const sentryOptionsProblem = function sentryOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find((name) => !OPTION_NAMES.has(name));
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	const { replay } = options;
	if (!matches(options.dsn, SENTRY_DSN)) {
		return 'its dsn is not a sentry.io DSN as the Inth server builds one';
	}
	if (!matches(options.version, SENTRY_VERSION)) {
		return 'its version is not a version number';
	}
	if (
		typeof options.tracing !== 'boolean' ||
		!(options.loadMode === 'always' || options.loadMode === 'after-consent')
	) {
		return 'its tracing or loadMode has the wrong type';
	}
	if (!isCategoryCondition(options.piiCategory)) {
		return 'its piiCategory is not a condition over known categories';
	}
	const initOption = wrongField(options.initOptions, INIT_OPTIONS);
	if (initOption !== undefined) {
		return `its initOptions has the unknown or wrong option ${initOption}`;
	}
	if (
		!isRecord(replay) ||
		Object.keys(replay).some((name) => !REPLAY_NAMES.has(name)) ||
		typeof replay.load !== 'boolean' ||
		!isCategoryCondition(replay.category)
	) {
		return 'its replay is not a load flag with a category';
	}
	const replayOption =
		replay.options === undefined
			? undefined
			: wrongField(replay.options, REPLAY_OPTIONS);
	return replayOption === undefined
		? undefined
		: `its replay options have the unknown or wrong option ${replayOption}`;
};

/** The Sentry adapter, as a manifest's `adapter: { id: 'sentry' }` runs it. */
export const sentryAdapter: ManifestAdapter<SentryAdapterOptions> = {
	id: 'sentry',
	problem: sentryOptionsProblem,
	script: (base, options) => sentryCdnScript(base, options),
};
