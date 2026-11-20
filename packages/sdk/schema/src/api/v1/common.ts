/**
 * Shapes every `/v1` route shares: subject IDs, idempotency keys, the
 * property a consent or acceptance belongs to, and the error body.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import {
	V1_LEGACY_SUBJECT_ID_PATTERN,
	V1_PROPERTY_MAX_LENGTH,
	V1_PROPERTY_PATTERN,
	V1_UUID_PATTERN,
	V1_UUID_V7_PATTERN,
} from './constants';

/** A canonical subject ID, as every `/v1` response names it. */
export const v1CanonicalSubjectIdSchema = v.pipe(
	v.string(),
	v.regex(V1_UUID_V7_PATTERN, 'Subject ID must be a lowercase UUIDv7'),
	v.description('Canonical subject ID: a UUIDv7 in lowercase canonical text.'),
	v.examples(['0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c'])
);

/** A subject ID a `/v1` request may carry: a UUIDv7, or a `sub_` ID. */
export const v1SubjectIdSchema = v.pipe(
	v.string(),
	v.check(
		(value) =>
			V1_UUID_V7_PATTERN.test(value) ||
			V1_LEGACY_SUBJECT_ID_PATTERN.test(value),
		'Subject ID must be a lowercase UUIDv7 or a sub_ ID'
	),
	v.description(
		'Client-made subject ID: a lowercase UUIDv7, or the sub_ ID a c15t client stored.'
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
	v.regex(V1_UUID_PATTERN, 'Idempotency key must be a lowercase UUID'),
	v.description(
		'UUID made once per user action and reused on every retry of that action.'
	),
	v.examples(['0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e'])
);

/** Where consent was given. See {@link V1_PROPERTY_PATTERN}. */
export const v1PropertySchema = v.pipe(
	v.string(),
	v.maxLength(
		V1_PROPERTY_MAX_LENGTH,
		`Property must be at most ${V1_PROPERTY_MAX_LENGTH} characters`
	),
	v.regex(
		V1_PROPERTY_PATTERN,
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
	v.minLength(1, 'Identity provider must not be empty'),
	v.description('Identity provider that issued the external ID.'),
	v.examples(['clerk', 'auth0'])
);

/** Signed proof of an external ID, minted by your server. */
export const v1IdentityTokenSchema = v.pipe(
	v.string(),
	v.description('Identity token signed by your server, proving externalId.')
);

/** Epoch milliseconds, from 1970 to the latest time `Date` can represent. */
export const v1EpochMillisecondsSchema = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(0),
	v.maxValue(8_640_000_000_000_000),
	v.description('Epoch milliseconds.'),
	v.examples([1_763_467_200_000])
);

/** `error.details` of a validation failure. */
export const v1ValidationDetailsSchema = v.object({
	fieldErrors: v.record(v.string(), v.array(v.string())),
	formErrors: v.array(v.string()),
});

/**
 * The body of every `/v1` failure, from the backend and from the gateway.
 * `code` is any string, so a code added later still parses.
 */
export const v1ErrorBodySchema = v.object({
	error: v.object({
		code: v.pipe(v.string(), v.minLength(1)),
		details: v.optional(v.unknown()),
		message: v.string(),
	}),
	requestId: v.string(),
});

export type V1ErrorBody = v.InferOutput<typeof v1ErrorBodySchema>;
export type V1ValidationDetails = v.InferOutput<
	typeof v1ValidationDetailsSchema
>;
