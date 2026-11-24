import type {
	ConsentKernel,
	HydrationRecords,
	HydrationResult,
	InitResponse,
	KernelEvent,
	KernelUser,
} from '../consent-kernel.model';
/**
 * Kernel verbs that only core's own modules call: the runtime, persistence
 * and the records clear. They exist on every kernel `createConsentKernel()`
 * returns but are not part of {@link ConsentKernel}, the public interface.
 *
 * Callers cast with a type-only import, so a module loaded on demand gains
 * no import edge.
 *
 * @internal
 */
import type { UserConsent } from '@inth/sdk-schema/types';
import type { OptOutReceiptData } from '../libs/opt-out-state.model';
import type {
	AccountConsentLayer,
	AccountLayerSource,
	BrowserConsentRecords,
} from './account-layer';

/** @internal */
export interface InternalKernel extends ConsentKernel {
	/**
	 * Apply validated stored records without creating a choice. Emits
	 * `permissions:changed` when permissions changed and nothing else. Marks
	 * the lifecycle as started and installs the deadline timer. Hydration
	 * does not write storage; the mounted adapter forwards browser detection
	 * through `set.privacySignals` afterward.
	 */
	hydrate: (records: HydrationRecords) => HydrationResult;
	/**
	 * Apply an init response synchronously, in place of the attempt that
	 * would have fetched it; an attempt in flight then applies nothing. The
	 * provider runtime adopts a streamed prefetch this way, so the kernel
	 * holds the policy a server-rendered surface shows by the time it
	 * hydrates. Before the runtime started (`afterStart` false) it only
	 * commits, as construction would; after, it announces `init:applied` as
	 * a completed attempt does.
	 */
	adoptInit: (response: InitResponse, afterStart: boolean) => void;
	/**
	 * Mark the kernel live in a visitor's browser. `init()` does this on its
	 * own; a runtime that renders from a server-resolved prefetch and never
	 * calls `init()` calls it after hydration, so a visible surface is
	 * stamped as an impression (`surface:shown`, `snapshot.surfaceShownAt`)
	 * and a later choice can carry `timeToDecisionMs`. Idempotent.
	 *
	 * @param at - Impression time for a surface already visible. Defaults to now.
	 */
	markLive: (at?: number) => void;
	/**
	 * Mark `id` as an ID Inth generated that no record carries, or clear the
	 * mark with `null`. It lives in memory only until a save records it, so
	 * `identify()` keeps the identity for the first save instead of linking
	 * an ID the next page load does not have. The first save, vendor save or
	 * notice acknowledgement that carries it clears the mark.
	 */
	markProvisionalSubject: (id: string | null) => void;
	/**
	 * Sign the identified account out: `snapshot.user` becomes `null` and
	 * the identification generation advances at once, so an answer to a
	 * request made for that account (an opt-out lift, a link, a subject
	 * read) no longer applies. IAB authority given under the account is
	 * retired, as on `identify()`. The subject, its records and the held
	 * opt-out stay. The runtime calls it for `identify(undefined)`.
	 */
	clearIdentity: () => void;
	/** The ID {@link markProvisionalSubject} marked, `null` for none. */
	getProvisionalSubject: () => string | null;
	/**
	 * Keep save requests from leaving until `until` settles, whether it
	 * resolves or rejects. A request that already left is not held.
	 * Persistence calls this from its `choice:recorded` listener while its
	 * write code is still loading, with the promise of the write, so the
	 * first save after page load is stored before it is sent.
	 */
	holdSaves: (until: Promise<unknown>) => void;
	/**
	 * The pending promise passed to {@link holdSaves}, or `undefined` once
	 * every local write hold has settled.
	 */
	getSavesHold: () => Promise<unknown> | undefined;
	/**
	 * Send the saves queued in the outbox now, as after a completed init.
	 * A deferred root calls it when its engine starts after a banner tap
	 * that queued its save without a kernel. Does nothing once disposed.
	 */
	replaySaves: () => void;
	/**
	 * Whether this browser has already handed a GPC opt-out request to the save
	 * outbox for the currently held opt-out record.
	 */
	isOptOutGpcReported: () => boolean;
	/**
	 * Subscribe to live changes to the local GPC report mark so persistence
	 * stores it beside the opt-out record without emitting `opt-out:recorded`.
	 */
	onOptOutGpcReportedChange: (
		listener: (reported: boolean) => void
	) => () => void;
	/**
	 * Local-only receipt data kept beside the held opt-out record.
	 */
	getOptOutReceiptData: () => Readonly<OptOutReceiptData>;
	/**
	 * Immutable revision-0 local receipt data, matching `getServerSnapshot()`.
	 */
	getServerOptOutReceiptData: () => Readonly<OptOutReceiptData>;
	/**
	 * Subscribe to changes in local opt-out receipt data.
	 */
	onOptOutReceiptDataChange: (
		listener: (
			data: Readonly<OptOutReceiptData>,
			fromHydration?: boolean
		) => void
	) => () => void;
	/** Raw server `device.writtenAt` from the last backend answer carrying this device's opt-out row, or `null`. */
	getOptOutServerWrittenAt: () => number | null;
	/** Subscribe to changes in the raw server write timestamp. */
	onOptOutServerWrittenAtChange: (
		listener: (writtenAt: number | null, fromHydration?: boolean) => void
	) => () => void;
	/**
	 * Number of direct opt-out and lift requests currently in flight.
	 */
	getOptOutRequestsInFlight: () => number;
	/**
	 * Subscribe to changes in the in-flight opt-out and lift request count.
	 */
	onOptOutRequestsChange: (listener: (inFlight: number) => void) => () => void;
	/** Browser-made consent records kept apart from the account consent layer. */
	getBrowserRecords: () => BrowserConsentRecords;
	/** Verified external user ID linked to `subjectId`, when known. */
	getLinkedExternalId: (subjectId: string | null) => string | undefined;
	/** Subscribe to newly verified subject links so persistence can store them. */
	onSubjectLinked: (listener: () => void) => () => void;
	/** Current account consent layer, or `null` when none is held. */
	getAccountLayer: () => AccountConsentLayer | null;
	/** Provenance (`'incoming' | 'stored'`) of the current account consent layer. */
	getAccountLayerSource: () => AccountLayerSource;
	/**
	 * Atomically update the current user (dropping any mismatched account layer)
	 * and optionally set `userConsentPending` or apply a resolved `userConsent`
	 * (`UserConsent | null`) in one single kernel commit.
	 */
	setUserWithPending: (
		user: KernelUser | null,
		options?:
			| boolean
			| {
					readonly pending?: boolean;
					readonly userConsent?: UserConsent | null;
			  }
	) => void;
	/**
	 * Monotonic generation bumped on user change, logout, clear, dispose, and
	 * successful account opt-out lift. Async `userConsent` Promises capture it
	 * before awaiting and drop results if it moved.
	 */
	getAccountSyncGeneration: () => number;
	/** Bump the account sync generation and return the new value. */
	bumpAccountSyncGeneration: () => number;
	/** Arm or release the `userConsentPending` hold on the kernel snapshot. */
	setUserConsentPending: (pending: boolean) => void;
	/**
	 * Sync a `UserConsent` document and optionally release `userConsentPending`
	 * in one atomic commit so no intermediate snapshot runs with `pending: false`
	 * before the resolved document applies.
	 */
	settleUserConsent: (
		value: UserConsent | null | undefined,
		options?: { clearPending?: boolean; forceClientSync?: boolean }
	) => boolean;
	/**
	 * Subscribe to changes to the account consent layer so persistence can
	 * schedule writes or synchronously delete account storage on drop.
	 */
	onAccountLayerChange: (
		listener: (
			layer: AccountConsentLayer | null,
			fromHydration: boolean
		) => void
	) => () => void;
	readonly events: ConsentKernel['events'] & {
		/** Announce an event the kernel did not produce itself. */
		emit: (event: KernelEvent) => void;
	};
}
