/**
 * What data clearing calls but does not import, passed to `clear.ts` so it
 * can load on demand as one chunk that imports nothing the first load has.
 *
 * Imported by the public entry and by `onDemandRuntimeModules`, never by
 * `clear.ts` itself.
 *
 * @internal
 */
import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import { ownedStorageKeys } from '../../libs/storage-keys';
import { getEffectiveGateState } from '../has';
import type { ClearOnRevocationTools } from './types';

/** @internal */
export const clearOnRevocationTools: ClearOnRevocationTools = {
	gateState: getEffectiveGateState,
	optionalConsentCategories: OPTIONAL_CONSENT_CATEGORIES,
	ownedStorageKeys,
};
