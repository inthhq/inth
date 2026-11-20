import type { V1ErrorCode } from '@inth/sdk-schema/types';

import { ConsentSaveRejectedError } from '../save-rejection';
import { InthApiError, describeApiError, readApiErrorDetail } from './error';
import type { InthApiErrorDetail } from './error';

/**
 * A consent save the backend refused for good. The kernel drops it rather
 * than replaying a save that would be refused the same way.
 */
export class InthApiSaveRejectedError extends ConsentSaveRejectedError {
	readonly inthApiError = true;
	readonly requestId: string | undefined;
	readonly details: unknown;
	readonly retryAfter: number | undefined;

	constructor(message: string, detail: InthApiErrorDetail) {
		super({
			code: detail.code,
			message,
			reason: detail.message || undefined,
			status: detail.status,
		});
		this.name = 'InthApiSaveRejectedError';
		this.requestId = detail.requestId;
		this.details = detail.details;
		this.retryAfter = detail.retryAfter;
	}
}

/** Anything a `/v1` save threw for a failed response. */
export type ApiFailure = InthApiError | InthApiSaveRejectedError;

/**
 * `409` codes a resent save gets again. The kernel recovers from
 * `subject_conflict` by moving the visitor to a new subject ID.
 */
const PERMANENT_SAVE_CODES: ReadonlySet<string> = new Set<V1ErrorCode>([
	'conflict',
	'policy_snapshot_expired',
	'policy_snapshot_invalid',
	'policy_snapshot_required',
	'subject_conflict',
]);

/**
 * The error for a failed `POST /v1/consent/records`: an
 * {@link InthApiSaveRejectedError} when a replay would be refused the
 * same way (`413`, a `400` whose body names `invalid_request`, and the
 * `409` codes above when the body names them), else an
 * {@link InthApiError} the kernel queues and retries.
 *
 * A `401` is retried: the backend never refuses a save for its identity
 * token, it leaves the link off.
 *
 * @param label - Names the caller and route.
 * @param response - The response that is not ok. Its body is consumed.
 * @returns The error to throw.
 */
export const readSaveFailure = async function readSaveFailure(
	label: string,
	response: Response
): Promise<ApiFailure> {
	const detail = await readApiErrorDetail(response);
	const message = describeApiError(label, detail);
	const permanent =
		response.status === 413 ||
		(response.status === 400 &&
			detail.codeFromBody &&
			detail.code === 'invalid_request') ||
		(response.status === 409 &&
			detail.codeFromBody &&
			PERMANENT_SAVE_CODES.has(detail.code));
	return permanent
		? new InthApiSaveRejectedError(message, detail)
		: new InthApiError(message, detail);
};

/**
 * The error for a failed `POST /v1/consent/opt-outs` or
 * `POST /v1/consent/opt-outs/lift`, or `null` on `404` (the backend does not
 * store opt-outs, which is not an error).
 *
 * `413` and a `400` whose body names `invalid_request` are refused for good.
 * `409` with `subject_conflict` is returned as a rejection so the kernel
 * moves the visitor to a new subject ID and resends. Policy snapshot codes
 * are never treated as permanent on opt-out routes.
 *
 * @param label - Names the caller and route.
 * @param response - The response that is not ok. Its body is consumed.
 * @returns The error to throw, or `null` on `404`.
 */
export const readOptOutFailure = async function readOptOutFailure(
	label: string,
	response: Response
): Promise<ApiFailure | null> {
	if (response.status === 404) {
		try {
			await response.body?.cancel();
		} catch {
			// Stream already closed or unavailable.
		}
		return null;
	}
	const detail = await readApiErrorDetail(response);
	const message = describeApiError(label, detail);
	const permanent =
		response.status === 413 ||
		(response.status === 400 &&
			detail.codeFromBody &&
			detail.code === 'invalid_request') ||
		(response.status === 409 &&
			detail.codeFromBody &&
			detail.code === 'subject_conflict');
	return permanent
		? new InthApiSaveRejectedError(message, detail)
		: new InthApiError(message, detail);
};
