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
	v1EffectiveOptOutSchema,
	v1EpochMillisecondsSchema,
	v1ExternalIdSchema,
	v1IdempotencyKeySchema,
	v1IdentityProviderSchema,
	v1IdentityTokenSchema,
	v1OptOutRightsSchema,
	v1PropertySchema,
	v1SubjectIdSchema,
} from './common';
import type { V1EffectiveOptOut } from './common';
import {
	consentRecordRequestSchema,
	consentRecordResponseSchema,
	consentSessionRequestSchema,
	getV1ConsentInitQuerySchema,
	getV1ConsentManifestQuerySchema,
	postV1ConsentRecordsQuerySchema,
} from './generated/schemas';
import { jsonObject, jsonRecord } from './json-schema';

// ---------------------------------------------------------------------------
// GET /v1/consent/init and GET /v1/consent/manifest
// ---------------------------------------------------------------------------

/** Query of `GET /v1/consent/init`. */
export const v1ConsentInitQuerySchema = getV1ConsentInitQuerySchema;

/** Query of `GET /v1/consent/manifest`. */
export const v1ConsentManifestQuerySchema = getV1ConsentManifestQuerySchema;

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
		optOut: v.optional(v1EffectiveOptOutSchema),
		subjectId: v1CanonicalSubjectIdSchema,
	})
);

// ---------------------------------------------------------------------------
// POST /v1/consent/opt-outs
// ---------------------------------------------------------------------------

/**
 * Body of `POST /v1/consent/opt-outs`: record a durable opt-out.
 *
 * When `rights` is omitted, the server derives the applicable rights from
 * the visitor's location (the verified `policySnapshotToken`, else the
 * request's geo location, else `country` and `region`, else all three).
 * Context fields (`policyId`, `country`, `region`, `language`,
 * `policySnapshotToken`) are recorded and never validated. Identity problems
 * never fail the opt-out.
 */
export const v1ConsentOptOutInputSchema = jsonObject(
	v.object({
		country: consentRecordRequestSchema.entries.country,
		externalId: v.optional(v1ExternalIdSchema),
		givenAt: v1EpochMillisecondsSchema,
		idempotencyKey: v1IdempotencyKeySchema,
		identityProvider: v.optional(v1IdentityProviderSchema),
		identityToken: v.optional(v1IdentityTokenSchema),
		language: consentRecordRequestSchema.entries.language,
		metadata: v.optional(
			v.pipe(
				jsonRecord(v.string(), v.unknown()),
				v.description('Audit metadata to store with the opt-out.')
			)
		),
		method: v.pipe(
			v.picklist(['button', 'gpc']),
			v.description('How the visitor recorded this opt-out.')
		),
		policyId: consentRecordRequestSchema.entries.policyId,
		policySnapshotToken: v.optional(
			v.pipe(
				v.string(),
				v.description('Signed policy snapshot token from init, if held.')
			)
		),
		property: v1PropertySchema,
		region: consentRecordRequestSchema.entries.region,
		/** Optional. When absent, the server derives the applicable rights from the visitor's location. */
		rights: v.optional(v1OptOutRightsSchema),
		subjectId: v1SubjectIdSchema,
		uiSource: v.optional(
			v.pipe(
				v.string(),
				v.description('UI surface that collected the opt-out.'),
				v.examples(['banner', 'dialog', 'widget'])
			)
		),
	})
);

/**
 * Answer of `POST /v1/consent/opt-outs`. `subjectId` is canonical and
 * `optOut.recordedAt` is the backend's authoritative time.
 *
 * `optOut` is `null` only when a retry arrives after that opt-out was
 * lifted: the act is recorded under the first try's `recordId`, nothing is
 * restored, and the device holds no opt-out.
 */
export const v1ConsentOptOutOutputSchema = jsonObject(
	v.object({
		link: v.optional(v1ConsentRecordLinkSchema),
		optOut: v.nullable(v1EffectiveOptOutSchema),
		recordId: v.pipe(
			v.string(),
			v.uuid('Record ID must be a UUID'),
			v.description('ID of the event that recorded the opt-out.')
		),
		subjectId: v1CanonicalSubjectIdSchema,
	})
);

// ---------------------------------------------------------------------------
// POST /v1/consent/opt-outs/lift
// ---------------------------------------------------------------------------

/**
 * Body of `POST /v1/consent/opt-outs/lift`: lift an opt-out.
 *
 * Omit `rights` to lift every right the device holds. With a verifying
 * `identityToken`, the account's opt-out lifts too.
 */
export const v1ConsentOptOutLiftInputSchema = jsonObject(
	v.object({
		externalId: v.optional(v1ExternalIdSchema),
		givenAt: v1EpochMillisecondsSchema,
		idempotencyKey: v1IdempotencyKeySchema,
		identityProvider: v.optional(v1IdentityProviderSchema),
		identityToken: v.optional(v1IdentityTokenSchema),
		property: v1PropertySchema,
		rights: v.optional(v1OptOutRightsSchema),
		subjectId: v1SubjectIdSchema,
		uiSource: v.optional(
			v.pipe(
				v.string(),
				v.description('UI surface that lifted the opt-out.'),
				v.examples(['banner', 'dialog', 'widget'])
			)
		),
	})
);

/**
 * Answer of `POST /v1/consent/opt-outs/lift`. `optOut` is `null` once no
 * opt-out remains in force, or the account's remaining opt-out when the
 * device alone was lifted. A lift that lifts nothing is still recorded, so
 * `recordId` is always present.
 */
export const v1ConsentOptOutLiftOutputSchema = jsonObject(
	v.object({
		optOut: v.nullable(v1EffectiveOptOutSchema),
		recordId: v.pipe(
			v.string(),
			v.uuid('Record ID must be a UUID'),
			v.description('ID of the event that recorded the lift.')
		),
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
export type V1ConsentRecordOutput = Omit<
	v.InferOutput<typeof v1ConsentRecordOutputSchema>,
	'optOut'
> & {
	optOut?: V1EffectiveOptOut;
};
export type V1ConsentOptOutInput = v.InferOutput<
	typeof v1ConsentOptOutInputSchema
>;
export type V1ConsentOptOutOutput = Omit<
	v.InferOutput<typeof v1ConsentOptOutOutputSchema>,
	'optOut'
> & {
	optOut: V1EffectiveOptOut | null;
};
export type V1ConsentOptOutLiftInput = v.InferOutput<
	typeof v1ConsentOptOutLiftInputSchema
>;
export type V1ConsentOptOutLiftOutput = Omit<
	v.InferOutput<typeof v1ConsentOptOutLiftOutputSchema>,
	'optOut'
> & {
	optOut: V1EffectiveOptOut | null;
};
export type V1ConsentSessionJourney = v.InferOutput<
	typeof v1ConsentSessionJourneySchema
>;
export type V1ConsentSessionReport = v.InferOutput<
	typeof v1ConsentSessionReportSchema
>;
