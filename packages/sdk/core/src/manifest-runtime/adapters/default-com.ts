/**
 * The Default adapter, for the Default Pixel and the standalone Default
 * Forms SDK. Both share one page claim: the first loader to start claims
 * the page, and a loader of the other kind, or one that finds the other
 * product's global already on the page, removes its own `src` before the
 * loader inserts it and logs a conflict. The Pixel queues `setConsent`
 * with the mapped purposes before index.js runs; the Forms SDK forwards
 * consent from every registration and calls `init` once it is allowed.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'default-com' }` with {@link DefaultComAdapterOptions}.
 * The `defaultComPixel()` and `defaultComFormsSdk()` helpers in
 * `@inth/integrations` build their scripts with {@link defaultComPixelScript}
 * and {@link defaultComFormsScript}, and add what only a site's own code
 * passes: a scheduler container element or selector, and an API endpoint.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

/** Default's scheduler display configuration. */
export type DefaultComAutoDisplayScheduler =
	| boolean
	| {
			/** Show Default's loading indicator while opening the scheduler. */
			loader?: boolean;
			/** CSS selector or element for the scheduler container. */
			target: string | HTMLElement;
	  };

/** Configuration accepted by DefaultPixelSDK.init(). */
export interface DefaultComFormsSdkInitOptions {
	autoDisplayScheduler?: DefaultComAutoDisplayScheduler;
	endpoint?: string;
	publicKey: string;
	schedulerOrigins?: string[];
}

interface DefaultComConsent {
	analytics: boolean;
	marketing: boolean;
}

interface PixelBootstrap {
	autoDisplayScheduler?: DefaultComAutoDisplayScheduler;
	key?: string;
	q?: unknown[];
	schedulerOrigins?: string[];
	setConsent?: (consent: Partial<DefaultComConsent>) => void;
}

/** The part of the Forms SDK client the adapter calls. */
interface FormsSdk {
	init: (options: DefaultComFormsSdkInitOptions) => void;
	setConsent: (consent: Partial<DefaultComConsent>) => void;
}

type DefaultWindow = Window & {
	__defaultPixel__?: PixelBootstrap;
	DefaultPixelSDK?: FormsSdk;
};

/** What a manifest's `adapter.options` holds for the Default Pixel. */
export interface DefaultComPixelAdapterOptions {
	product: 'pixel';
	/** Public key from the Default workspace. */
	publicKey: string;
	/** `always` loads before consent and forwards the current state. */
	loadMode: 'after-consent' | 'always';
	/** Scheduler origins the workspace allows. */
	schedulerOrigins?: string[];
	/** Scheduler display, forwarded as is. Unset leaves Default's own. */
	autoDisplayScheduler?: boolean;
}

/** What a manifest's `adapter.options` holds for the Forms SDK. */
export interface DefaultComFormsAdapterOptions {
	product: 'forms';
	/** Public key from the Default workspace. */
	publicKey: string;
	/** Scheduler origins the workspace allows. */
	schedulerOrigins?: string[];
	/** Scheduler display. Unset restores Default's `true`. */
	autoDisplayScheduler?: boolean;
}

/** What a manifest's `adapter.options` holds for Default. */
export type DefaultComAdapterOptions =
	| DefaultComPixelAdapterOptions
	| DefaultComFormsAdapterOptions;

/** What only a site's own code passes the adapter. */
export interface DefaultComExtras {
	/** A scheduler container, in place of the options' switch. */
	autoDisplayScheduler?: DefaultComAutoDisplayScheduler;
	/** The Forms SDK's API endpoint, such as a same-origin proxy. */
	endpoint?: string;
}

const win = (): DefaultWindow => window as DefaultWindow;

/** Whether the vendor may run: its condition holds and it is not off. */
const permitted = (info: ScriptCallbackInfo): boolean =>
	info.vendor?.granted !== false && info.hasConsent;

type SdkRegistration = symbol | HTMLScriptElement;
interface SdkState {
	options?: DefaultComFormsSdkInitOptions;
	registrations: Map<SdkRegistration, DefaultComConsent>;
}
const sdkStates = new WeakMap<FormsSdk, SdkState>();
const sdkOwners = new Map<SdkRegistration, FormsSdk>();
// Owners observed before their element mounted, such as an initially denied
// loader. They still gate the shared SDK once another owner loads it.
const preloadOwners = new Map<SdkRegistration, DefaultComConsent>();
const formsElements = new WeakSet<HTMLScriptElement>();
const loadedFormsElements = new WeakSet<HTMLScriptElement>();
// sdk.js runs once per document, so its first inserted URL stays for the page.
const formsSdkSources = new WeakMap<Document, string>();
const formsSdkSourceError =
	'defaultComFormsSdk: Reload the page to change the Forms SDK URL.';

const registrationOf = (
	info: ScriptCallbackInfo
): SdkRegistration | undefined => info.registration ?? info.element;

const forwardSdkConsent = (sdk: FormsSdk): void => {
	const states = [...(sdkStates.get(sdk)?.registrations.values() ?? [])];
	sdk.setConsent({
		analytics: states.length > 0 && states.every((state) => state.analytics),
		marketing: states.length > 0 && states.every((state) => state.marketing),
	});
};

const currentSdk = (): FormsSdk | undefined =>
	typeof window === 'undefined' ? undefined : win().DefaultPixelSDK;

// Stable identity lets core retain the resource across configuration updates.
const observePreloadOwner = (
	registration: SdkRegistration,
	consent: DefaultComConsent
): void => {
	preloadOwners.set(registration, consent);
	const sdk = currentSdk();
	const state = sdk ? sdkStates.get(sdk) : undefined;
	if (sdk && state) {
		state.registrations.set(registration, consent);
		forwardSdkConsent(sdk);
	}
};

const joinPreloadOwners = (state: SdkState): void => {
	for (const [owner, consent] of preloadOwners) {
		if (!state.registrations.has(owner)) {
			state.registrations.set(owner, consent);
		}
	}
};

const disposeFormsSdk = (info: ScriptCallbackInfo): void => {
	const registration = registrationOf(info);
	if (registration !== undefined && preloadOwners.delete(registration)) {
		const sdk = currentSdk();
		const state = sdk ? sdkStates.get(sdk) : undefined;
		if (sdk && state?.registrations.delete(registration)) {
			forwardSdkConsent(sdk);
		}
	}
	const sdk =
		registration === undefined ? undefined : sdkOwners.get(registration);
	if (registration !== undefined && sdk) {
		sdkOwners.delete(registration);
		sdkStates.get(sdk)?.registrations.delete(registration);
		forwardSdkConsent(sdk);
	}
};

const denyDetachedFormsSdk = (info: ScriptCallbackInfo): void => {
	const registration = registrationOf(info);
	if (registration === undefined) {
		return;
	}
	const sdk = sdkOwners.get(registration);
	if (sdk) {
		sdkStates.get(sdk)?.registrations.set(registration, {
			analytics: false,
			marketing: false,
		});
		forwardSdkConsent(sdk);
	}
};

const snapshotSdkOptions = (
	options: DefaultComFormsSdkInitOptions
): DefaultComFormsSdkInitOptions => ({
	...options,
	autoDisplayScheduler:
		typeof options.autoDisplayScheduler === 'object'
			? { ...options.autoDisplayScheduler }
			: (options.autoDisplayScheduler ?? true),
	schedulerOrigins: options.schedulerOrigins?.slice(),
});

const sameSdkOptions = (
	previous: DefaultComFormsSdkInitOptions | undefined,
	next: DefaultComFormsSdkInitOptions
): boolean => {
	if (!previous) {
		return false;
	}
	const previousDisplay = previous.autoDisplayScheduler;
	const nextDisplay = next.autoDisplayScheduler;
	return (
		previous.publicKey === next.publicKey &&
		(previous.endpoint ?? 'https://api.default.com') ===
			(next.endpoint ?? 'https://api.default.com') &&
		previous.schedulerOrigins?.length === next.schedulerOrigins?.length &&
		(previous.schedulerOrigins?.every(
			(origin, index) => origin === next.schedulerOrigins?.[index]
		) ??
			true) &&
		(previousDisplay === nextDisplay ||
			(typeof previousDisplay === 'object' &&
				typeof nextDisplay === 'object' &&
				previousDisplay.target === nextDisplay.target &&
				(previousDisplay.loader ?? false) === (nextDisplay.loader ?? false)))
	);
};
type DefaultComLoader = 'defaultComPixel' | 'defaultComFormsSdk';
const pageLoaders = new WeakMap<Document, DefaultComLoader>();
const blockedLoaderType = 'application/x-inth-default-conflict';
interface PixelConfiguration extends DefaultComFormsSdkInitOptions {
	scriptUrl: string;
}
const pixelConfigurations = new WeakMap<Document, PixelConfiguration>();
const conflictsWithPixel = (options: PixelConfiguration): boolean => {
	const previous =
		typeof document === 'undefined'
			? undefined
			: pixelConfigurations.get(document);
	return (
		previous !== undefined &&
		(previous.scriptUrl !== options.scriptUrl ||
			!sameSdkOptions(previous, options))
	);
};
const assertPixelConfiguration = (options: PixelConfiguration): void => {
	if (conflictsWithPixel(options)) {
		throw new Error(
			'defaultComPixel: Reload the page to change Default Pixel configuration.'
		);
	}
};

const claimLoader = function claimLoader(
	info: ScriptCallbackInfo,
	helper: DefaultComLoader,
	alwaysLoad = false
): boolean {
	if (
		typeof document === 'undefined' ||
		!info.element ||
		(!alwaysLoad && !permitted(info))
	) {
		return false;
	}
	const existing = pageLoaders.get(document);
	const conflictingGlobal =
		helper === 'defaultComPixel'
			? win().DefaultPixelSDK !== undefined
			: win().__defaultPixel__?.key !== undefined;
	if ((existing !== undefined && existing !== helper) || conflictingGlobal) {
		// Core catches callback errors, so throwing would still insert the loader.
		// Disable the element itself before core appends it.
		info.element.removeAttribute('src');
		info.element.type = blockedLoaderType;
		console.error(
			`${helper}: conflicting Default installation. Use one Default helper per page. The conflicting loader will not run.`
		);
		return false;
	}
	pageLoaders.set(document, helper);
	return true;
};

const ownsLoader = function ownsLoader(
	info: ScriptCallbackInfo,
	helper: DefaultComLoader
): boolean {
	return (
		typeof document !== 'undefined' &&
		pageLoaders.get(document) === helper &&
		info.element?.type !== blockedLoaderType
	);
};

const mapConsent = function mapConsent(
	info: ScriptCallbackInfo
): DefaultComConsent {
	const allowed = permitted(info);
	return {
		analytics: allowed && info.consents.measurement === true,
		marketing: allowed && info.consents.marketing === true,
	};
};

/**
 * Handle a callback for an owner without a connected element. A no-element
 * callback is a consent update for a pending or retained owner; only
 * `onDispose` removes an owner from the SDK aggregate.
 */
const releaseUnmountedFormsSdk = (
	info: ScriptCallbackInfo,
	registration: SdkRegistration | undefined
): void => {
	if (info.element) {
		denyDetachedFormsSdk(info);
		return;
	}
	if (registration === undefined) {
		return;
	}
	const sdk = sdkOwners.get(registration);
	const state = sdk ? sdkStates.get(sdk) : undefined;
	if (sdk && state) {
		state.registrations.set(registration, mapConsent(info));
		forwardSdkConsent(sdk);
		return;
	}
	observePreloadOwner(registration, mapConsent(info));
};

const forwardPixelConsent = function forwardPixelConsent(
	info: ScriptCallbackInfo
): void {
	if (typeof window !== 'undefined' && ownsLoader(info, 'defaultComPixel')) {
		win().__defaultPixel__?.setConsent?.(mapConsent(info));
	}
};

/** The scheduler display the options and extras give, copied. */
const displayOf = (
	options: { autoDisplayScheduler?: boolean },
	extras: DefaultComExtras
): DefaultComAutoDisplayScheduler | undefined => {
	const display = extras.autoDisplayScheduler ?? options.autoDisplayScheduler;
	return typeof display === 'object' ? { ...display } : display;
};

/**
 * `base`, the script that loads the Default Pixel, with the hooks that
 * claim the page, queue the Pixel's configuration and mapped consent, and
 * forward later consent. Its `validate` throws when another Pixel on the
 * page started with another configuration.
 */
export const defaultComPixelScript = function defaultComPixelScript(
	base: Script,
	options: DefaultComPixelAdapterOptions,
	extras: DefaultComExtras = {}
): Script {
	const alwaysLoad = options.loadMode === 'always';
	const configuration: PixelConfiguration = {
		autoDisplayScheduler: displayOf(options, extras),
		publicKey: options.publicKey,
		schedulerOrigins: options.schedulerOrigins?.slice(),
		scriptUrl: base.src ?? '',
	};
	// The hooks run in the browser, so a server render leaves the tag to it.
	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		alwaysLoad: alwaysLoad || undefined,
		onBeforeLoad(info) {
			if (conflictsWithPixel(configuration)) {
				if (info.element) {
					info.element.removeAttribute('src');
					info.element.type = blockedLoaderType;
				}
				console.error(
					'defaultComPixel: Reload the page to change Default Pixel configuration.'
				);
				return;
			}
			if (!claimLoader(info, 'defaultComPixel', alwaysLoad)) {
				return;
			}
			pixelConfigurations.set(document, configuration);
			win().__defaultPixel__ ??= {};
			const config = win().__defaultPixel__ as PixelBootstrap;
			config.key = options.publicKey;
			if (configuration.schedulerOrigins !== undefined) {
				config.schedulerOrigins = configuration.schedulerOrigins?.slice();
			}
			if (configuration.autoDisplayScheduler !== undefined) {
				config.autoDisplayScheduler =
					typeof configuration.autoDisplayScheduler === 'object'
						? { ...configuration.autoDisplayScheduler }
						: configuration.autoDisplayScheduler;
			}
			config.q ??= [];
			config.setConsent ??= (consent) => {
				config.q?.push(['setConsent', consent]);
			};
			config.setConsent(mapConsent(info));
		},
		onConsentChange(info) {
			assertPixelConfiguration(configuration);
			forwardPixelConsent(info);
		},
		onLoad(info) {
			if (info.element?.isConnected) {
				forwardPixelConsent(info);
			}
		},
		validate: () => assertPixelConfiguration(configuration),
	};
};

/**
 * `base`, the script that loads the Forms SDK, with the hooks that claim
 * the page, forward consent from every registration, and call `init` once
 * the SDK is allowed.
 */
export const defaultComFormsScript = function defaultComFormsScript(
	base: Script,
	options: DefaultComFormsAdapterOptions,
	extras: DefaultComExtras = {}
): Script {
	const initOptions: DefaultComFormsSdkInitOptions = {
		autoDisplayScheduler: displayOf(options, extras) ?? true,
		publicKey: options.publicKey,
	};
	if (extras.endpoint !== undefined) {
		initOptions.endpoint = extras.endpoint;
	}
	if (options.schedulerOrigins !== undefined) {
		// Initialization is asynchronous; snapshot caller-owned settings now.
		initOptions.schedulerOrigins = options.schedulerOrigins.slice();
	}
	const scriptUrl = base.src ?? '';
	// The URL `scriptLoader.sources` or the script registry chose, if any
	const loadUrl = (info: ScriptCallbackInfo): string =>
		info.source?.src ?? scriptUrl;
	let reportedSource = false;
	const reportSource = (): void => {
		if (!reportedSource) {
			reportedSource = true;
			console.error(formsSdkSourceError);
		}
	};
	const synchronize = (info: ScriptCallbackInfo): void => {
		const registration = registrationOf(info);
		if (!info.element?.isConnected) {
			releaseUnmountedFormsSdk(info, registration);
			return;
		}
		if (
			typeof window === 'undefined' ||
			!ownsLoader(info, 'defaultComFormsSdk') ||
			!formsElements.has(info.element) ||
			!loadedFormsElements.has(info.element) ||
			registration === undefined
		) {
			return;
		}
		// Core adopts a retained element by id; it keeps the original source.
		if (info.element.getAttribute('src') !== loadUrl(info)) {
			reportSource();
			return;
		}
		const previous = sdkOwners.get(registration);
		const allowed = permitted(info);
		const sdk = !allowed && previous ? previous : win().DefaultPixelSDK;
		if (!sdk) {
			return;
		}
		if (previous && previous !== sdk) {
			disposeFormsSdk(info);
		}
		let state = sdkStates.get(sdk);
		if (!state) {
			state = { registrations: new Map() };
			sdkStates.set(sdk, state);
		}
		sdkOwners.set(registration, sdk);
		preloadOwners.delete(registration);
		state.registrations.set(registration, mapConsent(info));
		joinPreloadOwners(state);
		forwardSdkConsent(sdk);
		if (allowed && !sameSdkOptions(state.options, initOptions)) {
			const applied = snapshotSdkOptions(initOptions);
			sdk.init(applied);
			state.options = snapshotSdkOptions(applied);
		}
	};
	// The hooks run in the browser, so a server render leaves the tag to it.
	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		id: 'default-com-forms-sdk',
		onBeforeLoad(info) {
			if (!claimLoader(info, 'defaultComFormsSdk') || !info.element) {
				return;
			}
			const source = formsSdkSources.get(document);
			if (source !== undefined && source !== loadUrl(info)) {
				info.element.removeAttribute('src');
				info.element.type = blockedLoaderType;
				reportSource();
				return;
			}
			formsSdkSources.set(document, loadUrl(info));
			formsElements.add(info.element);
		},
		onConsentChange: synchronize,
		onDispose: disposeFormsSdk,
		onLoad(info) {
			if (info.element?.isConnected && formsElements.has(info.element)) {
				loadedFormsElements.add(info.element);
				synchronize(info);
			}
		},
	};
};

const PIXEL_NAMES: ReadonlySet<string> = new Set([
	'autoDisplayScheduler',
	'loadMode',
	'product',
	'publicKey',
	'schedulerOrigins',
]);
const FORMS_NAMES: ReadonlySet<string> = new Set([
	'autoDisplayScheduler',
	'product',
	'publicKey',
	'schedulerOrigins',
]);

const PUBLIC_KEY = /^[0-9A-Za-z_-]{1,128}$/u;
// An https origin on a DNS name: no path, port, credentials or IP literal.
const ORIGIN =
	/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;

/**
 * Why `options` are not {@link DefaultComAdapterOptions} the Inth server may
 * send, or `undefined`. It refuses any name it does not know for the
 * product.
 */
export const defaultComOptionsProblem = function defaultComOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const { product } = options;
	if (product !== 'pixel' && product !== 'forms') {
		return 'its product is not pixel or forms';
	}
	const names = product === 'pixel' ? PIXEL_NAMES : FORMS_NAMES;
	const extra = Object.keys(options).find((name) => !names.has(name));
	if (extra !== undefined) {
		return `it has the unknown ${product} option ${extra}`;
	}
	if (
		typeof options.publicKey !== 'string' ||
		!PUBLIC_KEY.test(options.publicKey)
	) {
		return 'its publicKey is not a public key';
	}
	if (
		product === 'pixel' &&
		options.loadMode !== 'after-consent' &&
		options.loadMode !== 'always'
	) {
		return 'its loadMode is not after-consent or always';
	}
	const origins = options.schedulerOrigins;
	if (
		origins !== undefined &&
		!(
			Array.isArray(origins) &&
			origins.every(
				(origin) => typeof origin === 'string' && ORIGIN.test(origin)
			)
		)
	) {
		return 'its schedulerOrigins is not a list of https origins';
	}
	return options.autoDisplayScheduler === undefined ||
		typeof options.autoDisplayScheduler === 'boolean'
		? undefined
		: 'its autoDisplayScheduler is not a boolean';
};

/** The Default adapter, as `adapter: { id: 'default-com' }` runs it. */
export const defaultComAdapter: ManifestAdapter<DefaultComAdapterOptions> = {
	id: 'default-com',
	problem: defaultComOptionsProblem,
	script: (base, options) =>
		options.product === 'pixel'
			? defaultComPixelScript(base, options)
			: defaultComFormsScript(base, options),
};
