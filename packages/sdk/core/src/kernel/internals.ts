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
import type { TransportBackend } from '../transports/mode';
import type {
	ConsentKernel,
	HydrationRecords,
	HydrationResult,
	InitResponse,
	KernelEvent,
} from '../types';

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
	 * Move the records from subject `from` to `to`, the canonical ID the
	 * backend answered with, as a consent save's answer does. Does nothing
	 * once the subject is no longer `from`.
	 */
	adoptSubject: (from: string, to: string) => Promise<void>;
	/**
	 * The backend this kernel's transport reported, for a kernel a runtime
	 * built. `undefined` before it resolved one, and for a transport with no
	 * backend.
	 */
	backend?: () => TransportBackend | undefined;
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
	 * Send the saves queued in the outbox now, as after a completed init.
	 * A deferred root calls it when its engine starts after a banner tap
	 * that queued its save without a kernel. Does nothing once disposed.
	 */
	replaySaves: () => void;
	readonly events: ConsentKernel['events'] & {
		/** Announce an event the kernel did not produce itself. */
		emit: (event: KernelEvent) => void;
	};
}
