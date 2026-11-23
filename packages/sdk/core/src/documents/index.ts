/**
 * Legal documents on the `/v1` routes: read the version in force and record
 * acceptances. Usable with no UI.
 */

export { createDocumentsClient } from './create-documents-client';
export type {
	DocumentsClient,
	DocumentsClientOptions,
	RecordAcceptancesInput,
} from './create-documents-client';
export { createIdempotencyKey } from '../libs/subject-uuid.model';
export { InthApiError, isInthApiError } from '../transports/v1/inth-api-error';
