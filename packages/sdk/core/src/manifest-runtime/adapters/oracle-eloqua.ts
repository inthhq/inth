/**
 * The Oracle Eloqua adapter: runs Eloqua's asynchronous tracking under Inth
 * consent. It keeps one `elqOptIn` or `elqOptOut` request in flight at a
 * time, across registrations and remounts, finds the response script the
 * request inserted in `document.scripts` by its `pps` and `siteid`, and
 * tracks a page view only after the opt-in response loads. A response it
 * cannot match blocks tracking until the page reloads.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'oracle-eloqua' }` with {@link EloquaAdapterOptions};
 * the `eloquaTracking()` helper in `@inth/integrations` builds its script
 * with the same function.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

interface EloquaQueue {
	push: (...commands: unknown[][]) => unknown;
}

type EloquaWindow = Window & { _elqQ?: EloquaQueue };

/** What a manifest's `adapter.options` hold for Oracle Eloqua. */
export interface EloquaAdapterOptions {
	/** The Eloqua site ID. */
	siteId: string;
	/** The lowercase first-party tracking hostname, when the site uses one. */
	firstPartyCookieDomain?: string;
}

/**
 * The stock loader, the only one known to insert its consent response
 * synchronously.
 */
const defaultScriptUrl = 'https://img.en25.com/i/elqCfg.min.js';

interface AccountIdentity {
	siteId: string;
	firstPartyCookieDomain?: string;
}

interface ConsentOwner extends AccountIdentity {
	hasConsent: boolean;
	loaded: boolean;
	initialize: () => void;
	invalidateTracking: () => void;
	track: (dispatcher: EloquaQueue) => boolean;
}

interface CapturedDispatcher {
	queue: EloquaQueue;
	synchronous: boolean;
}

const sameAccount = (left: AccountIdentity, right: AccountIdentity): boolean =>
	left.siteId === right.siteId &&
	left.firstPartyCookieDomain === right.firstPartyCookieDomain;

// Removing a tag cannot unload its dispatcher or cancel a detached download.
// A different account therefore needs a new document, even after disposal.
const installedAccounts = new WeakMap<Document, AccountIdentity>();
const failedWithdrawals = new WeakMap<Document, CapturedDispatcher>();

// Keep one consent request in flight, including across provider remounts.
// A response can update OPTIN before its load event, so removing its handlers
// cannot cancel it. Reconcile the latest choice after that response completes.
const createConsentDispatcher = (onIdle: () => void) => {
	const owners = new Set<ConsentOwner>();
	const reportedConflicts = new WeakSet<ConsentOwner>();
	let dispatcher: CapturedDispatcher | undefined;
	let desired = false;
	let pending = false;
	let executions = 0;
	let indeterminate = false;
	let conflicting = false;
	let settledDispatcher: EloquaQueue | undefined;
	let settledConsent: boolean | undefined;
	const account = (): AccountIdentity | undefined =>
		installedAccounts.get(document) ?? owners.values().next().value;
	const compatible = (owner: AccountIdentity): boolean => {
		const installed = account();
		return !installed || sameAccount(installed, owner);
	};
	const permitted = (): boolean =>
		owners.size > 0 &&
		[...owners].every((owner) => owner.hasConsent && compatible(owner));
	const retire = (): void => {
		if (owners.size === 0 && !pending && executions === 0 && !indeterminate) {
			onIdle();
		}
	};
	const block = (error: unknown): void => {
		indeterminate = true;
		console.error(
			'eloquaTracking: dispatcher failed. Reload before tracking again.',
			error
		);
	};
	const reconcile = (): void => {
		if (!dispatcher || pending || indeterminate) {
			return;
		}
		if (settledDispatcher === dispatcher.queue && settledConsent === desired) {
			return;
		}
		const currentDispatcher = dispatcher;
		const requested = desired;
		const before = new Set(document.scripts);
		let dispatchFailed = false;
		let dispatchError: unknown;
		try {
			currentDispatcher.queue.push([requested ? 'elqOptIn' : 'elqOptOut']);
		} catch (error) {
			dispatchFailed = true;
			dispatchError = error;
		}
		const added = Array.from(document.scripts).filter(
			(candidate) => !before.has(candidate) && candidate.src
		);
		const response = added.find((candidate) => {
			let url: URL;
			try {
				url = new URL(candidate.src);
			} catch {
				return false;
			}
			return (
				url.searchParams.get('pps') === (requested ? '41' : '42') &&
				url.searchParams.get('siteid') === account()?.siteId
			);
		});
		if (!response || dispatchFailed || added.length !== 1) {
			// The stock SDK appends synchronously and swallows insertion errors.
			// An unknown loader may still execute a deferred or unmatched response.
			indeterminate =
				!currentDispatcher.synchronous ||
				added.length > 0 ||
				Array.isArray(currentDispatcher.queue);
			console.error(
				`eloquaTracking: consent dispatch failed; no consent was confirmed.${indeterminate ? ' Reload before tracking again.' : ''}`,
				dispatchError ??
					new Error(
						'The loader did not create one matching consent response script'
					)
			);
			if (!requested && !indeterminate) {
				failedWithdrawals.set(document, currentDispatcher);
			}
			if (!response) {
				return;
			}
		}
		pending = true;
		let completed = false;
		const complete = (event: Event): void => {
			if (completed) {
				return;
			}
			completed = true;
			response.removeEventListener('load', complete);
			response.removeEventListener('error', complete);
			pending = false;
			if (!indeterminate && event.type === 'load') {
				settledDispatcher = currentDispatcher.queue;
				settledConsent = requested;
				if (!requested) {
					failedWithdrawals.delete(document);
				}
			}
			if (!indeterminate && event.type === 'error') {
				settledConsent = undefined;
				if (!requested) {
					failedWithdrawals.set(document, currentDispatcher);
				}
			}
			if (
				!indeterminate &&
				event.type === 'load' &&
				requested &&
				desired &&
				dispatcher === currentDispatcher
			) {
				try {
					for (const candidate of [...owners].reverse()) {
						if (candidate.loaded && candidate.track(currentDispatcher.queue)) {
							break;
						}
					}
				} catch (error) {
					block(error);
				}
			}
			if (
				event.type === 'load' ||
				desired !== requested ||
				dispatcher !== currentDispatcher
			) {
				reconcile();
			}
			retire();
		};
		response.addEventListener('load', complete, { once: true });
		response.addEventListener('error', complete, { once: true });
	};
	const refresh = (): void => {
		if (!permitted()) {
			dispatcher ??= failedWithdrawals.get(document);
		}
		const nextConflicting = [...owners].some((owner) => !compatible(owner));
		if (nextConflicting && !conflicting) {
			for (const owner of owners) {
				owner.invalidateTracking();
			}
		}
		conflicting = nextConflicting;
		for (const owner of owners) {
			if (!compatible(owner) && !reportedConflicts.has(owner)) {
				reportedConflicts.add(owner);
				console.error(
					'eloquaTracking: conflicting site ID or first-party cookie domain. ' +
						'Use one account configuration per page; reload to change it.'
				);
			}
		}
		if (permitted() && !indeterminate) {
			for (const owner of owners) {
				owner.initialize();
			}
		}
		desired = permitted() && [...owners].some((owner) => owner.loaded);
		reconcile();
	};
	return {
		block,
		compatible,
		completeExecution(): void {
			executions -= 1;
			retire();
		},
		release(owner: ConsentOwner): void {
			owners.delete(owner);
			refresh();
			retire();
		},
		start(identity: AccountIdentity): boolean {
			if (!permitted() || !compatible(identity) || indeterminate) {
				return false;
			}
			installedAccounts.set(document, {
				firstPartyCookieDomain: identity.firstPartyCookieDomain,
				siteId: identity.siteId,
			});
			executions += 1;
			return true;
		},
		update(owner: ConsentOwner, nextDispatcher?: CapturedDispatcher): void {
			owners.add(owner);
			if (nextDispatcher && compatible(owner)) {
				dispatcher = nextDispatcher;
			}
			refresh();
		},
	};
};

// All registrations share the physical global SDK, even across site IDs.
const consentDispatchers = new WeakMap<
	Document,
	ReturnType<typeof createConsentDispatcher>
>();
const getConsentDispatcher = () => {
	let dispatcher = consentDispatchers.get(document);
	if (!dispatcher) {
		const ownerDocument = document;
		dispatcher = createConsentDispatcher(() =>
			consentDispatchers.delete(ownerDocument)
		);
		consentDispatchers.set(document, dispatcher);
	}
	return dispatcher;
};

const initializedElements = new WeakSet<HTMLScriptElement>();
const elementAccounts = new WeakMap<HTMLScriptElement, AccountIdentity>();
const elementDispatchers = new WeakMap<HTMLScriptElement, CapturedDispatcher>();

/**
 * `base`, the script built from Eloqua's manifest, made to load Eloqua and
 * enable page tracking only after consent. The loader loads from
 * `base.src`, or the URL `scriptLoader.sources` or the script registry
 * chose.
 */
export const eloquaScript = function eloquaScript(
	base: Script,
	{ firstPartyCookieDomain, siteId }: EloquaAdapterOptions
): Script {
	// The tag's `src` waits for consent in the browser, so a server render
	// writes no inline start.
	const { serverStart: _serverStart, ...rest } = base;
	const script = base;
	let consent: ReturnType<typeof getConsentDispatcher> | undefined;
	let hasConsent = false;
	let initialized = false;
	let loaded = false;
	let generation = 0;
	let trackedGeneration = -1;
	let element: HTMLScriptElement | undefined;
	let latestInfo: ScriptCallbackInfo | undefined;
	const track = (dispatcher: EloquaQueue): boolean => {
		if (
			hasConsent &&
			element?.isConnected &&
			trackedGeneration !== generation
		) {
			dispatcher.push(['elqTrackPageView', window.location.href]);
			trackedGeneration = generation;
			return true;
		}
		return false;
	};
	const captureDispatcher = (loadedElement: HTMLScriptElement) => {
		const browser = window as EloquaWindow;
		let dispatcher = elementDispatchers.get(loadedElement);
		const installed = elementAccounts.get(loadedElement);
		if (!dispatcher && browser._elqQ && installed) {
			dispatcher = {
				queue: browser._elqQ,
				// Only the stock loader is known to answer synchronously; a
				// source entry can move this tag to another URL.
				synchronous: loadedElement.src === defaultScriptUrl,
			};
			try {
				dispatcher.queue.push(['elqSetSiteId', installed.siteId]);
				if (installed.firstPartyCookieDomain) {
					dispatcher.queue.push([
						'elqUseFirstPartyCookie',
						installed.firstPartyCookieDomain,
					]);
				}
			} catch (error) {
				consent?.block(error);
				return;
			}
			elementDispatchers.set(loadedElement, dispatcher);
		}
		return dispatcher;
	};
	const initialize = (info: ScriptCallbackInfo): void => {
		if (info.element && info.element !== element) {
			({ element } = info);
			initialized = initializedElements.has(info.element);
			// Another provider may have completed this tag while setup was blocked.
			loaded = elementDispatchers.has(info.element);
			generation += 1;
		}
		if (
			initialized ||
			!hasConsent ||
			!element ||
			!consent?.start({ firstPartyCookieDomain, siteId })
		) {
			return;
		}
		initialized = true;
		elementAccounts.set(element, { firstPartyCookieDomain, siteId });
		script.onBeforeLoad?.(info);
		initializedElements.add(element);
		const pendingElement = element;
		// Detached downloads can still execute and consume another tag's queue.
		// Configure and capture each actual execution before core's load callback.
		const complete = (event: Event): void => {
			pendingElement.removeEventListener('load', complete);
			pendingElement.removeEventListener('error', complete);
			if (event.type === 'load') {
				captureDispatcher(pendingElement);
			}
			consent?.completeExecution();
		};
		element.addEventListener('load', complete, { once: true });
		element.addEventListener('error', complete, { once: true });
		element.src = info.source?.src ?? script.src ?? '';
	};
	const owner: ConsentOwner = {
		firstPartyCookieDomain,
		hasConsent,
		initialize: () => {
			if (latestInfo) {
				initialize(latestInfo);
				owner.loaded = loaded;
			}
		},
		invalidateTracking: () => {
			generation += 1;
		},
		loaded,
		siteId,
		track,
	};
	const updateConsent = (dispatcher?: CapturedDispatcher): void => {
		consent ??= getConsentDispatcher();
		Object.assign(owner, { hasConsent, loaded });
		consent.update(owner, dispatcher);
	};
	return {
		...rest,
		observeConsentBeforeLoad: true,
		onBeforeLoad(info) {
			if (hasConsent !== info.hasConsent) {
				generation += 1;
			}
			({ hasConsent } = info);
			latestInfo = info;
			updateConsent();
			if (!initialized) {
				info.element?.removeAttribute('src');
			}
		},
		onConsentChange(info) {
			if (hasConsent !== info.hasConsent) {
				generation += 1;
			}
			({ hasConsent } = info);
			latestInfo = info;
			updateConsent();
		},
		onDispose() {
			hasConsent = false;
			loaded = false;
			generation += 1;
			consent?.release(owner);
		},
		onLoad(info) {
			if (initialized && consent?.compatible(owner)) {
				loaded = true;
				element = info.element ?? element;
				updateConsent(element && captureDispatcher(element));
			}
		},
	};
};

const SITE_ID = /^[0-9A-Za-z_-]{1,64}$/u;
const LABEL = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/u;

/** Whether `value` is a lowercase DNS name, with no IP address. */
const isHostname = (value: unknown): boolean => {
	if (typeof value !== 'string' || value.length > 253) {
		return false;
	}
	const labels = value.split('.');
	return (
		labels.length >= 2 &&
		labels.every((label) => LABEL.test(label)) &&
		!/^\d+$/u.test(labels.at(-1) ?? '')
	);
};

const OPTION_NAMES: ReadonlySet<string> = new Set([
	'firstPartyCookieDomain',
	'siteId',
]);

/**
 * Why `options` are not {@link EloquaAdapterOptions} the Inth server may
 * send, or `undefined`.
 */
export const eloquaOptionsProblem = function eloquaOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find((name) => !OPTION_NAMES.has(name));
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	if (!(typeof options.siteId === 'string' && SITE_ID.test(options.siteId))) {
		return 'its siteId is not a site ID';
	}
	return options.firstPartyCookieDomain === undefined ||
		isHostname(options.firstPartyCookieDomain)
		? undefined
		: 'its firstPartyCookieDomain is not a hostname';
};

/** The Oracle Eloqua adapter, as a manifest's `adapter: { id: 'oracle-eloqua' }` runs it. */
export const eloquaAdapter: ManifestAdapter<EloquaAdapterOptions> = {
	id: 'oracle-eloqua',
	problem: eloquaOptionsProblem,
	script: (base, options) => eloquaScript(base, options),
};
