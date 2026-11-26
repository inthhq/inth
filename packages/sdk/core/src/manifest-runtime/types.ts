import type { AllConsentNames } from '../consent/consent-types';
import type { HasCondition } from '../libs/has';
import type { VendorDetails } from '../libs/script-loader/types';

export const VENDOR_MANIFEST_KIND = 'inth.vendor-manifest';
export const VENDOR_MANIFEST_SCHEMA_VERSION = 1;
export const vendorManifestContract = {
	kind: VENDOR_MANIFEST_KIND,
	schemaVersion: VENDOR_MANIFEST_SCHEMA_VERSION,
} as const;

export const RUNTIME_VALUE_KIND = 'inth.runtime-value';

/**
 * A value a step reads when it runs, in place of a literal.
 *
 * - `date`, `timestamp`: the current time, as a `Date` or epoch milliseconds.
 * - `hasConsent` (level 2): whether the vendor may run, `false` when the
 *   visitor turned the vendor off or its consent condition fails.
 * - `scriptElement` (level 2): the script's element; `undefined` for a
 *   manifest that loads no script.
 * - `scriptNonce` (level 2): that element's CSP nonce. An object property
 *   whose value is a missing nonce is left out.
 * - `consentGate` (level 2): a function that returns its argument while the
 *   script is registered and its consent holds when called, and `null`
 *   otherwise. It returns `null` for good once the script is disposed.
 */
export interface SimpleRuntimeValue {
	kind: typeof RUNTIME_VALUE_KIND;
	value:
		| 'date'
		| 'timestamp'
		| 'hasConsent'
		| 'scriptElement'
		| 'scriptNonce'
		| 'consentGate';
}

/**
 * The vendor's consent purposes and their state (level 2). Each purpose
 * follows the Inth categories that list it in `mapping`. Every purpose is
 * denied while the vendor may not run.
 */
export interface ConsentsRuntimeValue {
	kind: typeof RUNTIME_VALUE_KIND;
	value: 'consents';
	/** Inth category to the vendor purposes it controls. */
	mapping: Record<string, string[]>;
	/** `true`/`false`, or `'granted'`/`'denied'`. */
	format: 'boolean' | 'grantedDenied';
}

export type RuntimeValue = SimpleRuntimeValue | ConsentsRuntimeValue;

export const runtimeDateValue = {
	kind: RUNTIME_VALUE_KIND,
	value: 'date',
} as const satisfies RuntimeValue;

export const runtimeTimestampValue = {
	kind: RUNTIME_VALUE_KIND,
	value: 'timestamp',
} as const satisfies RuntimeValue;

export const runtimeHasConsentValue = {
	kind: RUNTIME_VALUE_KIND,
	value: 'hasConsent',
} as const satisfies RuntimeValue;

export const runtimeScriptElementValue = {
	kind: RUNTIME_VALUE_KIND,
	value: 'scriptElement',
} as const satisfies RuntimeValue;

export const runtimeScriptNonceValue = {
	kind: RUNTIME_VALUE_KIND,
	value: 'scriptNonce',
} as const satisfies RuntimeValue;

export const runtimeConsentGateValue = {
	kind: RUNTIME_VALUE_KIND,
	value: 'consentGate',
} as const satisfies RuntimeValue;

export interface ManifestContract {
	kind: typeof VENDOR_MANIFEST_KIND;
	schemaVersion: typeof VENDOR_MANIFEST_SCHEMA_VERSION;
}

export interface LoadScriptStep {
	type: 'loadScript';
	src: string;
	async?: boolean;
	defer?: boolean;
	attributes?: Record<string, string>;
	/** Priority hint for the script request. */
	fetchPriority?: 'high' | 'low' | 'auto';
}

export interface SetGlobalStep {
	type: 'setGlobal';
	/** Global variable name (e.g. 'dataLayer') */
	name: string;
	/** Value to assign. Arrays and objects are recursively cloned on execution. */
	value: unknown;
	/**
	 * Only set the global if it's not already defined.
	 * Mirrors the common `window.x = window.x || value` pattern.
	 * @default true
	 */
	ifUndefined?: boolean;
	/**
	 * Keep the current value when it is already an array, such as a snippet
	 * queue the page filled before this step ran. Any other value is replaced.
	 * Only relevant when `ifUndefined` is `false`.
	 * @default false
	 */
	keepExistingQueue?: boolean;
}

export interface DefineQueueFunctionStep {
	type: 'defineQueueFunction';
	/** Global function name (e.g. 'gtag') */
	name: string;
	/** Global array name that receives queued calls (e.g. 'dataLayer') */
	queue: string;
	/**
	 * Only define the function if it is not already present.
	 * @default true
	 */
	ifUndefined?: boolean;
	/**
	 * Whether queued calls should store the `arguments` object or a copied array.
	 * @default 'arguments'
	 */
	pushStyle?: 'arguments' | 'array';
}

export interface DefineStubFunctionStep {
	type: 'defineStubFunction';
	/** Global function name (e.g. 'fbq', 'twq', 'lintrk') */
	name: string;
	/**
	 * Queue storage location:
	 * - `global` pushes into another global array (e.g. `dataLayer`)
	 * - `property` pushes into a property on the stub function itself (e.g. `fbq.queue`)
	 */
	queue:
		| { global: string; property?: never }
		| { global?: never; property: string };
	/**
	 * If present, calls `stub[dispatchProperty](...args)` when available instead of queueing.
	 * Mirrors vendor APIs like Meta Pixel's `callMethod`.
	 */
	dispatchProperty?: string;
	/**
	 * How queued values should be stored.
	 * - `'arguments'` => push the `arguments` object
	 * - `'array'` => push a copied array of arguments
	 */
	queueFormat?: 'arguments' | 'array';
	/** Additional globals that should reference the same stub */
	aliases?: string[];
	/** Properties on the stub that should reference the stub itself (e.g. `push`) */
	selfReferences?: string[];
	/** Additional scalar/object properties assigned to the stub */
	properties?: Record<string, unknown>;
	/** Only define the stub if not already present. */
	ifUndefined?: boolean;
}

interface CallGlobalBase {
	type: 'callGlobal';
	args?: unknown[];
	/**
	 * Clone arguments as literal JSON without interpreting runtime value markers.
	 * Arguments must be JSON-serializable.
	 * @default false
	 */
	literalArgs?: boolean;
}

export type CallGlobalStep = CallGlobalBase &
	(
		| {
				/** Global object name (e.g. 'posthog', 'fbq') */
				global: string;
				/** Method to call on the global. If omitted, the global itself is called as a function. */
				method?: string;
				path?: never;
		  }
		| {
				global?: never;
				method?: never;
				/**
				 * Path segments under window to the function (level 2), such as
				 * `['databuddyReplay', 'stop']`. The function is called on the
				 * object that holds it.
				 */
				path: string[];
		  }
	);

/**
 * Inserts a second script tag the manifest's script owns (level 2), such as
 * a vendor's add-on file. Does nothing when a tag with `id` is already in
 * the document or `unlessGlobal` is defined. The tag gets the script
 * element's nonce, and goes when the script is disposed or a
 * `removeScript` step names it.
 */
export interface LoadScriptTagStep {
	type: 'loadScriptStep';
	/** The tag's `id`, which `removeScript` names. */
	id: string;
	/** An https URL. */
	src: string;
	/** Unset leaves the browser's default for inserted scripts, which is async. */
	async?: boolean;
	/** The same attributes the manifest's `loadScript` may set. */
	attributes?: Record<string, string>;
	/** Path segments under window that, when defined, skip the tag. */
	unlessGlobal?: string[];
}

/**
 * Removes a tag a `loadScriptStep` of the same script inserted (level 2).
 * A tag with that `id` the script did not insert stays.
 */
export interface RemoveScriptStep {
	type: 'removeScript';
	id: string;
}

export interface PushToQueueStep {
	type: 'pushToQueue';
	/** Global array name that receives queued values (e.g. 'dataLayer') */
	queue: string;
	value: unknown;
}

export interface SetGlobalPathStep {
	type: 'setGlobalPath';
	/** Path segments under window (e.g. ['databuddy', 'options', 'disabled']) */
	path: string[];
	value: unknown;
	/** Only assign while the root global is still a snippet queue array. */
	ifGlobalIsQueue?: boolean;
	/**
	 * Only assign when the target property is `undefined`, mirroring the
	 * `obj.x = obj.x || value` pattern.
	 * @default false
	 */
	ifUndefined?: boolean;
}

export interface DefineQueueMethodsStep {
	type: 'defineQueueMethods';
	/** Global array/object name that owns the queue methods */
	target: string;
	methods: string[];
	/** Optional queue location. Defaults to the target itself. */
	queue?:
		| { global: string; property?: never }
		| { global?: never; property: string };
	/**
	 * Format used for each queued method call.
	 *
	 * - `tuple` pushes `[methodName, ...args]`, matching classic array queues.
	 * - `nameAndArgs` pushes `[methodName, argsArray]`, preserving argument
	 *   references for SDKs that spread the second entry when replaying calls.
	 * - `methodCall` pushes `{ name, args, resolve }` and returns a `Promise`,
	 *   matching SDK loaders that replay named calls and resolve the original
	 *   pre-load promise after the real method runs.
	 * - `wrappedMethodCall` queues like `methodCall` but returns
	 *   `{ promise }`, matching Amplitude's snippet contract where queued
	 *   proxy calls expose the pending promise on a `promise` property.
	 * - `voidMethodCall` queues like `methodCall` but returns nothing,
	 *   matching snippet methods the vendor treats as synchronous.
	 * - `callback` pushes `{ name, fn }`, where `fn` replays the captured call
	 *   against the current global target, matching loaders that own a
	 *   ready-callback queue.
	 * - `nameAndArguments` (level 2) pushes `[methodName, arguments]` with the
	 *   call's own `Arguments` object, as AdRoll's snippet does.
	 *
	 * @default 'tuple'
	 */
	queueFormat?:
		| 'tuple'
		| 'nameAndArgs'
		| 'methodCall'
		| 'wrappedMethodCall'
		| 'voidMethodCall'
		| 'callback'
		| 'nameAndArguments';
	/**
	 * Return the target that owns the methods after a tuple call, even when
	 * storage uses a separate queue. Other formats keep their return values.
	 * @default false
	 */
	returnTarget?: boolean;
	/**
	 * Leave a method alone when the target already has a function under that
	 * name. Setup runs again when consent is granted after a revocation
	 * without a page reload; this keeps the methods of an SDK that is still
	 * running instead of replacing them with queue stubs that nothing drains.
	 * @default false
	 */
	preserveExisting?: boolean;
}

export interface DefineQueueClassStep {
	type: 'defineQueueClass';
	/** Global object that receives the queued helper class. */
	target: string;
	/** Constructor property name to define on the target object. */
	name: string;
	/**
	 * Instance property that stores queued helper method calls.
	 *
	 * @default '_q'
	 */
	queueProperty?: string;
	/** Helper instance method names to attach to the constructor prototype. */
	methods: string[];
}

export type GlobalMethodBehavior =
	| {
			name: string;
			behavior: 'noop';
	  }
	| {
			name: string;
			behavior: 'return';
			value: unknown;
	  };

export interface DefineGlobalMethodsStep {
	type: 'defineGlobalMethods';
	/** Global object name to receive the methods */
	target: string;
	methods: GlobalMethodBehavior[];
	/** Only define methods while the target is still a snippet queue array. */
	ifGlobalIsQueue?: boolean;
}

export interface SetCookieStep {
	type: 'setCookie';
	/**
	 * The whole `document.cookie` assignment, attributes included.
	 * @example `'__kla_off=true; path=/; SameSite=Lax'`
	 */
	cookie: string;
}

/**
 * Defines `window[name]` as an object that answers any method name with a
 * function queueing the call on `window[queue]`, unless the global exists.
 *
 * Each call pushes `[method, ...args, done]` and returns a promise `done`
 * resolves. A trailing function argument is taken off the call and gets the
 * result too. `push` forwards its items to the queue. Symbols, `then`,
 * `toJSON` and `Object.prototype` members are left alone, so awaiting or
 * serializing the object queues nothing.
 */
export interface DefineQueueProxyStep {
	type: 'defineQueueProxy';
	/** Global name of the proxy (e.g. `klaviyo`) */
	name: string;
	/** Global queue that receives the calls; an array when missing */
	queue: string;
}

export interface ConstructGlobalStep {
	type: 'constructGlobal';
	/** Global constructor name (e.g. `UET`) */
	constructor: string;
	/** Global name to assign the constructed instance to */
	assignTo: string;
	args?: unknown[];
	/**
	 * Copies the current `window[assignTo]` value into the first constructor arg object
	 * under this property before constructing.
	 */
	copyAssignedValueToArgProperty?: string;
}

export type ManifestStep =
	| LoadScriptStep
	| SetGlobalStep
	| DefineQueueFunctionStep
	| DefineStubFunctionStep
	| CallGlobalStep
	| PushToQueueStep
	| SetGlobalPathStep
	| DefineQueueMethodsStep
	| DefineQueueClassStep
	| DefineGlobalMethodsStep
	| SetCookieStep
	| DefineQueueProxyStep
	| ConstructGlobalStep
	| LoadScriptTagStep
	| RemoveScriptStep;

/**
 * Consent signal type determines how consent state is communicated to the vendor.
 *
 * - `'gtag'` — Google Consent Mode pattern: calls `gtag('consent', 'default'|'update', state)`
 * - `'rudderstack'` — RudderStack consent-management pattern: calls
 *   `rudderanalytics.consent({ consentManagement: { enabled, provider: 'custom',
 *   allowedConsentIds, deniedConsentIds } })` with the mapping's consent IDs
 *   partitioned by the current Inth consent state
 * - `'clarity'` — Microsoft Clarity Consent V2: calls
 *   `clarity('consentv2', state)` with the mapping's storage names
 */
export type ConsentSignalType = 'gtag' | 'rudderstack' | 'clarity';

/**
 * Transport-ready manifest shape produced by the compile phase.
 *
 * Contains only serializable data and no runtime callbacks. The Inth server
 * builds these with `@inth/integrations/remote` and sends them to the SDK,
 * which turns each one into a `Script`.
 */
export interface ResolvedManifest extends ManifestContract {
	/**
	 * The manifest runtime level the manifest needs, when it is above 1. A
	 * level 1 manifest leaves it out.
	 */
	requires?: number;
	vendor: string;
	vendorDetails?: VendorDetails;
	/**
	 * Every window property the steps read, write or call through, as the
	 * first name of each path (level 2). The parser refuses a step whose
	 * root is not listed, and a platform or built-in global such as
	 * `document`, `location` or `Object`. A vendor's own data layer, such
	 * as `dataLayer`, may be listed. `compileManifest` fills it in from the
	 * steps.
	 */
	globals: string[];
	category: HasCondition<AllConsentNames>;
	alwaysLoad?: boolean;
	persistAfterConsentRevoked?: boolean | 'loaded';
	bootstrapSteps: ManifestStep[];
	setupSteps: ManifestStep[];
	loadScript?: LoadScriptStep;
	afterLoadSteps: ManifestStep[];
	onBeforeLoadGrantedSteps: ManifestStep[];
	onBeforeLoadDeniedSteps: ManifestStep[];
	onLoadGrantedSteps: ManifestStep[];
	onLoadDeniedSteps: ManifestStep[];
	onConsentChangeSteps: ManifestStep[];
	onConsentGrantedSteps: ManifestStep[];
	onConsentDeniedSteps: ManifestStep[];
	/**
	 * Steps run when the script is disposed (level 2), even if it never
	 * loaded. When a new manifest replaces this one, they run once the new
	 * one has started, and runtime values in them read consent then.
	 */
	onDisposeSteps?: ManifestStep[];
	/** `Script.target` (level 2). */
	target?: 'head' | 'body';
	/** `Script.observeConsentBeforeLoad` (level 2). */
	observeConsentBeforeLoad?: boolean;
	/** `Script.persistAfterDispose` (level 2). */
	persistAfterDispose?: boolean;
	/** `Script.resourceKey` (level 2). */
	resourceKey?: string;
	consentMapping?: Record<string, string[]>;
	consentSignal?: ConsentSignalType;
	consentSignalTarget?: string;
	consentSignalDefaults?: Record<string, 'granted' | 'denied'>;
}

/**
 * Every `ManifestStep` type the manifest runtime runs. A `Record` over the
 * union, so a new step type fails to compile until it is listed here.
 */
export const MANIFEST_STEP_TYPES: Readonly<Record<ManifestStep['type'], true>> =
	{
		callGlobal: true,
		constructGlobal: true,
		defineGlobalMethods: true,
		defineQueueClass: true,
		defineQueueFunction: true,
		defineQueueMethods: true,
		defineQueueProxy: true,
		defineStubFunction: true,
		loadScript: true,
		loadScriptStep: true,
		pushToQueue: true,
		removeScript: true,
		setCookie: true,
		setGlobal: true,
		setGlobalPath: true,
	};
