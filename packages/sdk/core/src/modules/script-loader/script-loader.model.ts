/**
 * Shared types for the script-loader module.
 *
 * Public types (`ScriptLoaderOptions`, `ScriptLoaderHandle`,
 * `ScriptLoaderDebugEvent`) are re-exported by `index.ts` so consumers
 * can keep importing from `@inth/sdk/modules/script-loader`.
 *
 * Internal types (`NormalizedScript`, `ReconcilePass`, `PendingMount`)
 * are exported here so siblings (`script-eligibility.model.ts`, `mount.ts`, etc.)
 * can share them. They are not re-exported from `index.ts`.
 */

import type {
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	KernelIABState,
} from '../../consent-kernel.model';
import type { AllConsentNames } from '../../consent/consent-types';
import type { extractConsentNamesFromCondition } from '../../libs/has';
import type { dispatchScriptDebugEvent } from '../../libs/script-loader/debug';
import type {
	Script,
	ScriptCallbackInfo,
	ScriptDebugEvent,
} from '../../libs/script-loader/script.model';
import type {
	declareOwnedVendors,
	forgetOwnedVendors,
	isValidVendorId,
	vendorAxisActive,
	withoutOwnedVendors,
} from '../../libs/vendors';
import type {
	deniedVendorIds,
	evaluateConsent,
	getEffectiveGateState,
	has,
} from '../has';
import type { RegistrySigningKeys } from './script-signature.model';
import type { ScriptSources } from './script-sources.model';

export type { Script, ScriptCallbackInfo };

/**
 * What the script loader calls but does not import, so it can load on
 * demand as one self-contained chunk. Vendor ownership keeps state per
 * kernel, so these are always the shared implementations; the public
 * entry passes them.
 * @internal
 */
export interface ScriptLoaderTools {
	/** Identity of this loader's callback registrations. */
	registration?: symbol;
	/** Whether a callback belongs to a same-ID configuration replacement. */
	isReplacing?: (script: Script) => boolean;

	/** Reader bound to the script object's active lifecycle, when available. */
	getConsentReader?: (
		script: Script
	) => ScriptCallbackInfo['getCurrentConsent'];

	/** Reports a load failure for the script object's active lifecycle. */
	getLoadErrorReporter?: (
		script: Script
	) => ScriptCallbackInfo['reportLoadError'];

	categoriesOf: typeof extractConsentNamesFromCondition;
	/** Hands a debug event to the page's script debug listeners. */
	debug: typeof dispatchScriptDebugEvent;
	vendorAxisActive: typeof vendorAxisActive;
	declareOwners: typeof declareOwnedVendors;
	deniedVendors: typeof deniedVendorIds;
	evaluate: typeof evaluateConsent;
	forgetOwners: typeof forgetOwnedVendors;
	/** Project declarations after this loader leaves, without mutations. */
	withoutOwners: typeof withoutOwnedVendors;
	gateState: typeof getEffectiveGateState;
	has: typeof has;
	isVendorId: typeof isValidVendorId;
}

/**
 * Structured debug event emitted at every reconcile / mount / unmount /
 * callback step. Consumed by adapter devtools and the page's script debug
 * listeners (`subscribeToScriptDebugEvents`), which receive it as the
 * {@link ScriptDebugEvent} it narrows.
 */
export interface ScriptLoaderDebugEvent extends ScriptDebugEvent {
	source: 'script-loader';
	scope: 'lifecycle' | 'phase' | 'step';
	action:
		| 'skipped'
		| 'loaded'
		| 'load_completed'
		| 'unloaded'
		| 'already_loaded'
		| 'error'
		| 'callback_invoked'
		| 'callback_error';
	message: string;
	scriptId: string;
	elementId?: string;
	hasConsent?: boolean;
	callback?:
		| 'onLoad'
		| 'onError'
		| 'onConsentChange'
		| 'onBeforeLoad'
		| 'onDispose';
	data?: Record<string, unknown>;
	timestamp: number;
}

export interface ScriptLoaderOptions {
	kernel: ConsentKernel;
	/** Script configurations. May be empty; `updateScripts` swaps later. */
	scripts: Script[];
	/** Optional synchronous listener for debug events. */
	onDebug?: (event: ScriptLoaderDebugEvent) => void;
	/**
	 * Content Security Policy nonce applied to every `<script>` element the
	 * loader creates. A per-script `nonce` takes precedence.
	 */
	nonce?: string;
	/**
	 * URLs to load scripts from in place of their own `src`, by script
	 * `id`. Applies to `scripts` and to every `updateScripts` list.
	 */
	sources?: ScriptSources;
	/**
	 * Load scripts by the Inth script registry's sources that init carries
	 * on `snapshot.scriptRegistry.sources`. Until init resolves, each script that
	 * `@inth/integrations` built, has a `src` and no entry in `sources`
	 * waits. It then loads from the registry's entry for its `id`, or from
	 * its own URL when there is none or init carried no list. An entry the
	 * loader cannot check keeps the script from loading at all. A new
	 * script list in which a waiting script has `validate` replaces the
	 * current one only once the list arrives and every check passes.
	 */
	registry?: {
		/**
		 * Whether the runtime asks `/v1/consent/init`. When it does not, the loader
		 * reads only the list a prefetch carried, and never waits.
		 */
		waitForInit: boolean;
		/**
		 * Whether an entry with no release signature is refused like
		 * `null`. Without it, such an entry loads on its integrity hash. An
		 * invalid signature is refused either way, and a script waits while
		 * its entry's signature is checked.
		 * @default false
		 */
		requireSignatures?: boolean;
		/** Whose signing keys to trust. @default 'production' */
		signingKeys?: RegistrySigningKeys;
	};
	/**
	 * When true, also dispatch debug events to the page's script debug
	 * listeners (`subscribeToScriptDebugEvents`). Default: true.
	 */
	emitToV2DebugListeners?: boolean;
}

export interface ScriptLoaderHandle {
	/** Tear down subscription and remove mounted elements. */
	dispose: () => void;
	/** Swap the script configuration. Reconciles DOM immediately. */
	updateScripts: (next: Script[]) => void;
	getLoadedScriptIds: () => string[];
}

/**
 * A `Script` plus precomputed metadata we need on every reconcile pass.
 *
 * - `hasIabMeta` — true when the script declares any IAB metadata
 *   (`vendorId`, `iabPurposes`, `iabLegIntPurposes`, `iabSpecialFeatures`).
 *   Used to route eligibility through `hasIABConsent` in IAB mode.
 * - `simpleCategory` — set when `script.category` is a single category
 *   name string. Avoids re-parsing the category tree on every reconcile.
 */
export interface NormalizedScript {
	script: Script;
	hasIabMeta: boolean;
	simpleCategory: AllConsentNames | null;
	/** Vendor slug for vendor-level consent outside IAB, if declared. */
	vendor: string | null;
}

/**
 * Per-reconcile context derived once from the snapshot and shared by
 * every script gate in this pass. Building this once per reconcile (vs
 * once per script) is the difference between O(n) and O(n²) work in
 * large script sets.
 */
export interface ReconcilePass {
	snapshot: ConsentSnapshot;
	tools: Pick<ScriptLoaderTools, 'evaluate' | 'has'>;
	consents: ConsentState;
	isIabMode: boolean;
	iab: KernelIABState | null;
	/** Vendors the subject turned off, or `null` when none is denied. */
	vendorDenied: ReadonlySet<string> | null;
}

/**
 * A script that's ready to mount but whose DOM append has been deferred
 * to a batched `flushPendingMounts` call. Batching lets a burst of
 * mounts (e.g. accept-all on a page with many scripts) trigger one
 * layout invalidation per append target instead of one per script.
 */
export interface PendingMount {
	/** Records insertion even if inline execution removes its own element. */
	appended: boolean;
	script: Script;
	element: HTMLScriptElement;
	target: HTMLElement;
	elementId: string;
	hasConsent: boolean;
	info: ScriptCallbackInfo | undefined;
}
