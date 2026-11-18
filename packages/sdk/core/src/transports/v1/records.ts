/**
 * The record half of a `/v1` transport: saves and identity links.
 *
 * - `save` posts one action to `POST /v1/consent/records` and returns the
 *   canonical subject ID the backend answers with. The kernel adopts it, so
 *   a `sub_` ID an earlier client stored is replaced by its UUID.
 * - `identify` links the subject to a person through
 *   `POST /v1/subjects/:id/link`, and only with an identity token: a link
 *   made in the browser must be proven. Without a token, or before a
 *   subject exists, it sends nothing. The identity stays in the kernel and
 *   travels with the next save, where the backend links it only when the
 *   save carries a valid token.
 *
 * There is no route for a browser to read a subject, so this transport has
 * no `loadSubjectRecord`.
 */
import { appendJourneyParams } from '@inth/sdk-schema/types';
import type { V1ConsentRecordLink } from '@inth/sdk-schema/types';

import { createIdempotencyKey, isUuidV7 } from '../../libs/subject-uuid';
import type {
	KernelTransport,
	KernelUser,
	SavePayload,
	SaveResult,
} from '../../types';
import { buildDecisionAssertion } from '../decision-inputs';
import type { RememberedDecisionInputs } from '../decision-inputs';
import { readInthApiError } from './error';
import { buildV1ConsentRecordBody } from './records-body';
import {
	resolveProperty,
	resolveV1Fetch,
	subjectLinkPath,
	trimTrailingSlash,
	V1_DEFAULT_CREDENTIALS,
	V1_JSON_HEADERS,
	V1_ROUTES,
} from './routes';
import { readSaveFailure } from './save-rejected';

/** Options for {@link createV1RecordTransport}. */
export interface V1RecordTransportOptions {
	/**
	 * Project URL, such as `https://your-project.inth.app`, or a same-origin
	 * path that proxies it. Trailing slashes are stripped.
	 */
	projectUrl: string;
	/** Fetch implementation. Defaults to `globalThis.fetch`. */
	fetch?: typeof globalThis.fetch;
	/** Fetch credentials mode. Defaults to `'same-origin'`. */
	credentials?: RequestCredentials;
	/**
	 * Host name or app ID the consent belongs to. Defaults to the page's host
	 * name, else the project URL's. Sent lowercase.
	 */
	property?: string;
	/**
	 * Called when a link answers with a subject ID other than the one it was
	 * sent, such as the UUID for a stored `sub_` ID. A save's canonical ID
	 * reaches the kernel through its result; a link's has no such path.
	 */
	onSubjectId?: (subjectId: string, previous: string) => void;
}

/**
 * Where a save finds the decision it asserts when the payload carries
 * neither a `policySnapshotToken` nor decision inputs of its own.
 *
 * @internal
 */
export interface V1DecisionSource {
	/** Refuse to save until an init resolved a decision. */
	required: boolean;
	/** The init in flight, if any. A save waits for it before asserting. */
	pending: () => Promise<unknown> | undefined;
	/** Decision inputs the latest init remembered. */
	inputs: () => RememberedDecisionInputs | undefined;
}

/** A save result with the backend's answer about the identity link. */
export interface V1SaveResult extends SaveResult {
	/** Present when the save sent an `externalId`. */
	link?: V1ConsentRecordLink;
}

/** The record methods of a `/v1` transport. */
export interface V1RecordTransport extends KernelTransport {
	save: (payload: SavePayload) => Promise<V1SaveResult>;
	identify: (user: KernelUser, subjectId: string | null) => Promise<void>;
}

const LABEL = 'Inth transport';

const readLink = function readLink(
	value: unknown
): V1ConsentRecordLink | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}
	const link = value as { stored?: unknown; verifiedBy?: unknown };
	if (link.stored === true && link.verifiedBy === 'identity_token') {
		return { stored: true, verifiedBy: 'identity_token' };
	}
	if (link.stored === false) {
		return { reason: 'unverified', stored: false };
	}
	return undefined;
};

/**
 * The save result from the backend's answer. Success is the HTTP status. A
 * subject ID is adopted only when it has the canonical layout.
 */
const toSaveResult = function toSaveResult(data: unknown): V1SaveResult {
	const body =
		typeof data === 'object' && data !== null
			? (data as { link?: unknown; subjectId?: unknown })
			: {};
	const result: V1SaveResult = { ok: true };
	if (typeof body.subjectId === 'string' && isUuidV7(body.subjectId)) {
		result.subjectId = body.subjectId;
	}
	const link = readLink(body.link);
	if (link) {
		result.link = link;
	}
	return result;
};

const readJson = async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
};

/**
 * Build the record half of a `/v1` transport. Plain object, no listeners,
 * no caches. Safe to create per request.
 *
 * @param options - Project URL and request settings.
 * @param decision - Where saves find a remembered decision. Omit it when
 *   every save carries its own decision inputs or a snapshot token.
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
	const credentials = options.credentials ?? V1_DEFAULT_CREDENTIALS;
	const property = resolveProperty(base, options.property);

	return {
		async identify(user, subjectId): Promise<void> {
			// A browser link must be proven. Without a token, or without a
			// subject yet, the identity stays in the kernel and travels with
			// the next save.
			if (!(subjectId && user.identityToken)) {
				return;
			}
			const body: Record<string, string> = {
				externalId: user.externalId,
				identityToken: user.identityToken,
			};
			if (user.identityProvider) {
				body.identityProvider = user.identityProvider;
			}
			const response = await fetchImpl(`${base}${subjectLinkPath(subjectId)}`, {
				body: JSON.stringify(body),
				credentials,
				headers: { ...V1_JSON_HEADERS },
				method: 'POST',
			});
			if (!response.ok) {
				throw await readInthApiError(
					`${LABEL}: /v1/subjects/:id/link`,
					response
				);
			}
			const answer = (await readJson(response)) as
				| { subjectId?: unknown }
				| undefined;
			const canonical = answer?.subjectId;
			if (
				typeof canonical === 'string' &&
				isUuidV7(canonical) &&
				canonical !== subjectId
			) {
				options.onSubjectId?.(canonical, subjectId);
			}
		},

		async save(payload): Promise<V1SaveResult> {
			if (
				decision?.required &&
				!payload.policySnapshotToken &&
				!payload.decisionInputs
			) {
				// Wait out every init in flight so the assertion reflects the
				// latest decision; if none resolves, refuse rather than record an
				// answer bound to no policy.
				let awaited = decision.pending();
				while (awaited) {
					// oxlint-disable-next-line no-await-in-loop -- Each iteration waits for the init that superseded the last.
					await awaited.catch(() => undefined);
					awaited = decision.pending();
				}
				if (!buildDecisionAssertion(payload, decision.inputs())) {
					throw new Error(
						`${LABEL}: cannot save before init resolved a policy decision (assertDecisionInputs is set).`
					);
				}
			}

			const url = `${base}${V1_ROUTES.records}`;
			const response = await fetchImpl(
				payload.journey
					? appendJourneyParams(url, {
							id: payload.journey.id,
							scope: payload.journey.scope,
						})
					: url,
				{
					body: JSON.stringify({
						...buildV1ConsentRecordBody(payload, {
							fallbackIdempotencyKey: createIdempotencyKey,
							property,
						}),
						...buildDecisionAssertion(payload, decision?.inputs()),
					}),
					credentials,
					headers: { ...V1_JSON_HEADERS },
					method: 'POST',
				}
			);

			if (!response.ok) {
				throw await readSaveFailure(`${LABEL}: /v1/consent/records`, response);
			}

			return toSaveResult(await readJson(response));
		},
	};
};
