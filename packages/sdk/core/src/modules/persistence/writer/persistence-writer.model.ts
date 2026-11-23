import type { InternalKernel } from '../../../kernel/kernel-internals.model';
/**
 * The interface between persistence's first-load part (`../index.ts`) and
 * its write code, which loads on demand.
 *
 * Type-only: the writer imports nothing the first load has. What it calls
 * there arrives as {@link PersistenceTools}.
 */
import type { mergeNewestChoice } from '../../../kernel/record-validation.model';
import type { deleteCookie, writeCookie } from '../../../libs/cookie';
import type { removeLocalStorageKey } from '../../../libs/local-storage.store';
import type { ResolvedStorageKeys } from '../../../libs/storage-keys';
import type {
	createAccountRevision,
	encodeAccountChoicesCookie,
	encodeAccountLocalJson,
	encodeAccountOptOutCookie,
	encodeAccountVendorsCookie,
} from '../account-codec';
import type {
	clearStoredAccountLayer,
	clearStoredRecords,
} from '../persistence-clear.store';
import type {
	choiceSinceEpoch,
	noticeSinceEpoch,
	optOutSinceEpoch,
	vendorChoiceSinceEpoch,
} from '../persistence-epoch.model';
import type { StoredRecords } from '../persistence-hydrate.store';
import type { StorageConfig } from '../persistence.model';
import type {
	decodeNoticeDismissal,
	decodeOptOutRecord,
	decodeVendorChoice,
	validateStoredConsentEnvelope,
} from '../record-codec.model';

/**
 * First-load functions the write code calls: the storage reads and record
 * validators the read path already has, the clear-epoch rules, the
 * per-category merge, cookie writes and the storage clear. Passed in, never imported, so the
 * write code loads as one chunk without splitting shared modules out of
 * the first load.
 *
 * @internal
 */
export interface PersistenceTools {
	/** `readStoredRecordsForReconcile`. */
	read: (config: StorageConfig | undefined, now: number) => StoredRecords;
	/** `resolveStorageKeys`. */
	keys: (config?: StorageConfig) => ResolvedStorageKeys;
	/** `getRawCookieValue`. */
	rawCookie: (name: string) => string | null;
	writeCookie: typeof writeCookie;
	deleteCookie: typeof deleteCookie;
	validateEnvelope: typeof validateStoredConsentEnvelope;
	decodeNotice: typeof decodeNoticeDismissal;
	decodeOptOut: typeof decodeOptOutRecord;
	decodeVendors: typeof decodeVendorChoice;
	choiceSince: typeof choiceSinceEpoch;
	noticeSince: typeof noticeSinceEpoch;
	optOutSince: typeof optOutSinceEpoch;
	vendorsSince: typeof vendorChoiceSinceEpoch;
	merge: typeof mergeNewestChoice;
	/** `removeLocalStorageKey`. */
	removeLocal: typeof removeLocalStorageKey;
	/** `clearStoredRecords`: first-load code, since `clear()` runs it at once. */
	clear: typeof clearStoredRecords;
	/** `clearStoredAccountLayer`: first-load code for synchronous logout cleanup. */
	clearAccount: typeof clearStoredAccountLayer;
	createAccountRevision: typeof createAccountRevision;
	encodeAccountChoicesCookie: typeof encodeAccountChoicesCookie;
	encodeAccountVendorsCookie: typeof encodeAccountVendorsCookie;
	encodeAccountOptOutCookie: typeof encodeAccountOptOutCookie;
	encodeAccountLocalJson: typeof encodeAccountLocalJson;
}

/** What {@link createRecordStore} calls. @internal */
export type RecordStoreTools = Pick<
	PersistenceTools,
	| 'decodeNotice'
	| 'decodeOptOut'
	| 'decodeVendors'
	| 'deleteCookie'
	| 'keys'
	| 'rawCookie'
	| 'removeLocal'
	| 'validateEnvelope'
	| 'writeCookie'
> &
	Partial<
		Pick<
			PersistenceTools,
			| 'clearAccount'
			| 'createAccountRevision'
			| 'encodeAccountChoicesCookie'
			| 'encodeAccountLocalJson'
			| 'encodeAccountOptOutCookie'
			| 'encodeAccountVendorsCookie'
		>
	>;

/** A record the writer stores on its own schedule. */
export type WriteKind = 'account' | 'choice' | 'notice' | 'optOut' | 'vendors';

/**
 * What the kernel's events told persistence since the last write. The
 * first-load part sets these from its listeners, which are attached before
 * the writer exists; the writer reads and resets them.
 *
 * @internal
 */
export interface PersistenceState {
	/** A decision was recorded since the last choice write. */
	choiceRecorded: boolean;
	/** A notice was acknowledged since the last notice write. */
	noticeRecorded?: boolean;
	/** An opt-out was recorded or lifted since the last opt-out write. */
	optOutRecorded?: boolean;
	/** A backend opt-out answer replaced the local record since the last opt-out write. */
	optOutSynced?: boolean;
	/** A vendor decision was recorded since the last vendor write. */
	vendorsRecorded: boolean;
	/** The subject id held when the current save started. */
	subjectBeforeSave?: string;
	/** An id a save generated because this runtime held none. */
	freshSubjectId?: string;
	/** When the save that generated `freshSubjectId` acted. */
	freshSubjectAt?: number;
}

/** What one persistence handle shares with its writer. @internal */
export interface PersistenceContext {
	kernel: InternalKernel;
	storageConfig: StorageConfig | undefined;
	now: () => number;
	state: PersistenceState;
}

/**
 * The write half of one persistence handle.
 *
 * @internal
 */
export interface PersistenceWriter {
	/**
	 * Take `read` as what storage held when memory last matched it. With
	 * `iab`, also keep its IAB metadata for the next choice write.
	 */
	adopt: (read: StoredRecords, iab: boolean) => void;
	/** Write a record in the next macrotask (coalesced). */
	schedule: (kind: WriteKind) => void;
	/** Run every scheduled write now. */
	flush: () => void;
	/** Cancel any pending scheduled write for the account layer. */
	cancelAccountWrite: () => void;
	/**
	 * Drop scheduled writes, remove every stored record and store the clear
	 * epoch for a clear made at `at`. The caller resets the event state and
	 * clears the kernel's records.
	 */
	clearStorage: (at: number) => void;
	/** See `PersistenceHandle.reconcile`. */
	reconcile: () => boolean;
	/** Reconcile in a later macrotask (coalesced). */
	scheduleReconcile: () => void;
	/** Cancel a scheduled reconciliation. */
	dispose: () => void;
}
