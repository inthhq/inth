/**
 * Schemas for the `/v1` routes of an Inth backend.
 *
 * @packageDocumentation
 */

export {
	type V1ErrorCode,
	V1_DOCUMENT_TYPE_PATTERN,
	V1_ERROR_CODES,
	V1_LEGACY_SUBJECT_ID_PATTERN,
	V1_MAX_ACCEPTANCES,
	V1_PROPERTY_MAX_LENGTH,
	V1_PROPERTY_PATTERN,
	V1_REQUEST_ID_HEADER,
	V1_UUID_PATTERN,
	V1_UUID_V7_PATTERN,
} from './constants';

export {
	type V1ErrorBody,
	type V1ValidationDetails,
	v1CanonicalSubjectIdSchema,
	v1EpochMillisecondsSchema,
	v1ErrorBodySchema,
	v1ExternalIdSchema,
	v1IdempotencyKeySchema,
	v1IdentityProviderSchema,
	v1IdentityTokenSchema,
	v1PropertySchema,
	v1SubjectIdSchema,
	v1ValidationDetailsSchema,
} from './common';

export {
	type V1AnswerCategory,
	type V1ConsentAnswer,
	type V1ConsentCheckOutput,
	type V1ConsentCheckQuery,
	type V1ConsentCheckResult,
	type V1ConsentInitOutput,
	type V1ConsentInitQuery,
	type V1ConsentManifest,
	type V1ConsentRecordInput,
	type V1ConsentRecordLink,
	type V1ConsentRecordOutput,
	type V1ConsentRecordQuery,
	type V1ConsentSessionJourney,
	type V1ConsentSessionReport,
	V1_ANSWER_CATEGORIES,
	v1ConsentAnswerSchema,
	v1ConsentCheckOutputSchema,
	v1ConsentCheckQuerySchema,
	v1ConsentCheckResultSchema,
	v1ConsentInitOutputSchema,
	v1ConsentInitQuerySchema,
	v1ConsentRecordInputSchema,
	v1ConsentRecordLinkSchema,
	v1ConsentRecordOutputSchema,
	v1ConsentRecordQuerySchema,
	v1ConsentSessionJourneySchema,
	v1ConsentSessionReportSchema,
} from './consent';

export {
	type V1CurrentDocument,
	type V1DocumentAcceptanceItem,
	type V1DocumentAcceptancesInput,
	type V1DocumentAcceptancesOutput,
	type V1DocumentCurrentOutput,
	type V1DocumentParams,
	type V1DocumentPublishInput,
	type V1DocumentPublishOutput,
	type V1DocumentType,
	type V1PublishedDocument,
	type V1RecordedAcceptance,
	v1CurrentDocumentSchema,
	v1DocumentAcceptanceItemSchema,
	v1DocumentAcceptancesInputSchema,
	v1DocumentAcceptancesOutputSchema,
	v1DocumentCurrentOutputSchema,
	v1DocumentHashSchema,
	v1DocumentParamsSchema,
	v1DocumentPublishInputSchema,
	v1DocumentPublishOutputSchema,
	v1DocumentTypeSchema,
	v1PublishedDocumentSchema,
	v1RecordedAcceptanceSchema,
} from './documents';

export {
	type V1SubjectLinkInput,
	type V1SubjectLinkOutput,
	type V1SubjectLinkParams,
	v1SubjectLinkInputSchema,
	v1SubjectLinkOutputSchema,
	v1SubjectLinkParamsSchema,
} from './subjects';
