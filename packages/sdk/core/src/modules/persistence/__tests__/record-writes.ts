/**
 * Test helper: the record writes, bound to the first-load tools the way
 * persistence binds them, the encoders, and the first-load clear.
 */
import { persistenceTools } from '../tools';
import { createRecordStore } from '../writer/persistence-writer.store';

export * from '../writer/record-encode.model';

export {
	clearStoredConsentRecords,
	encodeClearEpoch,
	writeStoredClearEpoch,
} from '../persistence-clear.store';

export const {
	clearStoredOptOutRecord,
	clearStoredVendorChoice,
	writeStoredConsentEnvelope,
	writeStoredNoticeDismissal,
	writeStoredOptOutRecord,
	writeStoredVendorChoice,
} = createRecordStore(persistenceTools);
