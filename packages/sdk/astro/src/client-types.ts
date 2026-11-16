/**
 * The page-level consent client's public shape, shared by the first-load
 * shell (`./browser/shell`) and the engine (`./client-engine`). Types only.
 */

import type {
	ConsentSnapshot,
	ConsentState,
	KernelUser,
	ResolvedVendor,
	Unsubscribe,
	VendorChoice,
} from '@c15t/core';
import type { ConsentRuntime } from '@c15t/core/runtime';

import type { C15tResolvedOptions } from './types';
import type { ConsentDialogKind } from './ui/adapter';

/** Actions the banner can trigger. */
export type ConsentAction =
	| 'accept'
	| 'reject'
	| 'customize'
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
	/** The resolved integration options. */
	readonly options: C15tResolvedOptions;
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
	 * @returns An unsubscribe function.
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
	/** Close the open dialog. */
	closeDialog: () => void;
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
	 *
	 * @param user - The external user.
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
