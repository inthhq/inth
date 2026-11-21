/**
 * The record half of a `/v1` transport: saves and identity links.
 *
 * A link made in a browser must be proven, so `identify` sends a link only
 * with an identity token and a subject. Otherwise the identity stays in the
 * kernel and travels with the next save. There is no route for a browser to
 * read a subject, so there is no `loadSubjectRecord`.
 */
import { appendJourneyParams, V1_UUID_PATTERN } from '@inth/sdk-schema/types';
import type { OptOutRecord, V1ConsentRecordLink } from '@inth/sdk-schema/types';

import { validateOptOutRecord } from '../../consent-record/validation';
import type {
	KernelTransport,
	KernelUser,
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	OptOutPayload,
	OptOutTransportResult,
	SavePayload,
	SaveResult,
} from '../../types';
import { buildDecisionAssertion } from '../decision-inputs';
import type { RememberedDecisionInputs } from '../decision-inputs';
import { readApiError } from './error';
import {
	buildV1ConsentOptOutBody,
	buildV1ConsentOptOutLiftBody,
} from './opt-outs-body';
import { trimTrailingSlash, V1_ROUTES } from './paths';
import { buildV1ConsentRecordBody } from './records-body';
import {
	isUuidV7,
	readJson,
	resolveProperty,
	resolveV1Fetch,
	subjectLinkPath,
	V1_JSON_HEADERS,
} from './routes';
import { readOptOutFailure, readSaveFailure } from './save-rejected';

/** Options for {@link createV1RecordTransport}. */
export interface V1RecordTransportOptions {
	/**
	 * Project URL, such as `https://your-project.inth.app`, or a same-origin
	 * path that proxies it.
	 */
	projectUrl: string;
	/** Fetch implementation. Defaults to `globalThis.fetch`. */
	fetch?: typeof globalThis.fetch;
	/** Fetch credentials mode. */
	credentials?: RequestCredentials;
	/**
	 * Host name or app ID the consent belongs to. Defaults to the page's host
	 * name, else the project URL's.
	 */
	property?: string;
}

/** A save result with the record ID and the answer about the identity link. */
export interface V1SaveResult extends SaveResult {
	/** ID of the event that recorded the save. */
	recordId: string;
	/**
	 * Present when the save sent an `externalId`. A link left off is not a
	 * failure: the save was recorded, and `identify` can link it later.
	 */
	link?: V1ConsentRecordLink;
}

/** Result of `POST /v1/consent/opt-outs`. */
export interface V1OptOutResult extends OptOutTransportResult {
	/** ID of the event that recorded the opt-out, absent on `404`. */
	recordId?: string;
	/** Present when the request sent an `externalId`. */
	link?: V1ConsentRecordLink;
}

/** Result of `POST /v1/consent/opt-outs/lift`. */
export interface V1LiftOptOutResult extends LiftOptOutTransportResult {
	/** ID of the event that recorded the lift, absent on `404`. */
	recordId?: string;
}

/** Where saves find the policy decision they assert. */
export interface V1DecisionSource {
	/** Refuse a save until an init resolved a decision. */
	required: boolean;
	/** The init in flight, if any. A save waits for it before asserting. */
	pending: () => Promise<unknown> | undefined;
	/** Decision inputs the latest init remembered. */
	inputs: () => RememberedDecisionInputs | undefined;
}

/** The record methods of a `/v1` transport. */
export interface V1RecordTransport extends KernelTransport {
	save: (payload: SavePayload) => Promise<V1SaveResult>;
	optOut: (payload: OptOutPayload) => Promise<V1OptOutResult>;
	liftOptOut: (payload: LiftOptOutPayload) => Promise<V1LiftOptOutResult>;
	identify: (
		user: KernelUser,
		subjectId: string | null
	) => Promise<{ subjectId: string; optOut?: OptOutRecord } | undefined>;
}

/**
 * Per-request UTF-8 byte ceiling for `fetch`'s `keepalive` flag.
 *
 * Browsers cap all in-flight keepalive requests for a page at 64 KiB total
 * and reject requests that exceed the cap with a `TypeError`. Using 32 KiB
 * per request (half the browser limit) leaves headroom for a save and an
 * opt-out or lift request to leave together. Bodies above this ceiling send
 * without `keepalive`, and any aggregate rejection stays queued for replay.
 */
const MAX_KEEPALIVE_BODY_BYTES = 32 * 1024;

let textEncoder: TextEncoder | undefined;

const utf8ByteLength = function utf8ByteLength(value: string): number {
	if (typeof TextEncoder === 'function') {
		textEncoder ??= new TextEncoder();
		return textEncoder.encode(value).byteLength;
	}
	return value.length * 3;
};

const readOptOut = function readOptOut(
	value: unknown
): OptOutRecord | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const validated = validateOptOutRecord(value);
	// A backend answer names the applicable rights, never an empty list.
	return validated.ok && validated.record.rights.length > 0
		? validated.record
		: undefined;
};

const readLink = function readLink(
	value: unknown
): V1ConsentRecordLink | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}
	const link = value as {
		reason?: unknown;
		stored?: unknown;
		verifiedBy?: unknown;
	};
	if (link.stored === true && link.verifiedBy === 'identity_token') {
		return { stored: true, verifiedBy: 'identity_token' };
	}
	if (
		link.stored === false &&
		(link.reason === 'unverified' ||
			link.reason === 'invalid_token' ||
			link.reason === 'refused')
	) {
		return { reason: link.reason, stored: false };
	}
	return undefined;
};

/** The save result, or `undefined` for an answer that is not `{ subjectId, recordId }` with a UUIDv7 subject and a UUID record in any case. */
const toSaveResult = function toSaveResult(
	data: unknown
): (V1SaveResult & { subjectId: string }) | undefined {
	const body =
		typeof data === 'object' && data !== null
			? (data as {
					link?: unknown;
					optOut?: unknown;
					recordId?: unknown;
					subjectId?: unknown;
				})
			: {};
	if (
		typeof body.subjectId !== 'string' ||
		!isUuidV7(body.subjectId) ||
		typeof body.recordId !== 'string' ||
		// A UUID in any case, as the documents client reads a document ID.
		!V1_UUID_PATTERN.test(body.recordId.toLowerCase())
	) {
		return undefined;
	}
	const result: V1SaveResult & { subjectId: string } = {
		ok: true,
		recordId: body.recordId,
		subjectId: body.subjectId,
	};
	const link = readLink(body.link);
	if (link) {
		result.link = link;
	}
	const optOut = readOptOut(body.optOut);
	if (optOut) {
		result.optOut = optOut;
	}
	return result;
};

const toOptOutResult = function toOptOutResult(
	data: unknown
): (V1OptOutResult & { recordId: string; subjectId: string }) | undefined {
	const body =
		typeof data === 'object' && data !== null
			? (data as {
					link?: unknown;
					optOut?: unknown;
					recordId?: unknown;
					subjectId?: unknown;
				})
			: {};
	if (
		typeof body.subjectId !== 'string' ||
		!isUuidV7(body.subjectId) ||
		typeof body.recordId !== 'string' ||
		!V1_UUID_PATTERN.test(body.recordId.toLowerCase())
	) {
		return undefined;
	}
	const result: V1OptOutResult & { recordId: string; subjectId: string } = {
		ok: true,
		recordId: body.recordId,
		subjectId: body.subjectId,
	};
	const link = readLink(body.link);
	if (link) {
		result.link = link;
	}
	const optOut = readOptOut(body.optOut);
	if (optOut) {
		result.optOut = optOut;
	}
	return result;
};

const toLiftOptOutResult = function toLiftOptOutResult(
	data: unknown
): (V1LiftOptOutResult & { recordId: string; subjectId: string }) | undefined {
	const body =
		typeof data === 'object' && data !== null
			? (data as {
					optOut?: unknown;
					recordId?: unknown;
					subjectId?: unknown;
				})
			: {};
	// A lift is recorded even when it lifts nothing, so an answer without a
	// record ID is not the backend's.
	if (
		typeof body.subjectId !== 'string' ||
		!isUuidV7(body.subjectId) ||
		typeof body.recordId !== 'string' ||
		!V1_UUID_PATTERN.test(body.recordId.toLowerCase())
	) {
		return undefined;
	}
	const result: V1LiftOptOutResult & { recordId: string; subjectId: string } = {
		ok: true,
		recordId: body.recordId,
		subjectId: body.subjectId,
	};
	if (body.optOut === null) {
		result.optOut = null;
	} else {
		const optOut = readOptOut(body.optOut);
		if (optOut) {
			result.optOut = optOut;
		}
	}
	return result;
};

/**
 * Build the record half of a `/v1` transport. Safe to create per request.
 *
 * @param options - Project URL and request settings.
 * @param decision - The decision a save without a policy snapshot token
 *   asserts, when the transport remembers one.
 * @returns Save and identify methods.
 * @example
 * ```ts
 * const records = createV1RecordTransport({
 *   projectUrl: 'https://your-project.inth.app',
 * });
 * const result = await records.save(payload);
 * ```
 */
export const createV1RecordTransport = function createV1RecordTransport(
	options: V1RecordTransportOptions,
	decision?: V1DecisionSource
): V1RecordTransport {
	const base = trimTrailingSlash(options.projectUrl);
	const fetchImpl = resolveV1Fetch(options.fetch, 'createV1RecordTransport');
	const property = resolveProperty(base, options.property);

	const post = (url: string, body: unknown, keepalive = false) => {
		const serialized = JSON.stringify(body);
		const init: RequestInit = {
			body: serialized,
			credentials: options.credentials,
			headers: { ...V1_JSON_HEADERS },
			method: 'POST',
		};
		if (keepalive && utf8ByteLength(serialized) <= MAX_KEEPALIVE_BODY_BYTES) {
			init.keepalive = true;
		}
		return fetchImpl(url, init);
	};

	return {
		async identify(user, subjectId) {
			if (!(subjectId && user.identityToken)) {
				return undefined;
			}
			const response = await post(`${base}${subjectLinkPath(subjectId)}`, {
				externalId: user.externalId,
				identityToken: user.identityToken,
				...(user.identityProvider && {
					identityProvider: user.identityProvider,
				}),
			});
			if (!response.ok) {
				throw await readApiError(
					`Inth transport: ${V1_ROUTES.subjectLink}`,
					response
				);
			}
			const answer = (await readJson(response)) as
				| { optOut?: unknown; subjectId?: unknown }
				| undefined;
			const canonical = answer?.subjectId;
			if (typeof canonical !== 'string' || !isUuidV7(canonical)) {
				throw new Error(
					`Inth transport: ${V1_ROUTES.subjectLink} answered ${response.status} without a canonical subject ID`
				);
			}
			const optOut = readOptOut(answer?.optOut);
			return optOut
				? { optOut, subjectId: canonical }
				: { subjectId: canonical };
		},

		async liftOptOut(payload): Promise<V1LiftOptOutResult> {
			const response = await post(
				`${base}${V1_ROUTES.optOutLift}`,
				buildV1ConsentOptOutLiftBody(payload, property),
				true
			);
			if (!response.ok) {
				const failure = await readOptOutFailure(
					`Inth transport: ${V1_ROUTES.optOutLift}`,
					response
				);
				if (failure === null) {
					return { ok: false, unsupported: true };
				}
				throw failure;
			}
			const result = toLiftOptOutResult(await readJson(response));
			if (!result) {
				throw new Error(
					`Inth transport: ${V1_ROUTES.optOutLift} answered ${response.status} without a subject ID and record ID`
				);
			}
			return result;
		},

		async optOut(payload): Promise<V1OptOutResult> {
			const response = await post(
				`${base}${V1_ROUTES.optOuts}`,
				buildV1ConsentOptOutBody(payload, property),
				true
			);
			if (!response.ok) {
				const failure = await readOptOutFailure(
					`Inth transport: ${V1_ROUTES.optOuts}`,
					response
				);
				if (failure === null) {
					return { ok: false, unsupported: true };
				}
				throw failure;
			}
			const result = toOptOutResult(await readJson(response));
			if (!result) {
				throw new Error(
					`Inth transport: ${V1_ROUTES.optOuts} answered ${response.status} without a subject ID and record ID`
				);
			}
			return result;
		},

		async save(payload): Promise<V1SaveResult> {
			if (
				decision?.required &&
				!payload.policySnapshotToken &&
				!payload.decisionInputs
			) {
				let awaited = decision.pending();
				while (awaited) {
					// oxlint-disable-next-line no-await-in-loop -- Each iteration waits for the init that superseded the last.
					await awaited.catch(() => undefined);
					awaited = decision.pending();
				}
				if (!buildDecisionAssertion(payload, decision.inputs())) {
					throw new Error(
						'Inth transport: cannot save before init resolved a policy decision (assertDecisionInputs is set).'
					);
				}
			}
			const url = `${base}${V1_ROUTES.records}`;
			const response = await post(
				payload.journey
					? appendJourneyParams(url, {
							id: payload.journey.id,
							scope: payload.journey.scope,
						})
					: url,
				{
					...buildV1ConsentRecordBody(payload, property),
					...buildDecisionAssertion(payload, decision?.inputs()),
				},
				true
			);
			if (!response.ok) {
				throw await readSaveFailure(
					`Inth transport: ${V1_ROUTES.records}`,
					response
				);
			}
			const result = toSaveResult(await readJson(response));
			if (!result) {
				// Not the backend's answer, such as a proxy's page: retry with the
				// same key rather than count the save as recorded.
				throw new Error(
					`Inth transport: ${V1_ROUTES.records} answered ${response.status} without a subject ID and record ID`
				);
			}
			return result;
		},
	};
};
