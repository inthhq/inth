/**
 * Thrown by a transport's `save` when the backend refused the save and a
 * retry would be refused the same way. The kernel drops it instead of
 * queueing it for replay; the choice stays recorded in the browser.
 * `InthApiSaveRejectedError` extends it.
 */
export class ConsentSaveRejectedError extends Error {
	/** Brand checked by {@link isConsentSaveRejection} across bundle copies. */
	readonly inthSaveRejected = true;
	/** The backend's code, for example `policy_snapshot_expired`. */
	readonly code: string;
	/** The backend's message, when it gave one. */
	readonly reason: string | undefined;
	/** HTTP status of the refusal. */
	readonly status: number;

	constructor(options: {
		code: string;
		message: string;
		reason?: string;
		status: number;
	}) {
		super(options.message);
		this.name = 'ConsentSaveRejectedError';
		this.code = options.code;
		this.reason = options.reason;
		this.status = options.status;
	}
}

/**
 * Whether `error` is a save the backend refused for good. Checks a brand
 * rather than `instanceof`, so it holds across duplicated package copies.
 *
 * @param error - Anything a transport threw.
 * @returns `true` for a {@link ConsentSaveRejectedError}.
 */
export const isConsentSaveRejection = function isConsentSaveRejection(
	error: unknown
): error is ConsentSaveRejectedError {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { inthSaveRejected?: unknown }).inthSaveRejected === true
	);
};

/**
 * Whether `error` refused a save for its `subjectId`, the one refusal a
 * new subject ID recovers from.
 *
 * @param error - Anything a transport threw.
 * @returns `true` for a `subject_conflict` rejection.
 * @internal
 */
export const isSubjectConflict = function isSubjectConflict(
	error: unknown
): boolean {
	return isConsentSaveRejection(error) && error.code === 'subject_conflict';
};
