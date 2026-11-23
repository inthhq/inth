/**
 * What persistence's write code calls but does not import, passed to
 * `writer/writer.ts` so it can load on demand as one chunk that imports
 * nothing the first load has. Every function here is one the read path or
 * the kernel already has in the first load.
 *
 * @internal
 */
import { mergeNewestChoice } from '../../kernel/record-validation.model';
import {
	deleteCookie,
	getRawCookieValue,
	writeCookie,
} from '../../libs/cookie';
import { removeLocalStorageKey } from '../../libs/local-storage.store';
import { resolveStorageKeys } from '../../libs/storage-keys';
import {
	createAccountRevision,
	encodeAccountChoicesCookie,
	encodeAccountLocalJson,
	encodeAccountOptOutCookie,
	encodeAccountVendorsCookie,
} from './account-codec';
import {
	clearStoredAccountLayer,
	clearStoredRecords,
} from './persistence-clear.store';
import {
	choiceSinceEpoch,
	noticeSinceEpoch,
	optOutSinceEpoch,
	vendorChoiceSinceEpoch,
} from './persistence-epoch.model';
import { readStoredRecordsForReconcile } from './persistence-hydrate.store';
import {
	decodeNoticeDismissal,
	decodeOptOutRecord,
	decodeVendorChoice,
	validateStoredConsentEnvelope,
} from './record-codec.model';
import type { PersistenceTools } from './writer/persistence-writer.model';

/** @internal */
export const persistenceTools: PersistenceTools = {
	choiceSince: choiceSinceEpoch,
	clear: clearStoredRecords,
	clearAccount: clearStoredAccountLayer,
	createAccountRevision,
	decodeNotice: decodeNoticeDismissal,
	decodeOptOut: decodeOptOutRecord,
	decodeVendors: decodeVendorChoice,
	deleteCookie,
	encodeAccountChoicesCookie,
	encodeAccountLocalJson,
	encodeAccountOptOutCookie,
	encodeAccountVendorsCookie,
	keys: resolveStorageKeys,
	merge: mergeNewestChoice,
	noticeSince: noticeSinceEpoch,
	optOutSince: optOutSinceEpoch,
	rawCookie: getRawCookieValue,
	read: readStoredRecordsForReconcile,
	removeLocal: removeLocalStorageKey,
	validateEnvelope: validateStoredConsentEnvelope,
	vendorsSince: vendorChoiceSinceEpoch,
	writeCookie,
};
