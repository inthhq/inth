/**
 * Storage writes for every Inth record: the v3 envelope, the notice
 * dismissal and the vendor denials. The reads that pair with them are in
 * `../record-storage.store.ts`; clearing them all is first-load code, in
 * `../clear.ts`.
 *
 * Each record is validated with the reader's own validator before it is
 * written, so nothing is stored that the next read would reject. Writes
 * run only when the kernel explicitly asks; hydration never writes.
 *
 * @internal
 */
import type { CookieWriteReport } from '../../../libs/cookie';
import type {
	DecodeResult,
	StorageIssue,
	StoredConsentEnvelope,
	StoredNoticeDismissal,
	StoredOptOutRecord,
	StoredVendorChoice,
} from '../record-codec.model';
import type { StorageConfig } from '../persistence.model';
import {
	encodeNoticeDismissal,
	encodeNoticeDismissalCompact,
	encodeNoticeSubjectCompact,
	encodeOptOutCategoriesCompact,
	encodeOptOutRecord,
	encodeOptOutRecordCompact,
	encodeStoredConsentEnvelopeCompact,
	encodeStoredConsentEnvelopeJson,
	encodeVendorChoice,
	encodeVendorChoiceCompact,
} from './record-encode.model';
import type { RecordStoreTools } from './persistence-writer.model';

export interface WriteStoredConsentOptions {
	/** Current time. Rejects envelopes carrying future timestamps. */
	now: number;
	config?: StorageConfig;
}

export interface WriteReport {
	/** localStorage accepted the JSON envelope. */
	localStorage: boolean;
	/**
	 * The cookie assignment ran and the value read back matches. `false`
	 * covers both a thrown assignment and a silent browser drop; see
	 * `cookieDetail` to tell them apart.
	 */
	cookie: boolean;
	cookieDetail: CookieWriteReport;
}

export type WriteStoredConsentResult =
	| { ok: true; written: WriteReport; envelope: StoredConsentEnvelope }
	| { ok: false; issues: StorageIssue[] };

export type AuxiliaryWriteReport = WriteReport;

/** The record writes, bound to the first-load functions they call. */
export interface RecordStore {
	/**
	 * Writes one v3 envelope to localStorage (JSON) and the cookie (compact)
	 * under the configured key. The envelope is validated first and nothing
	 * is written when it is malformed. Category times are written exactly
	 * as given; this function never stamps the clock. The legacy
	 * localStorage key is left untouched. When localStorage rejects the
	 * write but the cookie takes it, the older localStorage copy is removed.
	 * When only localStorage takes it, the cookie as it stands is stored
	 * under `<key>-cookie-miss`, so a read can tell that the local copy is
	 * newer until the cookie changes; a write that reaches the cookie
	 * removes that marker. `written.cookie` is true only when the cookie
	 * assignment ran and the value read back equals what was written;
	 * `written.cookieDetail` separates a thrown assignment (`attempted:
	 * false`, with the error) from a silent browser drop (`attempted: true,
	 * verified: false`).
	 */
	writeStoredConsentEnvelope: (
		envelope: StoredConsentEnvelope,
		options: WriteStoredConsentOptions
	) => WriteStoredConsentResult;
	/**
	 * Writes the local notice dismissal to localStorage and its compact
	 * cookie projection. The consent record and its cookie are never
	 * touched.
	 */
	writeStoredNoticeDismissal: (
		record: StoredNoticeDismissal,
		config: StorageConfig | undefined,
		now: number
	) => DecodeResult<StoredNoticeDismissal> & {
		written?: AuxiliaryWriteReport;
	};
	/**
	 * Writes the vendor denial list to localStorage and its compact cookie
	 * projection. The consent record and its cookie are never touched.
	 */
	writeStoredVendorChoice: (
		record: StoredVendorChoice,
		config: StorageConfig | undefined,
		now: number
	) => DecodeResult<StoredVendorChoice> & { written?: AuxiliaryWriteReport };
	clearStoredVendorChoice: (config?: StorageConfig) => void;
	/**
	 * Writes the durable opt-out record to localStorage and its compact cookie
	 * projection, and the categories it withholds to
	 * `<key>-opt-out-categories` in both. The consent record and its cookie
	 * are never touched.
	 */
	writeStoredOptOutRecord: (
		record: StoredOptOutRecord,
		config: StorageConfig | undefined,
		now: number
	) => DecodeResult<StoredOptOutRecord> & { written?: AuxiliaryWriteReport };
	clearStoredOptOutRecord: (config?: StorageConfig) => void;
}

const hasLocalStorage = function hasLocalStorage(): boolean {
	return typeof window !== 'undefined' && Boolean(window.localStorage);
};

const writeLocalStorageText = function writeLocalStorageText(
	key: string,
	text: string
): boolean {
	try {
		if (hasLocalStorage()) {
			window.localStorage.setItem(key, text);
			return true;
		}
	} catch (error) {
		console.warn('Failed to save consent to localStorage:', error);
	}
	return false;
};

/**
 * The cookie text for a record, or `null` when a value in it has no URI
 * encoding, such as an opaque subject ID with a lone surrogate. Such a
 * record has no cookie copy: the write counts as one
 * the cookie refused, and localStorage keeps the record.
 */
const cookieText = function cookieText(encode: () => string): string | null {
	try {
		return encode();
	} catch (error) {
		if (error instanceof URIError) {
			return null;
		}
		throw error;
	}
};

/** A cookie write that did not run: the record has no cookie text. */
const NO_COOKIE_TEXT: CookieWriteReport = { attempted: false, verified: false };

/** Bind the record writes to the first-load functions they call. */
export const createRecordStore = function createRecordStore(
	tools: RecordStoreTools
): RecordStore {
	const writeCookieText = function writeCookieText(
		key: string,
		text: string | null,
		config: StorageConfig | undefined
	): CookieWriteReport {
		return text === null
			? NO_COOKIE_TEXT
			: tools.writeCookie(key, text, config);
	};

	const writeBoth = function writeBoth(
		key: string,
		local: string,
		compact: string | null,
		config: StorageConfig | undefined
	): AuxiliaryWriteReport {
		const localStorageWritten = writeLocalStorageText(key, local);
		const cookieDetail = writeCookieText(key, compact, config);
		return {
			cookie: cookieDetail.attempted && cookieDetail.verified,
			cookieDetail,
			localStorage: localStorageWritten,
		};
	};

	const removeBoth = function removeBoth(
		key: string,
		config: StorageConfig | undefined
	): void {
		tools.removeLocal(key);
		tools.deleteCookie(key, config);
	};

	const clearStoredVendorChoice: RecordStore['clearStoredVendorChoice'] = (
		config
	) => {
		removeBoth(tools.keys(config).vendors, config);
	};

	const clearStoredOptOutRecord: RecordStore['clearStoredOptOutRecord'] = (
		config
	) => {
		const keys = tools.keys(config);
		removeBoth(keys.optOut, config);
		removeBoth(keys.optOutCategories, config);
	};

	return {
		clearStoredOptOutRecord,
		clearStoredVendorChoice,
		writeStoredConsentEnvelope(envelope, options) {
			const validated = tools.validateEnvelope(envelope, options.now);
			if (validated.ok === false) {
				return validated;
			}
			const keys = tools.keys(options.config);
			const localStorageWritten = writeLocalStorageText(
				keys.consent,
				encodeStoredConsentEnvelopeJson(validated.record)
			);
			const cookieDetail = writeCookieText(
				keys.consent,
				cookieText(() => encodeStoredConsentEnvelopeCompact(validated.record)),
				options.config
			);
			if (!cookieDetail.attempted && cookieDetail.error !== undefined) {
				console.warn('Failed to save consent to cookie:', cookieDetail.error);
			}
			const cookieWritten = cookieDetail.attempted && cookieDetail.verified;
			if (cookieWritten) {
				tools.removeLocal(keys.cookieMiss);
				// The local copy is now older than the cookie.
				if (!localStorageWritten) {
					tools.removeLocal(keys.consent);
				}
			} else if (localStorageWritten) {
				writeLocalStorageText(
					keys.cookieMiss,
					tools.rawCookie(keys.consent) ?? ''
				);
			}

			return {
				envelope: validated.record,
				ok: true,
				written: {
					cookie: cookieWritten,
					cookieDetail,
					localStorage: localStorageWritten,
				},
			};
		},
		writeStoredNoticeDismissal(record, config, now) {
			const validated = tools.decodeNotice(record, now);
			if (validated.ok === false) {
				return validated;
			}
			const keys = tools.keys(config);
			const key = keys.notice;
			const written = writeBoth(
				key,
				encodeNoticeDismissal(validated.record),
				cookieText(() => encodeNoticeDismissalCompact(validated.record)),
				config
			);
			// Keep the original cookie readable by older runtimes. The companion is
			// usable only with the same acknowledgement, never as a record on its own.
			let subjectWritten = true;
			if (validated.record.subject) {
				const subjectDetail = writeCookieText(
					keys.noticeSubject,
					cookieText(() => encodeNoticeSubjectCompact(validated.record)),
					config
				);
				subjectWritten = subjectDetail.attempted && subjectDetail.verified;
			} else {
				tools.deleteCookie(keys.noticeSubject, config);
				subjectWritten = tools.rawCookie(keys.noticeSubject) === null;
			}
			if (written.cookie && subjectWritten) {
				tools.removeLocal(keys.noticeCookieMiss);
				if (!written.localStorage) {
					tools.removeLocal(key);
				}
			} else if (written.localStorage) {
				writeLocalStorageText(
					keys.noticeCookieMiss,
					JSON.stringify([
						tools.rawCookie(key) ?? '',
						tools.rawCookie(keys.noticeSubject) ?? '',
					])
				);
			}
			return { ...validated, written };
		},
		writeStoredOptOutRecord(record, config, now) {
			const validated = tools.decodeOptOut(record, now);
			if (validated.ok === false) {
				return validated;
			}
			const keys = tools.keys(config);
			const written = writeBoth(
				keys.optOut,
				encodeOptOutRecord(validated.record),
				cookieText(() => encodeOptOutRecordCompact(validated.record)),
				config
			);
			// The record stays readable by SDKs that predate `categories`; the
			// list goes beside it, bound to the act. Without a list the record
			// is legacy, so a companion left from an earlier act goes.
			const categories = encodeOptOutCategoriesCompact(validated.record);
			if (categories === null) {
				removeBoth(keys.optOutCategories, config);
			} else {
				writeBoth(keys.optOutCategories, categories, categories, config);
			}
			return { ...validated, written };
		},
		writeStoredVendorChoice(record, config, now) {
			const validated = tools.decodeVendors(record, now);
			if (validated.ok === false) {
				return validated;
			}
			return {
				...validated,
				written: writeBoth(
					tools.keys(config).vendors,
					encodeVendorChoice(validated.record),
					cookieText(() => encodeVendorChoiceCompact(validated.record)),
					config
				),
			};
		},
	};
};
