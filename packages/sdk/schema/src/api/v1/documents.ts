/**
 * `/v1/documents/*` schemas: publish a legal document version, read the
 * version in force, and record acceptances of a release by its hash.
 *
 * A document hash is the SHA-256 of the exact bytes of the published file,
 * in lowercase hex, prefixed `sha256:`.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import {
	v1CanonicalSubjectIdSchema,
	v1EpochMillisecondsSchema,
	v1ExternalIdSchema,
	v1IdempotencyKeySchema,
	v1IdentityProviderSchema,
	v1IdentityTokenSchema,
	v1PropertySchema,
	v1SubjectIdSchema,
} from './common';
import {
	V1_DOCUMENT_HASH_PATTERN,
	V1_DOCUMENT_TYPE_PATTERN,
	V1_MAX_ACCEPTANCES,
} from './constants';

export const v1DocumentTypeSchema = v.pipe(
	v.string(),
	v.regex(V1_DOCUMENT_TYPE_PATTERN, 'Invalid document type'),
	v.description('Document type: lowercase letters, digits and underscores.'),
	v.examples(['privacy_policy', 'terms_us', 'terms_eu'])
);

export const v1DocumentHashSchema = v.pipe(
	v.string(),
	v.regex(
		V1_DOCUMENT_HASH_PATTERN,
		'Hash must be sha256: and 64 lowercase hex digits'
	),
	v.description(
		'SHA-256 of the exact bytes of the published file, in lowercase hex, prefixed sha256:.'
	),
	v.examples([
		'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
	])
);

const versionSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.description('Release version of the document.'),
	v.examples(['2026-11-18'])
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
 * An ISO 8601 date and time with a zone, on a day the calendar has:
 * `v.isoTimestamp()` alone takes June 31.
 */
const effectiveDateSchema = v.pipe(
	v.string(),
	v.isoTimestamp(),
	v.check(isCalendarDay, 'Timestamp must be on a day of the calendar'),
	v.description('ISO 8601 date and time the version takes effect.'),
	v.examples(['2026-11-18T00:00:00.000Z'])
);

/** A publish may name the day alone; the answers carry a date and time. */
const publishEffectiveDateSchema = v.pipe(
	v.union([v.pipe(v.string(), v.isoDate()), effectiveDateSchema]),
	v.check(isCalendarDay, 'Effective date must be a day on the calendar'),
	v.description(
		'ISO 8601 date, or date and time with a zone, the version takes effect.'
	),
	v.examples(['2026-11-18', '2026-11-18T00:00:00.000Z'])
);

export const v1DocumentParamsSchema = v.object({
	type: v1DocumentTypeSchema,
});

// ---------------------------------------------------------------------------
// PUT /v1/documents/:type/current (secret key)
// ---------------------------------------------------------------------------

export const v1DocumentPublishInputSchema = v.object({
	effectiveDate: publishEffectiveDateSchema,
	hash: v1DocumentHashSchema,
	/**
	 * `false` marks a small edit: people who accepted the previous required
	 * version are not asked again.
	 */
	requiresAcceptance: v.optional(v.boolean(), true),
	version: versionSchema,
});

/** A release, as the publish and current-version answers carry it. */
export const v1DocumentSchema = v.object({
	effectiveDate: effectiveDateSchema,
	hash: v1DocumentHashSchema,
	id: v.pipe(v.string(), v.uuid()),
	isCurrent: v.boolean(),
	requiresAcceptance: v.boolean(),
	type: v1DocumentTypeSchema,
	version: versionSchema,
});

export const v1DocumentPublishOutputSchema = v.object({
	document: v1DocumentSchema,
});

// ---------------------------------------------------------------------------
// GET /v1/documents/:type/current
// ---------------------------------------------------------------------------

/** The release in force. Its `type` and `hash` name it in an acceptance. */
export const v1DocumentCurrentOutputSchema = v.object({
	document: v1DocumentSchema,
});

// ---------------------------------------------------------------------------
// POST /v1/documents/acceptances
// ---------------------------------------------------------------------------

/**
 * One release accepted. The project must have published it; it need not be
 * the one in force.
 */
export const v1DocumentAcceptanceItemSchema = v.object({
	hash: v1DocumentHashSchema,
	type: v1DocumentTypeSchema,
});

/**
 * Body of `POST /v1/documents/acceptances`. All acceptances are recorded, or
 * none. At least one of `subjectId` and `externalId` is required; with
 * `externalId` the request needs a secret key or a valid `identityToken`.
 * `context` is honoured only with a secret key.
 */
export const v1DocumentAcceptancesInputSchema = v.pipe(
	v.object({
		acceptances: v.pipe(
			v.array(v1DocumentAcceptanceItemSchema),
			v.minLength(1, 'At least one acceptance is required'),
			v.maxLength(
				V1_MAX_ACCEPTANCES,
				`At most ${V1_MAX_ACCEPTANCES} acceptances are allowed`
			)
		),
		acceptedAt: v1EpochMillisecondsSchema,
		context: v.optional(
			v.object({
				ipAddress: v.optional(v.pipe(v.string(), v.ip())),
				userAgent: v.optional(v.string()),
			})
		),
		externalId: v.optional(v1ExternalIdSchema),
		idempotencyKey: v1IdempotencyKeySchema,
		identityProvider: v.optional(v1IdentityProviderSchema),
		identityToken: v.optional(v1IdentityTokenSchema),
		property: v.optional(v1PropertySchema),
		subjectId: v.optional(v1SubjectIdSchema),
	}),
	v.check(
		(input) => input.subjectId !== undefined || input.externalId !== undefined,
		'subjectId or externalId is required'
	)
);

export const v1RecordedAcceptanceSchema = v.object({
	acceptedAt: v1EpochMillisecondsSchema,
	hash: v1DocumentHashSchema,
	type: v1DocumentTypeSchema,
	version: versionSchema,
});

export const v1DocumentAcceptancesOutputSchema = v.object({
	acceptances: v.array(v1RecordedAcceptanceSchema),
	subjectId: v1CanonicalSubjectIdSchema,
});

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
