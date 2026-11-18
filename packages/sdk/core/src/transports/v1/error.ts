/**
 * Errors from `/v1` routes. Every failure, from the backend and from its
 * gateway, has the body `{ error: { code, message, details? }, requestId }`.
 */
import { V1_REQUEST_ID_HEADER } from '@inth/sdk-schema/types';
import type { V1ErrorCode } from '@inth/sdk-schema/types';

/** Stop waiting for an error body after this long. */
const BODY_TIMEOUT_MS = 2000;

/** Longest backend message an error carries. */
const MAX_MESSAGE_LENGTH = 500;

/**
 * A `/v1` error code, usually a `V1ErrorCode`. A code added after this
 * client comes through as it is.
 */
export type InthApiErrorCode = string;

/** What a failed `/v1` response said. */
export interface InthApiErrorDetail {
	/** `error.code`, else a code derived from the HTTP status. */
	code: InthApiErrorCode;
	/** Whether the body named `code`, rather than the status implying it. */
	codeFromBody: boolean;
	/** `error.message`, cut to a bounded length. */
	message: string;
	/** `requestId` from the body, else the `x-request-id` header. */
	requestId: string | undefined;
	/** `error.details`; field errors for a validation failure. */
	details: unknown;
	/** HTTP status. */
	status: number;
	/** Seconds from `Retry-After`, on a `429`. */
	retryAfter: number | undefined;
}

/**
 * A `/v1` request that failed. Carries the backend's `code` and the
 * `requestId` to quote when reporting it.
 */
export class InthApiError extends Error {
	readonly inthApiError = true;
	readonly code: InthApiErrorCode;
	readonly requestId: string | undefined;
	readonly details: unknown;
	readonly status: number;
	readonly retryAfter: number | undefined;

	constructor(message: string, detail: InthApiErrorDetail) {
		super(message);
		this.name = 'InthApiError';
		this.code = detail.code;
		this.requestId = detail.requestId;
		this.details = detail.details;
		this.status = detail.status;
		this.retryAfter = detail.retryAfter;
	}
}

/**
 * Whether `error` is a failed `/v1` response: an {@link InthApiError}, or a
 * refused save with the same fields. Checks a brand rather than
 * `instanceof`, so it holds across package copies.
 *
 * @param error - Anything a `/v1` call threw.
 * @returns `true` for a failed `/v1` response.
 */
export const isInthApiError = function isInthApiError(
	error: unknown
): error is Pick<
	InthApiError,
	'code' | 'details' | 'message' | 'requestId' | 'retryAfter' | 'status'
> {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { inthApiError?: unknown }).inthApiError === true
	);
};

/** A code for a body that named none, such as a proxy's answer. */
const codeForStatus = function codeForStatus(status: number): V1ErrorCode {
	switch (status) {
		case 400:
		case 422:
			return 'invalid_request';
		case 401:
			return 'unauthorized';
		case 403:
			return 'forbidden';
		case 404:
			return 'not_found';
		case 409:
			return 'conflict';
		case 413:
			return 'payload_too_large';
		case 429:
			return 'rate_limited';
		case 502:
			return 'bad_gateway';
		case 504:
			return 'gateway_timeout';
		default:
			return 'server_error';
	}
};

const readText = async function readText(response: Response): Promise<string> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<string>((resolve) => {
		timer = setTimeout(() => resolve(''), BODY_TIMEOUT_MS);
	});
	try {
		return await Promise.race([response.text(), timeout]);
	} catch {
		return '';
	} finally {
		clearTimeout(timer);
	}
};

const nonEmpty = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const parseRetryAfter = function parseRetryAfter(
	value: string | null
): number | undefined {
	if (!value) {
		return undefined;
	}
	const seconds = Number(value.trim());
	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds;
	}
	const date = Date.parse(value);
	return Number.isNaN(date)
		? undefined
		: Math.max(0, Math.ceil((date - Date.now()) / 1000));
};

/**
 * Read a failed `/v1` response. Never throws; a body that is not the `/v1`
 * error shape yields a code derived from the status.
 *
 * @param response - The response that is not ok. Its body is consumed.
 * @returns What the response said.
 */
export const readInthApiErrorDetail = async function readInthApiErrorDetail(
	response: Response
): Promise<InthApiErrorDetail> {
	let body: unknown;
	try {
		body = JSON.parse(await readText(response));
	} catch {
		body = undefined;
	}
	const record =
		typeof body === 'object' && body !== null
			? (body as { error?: unknown; requestId?: unknown })
			: {};
	const error =
		typeof record.error === 'object' && record.error !== null
			? (record.error as {
					code?: unknown;
					details?: unknown;
					message?: unknown;
				})
			: {};
	const message = nonEmpty(error.message) ?? response.statusText ?? '';
	const bodyCode = nonEmpty(error.code);
	return {
		code: bodyCode ?? codeForStatus(response.status),
		codeFromBody: bodyCode !== undefined,
		details: error.details,
		message:
			message.length > MAX_MESSAGE_LENGTH
				? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
				: message,
		requestId:
			nonEmpty(record.requestId) ??
			nonEmpty(response.headers?.get(V1_REQUEST_ID_HEADER)),
		retryAfter:
			response.status === 429
				? parseRetryAfter(response.headers?.get('retry-after') ?? null)
				: undefined,
		status: response.status,
	};
};

export const describeInthApiError = function describeInthApiError(
	label: string,
	detail: InthApiErrorDetail
): string {
	const said = detail.message ? `: ${detail.message}` : '';
	const request = detail.requestId ? `, request ${detail.requestId}` : '';
	return `${label} responded ${detail.status}${said} (${detail.code}${request})`;
};

/**
 * Build the error for a failed `/v1` response.
 *
 * @param label - Names the caller and route, such as `Inth: /v1/consent/init`.
 * @param response - The response that is not ok. Its body is consumed.
 * @returns An {@link InthApiError}.
 */
export const readInthApiError = async function readInthApiError(
	label: string,
	response: Response
): Promise<InthApiError> {
	const detail = await readInthApiErrorDetail(response);
	return new InthApiError(describeInthApiError(label, detail), detail);
};
