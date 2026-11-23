/**
 * Write kernel records to storage.
 *
 * Every write is driven by a kernel event: a recorded choice writes the v3
 * envelope, a dismissed notice writes the notice record, a recorded vendor
 * toggle writes the vendor record, a recorded opt-out writes the opt-out
 * record, and a lifted opt-out removes it. Category times are written
 * exactly as the kernel holds them; nothing here stamps the clock into a
 * receipt.
 */

import type { OptOutReceiptData } from '../../../libs/opt-out-state.model';
import type { ConsentSnapshot } from '../../../consent-kernel.model';
import type {
	StoredConsentEnvelope,
	StoredIabMetadata,
	StoredNoticeDismissal,
	StoredOptOutRecord,
	StoredVendorChoice,
} from '../record-codec.model';
import type { StorageConfig } from '../persistence.model';
import type { RecordStore } from './persistence-writer.store';

/** Envelope a snapshot's explicit choice serializes to, or `null`. */
export const buildStoredEnvelope = function buildStoredEnvelope(
	snapshot: ConsentSnapshot,
	iab: StoredIabMetadata | null,
	epoch = 0
): StoredConsentEnvelope | null {
	if (!snapshot.explicitChoice) {
		return null;
	}
	const envelope: StoredConsentEnvelope = {
		categories: snapshot.explicitChoice.categories,
		version: 3,
	};
	if (snapshot.subject && Object.keys(snapshot.subject).length > 0) {
		envelope.subject = { ...snapshot.subject };
	}
	if (epoch > 0) {
		envelope.epoch = epoch;
	}
	if (iab) {
		envelope.iab = iab;
	}
	return envelope;
};

/**
 * Write the explicit choice to storage. No-op outside the browser or when
 * no choice exists.
 */
export const writeChoiceToStorage = function writeChoiceToStorage(
	store: RecordStore,
	snapshot: ConsentSnapshot,
	iab: StoredIabMetadata | null,
	storageConfig: StorageConfig | undefined,
	now: number,
	epoch = 0
): void {
	if (typeof document === 'undefined') {
		return;
	}
	const envelope = buildStoredEnvelope(snapshot, iab, epoch);
	if (!envelope) {
		return;
	}
	const result = store.writeStoredConsentEnvelope(envelope, {
		config: storageConfig,
		now,
	});
	if (result.ok === false) {
		console.warn('[inth] Consent record was not written.', result.issues);
	}
};

/** Write the notice dismissal. No-op outside the browser or when absent. */
export const writeNoticeToStorage = function writeNoticeToStorage(
	store: RecordStore,
	snapshot: ConsentSnapshot,
	storageConfig: StorageConfig | undefined,
	now: number
): void {
	if (typeof document === 'undefined' || !snapshot.noticeDismissal) {
		return;
	}
	const record: StoredNoticeDismissal = { ...snapshot.noticeDismissal };
	if (snapshot.subject) {
		record.subject = { ...snapshot.subject };
	}
	store.writeStoredNoticeDismissal(record, storageConfig, now);
};

/**
 * Write the vendor denial list. A `null` decision removes the record; an
 * empty list is written, since its time is what lets it supersede an older
 * server denial. No-op outside the browser.
 */
export const writeVendorChoiceToStorage = function writeVendorChoiceToStorage(
	store: RecordStore,
	snapshot: ConsentSnapshot,
	storageConfig: StorageConfig | undefined,
	now: number
): void {
	if (typeof document === 'undefined') {
		return;
	}
	if (!snapshot.vendorChoice) {
		store.clearStoredVendorChoice(storageConfig);
		return;
	}
	// The subject rides along so a visitor whose only act so far decided
	// vendors keeps one identity: the envelope cannot hold it without a
	// category choice.
	const record: StoredVendorChoice = { ...snapshot.vendorChoice };
	if (snapshot.subject && Object.keys(snapshot.subject).length > 0) {
		record.subject = { ...snapshot.subject };
	}
	const result = store.writeStoredVendorChoice(record, storageConfig, now);
	if (result.ok === false) {
		console.warn('[inth] Vendor choice was not written.', result.issues);
		return;
	}
	// A server render reads the cookie only. When the browser dropped it, most
	// likely because many long ids pushed it past the per-cookie limit, the
	// next SSR page would seed an older or absent list; say so rather than
	// let it pass silently.
	if (result.written && !result.written.cookie) {
		console.warn(
			'[inth] Vendor choice cookie was not stored; the localStorage copy is current but a server render will not see it. Shorten vendor ids or deny fewer vendors.',
			result.written.cookieDetail
		);
	}
};

/**
 * Write the durable opt-out record, or remove it when lifted (`null`).
 *
 * Stored under its own `<key>-opt-out` key instead of inside the v3 consent
 * envelope: the envelope is only written once a category choice exists, an
 * opt-out can exist with no category choice, and envelope readers reject
 * unknown keys. No-op outside the browser.
 */
export const writeOptOutToStorage = function writeOptOutToStorage(
	store: RecordStore,
	snapshot: ConsentSnapshot,
	storageConfig: StorageConfig | undefined,
	now: number,
	gpcReported = false,
	receiptData?: Readonly<OptOutReceiptData>
): boolean {
	if (typeof document === 'undefined') {
		return true;
	}
	if (!snapshot.optOut) {
		store.clearStoredOptOutRecord(storageConfig);
		return true;
	}
	// The subject rides along so a visitor whose only act is an opt-out keeps
	// one identity across reloads.
	const record: StoredOptOutRecord = { ...snapshot.optOut, version: 1 };
	if (gpcReported) {
		record.gpcReported = true;
	}
	if (receiptData?.reference) {
		record.reference = receiptData.reference;
	}
	if (receiptData?.localAct) {
		record.localAct = receiptData.localAct;
	}
	if (receiptData?.rightsConfirmed) {
		record.rightsConfirmed = true;
	}
	if (snapshot.subject && Object.keys(snapshot.subject).length > 0) {
		record.subject = { ...snapshot.subject };
	}
	const result = store.writeStoredOptOutRecord(record, storageConfig, now);
	if (result.ok === false) {
		console.warn('[inth] Opt-out record was not written.', result.issues);
		return true;
	}
	return Boolean(result.written?.cookie || result.written?.localStorage);
};
