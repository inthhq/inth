/**
 * The Amazon Ads adapter: Amazon's timestamped `amzn` queue under Inth
 * consent. On a grant it queues `setRegion`, `addTag` and the first
 * `trackEvent`; on a revoke before amzn.js runs, it drops the commands it
 * queued, so a later grant queues them again and amzn.js never sends them
 * for a visitor who withdrew.
 *
 * A manifest from the Inth server names it as `adapter: { id: 'amazon-ads' }`
 * with {@link AmazonAdsAdapterOptions}. The `amazonAdsTag()` helper in
 * `@inth/integrations` builds its script with {@link amazonAdsScript} and
 * adds what only a site's own code can pass: the visitor's country, IP
 * address and GPP string for Amazon's consent helper, and PageView
 * attributes.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

/** A queued Amazon command and the time the caller issued it. */
export type AmazonAdsQueueEntry = [args: IArguments, timestamp: number];

/** Amazon's callable tag API, including its pre-load command queue. */
export interface AmazonAdsFunction {
	(...args: unknown[]): void;
	q?: AmazonAdsQueueEntry[];
	version?: string;
}

/** Documented input to Amazon's optional consent helper. */
export interface AmazonAdsConsent {
	countryCode: string;
	enableAdStorage: boolean;
	enableUserData: boolean;
	ipAddress?: string;
	gpp?: string;
}

type AmazonWindow = Window & {
	amzn?: AmazonAdsFunction;
	amznConsent?: (consent: AmazonAdsConsent) => void;
};

/** What a manifest's `adapter.options` holds for Amazon Ads. */
export interface AmazonAdsAdapterOptions {
	/** Tag ID from the Amazon Ads console. */
	tagId: string;
	/** Region of the Amazon advertising account. */
	region: 'NA' | 'EU';
	/** Send one PageView after the tag is initialized. */
	trackPageView: boolean;
}

/** What only a site's own code passes the adapter. */
export interface AmazonAdsExtras {
	/** Attributes passed to the initial PageView event. */
	pageViewAttributes?: Record<string, unknown>;
	/**
	 * The visitor's country, upper case. Loads Amazon's consent helper
	 * before amzn.js and forwards consent to it.
	 */
	countryCode?: string;
	/** Visitor IP address forwarded to the consent helper. */
	ipAddress?: string;
	/** Existing IAB GPP string forwarded to the consent helper. */
	gpp?: string;
	/** The consent helper's URL. */
	consentScriptUrl?: string;
}

const consentHelperUrl = 'https://c.amazon-adsystem.com/aat/amzn-consent.js';

// Different configurations can borrow the same Inth-created ACS element.
const helperOwners = new WeakMap<HTMLScriptElement, number>();

interface ConsentOwner {
	readonly allowed: boolean;
	readonly details: Pick<AmazonAdsConsent, 'countryCode' | 'ipAddress' | 'gpp'>;
}

interface SharedConsent {
	owners: Set<ConsentOwner>;
	lastConsent?: AmazonAdsConsent;
	api?: AmazonWindow['amznConsent'];
}

// ACS is global even when distinct configurations borrow different elements.
const consentOwners = new WeakMap<Document, SharedConsent>();

/**
 * `base`, the script built from the Amazon Ads manifest, with the hooks that
 * queue Amazon's commands under consent, and with `extras.countryCode`, load
 * Amazon's consent helper first.
 */
export const amazonAdsScript = function amazonAdsScript(
	base: Script,
	options: AmazonAdsAdapterOptions,
	extras: AmazonAdsExtras = {}
): Script {
	const win = (): AmazonWindow => window as AmazonWindow;
	const { countryCode } = extras;
	let allowed = false;
	let initialized = false;
	let disposed = false;
	let sharedConsent: SharedConsent | undefined;
	const consentOwner: ConsentOwner = {
		get allowed() {
			return allowed;
		},
		details: { countryCode: countryCode ?? '' },
	};
	if (extras.ipAddress !== undefined) {
		consentOwner.details.ipAddress = extras.ipAddress;
	}
	if (extras.gpp !== undefined) {
		consentOwner.details.gpp = extras.gpp;
	}
	let helper: HTMLScriptElement | undefined;
	let releaseHelper: (() => void) | undefined;
	const pendingCommands = new Set<AmazonAdsQueueEntry>();

	const ensureQueue = () => {
		if (win().amzn) {
			return;
		}
		const pending: AmazonAdsQueueEntry[] = [];
		const queue = function queue() {
			// oxlint-disable-next-line prefer-rest-params -- Match Amazon's arguments-and-timestamp queue.
			pending.push([arguments, Date.now()]);
		};
		queue.q = pending;
		queue.version = '0.0';
		win().amzn = queue;
	};

	const forwardConsent = () => {
		const state = sharedConsent;
		const { amznConsent } = win();
		if (!state || typeof amznConsent !== 'function') {
			return;
		}
		const source =
			(state.owners.has(consentOwner) && allowed ? consentOwner : undefined) ??
			[...state.owners].find((owner) => owner.allowed) ??
			state.owners.values().next().value ??
			consentOwner;
		const permitted = state.owners.has(source) && source.allowed;
		const consent: AmazonAdsConsent = {
			...source.details,
			enableAdStorage: permitted,
			enableUserData: permitted,
		};
		const previous = state.lastConsent;
		if (
			state.api === amznConsent &&
			previous?.countryCode === consent.countryCode &&
			previous.enableAdStorage === permitted &&
			previous.ipAddress === consent.ipAddress &&
			previous.gpp === consent.gpp
		) {
			return;
		}
		amznConsent(consent);
		state.lastConsent = consent;
		state.api = amznConsent;
	};

	const initialize = () => {
		if (
			!allowed ||
			initialized ||
			(countryCode && typeof win().amznConsent !== 'function')
		) {
			return;
		}
		ensureQueue();
		const queue = win().amzn?.q;
		const previousLength = queue?.length ?? 0;
		win().amzn?.('setRegion', options.region);
		win().amzn?.('addTag', options.tagId);
		if (options.trackPageView) {
			win().amzn?.('trackEvent', 'PageView', extras.pageViewAttributes ?? {});
		}
		for (const entry of queue?.slice(previousLength) ?? []) {
			pendingCommands.add(entry);
		}
		initialized = true;
	};

	const discardPendingCommands = () => {
		const queue = win().amzn?.q;
		if (queue) {
			for (let index = queue.length - 1; index >= 0; index -= 1) {
				const entry = queue[index];
				if (entry && pendingCommands.has(entry)) {
					queue.splice(index, 1);
					initialized = false;
				}
			}
		}
		pendingCommands.clear();
	};

	const startConsentHelper = (info: ScriptCallbackInfo) => {
		if (!countryCode || win().amznConsent || helper) {
			return;
		}
		const helperId = `${info.elementId}-consent`;
		const existing = document.getElementById(helperId);
		const existingHelper =
			existing instanceof HTMLScriptElement ? existing : undefined;
		helper = existingHelper ?? document.createElement('script');
		if (!existingHelper) {
			helper.id = helperId;
			// Ordered dynamic scripts execute the helper before the core-owned tag.
			helper.async = false;
			helper.src = extras.consentScriptUrl ?? consentHelperUrl;
			if (info.element?.nonce) {
				helper.nonce = info.element.nonce;
			}
		}
		const element = helper;
		if (!existingHelper || helperOwners.has(element)) {
			helperOwners.set(element, (helperOwners.get(element) ?? 0) + 1);
		}
		const completed = (event: Event) => {
			element.removeEventListener('load', completed);
			element.removeEventListener('error', completed);
			if (disposed) {
				return;
			}
			if (event.type === 'error') {
				console.error(
					'amazonAdsTag: consent helper failed to load. Reload to retry.'
				);
				return;
			}
			forwardConsent();
			initialize();
		};
		releaseHelper = () => {
			element.removeEventListener('load', completed);
			element.removeEventListener('error', completed);
			const owners = helperOwners.get(element);
			if (owners === 1) {
				helperOwners.delete(element);
				element.remove();
			} else if (owners !== undefined) {
				helperOwners.set(element, owners - 1);
			}
			helper = undefined;
		};
		helper.addEventListener('load', completed, { once: true });
		helper.addEventListener('error', completed, { once: true });
		if (!existingHelper) {
			document.head.appendChild(helper);
		}
	};

	const update = (info: ScriptCallbackInfo) => {
		if (info.replacing) {
			return;
		}
		const changed = allowed !== info.hasConsent;
		allowed = info.hasConsent;
		if (countryCode && !sharedConsent) {
			sharedConsent = consentOwners.get(document) ?? { owners: new Set() };
			consentOwners.set(document, sharedConsent);
			sharedConsent.owners.add(consentOwner);
		}
		if (!allowed) {
			discardPendingCommands();
			if (win().amzn) {
				forwardConsent();
			}
			return;
		}
		if (!changed) {
			return;
		}
		ensureQueue();
		startConsentHelper(info);
		forwardConsent();
		initialize();
	};

	// The hooks run in the browser, so a server render leaves the tag to it.
	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		async: !countryCode,
		onBeforeLoad: update,
		onConsentChange: update,
		onDispose: (info) => {
			disposed = true;
			// Hold this permission until incoming membership is known. A
			// replacement can include a real withdrawal, so read current consent.
			allowed =
				info.afterReplacement !== undefined &&
				(info.getCurrentConsent?.().hasConsent ?? info.hasConsent);
			discardPendingCommands();
			releaseHelper?.();
			const finish = () => {
				allowed = false;
				sharedConsent?.owners.delete(consentOwner);
				try {
					forwardConsent();
				} finally {
					if (
						sharedConsent?.owners.size === 0 &&
						consentOwners.get(document) === sharedConsent
					) {
						consentOwners.delete(document);
					}
				}
			};
			if (info.afterReplacement) {
				info.afterReplacement(finish);
			} else {
				finish();
			}
		},
	};
};

const OPTION_NAMES: ReadonlySet<string> = new Set([
	'region',
	'tagId',
	'trackPageView',
]);

const TAG_ID = /^[0-9A-Za-z_-]{1,100}$/u;

/**
 * Why `options` are not {@link AmazonAdsAdapterOptions} the Inth server may
 * send, or `undefined`. It refuses any name it does not know.
 */
export const amazonAdsOptionsProblem = function amazonAdsOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find((name) => !OPTION_NAMES.has(name));
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	if (typeof options.tagId !== 'string' || !TAG_ID.test(options.tagId)) {
		return 'its tagId is not a tag ID';
	}
	if (options.region !== 'NA' && options.region !== 'EU') {
		return 'its region is not NA or EU';
	}
	return typeof options.trackPageView === 'boolean'
		? undefined
		: 'its trackPageView is not a boolean';
};

/** The Amazon Ads adapter, as `adapter: { id: 'amazon-ads' }` runs it. */
export const amazonAdsAdapter: ManifestAdapter<AmazonAdsAdapterOptions> = {
	id: 'amazon-ads',
	problem: amazonAdsOptionsProblem,
	script: (base, options) => amazonAdsScript(base, options),
};
