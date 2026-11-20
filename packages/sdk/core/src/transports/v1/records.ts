/**
 * The record half of a `/v1` transport: saves and identity links.
 *
 * A link made in a browser must be proven, so `identify` sends a link only
 * with an identity token and a subject. Otherwise the identity stays in the
 * kernel and travels with the next save. There is no route for a browser to
 * read a subject, so there is no `loadSubjectRecord`.
 */
import { appendJourneyParams } from '@inth/sdk-schema/types';
import type { V1ConsentRecordLink } from '@inth/sdk-schema/types';

import { isUuidV7 } from '../../libs/subject-uuid';
import type {
	KernelTransport,
	KernelUser,
	SavePayload,
	SaveResult,
} from '../../types';
import { buildDecisionAssertion } from '../decision-inputs';
import type { RememberedDecisionInputs } from '../decision-inputs';
import { readApiError } from './error';
import { buildV1ConsentRecordBody } from './records-body';
import {
	readJson,
	resolveProperty,
	resolveV1Fetch,
	subjectLinkPath,
	trimTrailingSlash,
	V1_JSON_HEADERS,
	V1_ROUTES,
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
	/**
	 * Called when an answer names a subject ID other than the one sent, such
	 * as the UUID for a stored `sub_` ID. The kernel reads a first save's ID
	 * from its result; a replay's and a link's reach it only here.
	 */
	onSubjectId?: (subjectId: string, previous: string) => void;
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

/** The save result, or `undefined` for an answer without a canonical subject ID. */
const toSaveResult = function toSaveResult(
	data: unknown
): (V1SaveResult & { subjectId: string }) | undefined {
	const body =
		typeof data === 'object' && data !== null
			? (data as { link?: unknown; subjectId?: unknown })
			: {};
	if (typeof body.subjectId !== 'string' || !isUuidV7(body.subjectId)) {
		return undefined;
	}
	const result: V1SaveResult & { subjectId: string } = {
		ok: true,
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
 * @param decisionInputs - The decision a save without a policy snapshot
 *   token asserts, when the transport remembers one.
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
	decisionInputs?: () => RememberedDecisionInputs | undefined
): V1RecordTransport {
	const base = trimTrailingSlash(options.projectUrl);
	const fetchImpl = resolveV1Fetch(options.fetch, 'createV1RecordTransport');
	const property = resolveProperty(base, options.property);

	const reportSubjectId = (canonical: string, sent: string) => {
		if (canonical !== sent) {
			options.onSubjectId?.(canonical, sent);
		}
	};

	const post = (url: string, body: unknown) =>
		fetchImpl(url, {
			body: JSON.stringify(body),
			credentials: options.credentials,
			headers: { ...V1_JSON_HEADERS },
			method: 'POST',
		});

	return {
		async identify(user, subjectId): Promise<void> {
			if (!(subjectId && user.identityToken)) {
				return;
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
			reportSubjectId(canonical, subjectId);
		},

		async save(payload): Promise<V1SaveResult> {
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
					...buildDecisionAssertion(payload, decisionInputs?.()),
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
					`Inth transport: ${V1_ROUTES.records} answered ${response.status} without a canonical subject ID`
				);
			}
			reportSubjectId(result.subjectId, payload.subjectId);
			return result;
		},
	};
};
