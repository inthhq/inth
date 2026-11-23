/**
 * `/v1/documents/*` schemas: publish a legal document version, read the
 * version in force, record acceptances of a release by its hash, and check
 * what a person accepted.
 *
 * A document hash is the SHA-256 of the exact bytes of the published file,
 * in lowercase hex, prefixed `sha256:`.
 *
 * Each one is the schema generated from the backend's OpenAPI document
 * (`./generated/schemas`), with the rules the document leaves out and the
 * backend applies: the form of a hash, a publish date on a real day of the
 * calendar, an IP address in an acceptance's context, and a subject ID or an
 * external ID on each acceptance.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import { isPlainPolicyObject } from '../../shared/policy/policy-rule.model';
import {
	v1CanonicalSubjectIdSchema,
	v1IdempotencyKeySchema,
	v1SubjectIdSchema,
} from './v1-common.model';
import { V1_DOCUMENT_HASH_PATTERN } from './v1-constants.model';
import {
	documentAcceptancesRequestSchema,
	documentAcceptancesResponseSchema,
	documentCheckResponseSchema,
	documentCurrentResponseSchema,
	documentPublishRequestSchema,
	documentPublishResponseSchema,
	getV1DocumentsByTypeCurrentPathSchema,
	getV1DocumentsCheckQuerySchema,
} from './generated/schemas';
import { jsonObject } from './json-schema';

/** Document type: lowercase letters, digits and underscores. */
export const v1DocumentTypeSchema =
	getV1DocumentsByTypeCurrentPathSchema.entries.type;

/** The document gives a hash no pattern. The backend refuses any other. */
export const v1DocumentHashSchema = v.pipe(
	documentPublishRequestSchema.entries.hash,
	v.regex(
		V1_DOCUMENT_HASH_PATTERN,
		'Hash must be sha256: and 64 lowercase hex digits'
	),
	v.examples([
		'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
	])
);

/** Whether the date `value` starts with is a day on the calendar. */
const isCalendarDay = function isCalendarDay(value: string): boolean {
	const year = Number(value.slice(0, 4));
	const month = Number(value.slice(5, 7)) - 1;
	const day = Number(value.slice(8, 10));
	const date = new Date(0);
	date.setUTCFullYear(year, month, day);
	return date.getUTCMonth() === month && date.getUTCDate() === day;
};

/**
 * A publish may name the day alone; the answers carry a date and time. The
 * document describes the publish date and does not check it, so the SDK
 * checks it here. The answers' date-time is the document's own check.
 */
const publishEffectiveDateSchema = v.pipe(
	documentPublishRequestSchema.entries.effectiveDate,
	v.union([
		v.pipe(v.string(), v.isoDate()),
		v.pipe(v.string(), v.isoTimestamp()),
	]),
	v.check(isCalendarDay, 'Effective date must be a day on the calendar'),
	v.examples(['2026-11-18', '2026-11-18T00:00:00.000Z'])
);

export const v1DocumentParamsSchema = getV1DocumentsByTypeCurrentPathSchema;

/** A release as an answer carries it, with the hash rule added. */
const release = <const Entries extends v.ObjectEntries>(entries: Entries) =>
	jsonObject(v.object({ ...entries, hash: v1DocumentHashSchema }));

// ---------------------------------------------------------------------------
// PUT /v1/documents/:type/current (secret key)
// ---------------------------------------------------------------------------

/**
 * `requiresAcceptance: false` marks a small edit: people who accepted the
 * previous required version are not asked again. It defaults to `true`.
 */
export const v1DocumentPublishInputSchema = jsonObject(
	v.object({
		...documentPublishRequestSchema.entries,
		effectiveDate: publishEffectiveDateSchema,
		hash: v1DocumentHashSchema,
	})
);

export const v1DocumentPublishOutputSchema = jsonObject(
	v.object({
		...documentPublishResponseSchema.entries,
		document: release(documentPublishResponseSchema.entries.document.entries),
	})
);

// ---------------------------------------------------------------------------
// GET /v1/documents/:type/current
// ---------------------------------------------------------------------------

/** A release, as the current-version answer carries it. */
export const v1DocumentSchema = release(
	documentCurrentResponseSchema.entries.document.entries
);

/** The release in force. Its `type` and `hash` name it in an acceptance. */
export const v1DocumentCurrentOutputSchema = jsonObject(
	v.object({
		...documentCurrentResponseSchema.entries,
		document: v1DocumentSchema,
	})
);

// ---------------------------------------------------------------------------
// POST /v1/documents/acceptances
// ---------------------------------------------------------------------------

const acceptancesEntries = documentAcceptancesRequestSchema.entries;

const contextEntries = acceptancesEntries.context.wrapped.entries;

/**
 * One release accepted. The project must have published it; it need not be
 * the one in force.
 */
export const v1DocumentAcceptanceItemSchema = jsonObject(
	v.object({
		...acceptancesEntries.acceptances.item.entries,
		hash: v1DocumentHashSchema,
	})
);

/** The document's limits on the list, such as how many it may hold. */
const [, ...acceptancesLimits] = acceptancesEntries.acceptances.pipe;

/**
 * Body of `POST /v1/documents/acceptances`. All acceptances are recorded, or
 * none. At least one of `subjectId` and `externalId` is required; with
 * `externalId` the request needs a secret key or a valid `identityToken`.
 * `context` is honoured only with a secret key.
 */
export const v1DocumentAcceptancesInputSchema = v.pipe(
	jsonObject(
		v.object({
			...acceptancesEntries,
			acceptances: v.pipe(
				v.array(v1DocumentAcceptanceItemSchema),
				...acceptancesLimits
			),
			context: v.optional(
				jsonObject(
					v.object({
						...contextEntries,
						ipAddress: v.optional(
							v.pipe(contextEntries.ipAddress.wrapped, v.ip())
						),
					})
				)
			),
			idempotencyKey: v1IdempotencyKeySchema,
			subjectId: v.optional(v1SubjectIdSchema),
		})
	),
	v.check(
		(input) => input.subjectId !== undefined || input.externalId !== undefined,
		'subjectId or externalId is required'
	)
);

const recordedEntries = documentAcceptancesResponseSchema.entries;

export const v1RecordedAcceptanceSchema = release(
	recordedEntries.acceptances.item.entries
);

export const v1DocumentAcceptancesOutputSchema = jsonObject(
	v.object({
		...recordedEntries,
		acceptances: v.array(v1RecordedAcceptanceSchema),
		subjectId: v1CanonicalSubjectIdSchema,
	})
);

// ---------------------------------------------------------------------------
// GET /v1/documents/check (secret key)
// ---------------------------------------------------------------------------

export const v1DocumentCheckQuerySchema = getV1DocumentsCheckQuerySchema;

/**
 * `acceptedLatest`: the person accepted the latest release that requires
 * acceptance, or one after it.
 */
export const v1DocumentCheckResultSchema =
	documentCheckResponseSchema.entries.documents.value;

/**
 * One result per type asked about, and at least one, since a check names at
 * least one type. Checked by hand: `v.record` leaves a key such as
 * `constructor`, a valid document type, out of its output.
 */
const checkDocumentsSchema = v.custom<
	Record<string, v.InferOutput<typeof v1DocumentCheckResultSchema>>
>(
	(input) =>
		isPlainPolicyObject(input) &&
		Object.keys(input).length > 0 &&
		Object.values(input).every((result) =>
			v.is(v1DocumentCheckResultSchema, result)
		),
	'Expected a check result for each type'
);

export const v1DocumentCheckOutputSchema = jsonObject(
	v.object({
		...documentCheckResponseSchema.entries,
		documents: checkDocumentsSchema,
	})
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type V1DocumentType = v.InferOutput<typeof v1DocumentTypeSchema>;
export type V1DocumentParams = v.InferOutput<typeof v1DocumentParamsSchema>;
export type V1DocumentPublishInput = v.InferInput<
	typeof v1DocumentPublishInputSchema
>;
export type V1Document = v.InferOutput<typeof v1DocumentSchema>;
export type V1DocumentPublishOutput = v.InferOutput<
	typeof v1DocumentPublishOutputSchema
>;
export type V1DocumentCurrentOutput = v.InferOutput<
	typeof v1DocumentCurrentOutputSchema
>;
export type V1DocumentAcceptanceItem = v.InferOutput<
	typeof v1DocumentAcceptanceItemSchema
>;
export type V1DocumentAcceptancesInput = v.InferOutput<
	typeof v1DocumentAcceptancesInputSchema
>;
export type V1RecordedAcceptance = v.InferOutput<
	typeof v1RecordedAcceptanceSchema
>;
export type V1DocumentAcceptancesOutput = v.InferOutput<
	typeof v1DocumentAcceptancesOutputSchema
>;
export type V1DocumentCheckQuery = v.InferOutput<
	typeof v1DocumentCheckQuerySchema
>;
export type V1DocumentCheckResult = v.InferOutput<
	typeof v1DocumentCheckResultSchema
>;
export type V1DocumentCheckOutput = v.InferOutput<
	typeof v1DocumentCheckOutputSchema
>;
