/**
 * The page-level consent client's public shape, shared by the first-load
 * shell (`./browser/start-deferred-client`) and the engine (`./client-engine`). Types only.
 */

import type {
	ConsentSnapshot,
	ConsentState,
	KernelUser,
	ResolvedVendor,
	Unsubscribe,
	VendorChoice,
} from '@inth/sdk/engine';
import type { ConsentRuntime } from '@inth/sdk/runtime';

import type { InthResolvedOptions } from './inth-options.model';
import type { ConsentDialogKind } from './ui/register-dialog-adapter';

/** Actions the banner can trigger. */
export type ConsentAction =
	| 'accept'
	| 'reject'
	| 'customize'
	| 'opt-out'
	| 'dismiss'
	| 'close';

/**
 * What {@link AstroConsentClient.save} records: categories to grant or
 * deny, and optionally per-vendor grants keyed by vendor id.
 */
export type AstroConsentSaveInput = Partial<ConsentState> & {
	/**
	 * Per-vendor grants keyed by the ids declared in `vendors`. `false` turns
	 * a vendor off inside a granted category. Vendors left out keep their
	 * recorded state. Ignored under an IAB policy.
	 */
	vendors?: Record<string, boolean>;
};

/** The page-level consent client. */
export interface AstroConsentClient {
	/**
	 * The runtime that owns this page's kernel.
	 *
	 * The consent engine loads after the page for a visitor the banner asks
	 * to choose, so this is `undefined` until {@link AstroConsentClient.ready}
	 * resolves. Every other member works before then.
	 */
	readonly runtime: ConsentRuntime | undefined;
	readonly options: InthResolvedOptions;
	/**
	 * Resolves once the consent engine has loaded and `runtime` is set.
	 * Reading it does not load the engine.
	 */
	readonly ready: Promise<void>;
	/** The current consent snapshot. */
	getConsent: () => ConsentSnapshot;
	/**
	 * Observe consent changes.
	 *
	 * @param listener - Called with every new snapshot.
	 */
	subscribe: (listener: (snapshot: ConsentSnapshot) => void) => Unsubscribe;
	/**
	 * Open a dialog, mounting its island on first use.
	 *
	 * @param kind - `'preferences'` (default) or `'iab'`.
	 * @param tab - Which IAB preference-centre tab to land on. Ignored by
	 * the preferences dialog, which has no tabs.
	 */
	openDialog: (
		kind?: ConsentDialogKind,
		tab?: 'purposes' | 'vendors'
	) => Promise<void>;
	/** Close the open dialog or opt-out confirmation view. */
	closeDialog: () => void;
	/**
	 * Record an opt-out in one click and open the confirmation view under an
	 * opt-out rule, or open the preference dialog under other models.
	 */
	optOut: (opener?: HTMLElement | null) => Promise<void>;
	/**
	 * Without IAB, accept every category in scope. Under an IAB policy, the CMP
	 * grants only the vendors' declared processing after publisher restrictions
	 * apply, including custom vendors. Optional categories without declared
	 * consent purposes remain denied. The TC string records the IAB signals.
	 * The open banner or dialog closes once the choice is recorded locally,
	 * before the backend answers.
	 */
	acceptAll: () => Promise<void>;
	/**
	 * Reject everything but strictly necessary, through the CMP under an IAB
	 * policy. Closes the open surface like {@link AstroConsentClient.acceptAll}.
	 */
	rejectAll: () => Promise<void>;
	/**
	 * Save a specific set of consents. The open banner or dialog closes once
	 * the choice is recorded locally.
	 *
	 * @param consents - The categories to persist, and optionally per-vendor
	 * grants under `vendors`.
	 * @example
	 * ```ts
	 * await getConsentClient()?.save({
	 *   measurement: true,
	 *   vendors: { posthog: false },
	 * });
	 * ```
	 */
	save: (consents: AstroConsentSaveInput) => Promise<void>;
	/**
	 * Vendors declared for vendor-level consent: from the `vendors` option,
	 * the backend manifest, and the slugs on scripts and iframes. Empty under
	 * an IAB policy, where the TC string decides.
	 */
	getDeclaredVendors: () => readonly ResolvedVendor[];
	/**
	 * The visitor's recorded vendor decision: the ids they turned off.
	 *
	 * @returns The decision, whose `denied` list is empty after a bulk action
	 * lifted every denial, or `null` when no vendor decision was recorded.
	 */
	getVendorChoice: () => Readonly<VendorChoice> | null;
	/**
	 * Whether a vendor may load: it is declared, its category condition
	 * passes, and outside an IAB policy the visitor has not turned it off.
	 *
	 * @param vendorId - Vendor id as declared in `vendors`, on a script or by
	 * the backend.
	 * @returns `true` while the vendor may load. An id nothing declares, such
	 * as a typo, returns `false` and logs a development warning.
	 * @example
	 * ```ts
	 * const client = getConsentClient();
	 * client?.subscribe(() => {
	 *   if (client.isVendorAllowed('youtube')) {
	 *     mountVideo();
	 *   }
	 * });
	 * ```
	 */
	isVendorAllowed: (vendorId: string) => boolean;
	/**
	 * Associate this consent record with an external identity.
	 */
	identify: (user: KernelUser) => Promise<void>;
	/** Tear the runtime down. Mainly for tests. */
	dispose: () => void;
}

/**
 * The client the engine builds, whose `runtime` is set from the start: what
 * the first-load shell attaches once its engine has loaded.
 *
 * @internal
 */
export type AstroEngineClient = AstroConsentClient & {
	readonly runtime: ConsentRuntime;
};
