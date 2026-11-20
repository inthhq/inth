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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

/**
 * The queue as read from storage, ready to append to: each entry as
 * written, less any identity token an older client stored with it. The
 * queue module validates entries when it reads them; this runs before that
 * module may have loaded, so an append never writes a token back.
 *
 * @param stored - The `saves` list as read, of any shape.
 * @returns The entries to write back.
 * @internal
 */
export const withoutStoredTokens = function withoutStoredTokens(
	stored: unknown
): unknown[] {
	if (!Array.isArray(stored)) {
		return [];
	}
	return stored.map((entry: unknown) => {
		if (
			!(
				isRecord(entry) &&
				isRecord(entry.payload) &&
				isRecord(entry.payload.user) &&
				'identityToken' in entry.payload.user
			)
		) {
			return entry;
		}
		const { identityToken: _token, ...user } = entry.payload.user;
		return { ...entry, payload: { ...entry.payload, user } };
	});
};
