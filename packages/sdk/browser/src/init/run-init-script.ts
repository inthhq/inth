/**
 * The init script (`inth.js`): the part of the script tag that runs before
 * the page's largest image has loaded.
 *
 * It installs a stand-in `window.inth`, starts `/v1/consent/init`, and
 * starts the scripts a stored choice allows. It renders no UI and records
 * no choice: when the answer owes a banner, it loads the engine
 * (`inth.hosted.js`) at once and starts fetching the consent UI
 * (`inth.choices.js`) beside it, so the banner waits for neither in turn.
 * Otherwise it loads the engine after the page's priority images, at the
 * first input, or after `ENGINE_TIMEOUT_MS`, and hands it everything
 * through the boot object (`./read-boot.ts`). Every consent call made before
 * the engine waits for it, and runs once it has loaded.
 *
 * It runs nothing early it cannot run the way the engine would: any option
 * the engine reads differently (custom copy, an experiment, a custom
 * transport or storage) leaves that part to the engine, which then loads
 * at once.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk-core';
import {
	configFromPrefetchedInit,
	hasStoredConsent,
	pendingSnapshot,
	primeInitRequest,
	snapshotFromPrefetchedInit,
} from '@inth/sdk-core/runtime/deferred-snapshot';
import type {
	DeferredSnapshotOptions,
	SSRInitialData,
} from '@inth/sdk-core/runtime/deferred-snapshot';
import {
	isPlainScript,
	isRunnableNow,
	startPlainScripts,
} from '@inth/sdk-core/surface-actions/plain-scripts';
import { resolveOptOut } from '@inth/sdk-core/surface-state';

import { activateGatedScripts } from '../activate-gated-scripts';
import type {
	ConsentClient,
	ScriptTagClientOptions,
} from '../consent-client.model';
import type { GlobalApiBase, QueuedCall } from '../create-global-with';
import { dropRejection } from '../drop-rejection';
import { GLOBAL_NAME } from '../global-name';
import { hasDecided } from '../has-decided';
import { ACTION_ATTRIBUTE, PREFERENCES_HASH } from '../page-actions.model';
import {
	mergeClientOptions,
	readPageOptions,
} from '../script-tag-options.model';
import { version } from '../version';
import { hostedMarker, readHostedMarker } from './hosted-marker';
import { hasPendingOptOutConfirmation } from './init-script-session.store';
import { partSrc } from './part-src';
import type { InitFile } from './part-src';
import { readPolicyCache, writePolicyCache } from './policy-cache.store';
import { BOOT_KEY } from './read-boot';
import type { InitBoot, InitRecordsPart } from './read-boot';
import { scheduleEngine } from './schedule-engine';
import { supportsEarlyStart } from './supports-early-start';

/**
 * How long the engine waits for the init script's `/v1/consent/init`
 * answer, and the init script for `inth.records.js`.
 */
const INIT_WAIT_MS = 3000;

/** The waits before each retry of a failed `inth.hosted.js`. */
const ENGINE_RETRY_MS = [1000, 2000];

/** Calls that act on consent or the UI. They load the engine at once. */
const ACTIONS = [
	'acceptAll',
	'rejectAll',
	'save',
	'saveIAB',
	'dismissNotice',
	'optOut',
	'showBanner',
	'openDialog',
	'closeDialog',
	'setLanguage',
	'identify',
	'mountUI',
	'processIframes',
] as const;

/** Methods that return a promise. */
const ASYNC = new Set<string>([
	'acceptAll',
	'rejectAll',
	'save',
	'saveIAB',
	'dismissNotice',
	'optOut',
	'identify',
]);

/** `data-inth-action` values, as the engine's client routes them. */
const PAGE_ACTIONS: Record<string, string> = {
	accept: 'acceptAll',
	banner: 'showBanner',
	close: 'closeDialog',
	customize: 'openDialog',
	dismiss: 'dismissNotice',
	'opt-out': 'optOut',
	reject: 'rejectAll',
};

const notReady = (): Error =>
	new Error('@inth/sdk: call inth.init() first, or wait for inth.ready().');

/** A queued call whose result the caller waits for (see `runQueued`). */
type SettledCall = QueuedCall & {
	settle?: (result: unknown, failed?: boolean) => void;
};

const usesPrivacyChoicesLink = (options: ScriptTagClientOptions): boolean =>
	options.presentation?.optOutLink === 'privacy-choices' ||
	options.presentation?.optOutLink === 'california-privacy-choices';

/**
 * Run the init script for `script`: install the stand-in `window.inth`,
 * start `/v1/consent/init` unless the page inits itself, and schedule the engine.
 *
 * @returns The stand-in, or `null` when `window.inth` is already an API.
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One lifecycle: stand in, start, hand over.
export const runInitScript = function runInitScript(
	script: HTMLScriptElement | null
): GlobalApiBase | null {
	const target = window as unknown as Record<string, unknown>;
	const existing = target[GLOBAL_NAME];
	if (existing && !Array.isArray(existing)) {
		// The engine or another init script is installed already.
		return null;
	}
	const queued = (existing ?? []) as unknown[];
	const { manual, options: scriptOptions } = readPageOptions(script);

	let api: GlobalApiBase | null = null;
	let options: ScriptTagClientOptions | null = null;
	let snapshot: ConsentSnapshot | null = null;
	let lastInit: SSRInitialData | undefined;
	let engineRequested = false;
	/** Set once `inth.hosted.js` failed on every try. */
	let engineError: Error | null = null;
	const parts: { records?: InitRecordsPart } = {};
	const partLoads: Partial<Record<InitFile, Promise<unknown>>> = {};
	const configs: ScriptTagClientOptions[] = [];
	const listeners = new Set<(next: ConsentSnapshot) => void>();
	const cleanups: (() => void)[] = [];

	/** Keep the last `/v1/consent/init` policy once the visitor has a choice. */
	const cachePolicy = function cachePolicy(): void {
		const projectUrl =
			options?.projectUrl ?? readHostedMarker(options?.mode)?.projectUrl;
		if (lastInit && projectUrl) {
			writePolicyCache(projectUrl, options?.overrides, lastInit);
		}
	};
	const boot: InitBoot = {
		attach(engine) {
			api = engine;
			for (const cleanup of cleanups.splice(0)) {
				cleanup();
			}
			listeners.clear();
			// A choice the engine records also keeps the policy for the next
			// page's init script.
			engine.onInit((client) => {
				const off = client.subscribe((next) => {
					if (next.explicitChoice) {
						off();
						cachePolicy();
					}
				});
			});
		},
		calls: [],
		disposed: false,
		prefetch: null,
		provide(part) {
			// A file from another release may not match this script's data.
			if (part.version === version) {
				(parts as Record<string, unknown>)[part.name] = part;
			}
		},
		script,
		settled: null,
		version,
	};

	const fileSrc = (file: InitFile): string | null =>
		partSrc(file, script, script?.getAttribute('src'));

	const appendScript = function appendScript(src: string): HTMLScriptElement {
		const element = document.createElement('script');
		element.src = src;
		const nonce = options?.nonce ?? scriptOptions.nonce;
		if (nonce) {
			element.nonce = nonce;
		}
		document.head.append(element);
		return element;
	};

	/** The engine is not coming: reject what waits for it, and what asks later. */
	const giveUp = function giveUp(message: string): void {
		engineError = new Error(message);
		// oxlint-disable-next-line no-console -- The engine is not coming.
		console.error(message);
		for (const call of boot.calls.splice(0) as SettledCall[]) {
			call.settle?.(engineError, true);
		}
	};

	const loadEngine = function loadEngine(): void {
		if (engineRequested || api || boot.disposed) {
			return;
		}
		engineRequested = true;
		const src = fileSrc('hosted');
		if (!src) {
			giveUp(
				'@inth/sdk: inth.js cannot tell where inth.hosted.js is. Load inth.js from a URL, or set data-hosted-src.'
			);
			return;
		}
		let tries = 0;
		const request = () => {
			const element = appendScript(src);
			element.addEventListener('error', () => {
				element.remove();
				if (api) {
					return;
				}
				if (boot.disposed) {
					// A later `init()` requests it again.
					engineRequested = false;
					return;
				}
				const wait = ENGINE_RETRY_MS[tries];
				tries += 1;
				if (wait !== undefined) {
					// The same URL: the browser fetches it again unless the
					// failure came with cache headers, as a missing file's may.
					setTimeout(() => {
						if (boot.disposed) {
							engineRequested = false;
						} else if (!api) {
							request();
						}
					}, wait);
					return;
				}
				giveUp(
					`@inth/sdk: inth.hosted.js failed to load ${tries} times, from ${src}.`
				);
			});
		};
		request();
	};

	/**
	 * Fetch `inth.records.js`, once. Settles when it has run, failed, or
	 * after {@link INIT_WAIT_MS}; `parts` holds what it provided.
	 */
	const loadPart = function loadPart(file: 'records'): Promise<unknown> {
		// oxlint-disable-next-line promise/avoid-new -- Settled by the script element.
		partLoads[file] ??= new Promise((resolve) => {
			const src = fileSrc(file);
			if (!src || api) {
				resolve(null);
				return;
			}
			const element = appendScript(src);
			element.addEventListener('load', resolve);
			element.addEventListener('error', resolve);
			setTimeout(resolve, INIT_WAIT_MS);
		});
		return partLoads[file];
	};

	/**
	 * Start fetching `inth.choices.js`, the consent UI the engine loads to
	 * render a banner, so it arrives with the engine instead of after it.
	 * The URL is the one the engine computes: next to `inth.hosted.js`,
	 * unless the backend or the tag names it.
	 */
	const preloadChoices = function preloadChoices(): void {
		const src = partSrc('choices', script, fileSrc('hosted'));
		if (!src) {
			return;
		}
		const link = document.createElement('link');
		link.rel = 'preload';
		link.as = 'script';
		link.href = src;
		const nonce = options?.nonce ?? scriptOptions.nonce;
		if (nonce) {
			link.nonce = nonce;
		}
		document.head.append(link);
	};

	const queue = function queue(call: SettledCall): void {
		if (engineError) {
			call.settle?.(engineError, true);
		} else {
			boot.calls.push(call);
		}
	};

	/**
	 * Queue a call for the engine and load it now. A method that returns a
	 * promise resolves with the engine's result.
	 */
	const act = function act(method: string, args: unknown[]): unknown {
		if (api) {
			return (
				api as unknown as Record<string, (...rest: unknown[]) => unknown>
			)[method]?.(...args);
		}
		const call: SettledCall = [method, ...args];
		let result: Promise<unknown> | undefined;
		if (ASYNC.has(method)) {
			// oxlint-disable-next-line promise/avoid-new -- Settled by the engine's queue.
			result = new Promise((resolve, reject) => {
				call.settle = (value, failed) =>
					failed ? reject(value) : resolve(value);
			});
		}
		queue(call);
		loadEngine();
		return result;
	};

	const setSnapshot = function setSnapshot(next: ConsentSnapshot): void {
		snapshot = next;
		for (const listener of listeners) {
			try {
				listener(next);
			} catch (error) {
				// oxlint-disable-next-line no-console -- A page listener failed.
				console.error('@inth/sdk: a subscribe listener threw.', error);
			}
		}
	};

	/**
	 * Start what `next` allows: the page's plain `scripts` and its inert
	 * `data-inth-category` tags. A non-plain script that may run needs the
	 * engine's loader, which then loads at once.
	 */
	const startScripts = function startScripts(next: ConsentSnapshot): void {
		const current = options ?? scriptOptions;
		const scripts = current.scripts ?? [];
		startPlainScripts(scripts, next, current.nonce);
		if (
			scripts.some(
				(entry) => isRunnableNow(entry, next) && !isPlainScript(entry)
			)
		) {
			loadEngine();
		}
		// A tag naming a vendor counts a denial only once the engine has
		// declared the vendor, so a visitor with denials waits for it.
		if (next.vendorChoice?.denied.length) {
			return;
		}
		const scan = () => {
			if (!api) {
				activateGatedScripts(
					next,
					document,
					current.nonce ? { nonce: current.nonce } : {}
				);
			}
		};
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', scan, { once: true });
		}
		scan();
	};

	/** Start `/v1/consent/init` and everything that follows from its answer. */
	const begin = function begin(initOptions?: ScriptTagClientOptions): void {
		if (options) {
			return;
		}
		const current = [...configs, initOptions ?? {}].reduce(
			mergeClientOptions,
			scriptOptions
		);
		options = current;
		const hosted = readHostedMarker(current.mode);
		const projectUrl = current.projectUrl ?? hosted?.projectUrl;
		const gpc =
			(navigator as Navigator & { globalPrivacyControl?: boolean })
				.globalPrivacyControl === true;
		const snapshotOptions: DeferredSnapshotOptions = {
			consentCategories: current.consentCategories,
			gpc,
			overrides: current.overrides,
		};
		snapshot = pendingSnapshot(snapshotOptions);
		let pending: Promise<SSRInitialData | undefined> | undefined;
		if (supportsEarlyStart(current, projectUrl)) {
			try {
				pending = primeInitRequest({
					overrides: current.overrides,
					projectUrl,
				});
			} catch {
				pending = undefined;
			}
		}
		if (!(pending && projectUrl)) {
			// Nothing to show or start without the engine: load it now, as a
			// one-file script tag would.
			loadEngine();
			return;
		}
		const stored = hasStoredConsent();
		let answered = false;
		const markAnswered = () => {
			answered = true;
		};
		// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
		void pending.then(markAnswered, markAnswered);
		// A returning visitor: `inth.records.js`, the record reader, loads at
		// once. The choice they stored, evaluated against the policy the last
		// `/v1/consent/init` sent, starts its scripts as soon as it has run, unless
		// `/v1/consent/init` answered first. Settles `false` when it did not run.
		const records = stored
			? // oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
				loadPart('records').then(() => {
					const reader = parts.records;
					if (!reader) {
						return false;
					}
					const read = reader.readStoredRecords(undefined, Date.now());
					if (read.found) {
						snapshotOptions.records = read.records;
						const cached =
							answered || api
								? undefined
								: snapshotFromPrefetchedInit(
										readPolicyCache(projectUrl, current.overrides),
										snapshotOptions
									);
						if (cached) {
							setSnapshot(cached);
							startScripts(cached);
						}
					}
					return true;
				})
			: true;
		// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
		const handled = Promise.all([pending, records]).then(([data, readable]) => {
			if (api || boot.disposed) {
				return;
			}
			lastInit = data;
			if (!readable) {
				// A stored choice the init script could not read: the engine
				// decides, now.
				loadEngine();
				return;
			}
			const resolved = snapshotFromPrefetchedInit(data, snapshotOptions);
			if (!(data && resolved)) {
				// A response the init script cannot read, or none: the engine
				// decides, now.
				loadEngine();
				return;
			}
			const config = configFromPrefetchedInit(data, current.overrides);
			if (config) {
				boot.prefetch = { config, overrides: current.overrides, projectUrl };
			}
			if (stored) {
				writePolicyCache(projectUrl, current.overrides, data);
			}
			setSnapshot(resolved);
			startScripts(resolved);
			if (resolved.activeUI !== 'banner') {
				if (hasPendingOptOutConfirmation()) {
					loadEngine();
				}
				return;
			}
			// A banner is owed: only the engine renders it, from the consent UI
			// file. Fetch both now, side by side.
			loadEngine();
			if (current.ui !== false && current.ui?.banner !== false) {
				preloadChoices();
			}
		});
		// The engine waits for this before it takes over, so it starts from
		// the answer instead of sending /init again, but not for long.
		boot.settled = Promise.race([
			// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
			handled.catch(() => undefined),
			// oxlint-disable-next-line promise/avoid-new -- A timer as a promise.
			new Promise<void>((resolve) => {
				setTimeout(resolve, INIT_WAIT_MS);
			}),
		]);
	};

	const onPageClick = function onPageClick(event: MouseEvent): void {
		const element = event.target instanceof Element ? event.target : null;
		const named = element
			?.closest(`[${ACTION_ATTRIBUTE}]`)
			?.getAttribute(ACTION_ATTRIBUTE);
		const resolvedOptions = options ?? readPageOptions(script, configs).options;
		let action: string | null = null;
		if (named === 'opt-out' && usesPrivacyChoicesLink(resolvedOptions)) {
			action = 'openDialog';
		} else if (named && PAGE_ACTIONS[named]) {
			action = PAGE_ACTIONS[named];
		} else if (
			element
				?.closest('a[href]')
				?.getAttribute('href')
				?.endsWith(PREFERENCES_HASH)
		) {
			action = 'openDialog';
		}
		if (!action) {
			return;
		}
		event.preventDefault();
		dropRejection(act(action, []));
	};
	document.addEventListener('click', onPageClick);
	cleanups.push(() => document.removeEventListener('click', onPageClick));

	/** With `failable`, rejects when the engine fails to load. */
	const withClient = function withClient<Result>(
		run: (client: ConsentClient) => Result,
		failable = false
	): Promise<Result> {
		// oxlint-disable-next-line promise/avoid-new -- Settled from the engine's onInit.
		return new Promise((resolve, reject) => {
			const call: SettledCall = [
				'onInit',
				(client: ConsentClient) => {
					try {
						resolve(run(client));
					} catch (error) {
						reject(error);
					}
				},
			];
			if (failable) {
				call.settle = (error, failed) => {
					if (failed) {
						reject(error);
					}
				};
			}
			queue(call);
		});
	};

	const forward = (method: string, args: unknown[]) =>
		(api as unknown as Record<string, (...rest: unknown[]) => unknown>)[
			method
		]?.(...args);

	const readSnapshot = function readSnapshot(): ConsentSnapshot {
		if (!snapshot) {
			throw notReady();
		}
		return snapshot;
	};

	const standIn = {
		[BOOT_KEY]: boot,
		get client() {
			return api?.client ?? null;
		},
		config(config: ScriptTagClientOptions) {
			if (api) {
				return api.config(config);
			}
			configs.push(config);
			queue(['config', config]);
		},
		get devtools() {
			return api?.devtools ?? null;
		},
		set devtools(value) {
			if (api) {
				api.devtools = value;
			}
		},
		dispose() {
			if (api) {
				return api.dispose();
			}
			const disposed = new Error(
				'@inth/sdk: dispose() ran before inth.hosted.js loaded.'
			);
			for (const call of boot.calls.splice(0) as SettledCall[]) {
				call.settle?.(disposed, true);
			}
			if (engineError) {
				// Given up: a later `init()` gets three new tries.
				engineError = null;
				engineRequested = false;
			}
			options = null;
			snapshot = null;
			// No later input, image load or timer loads the engine, and an
			// engine already on its way installs itself without initialising
			// (`autoInit`). A `/v1/consent/init` answer still in flight renders nothing.
			boot.disposed = true;
			for (const cleanup of cleanups.splice(0)) {
				cleanup();
			}
			listeners.clear();
		},
		getDeclaredVendors: () => (api ? api.getDeclaredVendors() : []),
		getOptOutState: () =>
			api ? api.getOptOutState() : resolveOptOut(readSnapshot()),
		getSnapshot: () => (api ? api.getSnapshot() : readSnapshot()),
		getVendorChoice: () =>
			api ? api.getVendorChoice() : readSnapshot().vendorChoice,
		has: (condition: Parameters<ConsentClient['has']>[0]) =>
			api
				? api.has(condition)
				: isRunnableNow({ category: condition }, readSnapshot()),
		hasConsented: () => (api ? api.hasConsented() : hasDecided(readSnapshot())),
		hosted: hostedMarker,
		get hosting() {
			return api?.hosting ?? null;
		},
		init(initOptions?: ScriptTagClientOptions) {
			if (api) {
				return api.init(initOptions);
			}
			queue(initOptions ? ['init', initOptions] : ['init']);
			if (boot.disposed) {
				// The listeners that would load the engine are gone: the engine
				// initialises from the queued call as soon as it arrives.
				boot.disposed = false;
				loadEngine();
				return standIn;
			}
			begin(initOptions);
			return standIn;
		},
		isVendorAllowed(vendorId: string) {
			if (!api) {
				throw new Error(
					'@inth/sdk: isVendorAllowed() needs inth.hosted.js. Call it from inth.onInit().'
				);
			}
			return api.isVendorAllowed(vendorId);
		},
		get mode() {
			return api?.mode ?? null;
		},
		on(event: string, listener: (payload: unknown) => void) {
			if (api) {
				return forward('on', [event, listener]);
			}
			let active = true;
			let off: (() => void) | undefined;
			void withClient((client) => {
				if (active) {
					off = client.on(event as never, listener as never);
				}
			});
			return () => {
				active = false;
				off?.();
			};
		},
		onInit(listener: (client: ConsentClient) => void) {
			if (api) {
				return api.onInit(listener);
			}
			let active = true;
			void withClient((client) => {
				if (active) {
					listener(client);
				}
			});
			return () => {
				active = false;
			};
		},
		pkg: '@inth/sdk',
		provideGPP(module: Parameters<GlobalApiBase['provideGPP']>[0]) {
			if (api) {
				return api.provideGPP(module);
			}
			queue(['provideGPP', module]);
		},
		push(...calls: unknown[]) {
			if (api) {
				return api.push(...calls);
			}
			for (const call of calls) {
				const [method, ...args] = Array.isArray(call) ? call : [];
				const own = (standIn as Record<string, unknown>)[method as string];
				if (typeof method === 'string' && typeof own === 'function') {
					(own as (...rest: unknown[]) => unknown).apply(standIn, args);
				} else {
					queue(call as QueuedCall);
				}
			}
			return calls.length;
		},
		ready: () =>
			api ? api.ready() : withClient((client) => client.ready(), true),
		subscribe(listener: (next: ConsentSnapshot) => void) {
			if (api) {
				return api.subscribe(listener);
			}
			listeners.add(listener);
			let active = true;
			let off: (() => void) | undefined;
			void withClient((client) => {
				listeners.delete(listener);
				if (active) {
					off = client.subscribe(listener);
				}
			});
			return () => {
				active = false;
				listeners.delete(listener);
				off?.();
			};
		},
		version,
	};
	for (const method of ACTIONS) {
		(standIn as Record<string, unknown>)[method] = (...args: unknown[]) =>
			act(method, args);
	}
	target[GLOBAL_NAME] = standIn;

	// Calls queued on the array before this tag, in order.
	for (const call of queued) {
		standIn.push(call);
	}
	if (!manual) {
		begin();
	}
	cleanups.push(scheduleEngine(loadEngine));
	return standIn as unknown as GlobalApiBase;
};
