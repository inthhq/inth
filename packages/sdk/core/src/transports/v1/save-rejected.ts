import type { V1ErrorCode } from '@inth/sdk-schema/types';

import { ConsentSaveRejectedError } from '../save-rejection';
import {
	describeInthApiError,
	InthApiError,
	readInthApiErrorDetail,
} from './error';
import type { InthApiErrorDetail } from './error';

/**
 * A consent save the backend refused for good. The kernel drops it rather
 * than replaying a save that would be refused the same way.
 */
export class InthConsentSaveRejectedError extends ConsentSaveRejectedError {
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
		this.name = 'InthConsentSaveRejectedError';
		this.requestId = detail.requestId;
		this.details = detail.details;
		this.retryAfter = detail.retryAfter;
	}
}

/** Anything a `/v1` save threw for a failed response. */
export type InthApiFailure = InthApiError | InthConsentSaveRejectedError;

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
 * {@link InthConsentSaveRejectedError} when a replay would be refused the
 * same way (`413`, and the `409` codes above when the body names them),
 * else an
 * {@link InthApiError} the kernel queues and retries.
 *
 * @param label - Names the caller and route.
 * @param response - The response that is not ok. Its body is consumed.
 * @returns The error to throw.
 */
export const readSaveFailure = async function readSaveFailure(
	label: string,
	response: Response
): Promise<InthApiFailure> {
	const detail = await readInthApiErrorDetail(response);
	const message = describeInthApiError(label, detail);
	const permanent =
		response.status === 413 ||
		(response.status === 409 &&
			detail.codeFromBody &&
			PERMANENT_SAVE_CODES.has(detail.code));
	return permanent
		? new InthConsentSaveRejectedError(message, detail)
		: new InthApiError(message, detail);
};
