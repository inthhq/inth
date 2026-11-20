import type {
	V1ConsentOptOutInput,
	V1ConsentOptOutLiftInput,
} from '@inth/sdk-schema/types';

import type { LiftOptOutPayload, OptOutPayload } from '../../types';

/**
 * Build the request body for `POST /v1/consent/opt-outs`.
 *
 * Omits `rights` so the backend derives the applicable rights from the
 * visitor's location.
 *
 * @param payload - The kernel's opt-out payload.
 * @param property - Lowercase host name or app ID the opt-out belongs to.
 * @returns The `/v1` request body.
 */
export const buildV1ConsentOptOutBody = function buildV1ConsentOptOutBody(
	payload: OptOutPayload,
	property: string
): V1ConsentOptOutInput {
	if (!payload.idempotencyKey) {
		// A key made here would differ on every retry, so the backend would
		// record each retry as a new opt-out.
		throw new TypeError(
			'Inth transport: an opt-out needs an idempotencyKey. Make one with createIdempotencyKey() when the visitor acts, and send it unchanged on every retry.'
		);
	}
	const { user } = payload;
	const body: V1ConsentOptOutInput = {
		givenAt: payload.givenAt,
		idempotencyKey: payload.idempotencyKey,
		method: payload.method,
		property,
		subjectId: payload.subjectId,
	};
	if (user?.externalId) {
		body.externalId = user.externalId;
	}
	if (user?.identityProvider) {
		body.identityProvider = user.identityProvider;
	}
	if (user?.identityToken) {
		body.identityToken = user.identityToken;
	}
	if (payload.uiSource) {
		body.uiSource = payload.uiSource;
	}
	if (payload.metadata !== undefined) {
		body.metadata = { ...payload.metadata };
	}
	if (payload.policyId !== undefined) {
		body.policyId = payload.policyId;
	}
	if (payload.country !== undefined) {
		body.country = payload.country;
	}
	if (payload.region !== undefined) {
		body.region = payload.region;
	}
	if (payload.language) {
		body.language = payload.language;
	}
	if (payload.policySnapshotToken) {
		body.policySnapshotToken = payload.policySnapshotToken;
	}
	return body;
};

/**
 * Build the request body for `POST /v1/consent/opt-outs/lift`.
 *
 * Omits `rights` so the backend lifts every right the device holds.
 *
 * @param payload - The kernel's lift payload.
 * @param property - Lowercase host name or app ID the opt-out belongs to.
 * @returns The `/v1` request body.
 */
export const buildV1ConsentOptOutLiftBody =
	function buildV1ConsentOptOutLiftBody(
		payload: LiftOptOutPayload,
		property: string
	): V1ConsentOptOutLiftInput {
		if (!payload.idempotencyKey) {
			throw new TypeError(
				'Inth transport: an opt-out lift needs an idempotencyKey. Make one with createIdempotencyKey() when the visitor acts, and send it unchanged on every retry.'
			);
		}
		const { user } = payload;
		const body: V1ConsentOptOutLiftInput = {
			givenAt: payload.givenAt,
			idempotencyKey: payload.idempotencyKey,
			property,
			subjectId: payload.subjectId,
		};
		if (user?.externalId) {
			body.externalId = user.externalId;
		}
		if (user?.identityProvider) {
			body.identityProvider = user.identityProvider;
		}
		if (user?.identityToken) {
			body.identityToken = user.identityToken;
		}
		if (payload.uiSource) {
			body.uiSource = payload.uiSource;
		}
		if (payload.policySnapshotToken) {
			body.policySnapshotToken = payload.policySnapshotToken;
		}
		return body;
	};
