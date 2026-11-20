import type * as v from 'valibot';

import type {
	components,
	operations,
} from '../../../../vendor/backend-openapi/openapi.generated';
import type { ConsentManifest } from '../../../shared/consent-manifest';
import type { v1ErrorBodySchema } from '../common';
import type {
	v1ConsentCheckOutputSchema,
	v1ConsentCheckQuerySchema,
	v1ConsentInitOutputSchema,
	v1ConsentInitQuerySchema,
	v1ConsentRecordInputSchema,
	v1ConsentRecordOutputSchema,
	v1ConsentRecordQuerySchema,
	v1ConsentSessionReportSchema,
} from '../consent';
import type { V1ErrorCode } from '../constants';
import type {
	v1DocumentAcceptancesInputSchema,
	v1DocumentAcceptancesOutputSchema,
	v1DocumentCurrentOutputSchema,
	v1DocumentParamsSchema,
	v1DocumentPublishInputSchema,
	v1DocumentPublishOutputSchema,
} from '../documents';
import type {
	v1SubjectLinkInputSchema,
	v1SubjectLinkOutputSchema,
	v1SubjectLinkParamsSchema,
} from '../subjects';
import type { ExpectNone, WireDiff } from './wire-diff';

/*
 * The `/v1` schemas against the types generated from the backend's OpenAPI
 * document (`vendor/backend-openapi/`). A field renamed, added or removed on
 * either side, or a change in its type or optionality, fails `check-types`.
 *
 * Each shape is compared as the SDK sends or reads it: a schema's output,
 * except the publish body, whose `requiresAcceptance` has a default and is
 * compared as the schema's input.
 */

type Body<Id extends keyof operations> = operations[Id] extends {
	requestBody?: { content: { 'application/json': infer Json } };
}
	? Json
	: never;
type Ok<Id extends keyof operations> = operations[Id] extends {
	responses: { 200: { content: { 'application/json': infer Json } } };
}
	? Json
	: never;
type Query<Id extends keyof operations> = NonNullable<
	operations[Id]['parameters']['query']
>;
type PathParams<Id extends keyof operations> = NonNullable<
	operations[Id]['parameters']['path']
>;
type Out<Schema extends v.GenericSchema> = v.InferOutput<Schema>;

type DocumentError = components['schemas']['V1Error'];

/**
 * The error body with any `error.code`: the SDK reads a code it does not
 * know yet, so a code the backend adds later still parses. The codes it
 * knows are compared on their own.
 */
type DocumentErrorBody = Omit<DocumentError, 'error'> & {
	error: Omit<DocumentError['error'], 'code'> & { code: string };
};

type Found =
	| WireDiff<
			Out<typeof v1ConsentInitQuerySchema>,
			Query<'getV1ConsentInit'>,
			'init query'
	  >
	| WireDiff<
			Out<typeof v1ConsentInitOutputSchema>,
			Ok<'getV1ConsentInit'>,
			'init answer'
	  >
	| WireDiff<ConsentManifest, Ok<'getV1ConsentManifest'>, 'manifest answer'>
	| WireDiff<
			Out<typeof v1ConsentRecordQuerySchema>,
			Query<'postV1ConsentRecords'>,
			'records query'
	  >
	| WireDiff<
			Out<typeof v1ConsentRecordInputSchema>,
			Body<'postV1ConsentRecords'>,
			'records body'
	  >
	| WireDiff<
			Out<typeof v1ConsentRecordOutputSchema>,
			Ok<'postV1ConsentRecords'>,
			'records answer'
	  >
	| WireDiff<
			Out<typeof v1ConsentSessionReportSchema>,
			Body<'postV1ConsentSessions'>,
			'sessions body'
	  >
	| WireDiff<
			Out<typeof v1ConsentCheckQuerySchema>,
			Query<'getV1ConsentCheck'>,
			'check query'
	  >
	| WireDiff<
			Out<typeof v1ConsentCheckOutputSchema>,
			Ok<'getV1ConsentCheck'>,
			'check answer'
	  >
	| WireDiff<
			Out<typeof v1SubjectLinkParamsSchema>,
			PathParams<'postV1SubjectsByIdLink'>,
			'link path'
	  >
	| WireDiff<
			Out<typeof v1SubjectLinkInputSchema>,
			Body<'postV1SubjectsByIdLink'>,
			'link body'
	  >
	| WireDiff<
			Out<typeof v1SubjectLinkOutputSchema>,
			Ok<'postV1SubjectsByIdLink'>,
			'link answer'
	  >
	| WireDiff<
			Out<typeof v1DocumentParamsSchema>,
			PathParams<'getV1DocumentsByTypeCurrent'>,
			'current path'
	  >
	| WireDiff<
			Out<typeof v1DocumentParamsSchema>,
			PathParams<'putV1DocumentsByTypeCurrent'>,
			'publish path'
	  >
	| WireDiff<
			v.InferInput<typeof v1DocumentPublishInputSchema>,
			Body<'putV1DocumentsByTypeCurrent'>,
			'publish body'
	  >
	| WireDiff<
			Out<typeof v1DocumentPublishOutputSchema>,
			Ok<'putV1DocumentsByTypeCurrent'>,
			'publish answer'
	  >
	| WireDiff<
			Out<typeof v1DocumentCurrentOutputSchema>,
			Ok<'getV1DocumentsByTypeCurrent'>,
			'current answer'
	  >
	| WireDiff<
			Out<typeof v1DocumentAcceptancesInputSchema>,
			Body<'postV1DocumentsAcceptances'>,
			'acceptances body'
	  >
	| WireDiff<
			Out<typeof v1DocumentAcceptancesOutputSchema>,
			Ok<'postV1DocumentsAcceptances'>,
			'acceptances answer'
	  >
	| WireDiff<Out<typeof v1ErrorBodySchema>, DocumentErrorBody, 'error body'>
	| WireDiff<V1ErrorCode, DocumentError['error']['code'], 'error codes'>;

/**
 * Where the backend's document disagrees with the wire contract, or the
 * contract does not settle the field. Each entry is one field for the
 * backend to fix.
 */
type DocumentGaps =
	// Clarification 19 says the document describes `scriptRegistry`, but the
	// backend does not answer it on `/v1` yet and the document leaves it out.
	// The SDK reads it when present.
	| 'init answer.scriptRegistry: only in SDK'
	| 'manifest answer.scriptRegistry: only in SDK'
	// The manifest type is shared with the 3.x routes, whose producer may
	// name a tenant. `/v1` names none, and the SDK does not send it on.
	| 'manifest answer.tenantId: only in SDK'
	// The document leaves the manifest's translation inputs open. The SDK
	// types them as the 3.x manifest does.
	| 'manifest answer.translations.customTranslations.*: record in document only'
	| 'manifest answer.translations.i18n: record in document only';

/** A mismatch this file does not list. */
export type UnlistedMismatches = ExpectNone<Exclude<Found, DocumentGaps>>;
/** An entry above the document no longer has. */
export type FixedGaps = ExpectNone<Exclude<DocumentGaps, Found>>;
