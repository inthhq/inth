/**
 * The record half of a `/v1` transport: saves and identity links.
 *
 * A link made in a browser must be proven, so `identify` sends a link only
 * with an identity token and a subject. Otherwise the identity stays in the
 * kernel and travels with the next save. There is no route for a browser to
 * read a subject, so there is no `loadSubjectRecord`.
 */
import { appendJourneyParams, V1_UUID_PATTERN } from '@inth/sdk-schema/types';
import type { V1ConsentRecordLink } from '@inth/sdk-schema/types';

import type {
	KernelTransport,
	KernelUser,
	SavePayload,
	SaveResult,
} from '../../types';
import { buildDecisionAssertion } from '../decision-inputs';
import type { RememberedDecisionInputs } from '../decision-inputs';
import { readApiError } from './error';
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
import { readSaveFailure } from './save-rejected';

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
	identify: (
		user: KernelUser,
		subjectId: string | null
	) => Promise<{ subjectId: string } | undefined>;
}

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
			? (data as { link?: unknown; recordId?: unknown; subjectId?: unknown })
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

	const post = (url: string, body: unknown) =>
		fetchImpl(url, {
			body: JSON.stringify(body),
			credentials: options.credentials,
			headers: { ...V1_JSON_HEADERS },
			method: 'POST',
		});

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
				| { subjectId?: unknown }
				| undefined;
			const canonical = answer?.subjectId;
			if (typeof canonical !== 'string' || !isUuidV7(canonical)) {
				throw new Error(
					`Inth transport: ${V1_ROUTES.subjectLink} answered ${response.status} without a canonical subject ID`
				);
			}
			return { subjectId: canonical };
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
				}
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
