/**
 * Shapes every `/v1` route shares: subject IDs, idempotency keys, the
 * property a consent or acceptance belongs to, and the error body.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

/**
 * A UUIDv7 in lowercase canonical text: 36 characters, version 7, RFC 4122
 * variant. The version nibble rules out the nil and max UUIDs. The
 * timestamp is not judged, so a device with a wrong clock still produces an
 * ID the backend accepts.
 */
export const V1_UUID_V7_PATTERN =
	/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

/**
 * The `sub_` plus base58 subject ID an earlier client stored in the
 * browser. `/v1` routes accept it wherever they take a subject ID and answer
 * with the canonical UUIDv7.
 */
export const V1_LEGACY_SUBJECT_ID_PATTERN = /^sub_[1-9A-HJ-NP-Za-km-z]+$/u;

/** A canonical subject ID, as every `/v1` response names it. */
export const v1CanonicalSubjectIdSchema = v.pipe(
	v.string(),
	v.regex(V1_UUID_V7_PATTERN, 'Subject ID must be a lowercase UUIDv7'),
	v.description('Canonical subject ID: a UUIDv7 in lowercase canonical text.'),
	v.examples(['0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c'])
);

/**
 * A subject ID a `/v1` request may carry: the canonical UUIDv7, or the
 * `sub_` form an earlier client stored.
 */
export const v1SubjectIdSchema = v.pipe(
	v.string(),
	v.check(
		(value) =>
			V1_UUID_V7_PATTERN.test(value) ||
			V1_LEGACY_SUBJECT_ID_PATTERN.test(value),
		'Subject ID must be a lowercase UUIDv7 or a sub_ ID'
	),
	v.description(
		'Client-made subject ID: a lowercase UUIDv7, or the sub_ ID an earlier client stored.'
	),
	v.examples([
		'0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
		'sub_2VZxR7YmNpKq3WfLs8TgHd',
	])
);

/**
 * A UUID the client makes once per user action and sends again on every
 * retry of it. The backend records the action once.
 */
export const v1IdempotencyKeySchema = v.pipe(
	v.string(),
	v.uuid('Idempotency key must be a UUID'),
	v.description(
		'UUID made once per user action and reused on every retry of that action.'
	),
	v.examples(['0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e'])
);

/**
 * Where consent was given: a site's host name (lowercase, no scheme, port
 * or path), or an app's application or bundle ID (lowercase).
 */
export const v1PropertySchema = v.pipe(
	v.string(),
	v.minLength(1, 'Property must not be empty'),
	v.maxLength(253, 'Property must be at most 253 characters'),
	v.regex(
		/^[\d_a-z-]+(?:\.[\d_a-z-]+)*$/u,
		'Property must be a lowercase host name or app ID'
	),
	v.description(
		'Lowercase host name of a site, or the application or bundle ID of an app.'
	),
	v.examples(['www.example.com', 'com.example.app'])
);

/** The person's ID in your own system. */
export const v1ExternalIdSchema = v.pipe(
	v.string(),
	v.minLength(1, 'External ID must not be empty'),
	v.description('ID of the person in your authentication system.'),
	v.examples(['user_123'])
);

/** Name of the identity provider that issued an external ID. */
export const v1IdentityProviderSchema = v.pipe(
	v.string(),
	v.description('Identity provider that issued the external ID.'),
	v.examples(['clerk', 'auth0'])
);

/** Signed proof of an external ID, minted by your server. */
export const v1IdentityTokenSchema = v.pipe(
	v.string(),
	v.description('Identity token signed by your server, proving externalId.')
);

/** Epoch milliseconds inside the range `Date` can represent. */
export const v1EpochMillisecondsSchema = v.pipe(
	v.number(),
	v.minValue(-8_640_000_000_000_000),
	v.maxValue(8_640_000_000_000_000),
	v.description('Epoch milliseconds.'),
	v.examples([1_763_467_200_000])
);

/** Every `error.code` a `/v1` route or its gateway answers with. */
export const V1_ERROR_CODES = [
	'invalid_request',
	'unauthorized',
	'identity_token_required',
	'identity_token_invalid',
	'forbidden',
	'not_found',
	'conflict',
	'subject_conflict',
	'identity_conflict',
	'policy_snapshot_required',
	'policy_snapshot_invalid',
	'policy_snapshot_expired',
	'document_proof_invalid',
	'document_proof_expired',
	'payload_too_large',
	'rate_limited',
	'server_error',
	'bad_gateway',
	'gateway_timeout',
] as const;

/** A known `/v1` error code. */
export type V1ErrorCode = (typeof V1_ERROR_CODES)[number];

/** `error.details` of a validation failure. */
export const v1ValidationDetailsSchema = v.object({
	fieldErrors: v.record(v.string(), v.array(v.string())),
	formErrors: v.array(v.string()),
});

/**
 * The one body every `/v1` failure has, from the backend and from the
 * gateway. `code` is any string, so a code added later still parses; compare
 * it against {@link V1_ERROR_CODES}.
 */
export const v1ErrorBodySchema = v.object({
	error: v.object({
		code: v.pipe(v.string(), v.minLength(1)),
		details: v.optional(v.unknown()),
		message: v.string(),
	}),
	requestId: v.string(),
});

/** Response header that carries the request ID on every `/v1` response. */
export const V1_REQUEST_ID_HEADER = 'x-request-id';

export type V1ErrorBody = v.InferOutput<typeof v1ErrorBodySchema>;
export type V1ValidationDetails = v.InferOutput<
	typeof v1ValidationDetailsSchema
>;
