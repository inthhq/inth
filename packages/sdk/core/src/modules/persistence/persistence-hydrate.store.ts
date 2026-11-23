/**
 * Read stored records into the kernel.
 *
 * Synchronous and read-only: the storage read never migrates, mirrors,
 * renews or deletes anything. The first structurally valid consent
 * candidate wins (cookie, then localStorage, under the configured key and
 * then each legacy family), the notice dismissal and vendor denials are
 * read with the same `now`,
 * and everything is applied through `kernel.hydrate()`, which
 * validates again and never emits a choice event.
 */
import type { ConsentSubject } from '../../consent-record/types';
import type { InternalKernel } from '../../kernel/internals';
import type { HydrationRecords } from '../../types';
import {
	noticeSinceEpoch,
	optOutSinceEpoch,
	vendorChoiceSinceEpoch,
} from './epoch';
import type {
	StoredIabMetadata,
	StoredNoticeDismissal,
	StoredOptOutRecord,
	StoredVendorChoice,
} from './record-codec';
import {
	consentSinceEpoch,
	readStoredClearEpoch,
	readStoredClearEpochFromCookieHeader,
	readStoredConsentRecord,
	readStoredConsentRecordFromCookieHeader,
	readStoredNoticeDismissal,
	readStoredNoticeDismissalFromCookieHeader,
	readStoredOptOutRecord,
	readStoredOptOutRecordFromCookieHeader,
	readStoredVendorChoice,
	readStoredVendorChoiceFromCookieHeader,
} from './record-storage';
import type { StoredConsentSelection } from './record-storage';
import type { StorageConfig } from './types';

/** Stored records plus the IAB transport metadata the next save preserves. */
export interface StoredRecords {
	/** Unreadable records are omitted so hydration preserves in-memory values. */
	records: HydrationRecords;
	iab: StoredIabMetadata | null;
	/** Whether any valid record was found. */
	found: boolean;
	/** Diagnostics for every inspected consent candidate. */
	candidates: StoredConsentSelection['candidates'];
	/**
	 * The subject the vendor record itself carries, `null` when it carries
	 * none or no vendor record is stored. The envelope's subject wins in
	 * `records.subject`, so this is the only place the vendor copy shows.
	 */
	vendorSubject: ConsentSubject | null;
	/** Subject carried by the opt-out record, independently of other records. */
	optOutSubject?: ConsentSubject | null;
	/** Subject carried by the notice record, independently of other records. */
	noticeSubject?: ConsentSubject | null;
	/**
	 * The subject ID the records carry, `null` when they carry none. The
	 * same ID as `records.subject`, kept for callers that read it here.
	 */
	recordedSubjectId: string | null;
	/**
	 * The record `records.subject` comes from, `null` when no record carries
	 * a subject. A record stored without one, as older versions wrote them,
	 * does not carry it.
	 */
	subjectCarrier: 'choice' | 'vendors' | 'opt-out' | 'notice' | null;
	/**
	 * The clear epoch in force: the newer of the stored epoch and the one
	 * the envelope records, `0` when no clear was ever recorded. Records
	 * above already exclude everything confirmed before it.
	 */
	epoch: number;
}

/**
 * The kernel's own vendor record shape. The stored record also carries the
 * subject, which the kernel validator does not know, so it is split off.
 */
const kernelVendorChoice = function kernelVendorChoice(
	record: StoredVendorChoice | null
): HydrationRecords['vendorChoice'] {
	if (!record) {
		return null;
	}
	const { subject: _subject, ...vendorChoice } = record;
	return vendorChoice;
};

/** Strip storage-only identity before applying a notice to the kernel. */
const kernelNoticeDismissal = function kernelNoticeDismissal(
	record: StoredNoticeDismissal | null
): HydrationRecords['noticeDismissal'] {
	if (!record) {
		return null;
	}
	const { subject: _subject, ...dismissal } = record;
	return dismissal;
};

/** Strip storage-only fields before applying an opt-out record to the kernel. */
const kernelOptOutRecord = function kernelOptOutRecord(
	record: StoredOptOutRecord | null
): HydrationRecords['optOut'] {
	if (!record) {
		return null;
	}
	const {
		gpcReported: _gpcReported,
		localAct: _localAct,
		reference: _reference,
		rightsConfirmed: _rightsConfirmed,
		subject: _subject,
		version: _version,
		...optOut
	} = record;
	return optOut;
};

/**
 * The record that carries the subject among the surviving records: the
 * envelope, else the vendor record, else the opt-out record, else the notice
 * record.
 */
const subjectCarrier = function subjectCarrier(
	selected: StoredConsentSelection['selected'],
	vendorRecord: StoredVendorChoice | null,
	optOutRecord: StoredOptOutRecord | null,
	noticeRecord: StoredNoticeDismissal | null
): StoredRecords['subjectCarrier'] {
	if (selected?.subject) {
		return 'choice';
	}
	if (vendorRecord?.subject) {
		return 'vendors';
	}
	if (optOutRecord?.subject) {
		return 'opt-out';
	}
	return noticeRecord?.subject ? 'notice' : null;
};

/**
 * The subject the surviving records carry: the envelope's, else the vendor
 * record's, else the opt-out record's, else the notice record's.
 */
const recordedSubject = function recordedSubject(
	selected: StoredConsentSelection['selected'],
	vendorRecord: StoredVendorChoice | null,
	optOutRecord: StoredOptOutRecord | null,
	noticeRecord: StoredNoticeDismissal | null
): ConsentSubject | null {
	return (
		selected?.subject ??
		vendorRecord?.subject ??
		optOutRecord?.subject ??
		noticeRecord?.subject ??
		null
	);
};

const validRecord = function validRecord<RecordType>(
	read: { ok: true; record: RecordType } | { ok: false } | null
): RecordType | null {
	return read?.ok ? read.record : null;
};

const attachOptOutMeta = function attachOptOutMeta(
	records: HydrationRecords,
	optOutRecord: StoredOptOutRecord | null
): void {
	if (!optOutRecord) {
		return;
	}
	if (optOutRecord.gpcReported) {
		records.optOutGpcReported = true;
	}
	if (optOutRecord.reference) {
		records.optOutReference = optOutRecord.reference;
	}
	if (optOutRecord.localAct) {
		records.optOutLocalAct = optOutRecord.localAct;
	}
	if (optOutRecord.rightsConfirmed) {
		records.optOutRightsConfirmed = true;
	}
};

/**
 * Builds the records from decoded reads. Anything confirmed before the
 * clear epoch (the newer of the stored epoch and the envelope's own) was
 * cleared and reads as absent, so a record written back by a runtime that
 * missed the clear cannot bring it back.
 */
const composeRecords = function composeRecords(
	selection: StoredConsentSelection,
	notice: ReturnType<typeof readStoredNoticeDismissal>,
	vendors: ReturnType<typeof readStoredVendorChoice>,
	optOut: ReturnType<typeof readStoredOptOutRecord>,
	clearEpoch: number,
	now: number
): StoredRecords {
	const epoch = Math.max(clearEpoch, selection.selected?.epoch ?? 0);
	const selected = consentSinceEpoch(selection.selected, clearEpoch);
	const vendorRecord = vendorChoiceSinceEpoch(validRecord(vendors), epoch);
	const optOutRecord = optOutSinceEpoch(validRecord(optOut), epoch);
	const noticeRecord = noticeSinceEpoch(validRecord(notice), epoch);
	const recorded = recordedSubject(
		selected,
		vendorRecord,
		optOutRecord,
		noticeRecord
	);
	const records: HydrationRecords = {
		choice: selected?.choice ?? null,
		noticeDismissal: kernelNoticeDismissal(noticeRecord),
		now,
		optOut: kernelOptOutRecord(optOutRecord),
		subject: recorded,
		vendorChoice: kernelVendorChoice(vendorRecord),
	};
	attachOptOutMeta(records, optOutRecord);
	return {
		candidates: selection.candidates,
		epoch,
		found: Boolean(
			selected || vendorRecord || optOutRecord || records.noticeDismissal
		),
		iab: selected?.iab ?? null,
		noticeSubject: noticeRecord?.subject ?? null,
		optOutSubject: optOutRecord?.subject ?? null,
		recordedSubjectId: recorded?.subjectId ?? null,
		records,
		subjectCarrier: subjectCarrier(
			selected,
			vendorRecord,
			optOutRecord,
			noticeRecord
		),
		vendorSubject: vendorRecord?.subject ?? null,
	};
};

/** Whether a consent read found bytes but no candidate decoded. */
const hasUndecodableChoice = function hasUndecodableChoice(
	selection: StoredConsentSelection
): boolean {
	return (
		selection.selected === null &&
		selection.candidates.some(
			(candidate) =>
				candidate.status === 'invalid' || candidate.status === 'unparseable'
		)
	);
};

interface Unreadable {
	choice: boolean;
	notice: boolean;
	optOut: boolean;
	vendors: boolean;
}

/**
 * Also count records whose bytes did not decode as unreadable. A reader
 * returns a failed decode result, not `null`, for such bytes.
 */
const markUndecodable = function markUndecodable(
	unreadable: Unreadable,
	selection: StoredConsentSelection,
	results: Record<'notice' | 'optOut' | 'vendors', { ok: boolean } | null>
): void {
	unreadable.choice ||= hasUndecodableChoice(selection);
	unreadable.notice ||= results.notice?.ok === false;
	unreadable.optOut ||= results.optOut?.ok === false;
	unreadable.vendors ||= results.vendors?.ok === false;
};

/**
 * Shared browser read. With `preserveUndecodable`, a record that is stored
 * but does not decode is omitted like an unavailable one, so the caller
 * keeps its in-memory value instead of treating the bytes as absent.
 */
const readRecords = function readRecords(
	storageConfig: StorageConfig | undefined,
	now: number,
	preserveUndecodable: boolean
): StoredRecords {
	const unreadable: Unreadable = {
		choice: false,
		notice: false,
		optOut: false,
		vendors: false,
	};
	const selection = readStoredConsentRecord(storageConfig, now, () => {
		unreadable.choice = true;
	});
	const notice = readStoredNoticeDismissal(storageConfig, now, () => {
		unreadable.notice = true;
	});
	const clearEpoch = readStoredClearEpoch(storageConfig, now);
	const effectiveEpoch = Math.max(clearEpoch, selection.selected?.epoch ?? 0);
	const vendors = readStoredVendorChoice(
		storageConfig,
		now,
		() => {
			unreadable.vendors = true;
		},
		effectiveEpoch
	);
	const optOut = readStoredOptOutRecord(
		storageConfig,
		now,
		() => {
			unreadable.optOut = true;
		},
		effectiveEpoch
	);
	if (preserveUndecodable) {
		markUndecodable(unreadable, selection, { notice, optOut, vendors });
	}
	const {
		choice: choiceUnavailable,
		notice: noticeUnavailable,
		optOut: optOutUnavailable,
		vendors: vendorsUnavailable,
	} = unreadable;
	const stored = composeRecords(
		selection,
		notice,
		vendors,
		optOut,
		clearEpoch,
		now
	);
	// An absent value only clears memory when every candidate was readable.
	// A valid record from an available source can still hydrate normally.
	if (!selection.selected && choiceUnavailable) {
		delete stored.records.choice;
		// A readable vendor, opt-out or notice record still supplies the
		// subject it carries, linked identity included.
		if (
			!stored.records.vendorChoice &&
			!stored.records.optOut &&
			stored.subjectCarrier !== 'notice'
		) {
			delete stored.records.subject;
		}
	}
	if (!notice?.ok && noticeUnavailable) {
		delete stored.records.noticeDismissal;
	}
	if (!vendors?.ok && vendorsUnavailable) {
		delete stored.records.vendorChoice;
	}
	if (!optOut?.ok && optOutUnavailable) {
		delete stored.records.optOut;
		delete stored.records.optOutGpcReported;
		delete stored.records.optOutReference;
		delete stored.records.optOutLocalAct;
		delete stored.records.optOutRightsConfirmed;
	}
	return stored;
};

/**
 * Browser read of every stored record at `now`. Never writes.
 */
export const readStoredRecords = function readStoredRecords(
	storageConfig: StorageConfig | undefined,
	now: number
): StoredRecords {
	return readRecords(storageConfig, now, false);
};

/**
 * Browser read for reconciling a running kernel. Like
 * {@link readStoredRecords}, except a record whose bytes are present but do
 * not decode is omitted rather than reported as absent: bytes that cannot
 * be read say nothing about what the visitor decided, so they must not
 * clear a decision the kernel already holds.
 */
export const readStoredRecordsForReconcile =
	function readStoredRecordsForReconcile(
		storageConfig: StorageConfig | undefined,
		now: number
	): StoredRecords {
		return readRecords(storageConfig, now, true);
	};

const composeFromCookieHeader = function composeFromCookieHeader(
	cookieHeader: string | undefined,
	storageConfig: StorageConfig | undefined,
	now: number
): StoredRecords {
	return composeRecords(
		readStoredConsentRecordFromCookieHeader(cookieHeader, storageConfig, now),
		readStoredNoticeDismissalFromCookieHeader(cookieHeader, storageConfig, now),
		readStoredVendorChoiceFromCookieHeader(cookieHeader, storageConfig, now),
		readStoredOptOutRecordFromCookieHeader(cookieHeader, storageConfig, now),
		readStoredClearEpochFromCookieHeader(cookieHeader, storageConfig, now),
		now
	);
};

/**
 * Server read of every cookie-carried record from a request `Cookie`
 * header at `now`. The choice, the notice projection and the vendor
 * projection are decoded with the same validators
 * the browser uses, so a server render seeded with the result matches the
 * client's hydration.
 */
export const readStoredRecordsFromCookieHeader =
	function readStoredRecordsFromCookieHeader(
		cookieHeader: string | undefined,
		storageConfig: StorageConfig | undefined,
		now: number
	): HydrationRecords {
		return composeFromCookieHeader(cookieHeader, storageConfig, now).records;
	};

/**
 * Read stored records and apply them to the kernel. Returns the read
 * result so the caller can keep the IAB metadata for the next save, or
 * `null` outside the browser. `apply` picks what the kernel gets from the
 * records read; the result is always what storage holds.
 */
export const hydrateFromStorage = function hydrateFromStorage(
	kernel: InternalKernel,
	storageConfig: StorageConfig | undefined,
	now: number,
	apply: (records: HydrationRecords, stored: StoredRecords) => HydrationRecords
): StoredRecords | null {
	if (typeof document === 'undefined') {
		return null;
	}
	// Cookies can remain usable when localStorage is blocked. Let each
	// storage reader guard its own access, including property getters.
	const stored = readStoredRecords(storageConfig, now);
	const result = kernel.hydrate(apply(stored.records, stored));
	if (result.ok === false) {
		// The storage layer already validated; a rejection here means the
		// records changed shape between read and apply. Nothing is applied.
		console.warn('[inth] Stored consent records were rejected.', result.issues);
	}
	return stored;
};
