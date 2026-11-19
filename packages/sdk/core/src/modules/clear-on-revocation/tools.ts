/**
 * What data clearing calls but does not import, passed to `clear.ts` so it
 * can load on demand as one chunk that imports nothing the first load has.
 *
 * Imported by the public entry and by `onDemandRuntimeModules`, never by
 * `clear.ts` itself.
 *
 * @internal
 */
import { IAB_STORAGE_KEYS } from '@inth/sdk-schema/types';

import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import { cookieDomainsOf } from '../../libs/cookie/domain-utils';
import type { StorageConfig } from '../../libs/cookie/types';
import { legacySubjectIdKey } from '../../libs/legacy-subject-id';
import {
	C15T_EXPERIMENT_STORAGE_KEY,
	C15T_JOURNEY_STORAGE_KEY,
	C15T_PENDING_SAVES_STORAGE_KEY,
	C15T_SUBJECT_REASSIGNMENTS_STORAGE_KEY,
	EXPERIMENT_STORAGE_KEY,
	JOURNEY_STORAGE_KEY,
	PENDING_SAVES_STORAGE_KEY,
	resolveStorageKeys,
	storageKeyFamilies,
	SUBJECT_REASSIGNMENTS_STORAGE_KEY,
} from '../../libs/storage-keys';
import { getEffectiveGateState } from '../has';
import type { ClearOnRevocationTools } from './types';

/**
 * Every name Inth stores under for `config`, the legacy families and the
 * fixed keys included: what revocation cleanup never deletes. Here, not
 * with the storage keys, so a first load that reads the keys does not
 * carry the list.
 *
 * @returns Cookie and localStorage names.
 * @internal
 */
export const ownedStorageKeys = function ownedStorageKeys(
	config?: StorageConfig
): string[] {
	return [
		...storageKeyFamilies(resolveStorageKeys(config)).flatMap((family) =>
			Object.values(family)
		),
		legacySubjectIdKey(config),
		PENDING_SAVES_STORAGE_KEY,
		C15T_PENDING_SAVES_STORAGE_KEY,
		SUBJECT_REASSIGNMENTS_STORAGE_KEY,
		C15T_SUBJECT_REASSIGNMENTS_STORAGE_KEY,
		EXPERIMENT_STORAGE_KEY,
		C15T_EXPERIMENT_STORAGE_KEY,
		// The IAB addon's records, which revocation cleanup keeps without
		// loading the addon.
		...Object.values(IAB_STORAGE_KEYS),
	];
};

/** @internal */
export const clearOnRevocationTools: ClearOnRevocationTools = {
	cookieDomainsOf,
	gateState: getEffectiveGateState,
	optionalConsentCategories: OPTIONAL_CONSENT_CATEGORIES,
	ownedSessionStorageKeys: [JOURNEY_STORAGE_KEY, C15T_JOURNEY_STORAGE_KEY],
	ownedStorageKeys,
};
