/**
 * A client for legal documents on the `/v1` routes, with no UI.
 *
 * - {@link DocumentsClient.getCurrent} reads the version of a document type
 *   in force, with the proof token that pins the type, version and hash the
 *   person was shown.
 * - {@link DocumentsClient.recordAcceptances} records one or more
 *   acceptances with those proof tokens. All are recorded, or none.
 *
 * An acceptance carries an idempotency key: make one per user action with
 * `createIdempotencyKey()` and send the same key on every retry of it, so
 * the backend records the action once.
 */
import {
	V1_DOCUMENT_TYPE_PATTERN,
	V1_MAX_ACCEPTANCES,
} from '@inth/sdk-schema/types';
import type {
	V1DocumentAcceptanceItem,
	V1DocumentAcceptancesInput,
	V1DocumentAcceptancesOutput,
	V1DocumentCurrentOutput,
} from '@inth/sdk-schema/types';

import { isUuidV7 } from '../libs/subject-uuid';
import { readApiError } from '../transports/v1/error';
import {
	currentDocumentPath,
	readJson,
	resolveV1Fetch,
	toProperty,
	trimTrailingSlash,
	V1_JSON_HEADERS,
	V1_ROUTES,
} from '../transports/v1/routes';

const LABEL = 'Inth documents';

/** Options for {@link createDocumentsClient}. */
export interface DocumentsClientOptions {
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
	 * The project's secret key, for a server that records acceptances for a
	 * person or passes the visitor's `context`. Server-side only: never ship
	 * it to a browser.
	 */
	secretKey?: string;
}

/** What {@link DocumentsClient.recordAcceptances} takes. */
export interface RecordAcceptancesInput {
	/** The documents accepted, each with the proof token it was shown with. */
	acceptances: readonly V1DocumentAcceptanceItem[];
	/** The device subject. At least one of `subjectId` and `externalId`. */
	subjectId?: string;
	/**
	 * The person. Needs the client's `secretKey` or a valid `identityToken`.
	 * The person is created when missing.
	 */
	externalId?: string;
	identityProvider?: string;
	/** Signed proof of `externalId`, minted by your server. */
	identityToken?: string;
	/** Lowercase host name or app ID where the documents were accepted. */
	property?: string;
	/**
	 * Epoch milliseconds of the acceptance. Defaults to now; pass the same
	 * value on every retry.
	 */
	acceptedAt?: number;
	/**
	 * Key of this user action, from `createIdempotencyKey()`. Send the same
	 * key on every retry.
	 */
	idempotencyKey: string;
	/**
	 * The visitor's IP address and user agent, when a server records the
	 * acceptance for them. Honoured only with a secret key.
	 */
	context?: { ipAddress?: string; userAgent?: string };
}

/** The documents client. */
export interface DocumentsClient {
	/**
	 * Read the version of `type` in force, with its proof token. Throws an
	 * `ApiError` with code `not_found` when the type has no current
	 * version.
	 */
	getCurrent: (type: string) => Promise<V1DocumentCurrentOutput>;
	/**
	 * Record acceptances. Resolves with the canonical subject ID and what
	 * was recorded; throws an `ApiError` (for example
	 * `document_proof_expired`) when nothing was.
	 */
	recordAcceptances: (
		input: RecordAcceptancesInput
	) => Promise<V1DocumentAcceptancesOutput>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const assertDocumentType = function assertDocumentType(type: string): void {
	if (!V1_DOCUMENT_TYPE_PATTERN.test(type)) {
		throw new TypeError(
			`${LABEL}: "${type}" is not a document type. Use lowercase letters, digits and underscores, starting with a letter.`
		);
	}
};

const readCurrent = function readCurrent(
	body: unknown
): V1DocumentCurrentOutput {
	if (
		isRecord(body) &&
		isRecord(body.document) &&
		typeof body.document.type === 'string' &&
		typeof body.document.version === 'string' &&
		typeof body.document.hash === 'string' &&
		typeof body.document.effectiveDate === 'string' &&
		typeof body.document.requiresAcceptance === 'boolean' &&
		typeof body.proofToken === 'string' &&
		body.proofToken &&
		typeof body.proofTokenExpiresAt === 'string'
	) {
		return body as unknown as V1DocumentCurrentOutput;
	}
	throw new Error(`${LABEL}: the current document answer is unreadable`);
};

const readAcceptances = function readAcceptances(
	body: unknown
): V1DocumentAcceptancesOutput {
	if (
		isRecord(body) &&
		typeof body.subjectId === 'string' &&
		isUuidV7(body.subjectId) &&
		Array.isArray(body.acceptances) &&
		body.acceptances.every(
			(acceptance) =>
				isRecord(acceptance) &&
				typeof acceptance.type === 'string' &&
				typeof acceptance.version === 'string' &&
				typeof acceptance.hash === 'string' &&
				typeof acceptance.acceptedAt === 'number'
		)
	) {
		return body as unknown as V1DocumentAcceptancesOutput;
	}
	throw new Error(`${LABEL}: the acceptances answer is unreadable`);
};

/**
 * The acceptances body, checked before it is sent.
 *
 * @param input - What the caller passed.
 * @returns The body of `POST /v1/documents/acceptances`.
 * @throws {TypeError} When there are no acceptances or too many, no
 * idempotency key, no subject ID or external ID, or a document type is
 * malformed.
 */
const buildAcceptancesBody = function buildAcceptancesBody(
	input: RecordAcceptancesInput
): V1DocumentAcceptancesInput {
	if (
		input.acceptances.length === 0 ||
		input.acceptances.length > V1_MAX_ACCEPTANCES
	) {
		throw new TypeError(
			`${LABEL}: pass 1 to ${V1_MAX_ACCEPTANCES} acceptances.`
		);
	}
	if (!input.idempotencyKey) {
		throw new TypeError(
			`${LABEL}: pass an idempotencyKey from createIdempotencyKey().`
		);
	}
	if (!(input.subjectId || input.externalId)) {
		throw new TypeError(`${LABEL}: pass a subjectId or an externalId.`);
	}
	for (const { type } of input.acceptances) {
		assertDocumentType(type);
	}
	const body: V1DocumentAcceptancesInput = {
		acceptances: input.acceptances.map(({ proofToken, type }) => ({
			proofToken,
			type,
		})),
		acceptedAt: input.acceptedAt ?? Date.now(),
		idempotencyKey: input.idempotencyKey,
	};
	if (input.subjectId) {
		body.subjectId = input.subjectId;
	}
	if (input.externalId) {
		body.externalId = input.externalId;
	}
	if (input.identityProvider) {
		body.identityProvider = input.identityProvider;
	}
	if (input.identityToken) {
		body.identityToken = input.identityToken;
	}
	if (input.property) {
		body.property = toProperty(input.property);
	}
	if (input.context) {
		body.context = { ...input.context };
	}
	return body;
};

/**
 * Build a documents client.
 *
 * @param options - Project URL and request settings.
 * @returns The client.
 * @example
 * ```ts
 * import { createDocumentsClient, createIdempotencyKey } from '...';
 *
 * const documents = createDocumentsClient({
 *   projectUrl: 'https://your-project.inth.app',
 * });
 * const terms = await documents.getCurrent('terms_us');
 * // Show terms.document, then on accept:
 * const key = createIdempotencyKey();
 * await documents.recordAcceptances({
 *   acceptances: [{ type: 'terms_us', proofToken: terms.proofToken }],
 *   idempotencyKey: key,
 *   subjectId,
 * });
 * ```
 */
export const createDocumentsClient = function createDocumentsClient(
	options: DocumentsClientOptions
): DocumentsClient {
	const base = trimTrailingSlash(options.projectUrl);
	const fetchImpl = resolveV1Fetch(options.fetch, 'createDocumentsClient');
	const authorization: Record<string, string> = options.secretKey
		? { authorization: `Bearer ${options.secretKey}` }
		: {};

	return {
		async getCurrent(type) {
			assertDocumentType(type);
			const response = await fetchImpl(`${base}${currentDocumentPath(type)}`, {
				credentials: options.credentials,
				headers: { accept: 'application/json' },
				method: 'GET',
			});
			if (!response.ok) {
				throw await readApiError(
					`${LABEL}: ${V1_ROUTES.currentDocument}`,
					response
				);
			}
			return readCurrent(await readJson(response));
		},

		async recordAcceptances(input) {
			const body = buildAcceptancesBody(input);
			const response = await fetchImpl(`${base}${V1_ROUTES.acceptances}`, {
				body: JSON.stringify(body),
				credentials: options.credentials,
				headers: { ...V1_JSON_HEADERS, ...authorization },
				method: 'POST',
			});
			if (!response.ok) {
				throw await readApiError(
					`${LABEL}: ${V1_ROUTES.acceptances}`,
					response
				);
			}
			return readAcceptances(await readJson(response));
		},
	};
};
