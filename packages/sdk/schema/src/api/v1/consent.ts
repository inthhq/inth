/**
 * `/v1/consent/*` schemas: init, manifest, records and sessions.
 *
 * Each one is the schema generated from the backend's OpenAPI document
 * (`./generated/schemas`), with the SDK's own rules added where the document
 * leaves them out. Init answers with the same shape the 3.x routes do, so
 * its schema is the shared one.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import type { ConsentManifest } from '../../shared/consent-manifest';
import { POLICY_OPTIONAL_CATEGORIES } from '../../shared/policy-rule-invariants';
import { initOutputSchema } from '../init';
import type { InitOutput } from '../init';
import {
	v1CanonicalSubjectIdSchema,
	v1IdempotencyKeySchema,
	v1SubjectIdSchema,
} from './common';
import {
	consentRecordRequestSchema,
	consentRecordResponseSchema,
	consentSessionRequestSchema,
	getV1ConsentInitQuerySchema,
	getV1ConsentManifestQuerySchema,
	postV1ConsentRecordsQuerySchema,
} from './generated/schemas';
import { jsonObject } from './json-schema';

// ---------------------------------------------------------------------------
// GET /v1/consent/init and GET /v1/consent/manifest
// ---------------------------------------------------------------------------

/**
 * The SDK's manifest runtime level (`manifestLevel`), which the document
 * does not describe yet. The Inth server sends only the remote scripts that
 * level runs.
 */
const manifestLevelEntry = {
	manifestLevel: v.optional(
		v.pipe(
			v.string(),
			v.regex(/^[1-9]\d{0,5}$/u),
			v.description(
				'The highest manifest runtime level the SDK runs. Without it, level 1.'
			)
		)
	),
};

/** Query of `GET /v1/consent/init`. */
export const v1ConsentInitQuerySchema = jsonObject(
	v.object({ ...getV1ConsentInitQuerySchema.entries, ...manifestLevelEntry })
);

/** Query of `GET /v1/consent/manifest`. */
export const v1ConsentManifestQuerySchema = jsonObject(
	v.object({
		...getV1ConsentManifestQuerySchema.entries,
		...manifestLevelEntry,
	})
);

export const v1ConsentInitOutputSchema = initOutputSchema;

// ---------------------------------------------------------------------------
// POST /v1/consent/records
// ---------------------------------------------------------------------------

/** Query of `POST /v1/consent/records`: the journey the save belongs to. */
export const v1ConsentRecordQuerySchema = postV1ConsentRecordsQuerySchema;

/** Categories an answer may hold a receipt for. */
export const V1_ANSWER_CATEGORIES = [
	'necessary',
	...POLICY_OPTIONAL_CATEGORIES,
] as const;

export type V1AnswerCategory = (typeof V1_ANSWER_CATEGORIES)[number];

/**
 * The subject's answer after an action: one receipt for every category with
 * an explicit value, each with the time and policy basis it was confirmed
 * under. `necessary` may be left out and counts as `true`.
 *
 * The backend merges an answer into the stored one: per category, the
 * receipt with the newer `confirmedAt` wins, and a category the answer
 * leaves out keeps its stored receipt. So an answer may be partial, such as
 * a queued save a newer action partly superseded.
 */
export const v1ConsentAnswerSchema = consentRecordRequestSchema.entries.answer;

/**
 * Body of `POST /v1/consent/records`: one banner answer.
 *
 * `answer` is the answer after the action; `confirmed` names the categories
 * this action confirmed, each a key of `answer.categories`, in no
 * particular order. `externalId` is stored as a link only with a valid
 * `identityToken`; a missing or invalid token leaves the link off and the
 * save still succeeds.
 */
export const v1ConsentRecordInputSchema = v.pipe(
	jsonObject(
		v.object({
			...consentRecordRequestSchema.entries,
			idempotencyKey: v1IdempotencyKeySchema,
			subjectId: v1SubjectIdSchema,
		})
	),
	v.forward(
		v.check(
			(input) =>
				input.confirmed.every(
					(category) => input.answer.categories[category] !== undefined
				),
			'Every confirmed category must have a receipt in answer'
		),
		['confirmed']
	)
);

/**
 * Whether the external ID sent with a save was stored as a link. A link left
 * off is not an error: the save was recorded either way. `unverified` means
 * the save carried no identity token, `invalid_token` one that did not
 * verify, and `refused` a token that verified for a person the backend will
 * not link, such as one who was erased.
 */
export const v1ConsentRecordLinkSchema =
	consentRecordResponseSchema.entries.link.wrapped;

/**
 * Answer of `POST /v1/consent/records`. `subjectId` is canonical: the client
 * stores it in place of a `sub_` ID.
 */
export const v1ConsentRecordOutputSchema = jsonObject(
	v.object({
		...consentRecordResponseSchema.entries,
		subjectId: v1CanonicalSubjectIdSchema,
	})
);

// ---------------------------------------------------------------------------
// POST /v1/consent/sessions
// ---------------------------------------------------------------------------

/** The consent journey of a session report, with its site as `property`. */
export const v1ConsentSessionJourneySchema =
	consentSessionRequestSchema.entries.journey.wrapped;

/**
 * Body of `POST /v1/consent/sessions`, sent by a server that resolved init
 * from a manifest. The visitor's IP and user agent travel as headers.
 */
export const v1ConsentSessionReportSchema = consentSessionRequestSchema;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type V1ConsentInitQuery = v.InferOutput<typeof v1ConsentInitQuerySchema>;
export type V1ConsentManifestQuery = v.InferOutput<
	typeof v1ConsentManifestQuerySchema
>;
export type V1ConsentInitOutput = InitOutput;
export type V1ConsentManifest = ConsentManifest;
export type V1ConsentAnswer = v.InferOutput<typeof v1ConsentAnswerSchema>;
export type V1ConsentRecordQuery = v.InferOutput<
	typeof v1ConsentRecordQuerySchema
>;
export type V1ConsentRecordInput = v.InferOutput<
	typeof v1ConsentRecordInputSchema
>;
export type V1ConsentRecordLink = v.InferOutput<
	typeof v1ConsentRecordLinkSchema
>;
export type V1ConsentRecordOutput = v.InferOutput<
	typeof v1ConsentRecordOutputSchema
>;
export type V1ConsentSessionJourney = v.InferOutput<
	typeof v1ConsentSessionJourneySchema
>;
export type V1ConsentSessionReport = v.InferOutput<
	typeof v1ConsentSessionReportSchema
>;
