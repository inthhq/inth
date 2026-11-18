/**
 * `/v1/documents/*` schemas: publish a legal document version, read the
 * version in force with a proof token, and record acceptances.
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
import { V1_DOCUMENT_TYPE_PATTERN, V1_MAX_ACCEPTANCES } from './constants';

export const v1DocumentTypeSchema = v.pipe(
	v.string(),
	v.regex(V1_DOCUMENT_TYPE_PATTERN, 'Invalid document type'),
	v.description('Document type: lowercase letters, digits and underscores.'),
	v.examples(['privacy_policy', 'terms_us', 'terms_eu'])
);

export const v1DocumentHashSchema = v.pipe(
	v.string(),
	v.regex(
		/^sha256:[\da-f]{64}$/u,
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

const effectiveDateSchema = v.pipe(
	v.string(),
	v.isoTimestamp(),
	v.description('ISO 8601 date and time the version takes effect.'),
	v.examples(['2026-11-18T00:00:00.000Z'])
);

/** A publish may name the day alone; the answers carry a date and time. */
const publishEffectiveDateSchema = v.pipe(
	v.union([v.pipe(v.string(), v.isoDate()), effectiveDateSchema]),
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

export const v1PublishedDocumentSchema = v.object({
	effectiveDate: effectiveDateSchema,
	hash: v1DocumentHashSchema,
	id: v.string(),
	isCurrent: v.boolean(),
	requiresAcceptance: v.boolean(),
	type: v1DocumentTypeSchema,
	version: versionSchema,
});

export const v1DocumentPublishOutputSchema = v.object({
	document: v1PublishedDocumentSchema,
});

// ---------------------------------------------------------------------------
// GET /v1/documents/:type/current
// ---------------------------------------------------------------------------

export const v1CurrentDocumentSchema = v.object({
	effectiveDate: effectiveDateSchema,
	hash: v1DocumentHashSchema,
	requiresAcceptance: v.boolean(),
	type: v1DocumentTypeSchema,
	version: versionSchema,
});

/**
 * The version in force, and a signed proof token that pins the type,
 * version and hash that were shown. Send the token back with an acceptance.
 */
export const v1DocumentCurrentOutputSchema = v.object({
	document: v1CurrentDocumentSchema,
	proofToken: v.pipe(v.string(), v.minLength(1)),
	proofTokenExpiresAt: v.pipe(v.string(), v.isoTimestamp()),
});

// ---------------------------------------------------------------------------
// POST /v1/documents/acceptances
// ---------------------------------------------------------------------------

export const v1DocumentAcceptanceItemSchema = v.object({
	proofToken: v.pipe(v.string(), v.minLength(1)),
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
export type V1PublishedDocument = v.InferOutput<
	typeof v1PublishedDocumentSchema
>;
export type V1DocumentPublishOutput = v.InferOutput<
	typeof v1DocumentPublishOutputSchema
>;
export type V1CurrentDocument = v.InferOutput<typeof v1CurrentDocumentSchema>;
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
