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
type Query<Id extends keyof operations> = [
	NonNullable<operations[Id]['parameters']['query']>,
] extends [never]
	? Record<never, never>
	: NonNullable<operations[Id]['parameters']['query']>;
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
	// The contract keeps the 3.x journey query parameters on init and on
	// records. The document lists neither.
	| 'init query.journey: only in SDK'
	| 'init query.journeyScope: only in SDK'
	| 'init query.stored: only in SDK'
	| 'records query.journey: only in SDK'
	| 'records query.journeyScope: only in SDK'
	// The contract keeps these 3.x fields in the records body: the save's
	// action, model and UI source, the snapshot token, the decision-input
	// assertion, the IAB strings, the vendor choice and the metadata. The
	// document leaves them out.
	| 'records body.addtlConsent: only in SDK'
	| 'records body.consentAction: only in SDK'
	| 'records body.country: only in SDK'
	| 'records body.fingerprint: only in SDK'
	| 'records body.gpc: only in SDK'
	| 'records body.language: only in SDK'
	| 'records body.metadata: only in SDK'
	| 'records body.model: only in SDK'
	| 'records body.policyId: only in SDK'
	| 'records body.policySnapshotToken: only in SDK'
	| 'records body.region: only in SDK'
	| 'records body.tcString: only in SDK'
	| 'records body.uiSource: only in SDK'
	| 'records body.vendorChoice: only in SDK'
	// The contract has the manifest answer unchanged from 3.x. The document
	// gives it no properties.
	| 'manifest answer: record in document only'
	// Contract does not say. The document types the `gpc` query parameter
	// as any string; the SDK sends `0` or `1`, as 3.x reads it.
	| 'init query.gpc: types differ'
	// Contract does not say. The init answer carries `scriptRegistry` when
	// the project has a script registry; the document does not list it.
	| 'init answer.scriptRegistry: only in SDK'
	// Contract does not say. The document lets a document `hash` be null;
	// the contract's hash rule and the publish body require one.
	| 'acceptances answer.acceptances[].hash: nullable in document only'
	| 'current answer.document.hash: nullable in document only'
	| 'publish answer.document.hash: nullable in document only';

/** A mismatch this file does not list. */
export type UnlistedMismatches = ExpectNone<Exclude<Found, DocumentGaps>>;
/** An entry above the document no longer has. */
export type FixedGaps = ExpectNone<Exclude<DocumentGaps, Found>>;
