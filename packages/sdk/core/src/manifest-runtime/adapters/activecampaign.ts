/**
 * The ActiveCampaign adapter: runs Diffuser, ActiveCampaign's site tracking
 * SDK, under Inth consent. Before it sets the tag's `src` it checks that no
 * other ActiveCampaign tracker owns the page (`window.pgo`, its alias
 * globals, or a pending tag for the same file), and once the SDK loads it
 * allows tracking for the visitor and keeps the visitor's email in step.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'activecampaign' }` with
 * {@link ActiveCampaignAdapterOptions}; the `activeCampaignTracking()`
 * helper in `@inth/integrations` builds its script with the same function,
 * and adds what only a site's own code can pass: the visitor's email.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

type PgoCommand = ((...args: unknown[]) => void) & {
	q?: IArguments[];
	l?: number;
};

type TrackerWindow = Window & {
	pgo?: PgoCommand;
	prismGlobalObjectAlias?: string;
};

/** What a manifest's `adapter.options` hold for ActiveCampaign. */
export interface ActiveCampaignAdapterOptions {
	/** The account ID from the tracking snippet. */
	accountId: string;
}

/** What only the npm helper passes: data about the visitor. */
export interface ActiveCampaignExtras {
	/** The visitor's email, sent once tracking is allowed. */
	email?: string;
}

interface TrackingConfig {
	accountId: string;
	email: string | undefined;
	scriptUrl: string;
	/**
	 * The URL the tracker loads from: `scriptUrl`, or the one
	 * `scriptLoader.sources` or the script registry chose
	 */
	loadUrl?: string;
}

interface Registration {
	config: TrackingConfig;
	info: ScriptCallbackInfo;
	script: Script;
}

interface Runtime {
	config?: TrackingConfig;
	element: HTMLScriptElement;
	status: 'waiting' | 'pending' | 'loaded' | 'error';
	command?: PgoCommand;
	email?: string;
	allowed: boolean;
}

interface TrackingState {
	document: Document;
	registrations: Map<symbol, Registration>;
	runtime?: Runtime;
	scheduled: boolean;
	problem?: string;
}

// Diffuser leaves its singleton and services running even if its tag is removed.
const states = new WeakMap<Document, TrackingState>();

const reportProblem = (state: TrackingState, problem: string): void => {
	if (state.problem !== problem) {
		console.error(`activeCampaignTracking: ${problem}`);
		state.problem = problem;
	}
};

const permittedRegistration = (
	state: TrackingState
): Registration | undefined => {
	const registrations = [...state.registrations.values()];
	const [first] = registrations;
	if (!first || registrations.some(({ info }) => !info.hasConsent)) {
		return;
	}
	const { accountId, email, loadUrl, scriptUrl } = first.config;
	if (
		registrations.some(
			({ config }) =>
				config.accountId !== accountId ||
				config.scriptUrl !== scriptUrl ||
				config.loadUrl !== loadUrl ||
				config.email !== email
		)
	) {
		reportProblem(state, 'conflicting registrations; use one configuration');
		return;
	}
	const { config: mounted } = state.runtime ?? {};
	if (
		mounted &&
		(mounted.accountId !== accountId ||
			mounted.scriptUrl !== scriptUrl ||
			mounted.loadUrl !== loadUrl)
	) {
		reportProblem(
			state,
			'changing accountId, scriptUrl or its source requires a new page'
		);
		return;
	}
	return first;
};

const start = (state: TrackingState, beforeAppend = false): void => {
	const { runtime, document } = state;
	if (!runtime || runtime.status !== 'waiting') {
		return;
	}
	const registration = permittedRegistration(state);
	if (!registration || (!beforeAppend && !runtime.element.isConnected)) {
		return;
	}
	const browser = document.defaultView as TrackerWindow | null;
	const { config, info, script } = registration;
	const { element } = runtime;
	// Another tracker may load from the vendor's URL or from the
	// replacement this one uses.
	const trackerUrls = new Set(
		[config.scriptUrl, config.loadUrl ?? config.scriptUrl].map(
			(url) => new URL(url, document.baseURI).href
		)
	);
	if (
		!browser ||
		browser.pgo !== undefined ||
		browser.prismGlobalObjectAlias !== undefined ||
		Reflect.has(browser, 'visitorGlobalObjectAlias') ||
		Reflect.has(browser, 'visitorGlobalObject') ||
		[...document.scripts].some(
			(existing) => existing !== element && trackerUrls.has(existing.src)
		)
	) {
		runtime.status = 'error';
		reportProblem(
			state,
			'an unmanaged tracker exists; remove the original snippet'
		);
		return;
	}
	runtime.config = config;
	runtime.status = 'pending';
	script.onBeforeLoad?.({ ...info, element });
	element.src = config.loadUrl ?? config.scriptUrl;
};

const reconcile = (state: TrackingState): void => {
	start(state);
	const { runtime } = state;
	if (!runtime || runtime.status !== 'loaded') {
		return;
	}
	const { command } = runtime;
	if (
		!runtime.element.isConnected ||
		(state.document.defaultView as TrackerWindow | null)?.pgo !== command ||
		!command
	) {
		runtime.status = 'error';
		reportProblem(state, 'tracker ownership was lost; reload the page');
		return;
	}
	const permitted = permittedRegistration(state);
	if (!permitted) {
		if (
			runtime.allowed &&
			[...state.registrations.values()].some(({ info }) => !info.hasConsent)
		) {
			// Diffuser cannot revoke allowTracking. A regrant must use a new page.
			runtime.status = 'error';
			reportProblem(
				state,
				'tracking permission was lost; reload the page to stop the running SDK'
			);
		}
		return;
	}
	const { email } = permitted.config;
	if (runtime.email !== email) {
		command('setEmail', email ?? '');
		runtime.email = email;
	}
	if (!runtime.allowed) {
		command('process', 'allowTracking');
		runtime.allowed = true;
	}
};

const schedule = (state: TrackingState): void => {
	if (state.scheduled) {
		return;
	}
	state.scheduled = true;
	// Core replaces a registration with dispose + register in the same turn.
	// Reconcile the final options without treating that as a consent regrant.
	queueMicrotask(() => {
		state.scheduled = false;
		reconcile(state);
	});
};

/**
 * `base`, the script built from ActiveCampaign's manifest, made to retain
 * Diffuser's SDK while it reconciles consent and the visitor's email. The
 * tracker loads from `base.src`, or the URL `scriptLoader.sources` or the
 * script registry chose.
 */
export const activeCampaignScript = function activeCampaignScript(
	base: Script,
	{ accountId }: ActiveCampaignAdapterOptions,
	{ email }: ActiveCampaignExtras = {}
): Script {
	const config: TrackingConfig = {
		accountId,
		email,
		scriptUrl: base.src ?? '',
	};
	const standalone = Symbol('activecampaign-registration');
	const update = (info: ScriptCallbackInfo): TrackingState => {
		let state = states.get(document);
		if (!state) {
			state = { document, registrations: new Map(), scheduled: false };
			states.set(document, state);
		}
		state.registrations.set(info.registration ?? standalone, {
			config: info.source ? { ...config, loadUrl: info.source.src } : config,
			info,
			script: base,
		});
		schedule(state);
		return state;
	};
	// The tag's `src` waits for the ownership check in the browser, so a
	// server render writes no inline start.
	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		observeConsentBeforeLoad: true,
		onBeforeLoad(info) {
			const state = update(info);
			const { element } = info;
			if (!element) {
				return;
			}
			// Core still creates the tag, applies CSP settings and observes completion.
			element.removeAttribute('src');
			if (state.runtime) {
				reportProblem(state, 'the owned SDK was replaced; reload the page');
				return;
			}
			state.runtime = { allowed: false, element, status: 'waiting' };
			start(state, true);
		},
		onConsentChange(info) {
			const state = update(info);
			if (info.element && state.runtime?.element !== info.element) {
				reportProblem(
					state,
					'an unmanaged tracker exists; remove the original snippet'
				);
			}
		},
		onDispose(info) {
			if (typeof document === 'undefined') {
				return;
			}
			const state = states.get(document);
			if (state) {
				state.registrations.delete(info.registration ?? standalone);
				schedule(state);
			}
		},
		onError() {
			const state = states.get(document);
			if (state?.runtime) {
				state.runtime.status = 'error';
				reportProblem(state, 'SDK failed to load; reload the page');
			}
		},
		onLoad(info) {
			const state = update(info);
			const { runtime } = state;
			const browser = document.defaultView as TrackerWindow | null;
			if (
				!runtime ||
				runtime.status === 'error' ||
				runtime.element !== info.element
			) {
				return;
			}
			if (
				!info.element?.isConnected ||
				typeof browser?.pgo !== 'function' ||
				browser.pgo.q
			) {
				runtime.status = 'error';
				reportProblem(state, 'SDK did not initialize; reload the page');
				return;
			}
			runtime.status = 'loaded';
			runtime.command ??= browser.pgo;
			reconcile(state);
		},
		persistAfterDispose: true,
	};
};

const ACCOUNT_ID = /^[0-9A-Za-z_-]{1,64}$/u;

/**
 * Why `options` are not {@link ActiveCampaignAdapterOptions} the Inth
 * server may send, or `undefined`.
 */
export const activeCampaignOptionsProblem =
	function activeCampaignOptionsProblem(
		options: Readonly<Record<string, unknown>>
	): string | undefined {
		const extra = Object.keys(options).find((name) => name !== 'accountId');
		if (extra !== undefined) {
			return `it has the unknown option ${extra}`;
		}
		return typeof options.accountId === 'string' &&
			ACCOUNT_ID.test(options.accountId)
			? undefined
			: 'its accountId is not an account ID';
	};

/** The ActiveCampaign adapter, as a manifest's `adapter: { id: 'activecampaign' }` runs it. */
export const activeCampaignAdapter: ManifestAdapter<ActiveCampaignAdapterOptions> =
	{
		id: 'activecampaign',
		problem: activeCampaignOptionsProblem,
		script: (base, options) => activeCampaignScript(base, options),
	};
