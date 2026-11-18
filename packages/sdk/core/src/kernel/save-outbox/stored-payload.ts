import type { SavePayload } from '../../types';

/**
 * A save payload as the outbox stores it: without `user.identityToken`.
 *
 * An identity token is short-lived proof of who the visitor is, so it stays
 * in memory for the first attempt and is never written to browser storage.
 * A token a client stored before is dropped when the outbox reads it back.
 * A replay goes without a token: the backend records the save with the link
 * left off, and `identify` with a fresh token can link the subject later.
 *
 * Returns the same object when there is no token.
 *
 * @param payload - A save payload about to be queued, or read back.
 * @returns The payload to store.
 * @internal
 */
export const toStoredPayload = function toStoredPayload(
	payload: SavePayload
): SavePayload {
	if (payload.user?.identityToken === undefined) {
		return payload;
	}
	const { identityToken: _token, ...user } = payload.user;
	return { ...payload, user };
};
