/**
 * Shapes every `/v1` route shares: subject IDs, idempotency keys, the
 * property a consent or acceptance belongs to, and the error body.
 *
 * Each one starts from the schema generated from the backend's OpenAPI
 * document (`./generated/schemas`). A rule the document leaves out and the
 * backend still applies, such as the form of a subject ID, is added here.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import {
	OPT_OUT_HOLDERS,
	OPT_OUT_METHODS,
	OPT_OUT_RIGHTS,
} from '../../shared/opt-out.model';
import type { OptOutRecord } from '../../shared/opt-out.model';
import {
	V1_LEGACY_SUBJECT_ID_PATTERN,
	V1_UUID_PATTERN,
	V1_UUID_V7_PATTERN,
} from './v1-constants.model';
import {
	consentRecordRequestSchema,
	consentRecordResponseSchema,
	subjectLinkRequestSchema,
	v1ErrorSchema,
} from './generated/schemas';
import { jsonObject, jsonRecord } from './json-schema';

/**
 * A canonical subject ID, as every `/v1` response names it. The document
 * says a UUID; the backend makes a UUIDv7 in lowercase, and the SDK stores it.
 */
export const v1CanonicalSubjectIdSchema = v.pipe(
	consentRecordResponseSchema.entries.subjectId,
	v.regex(V1_UUID_V7_PATTERN, 'Subject ID must be a lowercase UUIDv7'),
	v.examples(['0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c'])
);

/**
 * A subject ID a `/v1` request may carry: a UUIDv7, or a `sub_` ID. The
 * document says only a string.
 */
export const v1SubjectIdSchema = v.pipe(
	consentRecordRequestSchema.entries.subjectId,
	v.check(
		(value) =>
			V1_UUID_V7_PATTERN.test(value) ||
			V1_LEGACY_SUBJECT_ID_PATTERN.test(value),
		'Subject ID must be a lowercase UUIDv7 or a sub_ ID'
	),
	v.examples([
		'0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
		'sub_2VZxR7YmNpKq3WfLs8TgHd',
	])
);

/**
 * A UUID the client makes once per user action and sends again on every
 * retry of it. The backend records the action once. The document's format
 * takes either case; its description, and the backend, ask for lowercase.
 */
export const v1IdempotencyKeySchema = v.pipe(
	consentRecordRequestSchema.entries.idempotencyKey,
	v.regex(V1_UUID_PATTERN, 'Idempotency key must be a lowercase UUID'),
	v.examples(['0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e'])
);

/** Where consent was given: a lowercase host name or app ID. */
export const v1PropertySchema = consentRecordRequestSchema.entries.property;

/** The person's ID in your own system. */
export const v1ExternalIdSchema = subjectLinkRequestSchema.entries.externalId;

/** Name of the identity provider that issued an external ID. */
export const v1IdentityProviderSchema =
	subjectLinkRequestSchema.entries.identityProvider.wrapped;

/** Signed proof of an external ID, minted by your server. */
export const v1IdentityTokenSchema =
	subjectLinkRequestSchema.entries.identityToken.wrapped;

/** Epoch milliseconds, from 1970 to the latest time `Date` can represent. */
export const v1EpochMillisecondsSchema = v.pipe(
	consentRecordRequestSchema.entries.givenAt,
	v.description('Epoch milliseconds.')
);

/** Non-empty, de-duplicated opt-out rights list. */
export const v1OptOutRightsSchema = v.pipe(
	v.array(v.picklist(OPT_OUT_RIGHTS)),
	v.minLength(1, 'At least one opt-out right is required'),
	v.check(
		(rights) => new Set(rights).size === rights.length,
		'Opt-out rights must not repeat'
	),
	v.description('Opt-out rights refused by this record.')
);

/** Effective opt-out state returned by `/v1` consent and subject routes. */
export const v1EffectiveOptOutSchema = jsonObject(
	v.object({
		heldBy: v.picklist(OPT_OUT_HOLDERS),
		method: v.picklist(OPT_OUT_METHODS),
		recordedAt: v1EpochMillisecondsSchema,
		rights: v1OptOutRightsSchema,
	})
);

/**
 * `error.details` of a validation failure. The document leaves `details`
 * open.
 */
export const v1ValidationDetailsSchema = jsonObject(
	v.object({
		fieldErrors: jsonRecord(v.string(), v.array(v.string())),
		formErrors: v.array(v.string()),
	})
);

const errorEntries = v1ErrorSchema.entries.error.entries;

/**
 * The body of every `/v1` failure, from the backend and from the gateway.
 * `code` is any string, where the document lists the codes, so a code added
 * later still parses.
 */
export const v1ErrorBodySchema = jsonObject(
	v.object({
		...v1ErrorSchema.entries,
		error: jsonObject(
			v.object({
				...errorEntries,
				code: v.pipe(v.string(), v.minLength(1)),
			})
		),
	})
);

/** The backend's opt-out record. `categories` is browser-only and never on the wire. */
export type V1EffectiveOptOut = Omit<OptOutRecord, 'categories'>;
export type V1ErrorBody = v.InferOutput<typeof v1ErrorBodySchema>;
export type V1ValidationDetails = v.InferOutput<
	typeof v1ValidationDetailsSchema
>;
