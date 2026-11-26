/**
 * The FullStory adapter: runs the FullStory recorder under Inth consent.
 * Before `fs.js` runs it installs FullStory's v2 `FS` stub, whose `*Async`
 * commands return promises and which keeps the page's original `fetch` for
 * the recorder, and starts the SDK with capture off. It starts, restarts and
 * shuts down capture as consent comes and goes, and sets element consent,
 * across every Inth registration of FullStory on the page: capture runs only
 * while all of them allow it. An `FS` another installer or another recorder
 * configuration created is refused, since FullStory cannot be reconfigured
 * without a reload.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'fullstory', options: { orgId, elementConsent } }`; the
 * `fullStory()` helper in `@inth/integrations` builds its script with the
 * same function, and adds the site's own host and script path.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

/** FullStory v2 dispatcher arguments, including Async completion callbacks. */
export type FullStoryCall = [
	command: string,
	argument: unknown,
	source: unknown,
	resolve: ((value: unknown) => void) | undefined,
	reject: ((reason: unknown) => void) | undefined,
	version: number,
];

/** Callable v2 namespace. Async commands return promises before and after load. */
export interface FullStoryApi {
	(
		command: `${string}Async`,
		argument?: unknown,
		source?: unknown,
		version?: number
	): Promise<unknown>;
	(
		command: string,
		argument?: unknown,
		source?: unknown,
		version?: number
	): unknown;
	q?: FullStoryCall[];
	_api?: (...args: FullStoryCall) => unknown;
	_v?: string;
	_w?: { fetch?: typeof fetch; XMLHttpRequest: typeof XMLHttpRequest };
}

interface FullStoryWindow {
	FS?: FullStoryApi;
	_fs_org?: string;
	_fs_host?: string;
	_fs_script?: string;
	_fs_capture_on_startup?: boolean;
	_fs_namespace?: string;
}

/** What the Inth server may set for the adapter. */
export interface FullStoryAdapterOptions {
	orgId: string;
	/** Consent for elements configured as capture with consent. */
	elementConsent: boolean;
}

/** The FullStory host and script path, without a scheme. */
export interface FullStoryEndpoints {
	host: string;
	script: string;
}

/** What the `fullStory()` helper adds for a site. */
export interface FullStoryExtras {
	/** The site's host and script path. @default FullStory's own, in the org's region */
	endpoints?: FullStoryEndpoints;
	/**
	 * Every registration sharing this script, for a helper that shares one
	 * script between them. @default the one `info` describes
	 */
	registrations?: (info: ScriptCallbackInfo) => readonly ScriptCallbackInfo[];
}

const page = (): FullStoryWindow => window as unknown as FullStoryWindow;

const asyncCommand = /Async$/u;

const rejectQueue = (api: FullStoryApi, error: Error): void => {
	const queue = api.q;
	if (!queue) {
		return;
	}
	const reject = (...calls: FullStoryCall[]): number => {
		for (const call of calls) {
			call[4]?.(error);
		}
		return 0;
	};
	reject(...queue);
	queue.length = 0;
	queue.push = reject;
};

// Matches @fullstory/snippet 2.1.0: strip Async and forward six arguments.
const createApi = (): FullStoryApi => {
	const metadata: Pick<FullStoryApi, 'q' | '_api' | '_v' | '_w'> = {
		_v: '2.1.0',
		_w: { XMLHttpRequest: window.XMLHttpRequest, fetch: window.fetch },
		q: [],
	};
	// oxlint-disable-next-line no-use-before-define -- The callable and its SDK metadata share one identity.
	const api = Object.assign(call, metadata);
	function call(
		command: `${string}Async`,
		argument?: unknown,
		source?: unknown,
		version?: number
	): Promise<unknown>;
	function call(
		command: string,
		argument?: unknown,
		source?: unknown,
		version?: number
	): unknown;
	function call(
		command: string,
		argument?: unknown,
		source?: unknown,
		version = 2
	): unknown {
		const dispatch = (
			name: string,
			resolve?: FullStoryCall[3],
			reject?: FullStoryCall[4]
		): unknown => {
			if (api._api) {
				return api._api(name, argument, source, resolve, reject, version || 2);
			}
			api.q?.push([name, argument, source, resolve, reject, version || 2]);
			return undefined;
		};
		if (asyncCommand.test(command)) {
			return new Promise<unknown>((resolve, reject) => {
				dispatch(command.replace(asyncCommand, ''), resolve, reject);
			});
		}
		return dispatch(command);
	}
	if (window.fetch) {
		window.fetch = Object.assign(function instrumentedFetch(
			this: Window,
			...args: Parameters<typeof fetch>
		): Promise<Response> {
			const original = api._w?.fetch;
			if (!original) {
				throw new Error('fullStory: saved fetch is unavailable');
			}
			return original.apply(this, args);
		}, window.fetch);
	}
	return api;
};

interface Recorder {
	api: FullStoryApi;
	element?: HTMLScriptElement;
	configuration: string;
	inserted: boolean;
	insertionObserver?: MutationObserver;
	loaded: boolean;
	started: boolean;
	appliedConsent?: boolean;
	appliedElementConsent?: boolean;
}
interface Gate {
	consent: boolean;
	elementConsent: boolean;
}
const recorders = new WeakMap<FullStoryApi, Recorder>();
const gates = new WeakMap<Document, Set<Gate>>();
const markRecorderInserted = (recorder: Recorder): void => {
	recorder.inserted = true;
	recorder.insertionObserver?.disconnect();
	recorder.insertionObserver = undefined;
};
const readRecorderInsertions = (
	recorder: Recorder,
	records = recorder.insertionObserver?.takeRecords() ?? []
): void => {
	const { element } = recorder;
	if (
		element &&
		(element.isConnected ||
			records.some(({ addedNodes }) =>
				Array.from(addedNodes).includes(element)
			))
	) {
		markRecorderInserted(recorder);
	}
};
const reloadError = (): Error =>
	new Error(
		'fullStory: reload the page to change the recorder configuration or replace an existing FS installation'
	);
const applyRecorderConsent = (recorder: Recorder): void => {
	if (!recorder.loaded) {
		return;
	}
	const owners = [...(gates.get(document) ?? [])];
	const consent =
		page().FS === recorder.api &&
		owners.length > 0 &&
		owners.every((owner) => owner.consent);
	const elementConsent =
		consent && owners.every((owner) => owner.elementConsent);
	if (
		recorder.appliedConsent === consent &&
		recorder.appliedElementConsent === elementConsent
	) {
		return;
	}
	recorder.api('setIdentity', { consent: elementConsent });
	if (recorder.appliedConsent !== consent) {
		if (consent) {
			recorder.api(
				recorder.started || recorder.appliedConsent === false
					? 'restart'
					: 'start'
			);
			recorder.started = true;
		} else {
			recorder.api('shutdown');
		}
	}
	recorder.appliedConsent = consent;
	recorder.appliedElementConsent = elementConsent;
};
const observeRecorderElement = (
	recorder: Recorder,
	element: HTMLScriptElement | undefined
): void => {
	recorder.element = element;
	if (!recorder.inserted) {
		if (typeof MutationObserver === 'undefined') {
			markRecorderInserted(recorder);
		} else {
			recorder.insertionObserver ??= new MutationObserver((records) => {
				readRecorderInsertions(recorder, records);
			});
			// Start before core appends, including body-targeted shallow copies.
			for (const target of [document.head, document.body]) {
				if (target) {
					recorder.insertionObserver.observe(target, { childList: true });
				}
			}
		}
	}
	// An interrupted append can transfer the bootstrap to a new element.
	// Only the current SDK element can make this recorder ready.
	element?.addEventListener(
		'load',
		() => {
			if (recorder.element !== element) {
				return;
			}
			markRecorderInserted(recorder);
			recorder.loaded = true;
			applyRecorderConsent(recorder);
		},
		{ once: true }
	);
	element?.addEventListener(
		'error',
		() => {
			if (recorder.element === element) {
				rejectQueue(
					recorder.api,
					new Error(`fullStory: error loading ${element?.src}`)
				);
			}
		},
		{ once: true }
	);
};
// One predicate per configuration keeps recreated helpers the same resource.
const callbackOnlyChecks = new Map<string, () => boolean>();
const callbackOnlyFor = (configuration: string): (() => boolean) => {
	let check = callbackOnlyChecks.get(configuration);
	if (!check) {
		check = () => {
			if (typeof window === 'undefined' || !page().FS) {
				return false;
			}
			const recorder = recorders.get(page().FS as FullStoryApi);
			if (!recorder || recorder.configuration !== configuration) {
				return true;
			}
			readRecorderInsertions(recorder);
			if (recorder.element?.isConnected) {
				return false;
			}
			return recorder.inserted;
		};
		callbackOnlyChecks.set(configuration, check);
	}
	return check;
};
const matchingRecorder = (configuration: string): Recorder | undefined => {
	const { FS } = page();
	if (!FS) {
		return undefined;
	}
	const recorder = recorders.get(FS);
	if (!recorder || recorder.configuration !== configuration) {
		throw reloadError();
	}
	return recorder;
};

const fullStoryDomain = /^(?:[^.]+\.)*fullstory\.com(?:\/|$)/u;
const regionLabel = /^[a-z]{2,3}[0-9]+$/u;

/** The organization's FullStory region, or `undefined` for the default. */
// Matches @fullstory/browser 2.1.2's orgLocale rules.
export const fullStoryOrgLocale = function fullStoryOrgLocale(
	orgId: string
): string | undefined {
	const sections = orgId.split('-');
	const locale = sections.at(-1);
	if (
		sections.length < 3 ||
		(sections[0]?.length ?? 0) > 1 ||
		locale === 'na1'
	) {
		return undefined;
	}
	return locale;
};

const regionalize = (value: string, locale: string | undefined): string => {
	const pathIndex = value.indexOf('/');
	const host = pathIndex === -1 ? value : value.slice(0, pathIndex);
	// Check the host alone so a proxy path cannot match FullStory's domain.
	if (!locale || !fullStoryDomain.test(host)) {
		return value;
	}
	const path = pathIndex === -1 ? '' : value.slice(pathIndex);
	const labels = host.split('.');
	const insertAt = labels.length - 2;
	const existing = insertAt > 0 ? labels[insertAt - 1] : undefined;
	if (existing === locale) {
		return value;
	}
	if (existing !== undefined && regionLabel.test(existing)) {
		labels[insertAt - 1] = locale;
	} else {
		labels.splice(insertAt, 0, locale);
	}
	return labels.join('.') + path;
};

/**
 * The FullStory host and script path for `orgId`: `host` and `script`, or
 * FullStory's own, each moved to the organization's region when it is on
 * FullStory's domain.
 */
export const fullStoryEndpoints = function fullStoryEndpoints(
	orgId: string,
	host = 'fullstory.com',
	script = 'edge.fullstory.com/s/fs.js'
): FullStoryEndpoints {
	const locale = fullStoryOrgLocale(orgId);
	return {
		host: regionalize(host, locale),
		script: regionalize(script, locale),
	};
};

const configurationOf = (
	orgId: string,
	{ host, script }: FullStoryEndpoints,
	scriptUrl: string | undefined
): string => JSON.stringify([orgId, host, script, scriptUrl]);

/**
 * Throws when `FS` on the page belongs to another installer or another
 * recorder configuration than `base` with these options would start.
 */
export const assertFullStoryOwner = function assertFullStoryOwner(
	base: Pick<Script, 'src'>,
	{ orgId }: Pick<FullStoryAdapterOptions, 'orgId'>,
	endpoints: FullStoryEndpoints = fullStoryEndpoints(orgId)
): void {
	if (typeof document !== 'undefined') {
		matchingRecorder(configurationOf(orgId, endpoints, base.src));
	}
};

/**
 * `base`, the script that loads `fs.js`, with the hooks that bootstrap the
 * recorder with capture off and follow consent. Its `onBeforeLoad` installs
 * the `FS` stub, so a server render cannot start the file from the HTML:
 * the script has no `serverStart`.
 */
export const fullStoryScript = function fullStoryScript(
	base: Script,
	{ elementConsent, orgId }: FullStoryAdapterOptions,
	{
		endpoints = fullStoryEndpoints(orgId),
		registrations = (info) => [info],
	}: FullStoryExtras = {}
): Script {
	const { host, script: scriptPath } = endpoints;
	const configuration = configurationOf(orgId, endpoints, base.src);
	const gate: Gate = { consent: false, elementConsent };
	let ownedRecorder: Recorder | undefined;
	const updateGate = (consent: boolean): void => {
		gate.consent = consent;
		let owners = gates.get(document);
		if (!owners) {
			owners = new Set();
			gates.set(document, owners);
		}
		owners.add(gate);
	};
	const update = (consent: boolean): void => {
		updateGate(consent);
		const recorder = ownedRecorder ?? matchingRecorder(configuration);
		if (recorder) {
			ownedRecorder = recorder;
			applyRecorderConsent(recorder);
		}
	};
	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		// A retained runtime, including a pending download, needs callbacks
		// only. A function survives object-spread customization and is
		// checked at mount.
		callbackOnly: callbackOnlyFor(configuration),
		observeConsentBeforeLoad: true,
		onBeforeLoad(info) {
			const { element, hasConsent } = info;
			const src = element?.isConnected ? null : element?.getAttribute('src');
			// Core still inserts the element if configuration validation throws.
			if (src) {
				element?.removeAttribute('src');
			}
			const existing = matchingRecorder(configuration);
			ownedRecorder = existing;
			updateGate(hasConsent);
			if (existing) {
				readRecorderInsertions(existing);
				if (!existing.inserted && !existing.element?.isConnected && element) {
					existing.element?.removeAttribute('src');
					observeRecorderElement(existing, element);
				}
				if (element === existing.element && src) {
					element?.setAttribute('src', src);
				}
				applyRecorderConsent(existing);
				return;
			}
			if (!registrations(info).some((owner) => owner.hasConsent)) {
				return;
			}
			const fullStoryWindow = page();
			fullStoryWindow._fs_org = orgId;
			fullStoryWindow._fs_host = host;
			fullStoryWindow._fs_script = scriptPath;
			fullStoryWindow._fs_capture_on_startup = false;
			fullStoryWindow._fs_namespace = 'FS';
			const api = createApi();
			const recorder: Recorder = {
				api,
				configuration,
				element,
				inserted: false,
				loaded: false,
				started: false,
			};
			recorders.set(api, recorder);
			ownedRecorder = recorder;
			fullStoryWindow.FS = api;
			// Removing an async script cannot guarantee that its execution stops.
			// Keep completion across disposal so remounts reuse even a pending SDK.
			observeRecorderElement(recorder, element);
			api('init', {
				env: { captureOnStartup: false, host, orgId, script: scriptPath },
			});
			if (src) {
				element?.setAttribute('src', src);
			}
		},
		onConsentChange({ hasConsent }) {
			update(hasConsent);
		},
		onDispose({ element }) {
			if (typeof document === 'undefined') {
				return;
			}
			gates.get(document)?.delete(gate);
			const { FS } = page();
			const current = FS ? recorders.get(FS) : undefined;
			const recorder = ownedRecorder ?? current;
			if (recorder) {
				// Core supplies registered elements even after replacement detaches them.
				if (element !== undefined && element === recorder.element) {
					markRecorderInserted(recorder);
				}
				applyRecorderConsent(recorder);
			}
		},
		onLoad({ hasConsent }) {
			updateGate(hasConsent);
			const recorder = matchingRecorder(configuration);
			if (!recorder) {
				return;
			}
			applyRecorderConsent(recorder);
		},
		// Reject a replacement created before another Inth configuration
		// started, before core removes the active owner. Other installations
		// stay a per-script error so they don't block the rest of the batch.
		validate: () => {
			const { FS } = typeof window === 'undefined' ? {} : page();
			if (!FS) {
				return;
			}
			const active = recorders.get(FS);
			if (active && active.configuration !== configuration) {
				throw reloadError();
			}
		},
	};
};

const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/u;

/**
 * Why `options` are not {@link FullStoryAdapterOptions}, or `undefined`.
 * It refuses any name it does not know.
 */
export const fullStoryOptionsProblem = function fullStoryOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find(
		(name) => name !== 'orgId' && name !== 'elementConsent'
	);
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	if (!(typeof options.orgId === 'string' && ORG_ID.test(options.orgId))) {
		return 'its orgId is not an organization ID';
	}
	return typeof options.elementConsent === 'boolean'
		? undefined
		: 'its elementConsent is not true or false';
};

/** The FullStory adapter, as `adapter: { id: 'fullstory' }` runs it. */
export const fullStoryAdapter: ManifestAdapter<FullStoryAdapterOptions> = {
	id: 'fullstory',
	problem: fullStoryOptionsProblem,
	script: (base, options) => fullStoryScript(base, options),
};
