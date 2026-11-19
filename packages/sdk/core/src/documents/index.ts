/**
 * Legal documents on the `/v1` routes: read the version in force and record
 * acceptances. Usable with no UI.
 */

export { createDocumentsClient } from './client';
export type {
	DocumentsClient,
	DocumentsClientOptions,
	RecordAcceptancesInput,
} from './client';
export { createIdempotencyKey } from '../libs/subject-uuid';
export { InthApiError, isInthApiError } from '../transports/v1/error';
