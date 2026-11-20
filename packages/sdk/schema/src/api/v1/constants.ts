/**
 * `/v1` wire values with no validation code, so a client can share them
 * without loading valibot.
 *
 * @packageDocumentation
 */

/**
 * A subject ID: a UUIDv7 in lowercase canonical text with the RFC 4122
 * variant. The version digit rules out the nil and max UUIDs. The timestamp
 * is not judged, so a device with a wrong clock still makes a valid ID.
 */
export const V1_UUID_V7_PATTERN =
	/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

/**
 * The `sub_` plus base58 subject ID a c15t client stored in the browser.
 * `/v1` routes accept it wherever they take a subject ID.
 */
export const V1_LEGACY_SUBJECT_ID_PATTERN = /^sub_[1-9A-HJ-NP-Za-km-z]+$/u;

/** A document type, such as `privacy_policy`, `terms_us` or `terms_eu`. */
export const V1_DOCUMENT_TYPE_PATTERN = /^[a-z][\d_a-z]*$/u;

/** Response header that carries the request ID. */
export const V1_REQUEST_ID_HEADER = 'x-request-id';

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
