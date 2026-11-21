/**
 * The Inth client for a customer's server.
 *
 * It links browsers to a customer's own users in one project, reads what
 * they consent to,
 * publishes the project's legal documents and records their acceptance,
 * through the project's API, with the project's secret key. The key can act
 * for any user in the project, so it stays on the server and never reaches a
 * browser.
 *
 * No method throws for a request that fails. Each resolves to `{ data, error }`
 * with exactly one of the two set, so a failure is in the types and cannot be
 * missed. Only two things throw: `new Inth()`, for a key or an address it
 * cannot use, and `hashDocument`, for anything but bytes.
 *
 * It imports no Node module, only `fetch`, `AbortSignal` and Web Crypto, so it
 * runs on Node, Vercel Functions and Cloudflare Workers alike.
 */

// oxlint-disable max-classes-per-file -- The client and its three areas share one private `send`
import * as v from 'valibot';

import type { components, operations } from './generated/openapi';
import { version } from './version';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_MS = 250;
const RETRY_CAP_MS = 5000;
/** The longest timer `AbortSignal.timeout` and `setTimeout` take */
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface InthOptions {
	/**
	 * The project's secret key, `inth_prj_...`, or an organization API key,
	 * `inth_...`, that holds the permissions the calls need. Defaults to
	 * `INTH_SECRET_KEY`
	 */
	readonly secretKey?: string;
	/**
	 * The project's URL, as the Dashboard shows it, such as
	 * `https://your-project.inth.app`. Defaults to `INTH_URL`
	 */
	readonly baseUrl?: string;
	/** How long one attempt may take, in milliseconds. Defaults to 10 seconds */
	readonly timeout?: number;
	/**
	 * How many times a request that could not be answered is tried again:
	 * a network failure, a timeout, a 429 or a 5xx. Defaults to 2.
	 * `documents.publish` is never tried again
	 */
	readonly maxRetries?: number;
	/** For tests and runtimes without a global `fetch` */
	readonly fetch?: typeof fetch;
}

/** What one call may override */
export interface InthRequestOptions {
	/** Cancels the call, retries included */
	readonly signal?: AbortSignal;
	/** How long one attempt may take, in milliseconds */
	readonly timeout?: number;
	/** How many times to try again */
	readonly maxRetries?: number;
}

/** Why a call failed, as a value to branch on */
export type InthErrorCode =
	/** The key is missing, wrong, revoked or expired */
	| 'unauthorized'
	/** The key may not make this call */
	| 'forbidden'
	/** Too many requests. Already retried */
	| 'rate_limited'
	/** The API refused what was sent. `message` says what */
	| 'invalid_request'
	/** Nothing is stored under that id */
	| 'not_found'
	/** The request conflicts with what is stored */
	| 'conflict'
	/** No response arrived. Already retried */
	| 'network_error'
	/** No response arrived in time. Already retried */
	| 'timeout'
	/** The caller's `signal` cancelled the call */
	| 'aborted'
	/** The API failed. Already retried */
	| 'server_error'
	/** The API answered in a shape this client does not read */
	| 'unexpected_response';

/** A call that failed. Returned, not thrown */
export class InthError extends Error {
	/** Always `InthError`, for logs */
	override readonly name = 'InthError';
	/** Why, as a value to branch on */
	readonly code: InthErrorCode;
	/** The HTTP status, or 0 when no response arrived */
	readonly status: number;
	/** The API's own code, such as `identity_conflict`, when it sent one */
	readonly apiCode: string | undefined;
	/** The id to quote to support, when the API sent one */
	readonly requestId: string | undefined;

	constructor(
		code: InthErrorCode,
		message: string,
		details: {
			readonly status?: number;
			readonly apiCode?: string;
			readonly requestId?: string;
		} = {}
	) {
		super(message);
		this.code = code;
		this.status = details.status ?? 0;
		this.apiCode = details.apiCode;
		this.requestId = details.requestId;
	}
}

/** Exactly one of `data` and `error` is set. Check `error` first */
export type InthResult<Data> =
	| { readonly data: Data; readonly error: null }
	| { readonly data: null; readonly error: InthError };

const ok = <Data>(data: Data): InthResult<Data> => ({ data, error: null });
const failed = (error: InthError): InthResult<never> => ({ data: null, error });

/**
 * What a project defines, for this client's types to follow.
 *
 * Empty as shipped. Declare `documentTypes` on it to narrow every call to the
 * document types your project has:
 *
 * ```ts
 * declare module '@inth/node' {
 * 	interface Register {
 * 		documentTypes: 'privacy_policy' | 'terms_and_conditions';
 * 	}
 * }
 * ```
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- Empty on purpose: a project fills it in by declaration merging
export interface Register {}

/**
 * A project's document types: the ones declared on {@link Register}, or the
 * common ones and any other string
 */
export type InthDocumentType = Register extends {
	readonly documentTypes: infer Types extends string;
}
	? Types
	: // oxlint-disable-next-line typescript/ban-types -- `string & {}` keeps the common types in autocomplete
		'privacy_policy' | 'terms_and_conditions' | 'dpa' | (string & {});

const checkSchema = v.object({
	/** The user accepted some release of this type, on any linked device */
	accepted: v.boolean(),
	/** They accepted the latest release that requires acceptance */
	acceptedLatest: v.boolean(),
});

/**
 * A JSON object of `entry` values, with every key kept. Checked by hand:
 * `v.record` drops a key such as `constructor`, a valid document type, and
 * still succeeds
 */
const ownRecord = <Entry extends v.GenericSchema>(entry: Entry) =>
	v.custom<Record<string, v.InferOutput<Entry>>>(
		(input) =>
			typeof input === 'object' &&
			input !== null &&
			!Array.isArray(input) &&
			Object.values(input).every((value) => v.is(entry, value)),
		'Expected an object of entries'
	);

const checkAnswer = v.object({
	documents: ownRecord(checkSchema),
});

const consentAnswer = v.object({
	/** Each category the user answered, and whether they grant it now */
	categories: ownRecord(v.boolean()),
});

const linkAnswer = v.object({
	/** Your id for the user */
	externalId: v.string(),
	/** The subject's canonical id, a UUID, even when a c15t id was sent */
	subjectId: v.string(),
	/** What vouched for the link: your key, or an identity token */
	verifiedBy: v.picklist(['secret_key', 'identity_token']),
});

/**
 * A refusal, in each form it arrives in: a `/v1` route's, under `error` with
 * `requestId` beside it, and older routes', with `code` or `cause.code`
 */
const refusal = v.object({
	// Each field falls back alone, so one of an unexpected type, such as a
	// numeric `code`, does not lose the others
	cause: v.fallback(v.optional(v.object({ code: v.string() })), undefined),
	code: v.fallback(v.optional(v.string()), undefined),
	/**
	 * Some older routes put a plain title here, which says nothing more than
	 * the status does and is read as nothing
	 */
	error: v.optional(
		v.fallback(
			v.object({
				code: v.fallback(v.optional(v.string()), undefined),
				message: v.fallback(v.optional(v.string()), undefined),
			}),
			{}
		)
	),
	message: v.fallback(v.optional(v.string()), undefined),
	requestId: v.fallback(v.optional(v.string()), undefined),
});

/** The backend's schemas, generated from its OpenAPI document */
type Schemas = components['schemas'];

/** Whether a user has consented to one type */
export type InthDocumentCheck = v.InferOutput<typeof checkSchema>;
/** A device linked to one of your users */
export type InthLink = Schemas['SubjectLinkResponse'];

/** The JSON body of a 200 from `operation` */
type Answer<Operation extends keyof operations> =
	operations[Operation]['responses'] extends {
		200: { content: { 'application/json': infer Body } };
	}
		? Body
		: never;

/** True only when `A` and `B` are the same type */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Compiles only when given `true` */
type Holds<Check extends true> = Check;

/**
 * Fails to compile when a schema above no longer reads what the OpenAPI
 * document says the backend answers. Update the document as
 * `packages/sdk/schema/vendor/backend-openapi/README.md` says, then fix the
 * schema
 */
// oxlint-disable-next-line no-unused-vars -- Checked by the compiler, never used
type SchemasMatchTheDocument = [
	Holds<Same<v.InferOutput<typeof checkAnswer>, Answer<'getV1DocumentsCheck'>>>,
	Holds<Same<v.InferOutput<typeof consentAnswer>, Answer<'getV1ConsentCheck'>>>,
	Holds<Same<v.InferOutput<typeof linkAnswer>, InthLink>>,
];

export interface IdentifyParams {
	/** Your id for the user */
	readonly externalId: string;
	/**
	 * The id the banner holds in the browser: a UUID, or the `sub_` id a c15t
	 * banner made. Send it to your server at sign-in
	 */
	readonly subjectId: string;
	/** Where your id comes from, such as `workos`. For your own records */
	readonly provider?: string;
}

export interface CheckDocumentsParams<
	Types extends readonly InthDocumentType[],
> {
	/** Your id for the user */
	readonly externalId: string;
	/** The types to ask about. The answer has one entry for each */
	readonly types: Types;
}

export interface CreateIdentityTokenParams {
	/** Your id for the user. The browser passes the same id to `identify()` */
	readonly externalId: string;
	/**
	 * Where your id comes from, such as `workos`. When set, the browser
	 * must pass the same `identityProvider` to `identify()`
	 */
	readonly provider?: string;
}

const identityTokenSchema = v.object({
	/** When it stops working, as an ISO date. One hour after it was made */
	expiresAt: v.string(),
	/** Pass it to the browser's `identify()` as `identityToken` */
	token: v.string(),
});

/** A short-lived proof, for the browser, that it belongs to one of your users */
export type InthIdentityToken = v.InferOutput<typeof identityTokenSchema>;

/** Fails to compile when the schema above stops matching the document */
// oxlint-disable-next-line no-unused-vars -- Checked by the compiler, never used
type IdentityTokenMatchesTheDocument = Holds<
	Same<InthIdentityToken, Schemas['IdentityTokenResponse']>
>;

/** A body read as JSON */
const json = v.pipe(v.string(), v.parseJson());

/** Why these limits cannot be used, or `undefined` when they can */
const unusableLimits = (limits: {
	readonly maxRetries?: number | undefined;
	readonly timeout?: number | undefined;
}): string | undefined => {
	const { maxRetries, timeout } = limits;
	if (
		maxRetries !== undefined &&
		!(Number.isInteger(maxRetries) && maxRetries >= 0)
	) {
		return '`maxRetries` must be a whole number, 0 or more';
	}
	if (
		timeout !== undefined &&
		!(Number.isInteger(timeout) && timeout > 0 && timeout <= MAX_TIMEOUT_MS)
	) {
		return `\`timeout\` must be a whole number of milliseconds, from 1 to ${MAX_TIMEOUT_MS}`;
	}
	return undefined;
};

/** Hosts a key may be sent to over plain `http:`: this machine only */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
	'localhost',
	'127.0.0.1',
	'[::1]',
]);

/** Whether `hostname` is this machine, `*.localhost` included (RFC 6761) */
const isLoopback = (hostname: string): boolean =>
	LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost');

/** Why `base` cannot be the project's URL, or `undefined` when it can */
const unusableBaseUrl = (base: string): string | undefined => {
	let url: URL;
	try {
		url = new URL(base);
	} catch {
		return `Inth cannot read the project URL "${base}". Pass the full URL, such as https://your-project.inth.app.`;
	}
	// Each route is added to the end, so a query or fragment would swallow it
	if (base.includes('?') || base.includes('#')) {
		return 'The project URL cannot have a query or a fragment. Pass it as https://your-project.inth.app.';
	}
	if (url.username !== '' || url.password !== '') {
		return 'The project URL cannot hold a user name or password. Pass the secret key as `secretKey`.';
	}
	if (url.protocol === 'https:') {
		return undefined;
	}
	if (url.protocol === 'http:' && isLoopback(url.hostname)) {
		return undefined;
	}
	return 'The project URL must start with https://, so the secret key is never sent in the clear.';
};

/** The code of a refusal, by its status, where it is the API's own code */
const CODE_BY_STATUS = {
	401: 'unauthorized',
	403: 'forbidden',
	404: 'not_found',
	409: 'conflict',
	429: 'rate_limited',
} as const satisfies Record<number, InthErrorCode>;

/**
 * Statuses a proxy in front of the API answers when it did not wait for the
 * API, rather than the API's own refusals: tried again like a timeout
 */
const TIMEOUT_STATUSES: ReadonlySet<number> = new Set([408]);

/** The codes a documented refusal may carry */
type CodeOf<Body> = Body extends { error: { code: unknown } }
	? NonNullable<Body['error']['code']>
	: never;

/** The codes the document lists under `status`, on any `/v1` route */
type CodesUnder<Status extends number> = {
	[Operation in keyof operations]: operations[Operation]['responses'] extends {
		[S in Status]: { content: { 'application/json': infer Body } };
	}
		? CodeOf<Body>
		: never;
}[keyof operations];

/** Whether the document lists the table's code for `Status` under it */
type Listed<Status extends keyof typeof CODE_BY_STATUS> =
	(typeof CODE_BY_STATUS)[Status] extends CodesUnder<Status> ? true : false;

/**
 * Fails to compile when the API answers one of the codes above under
 * another status than the table says
 */
// oxlint-disable-next-line no-unused-vars -- Checked by the compiler, never used
type StatusesMatchTheDocument = [
	Holds<Listed<401>>,
	Holds<Listed<403>>,
	Holds<Listed<404>>,
	Holds<Listed<409>>,
	Holds<Listed<429>>,
];

const codeForStatus = (status: number): InthErrorCode => {
	if (TIMEOUT_STATUSES.has(status)) {
		return 'timeout';
	}
	// SAFETY: a status the table lacks reads `undefined`, which falls through
	return (
		CODE_BY_STATUS[status as keyof typeof CODE_BY_STATUS] ??
		(status >= 500 ? 'server_error' : 'invalid_request')
	);
};

const RETRIED: ReadonlySet<InthErrorCode> = new Set([
	'network_error',
	'rate_limited',
	'server_error',
	'timeout',
]);

/** The wait a `Retry-After` header asks for: seconds, or a date */
const askedWait = (retryAfter: string | null): number | undefined => {
	if (retryAfter === null || retryAfter.trim() === '') {
		return undefined;
	}
	const seconds = Number(retryAfter);
	if (Number.isFinite(seconds)) {
		return Math.max(seconds * 1000, 0);
	}
	const until = Date.parse(retryAfter);
	return Number.isNaN(until) ? undefined : Math.max(until - Date.now(), 0);
};

/**
 * How long to wait before the retry after attempt `attempt`. `null` when the
 * API asked for a longer wait than this client makes: retrying sooner would
 * only be refused again, so the caller gets the refusal.
 */
const delayBefore = (
	attempt: number,
	retryAfter: string | null
): number | null => {
	const asked = askedWait(retryAfter);
	if (asked !== undefined) {
		return asked > RETRY_CAP_MS ? null : asked;
	}
	// Full jitter, so clients that failed together do not retry together
	return Math.random() * Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS);
};

/**
 * Why `fetch` threw: the timeout ran out, or the request never completed.
 * Read from the signal, since a `fetch` may reject a timed-out call with an
 * `AbortError` rather than a `TimeoutError`. A caller's cancel is told apart
 * after the attempt
 */
const fetchFailure = (error: unknown, signal: AbortSignal): InthError => {
	if (signal.aborted) {
		return new InthError('timeout', 'The API did not answer in time');
	}
	return new InthError(
		'network_error',
		error instanceof Error ? error.message : 'The request failed'
	);
};

/** A refusal, read from whichever error shape the body carries */
const refusalError = (
	status: number,
	body: unknown,
	requestId: string | undefined
): InthError => {
	const refused = v.safeParse(refusal, body);
	const output = refused.success ? refused.output : undefined;
	return new InthError(
		codeForStatus(status),
		output?.message ?? output?.error?.message ?? `The API answered ${status}`,
		{
			apiCode: output?.cause?.code ?? output?.code ?? output?.error?.code,
			requestId: requestId ?? output?.requestId,
			status,
		}
	);
};

/**
 * Stops reading a body the client will not use. Not awaited by its callers:
 * a cancel that never settles must not hold the call
 */
const discard = async (response: Response): Promise<void> => {
	try {
		await response.body?.cancel();
	} catch {
		// Nothing more to read either way
	}
};

/**
 * An answer settled from its status and headers alone, before its body is
 * read, so a body that fails or stalls cannot make it a retried network
 * error. `undefined` for an answer whose body must be read
 */
const settledBeforeBody = (
	response: Response
):
	| {
			readonly error: InthError;
			readonly final: true;
			readonly retryAfter: string | null;
	  }
	| undefined => {
	const details = {
		requestId: response.headers.get('x-request-id') ?? undefined,
		status: response.status,
	};
	if (
		response.type === 'opaqueredirect' ||
		(response.status >= 300 && response.status < 400)
	) {
		void discard(response);
		const location = response.headers.get('location');
		return {
			error: new InthError(
				'unexpected_response',
				`The API redirected this request${location ? ` to ${location}` : ''}, which the client does not follow so the key goes nowhere else. Check the project URL in the Dashboard`,
				details
			),
			final: true,
			retryAfter: null,
		};
	}
	if (
		!response.ok &&
		response.headers.get('x-vercel-mitigated') === 'challenge'
	) {
		// The edge in front of the API challenged the call as it would a
		// browser, which a server cannot answer. Not the API's refusal: it
		// passes once the traffic from this address slows down. That takes
		// minutes, so a retry within this call would only add to the burst. A
		// `deny` is a refusal and reads as one
		void discard(response);
		return {
			error: new InthError(
				'rate_limited',
				'The edge in front of the API challenged this request. Send fewer requests from this address, and try again later',
				details
			),
			final: true,
			retryAfter: response.headers.get('retry-after'),
		};
	}
	return undefined;
};

/**
 * `value` as one path segment, or `undefined` for a string no URL can carry,
 * such as one with a lone UTF-16 surrogate, which `encodeURIComponent` throws on
 */
const segment = (value: string): string | undefined => {
	// A dot segment would move the request to another route, and an empty
	// one would name none
	if (value === '' || value === '.' || value === '..') {
		return undefined;
	}
	try {
		return encodeURIComponent(value);
	} catch {
		return undefined;
	}
};

/**
 * The name of the first value no URL can carry, or `undefined` when all can.
 * For a query: `URLSearchParams` would not refuse such a value but swap the
 * lone surrogate for U+FFFD, and ask about someone else
 */
const uncarried = (
	values: Readonly<Record<string, string | undefined>>
): string | undefined =>
	Object.keys(values).find((name) => {
		const value = values[name];
		return value !== undefined && segment(value) === undefined;
	});

/** The refusal for a parameter no URL can carry */
const unusableSegment = (name: string): InthResult<never> =>
	failed(
		new InthError(
			'invalid_request',
			`\`${name}\` cannot be sent in a URL: it is empty or a dot segment, or holds a character no URL can carry`
		)
	);

const wait = (milliseconds: number, signal: AbortSignal | undefined) =>
	new Promise<void>((resolve) => {
		// Removed on both paths: a caller may share one signal across every
		// call, and a listener left behind on each wait would pile up on it
		const done = () => {
			// oxlint-disable-next-line no-use-before-define -- Runs only after `timer` is set
			clearTimeout(timer);
			signal?.removeEventListener('abort', done);
			resolve();
		};
		const timer = setTimeout(done, milliseconds);
		signal?.addEventListener('abort', done, { once: true });
	});

type Send = <Schema extends v.GenericSchema>(
	schema: Schema,
	request: {
		/** The HTTP method */
		readonly method: 'GET' | 'POST' | 'PUT';
		/** From the project's URL, with the query */
		readonly path: string;
		/** A JSON body, sent as it is on every try */
		readonly body?: string;
		/** A route that needs no key, which is not sent */
		readonly keyless?: true;
		/**
		 * Tried once, never again: a write a late second try could undo, such
		 * as a publish arriving after a newer one made since
		 */
		readonly once?: true;
	},
	options: InthRequestOptions | undefined
) => Promise<InthResult<v.InferOutput<Schema>>>;

/** A consent category of the banner */
export type InthConsentCategory =
	| 'experience'
	| 'functionality'
	| 'marketing'
	| 'measurement'
	// oxlint-disable-next-line typescript/ban-types -- `string & {}` keeps the known categories in autocomplete
	| (string & {});

/**
 * What a user consents to now. A category they never answered, or whose
 * grant has run out, is absent: your policy's default applies to it
 */
export type InthConsent = Readonly<
	Partial<Record<InthConsentCategory, boolean>>
>;

export interface CheckConsentParams {
	/** Your id for the user */
	readonly externalId: string;
	/**
	 * A site's host name, or an app's application or bundle id, to count only
	 * the answers given there. Leave it out to count every property
	 */
	readonly property?: string;
}

class Consents {
	readonly #send: Send;

	constructor(send: Send) {
		this.#send = send;
	}

	/**
	 * What a user consents to now, across every device linked to them. Per
	 * category the answer they confirmed last stands, so a refusal on their
	 * phone takes back a grant made earlier on their laptop
	 *
	 * @example
	 * const { data, error } = await inth.consents.check({ externalId: user.id });
	 * if (!error && data.marketing === true) sendNewsletter();
	 */
	async check(
		params: CheckConsentParams,
		options?: InthRequestOptions
	): Promise<InthResult<InthConsent>> {
		const unusable = uncarried({
			externalId: params.externalId,
			property: params.property,
		});
		if (unusable !== undefined) {
			return unusableSegment(unusable);
		}
		const query = new URLSearchParams({ externalId: params.externalId });
		if (params.property !== undefined) {
			query.set('property', params.property);
		}
		const answer = await this.#send(
			consentAnswer,
			{
				method: 'GET',
				path: `/v1/consent/check?${query}`,
			},
			options
		);
		return answer.error ? answer : ok(answer.data.categories);
	}
}

class Users {
	readonly #send: Send;

	constructor(send: Send) {
		this.#send = send;
	}

	/**
	 * Links a browser to one of your users, so what that browser consented to
	 * counts as the user's. Call it when a user signs in. Safe to repeat.
	 * Answers with the subject's UUID, which replaces a c15t `sub_` id
	 *
	 * @example
	 * const { data, error } = await inth.users.identify({
	 *   externalId: user.id,
	 *   subjectId,
	 * });
	 */
	async identify(
		params: IdentifyParams,
		options?: InthRequestOptions
	): Promise<InthResult<InthLink>> {
		const subject = segment(params.subjectId);
		if (subject === undefined) {
			return unusableSegment('subjectId');
		}
		return await this.#send(
			linkAnswer,
			{
				body: JSON.stringify({
					externalId: params.externalId,
					identityProvider: params.provider,
				}),
				method: 'POST',
				path: `/v1/subjects/${subject}/link`,
			},
			options
		);
	}

	/**
	 * A token that lets a browser link itself to one of your users, for a
	 * server that never sees the consent cookie: an API on another domain, or
	 * a mobile backend. Send the token to the browser, which passes it to
	 * `identify()`. It expires after an hour, so make one per sign-in or page
	 * load rather than storing it. `not_found`, with `apiCode`
	 * `identity_tokens_disabled`, when the project does not have them
	 *
	 * @example
	 * const { data, error } = await inth.users.createIdentityToken({
	 *   externalId: user.id,
	 * });
	 * // In the browser:
	 * // await client.identify({ externalId: user.id, identityToken: data.token });
	 */
	async createIdentityToken(
		params: CreateIdentityTokenParams,
		options?: InthRequestOptions
	): Promise<InthResult<InthIdentityToken>> {
		const body: Schemas['IdentityTokenRequest'] = {
			externalId: params.externalId,
			identityProvider: params.provider,
		};
		return await this.#send(
			identityTokenSchema,
			{
				body: JSON.stringify(body),
				method: 'POST',
				path: '/v1/subjects/identity-tokens',
			},
			options
		);
	}
}

/**
 * Whether `value` is an `ArrayBuffer` or `SharedArrayBuffer`, whatever its
 * type says: a caller without types may pass a string. A brand check, not
 * `instanceof`, so a buffer made in another realm, such as a `vm` context,
 * is read too
 */
const isAnyArrayBuffer = (
	value: ArrayBufferView | ArrayBufferLike
): value is ArrayBufferLike => {
	const brand = Object.prototype.toString.call(value);
	return (
		brand === '[object ArrayBuffer]' || brand === '[object SharedArrayBuffer]'
	);
};

/**
 * The hash of a document to publish: `sha256:` and the lowercase hex SHA-256
 * of the exact bytes of the published file. Line endings, whitespace and
 * encoding are hashed as they are, so hash the file you serve, not a copy of
 * its text. Throws a `TypeError` for anything but bytes, such as a string
 *
 * @example
 * const hash = await hashDocument(await readFile('public/terms.html'));
 */
export const hashDocument = (
	bytes: ArrayBufferView | ArrayBufferLike
): Promise<string> => {
	// Thrown, not a rejected promise, as the module comment says
	if (!(ArrayBuffer.isView(bytes) || isAnyArrayBuffer(bytes))) {
		throw new TypeError(
			'hashDocument takes the bytes of the file, such as readFile(path) without an encoding'
		);
	}
	// A copy: Web Crypto refuses a view of a SharedArrayBuffer
	const copy = ArrayBuffer.isView(bytes)
		? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice()
		: new Uint8Array(bytes).slice();
	return crypto.subtle.digest('SHA-256', copy).then((digest) => {
		let hex = '';
		for (const byte of new Uint8Array(digest)) {
			hex += byte.toString(16).padStart(2, '0');
		}
		return `sha256:${hex}`;
	});
};

const documentSchema = v.object({
	/** When it takes effect, as an ISO date */
	effectiveDate: v.string(),
	/** `sha256:` and the hex hash of the published file */
	hash: v.string(),
	/** False for a small edit that people who accepted before need not accept */
	requiresAcceptance: v.boolean(),
	/** Such as `privacy_policy`, `terms_us` or `terms_eu` */
	type: v.string(),
	/** The name you gave this version, such as `2026-11-18` */
	version: v.string(),
});

/** A version of a legal document */
export type InthDocument = v.InferOutput<typeof documentSchema>;

const publishedSchema = v.object({
	...documentSchema.entries,
	/** The version's id */
	id: v.string(),
});

const publishedAnswer = v.object({ document: publishedSchema });

/** A version as it was published */
export type InthPublishedDocument =
	Schemas['DocumentPublishResponse']['document'];

const currentAnswer = v.object({ document: publishedSchema });

/** The version in force. Send its `hash` back with an acceptance */
export type InthCurrentDocument = Schemas['DocumentCurrentResponse'];

const acceptedAnswer = v.object({
	acceptances: v.array(
		v.object({
			/** When, in milliseconds since the epoch */
			acceptedAt: v.number(),
			hash: v.string(),
			type: v.string(),
			version: v.string(),
		})
	),
	/** The subject the acceptances are recorded for, a UUID */
	subjectId: v.string(),
});

/** Acceptances as they were recorded */
export type InthAcceptances = Schemas['DocumentAcceptancesResponse'];

/** Fails to compile when a schema above stops matching the document */
// oxlint-disable-next-line no-unused-vars -- Checked by the compiler, never used
type DocumentSchemasMatchTheDocument = [
	Holds<Same<v.InferOutput<typeof publishedSchema>, InthPublishedDocument>>,
	Holds<Same<v.InferOutput<typeof currentAnswer>, InthCurrentDocument>>,
	Holds<Same<v.InferOutput<typeof acceptedAnswer>, InthAcceptances>>,
];

export interface PublishDocumentParams {
	/** The document type, such as `privacy_policy` or `terms_us` */
	readonly type: InthDocumentType;
	/** Your name for this version, such as `2026-11-18` */
	readonly version: string;
	/** `hashDocument()` of the published file */
	readonly hash: string;
	/** When it takes effect, as an ISO 8601 date */
	readonly effectiveDate: string;
	/**
	 * Whether people who accepted the previous version must accept this one.
	 * Defaults to true. Pass false for a small edit
	 */
	readonly requiresAcceptance?: boolean;
}

export interface CurrentDocumentParams {
	/** The document type, such as `privacy_policy` or `terms_us` */
	readonly type: InthDocumentType;
}

interface AcceptDocumentsBase {
	/**
	 * The documents accepted, each by the `hash` of the version shown, as
	 * `current()` gave it
	 */
	readonly acceptances: readonly {
		readonly type: InthDocumentType;
		readonly hash: string;
	}[];
	/** When, in milliseconds since the epoch. Defaults to the time of the call */
	readonly acceptedAt?: number;
	/**
	 * The visitor's IP address and user agent, from the request that
	 * accepted. The call comes from your server, so Inth cannot see them
	 * unless you send them
	 */
	readonly context: {
		readonly ipAddress?: string;
		readonly userAgent?: string;
	};
	/** The site's host name, or the app's bundle id */
	readonly property?: string;
	/**
	 * A UUID, such as `crypto.randomUUID()`, that makes a repeat of this
	 * acceptance count once. The client makes one per call and sends it on
	 * each of its retries. Pass your own to resend a call that failed: a
	 * refused call records nothing under its key
	 */
	readonly idempotencyKey?: string;
}

/** For a person by `externalId`, for a device by `subjectId`, or both */
export type AcceptDocumentsParams = AcceptDocumentsBase &
	(
		| {
				/** Your id for the user */
				readonly externalId: string;
				/** The device they accepted on, when you know it */
				readonly subjectId?: string;
		  }
		| { readonly externalId?: undefined; readonly subjectId: string }
	);

class Documents {
	/** Sends one call, with the client's retries and limits */
	readonly #send: Send;

	constructor(send: Send) {
		this.#send = send;
	}

	/**
	 * Publishes a version of a document, which is in force from then on.
	 * Never tried again, whatever `maxRetries` says: after a failure it may
	 * have been stored, so check `documents.current` before publishing again
	 *
	 * @example
	 * const { data, error } = await inth.documents.publish({
	 *   type: 'terms_us',
	 *   version: '2026-11-18',
	 *   hash: await hashDocument(await readFile('public/terms.html')),
	 *   effectiveDate: '2026-11-18T00:00:00.000Z',
	 * });
	 */
	async publish(
		params: PublishDocumentParams,
		options?: InthRequestOptions
	): Promise<InthResult<InthPublishedDocument>> {
		const body: Schemas['DocumentPublishRequest'] = {
			effectiveDate: params.effectiveDate,
			hash: params.hash,
			requiresAcceptance: params.requiresAcceptance,
			version: params.version,
		};
		const type = segment(params.type);
		if (type === undefined) {
			return unusableSegment('type');
		}
		const answer = await this.#send(
			publishedAnswer,
			{
				body: JSON.stringify(body),
				method: 'PUT',
				once: true,
				path: `/v1/documents/${type}/current`,
			},
			options
		);
		return answer.error ? answer : ok(answer.data.document);
	}

	/**
	 * The version in force. Fetch it when you show the document, and send its
	 * `hash` back with `accept()`. `not_found` when the
	 * type has no version yet
	 *
	 * @example
	 * const { data: terms } = await inth.documents.current({ type: 'terms_us' });
	 */
	async current(
		params: CurrentDocumentParams,
		options?: InthRequestOptions
	): Promise<InthResult<InthCurrentDocument>> {
		const type = segment(params.type);
		if (type === undefined) {
			return unusableSegment('type');
		}
		return await this.#send(
			currentAnswer,
			{
				keyless: true,
				method: 'GET',
				path: `/v1/documents/${type}/current`,
			},
			options
		);
	}

	/**
	 * Records that a person, or a device, accepted documents. All are
	 * recorded, or none. Safe to retry: the call sends one idempotency key on
	 * each try
	 *
	 * @example
	 * const { error } = await inth.documents.accept({
	 *   externalId: user.id,
	 *   acceptances: [{ type: 'terms_us', hash: terms.document.hash }],
	 *   context: {
	 *     ipAddress: request.ip,
	 *     userAgent: request.headers.get('user-agent') ?? undefined,
	 *   },
	 * });
	 */
	async accept(
		params: AcceptDocumentsParams,
		options?: InthRequestOptions
	): Promise<InthResult<InthAcceptances>> {
		// Copied once, so the body and the check below read the same list
		const acceptances = params.acceptances.map(({ hash, type }) => ({
			hash,
			type,
		}));
		// All are recorded or none are, so a success must name each release
		// sent, by type and hash: checked as the answer is read, so a failure
		// keeps its request id
		const recordedAll = v.pipe(
			acceptedAnswer,
			v.check(({ acceptances: recorded }) =>
				acceptances.every(({ hash, type }) =>
					recorded.some(
						(accepted) =>
							accepted.type === type &&
							accepted.hash.toLowerCase() === hash.toLowerCase()
					)
				)
			)
		);
		// The body is made once, so each retry sends the same key and time
		return await this.#send(
			recordedAll,
			{
				body: JSON.stringify({
					acceptances,
					acceptedAt: params.acceptedAt ?? Date.now(),
					context: {
						ipAddress: params.context.ipAddress,
						userAgent: params.context.userAgent,
					},
					externalId: params.externalId,
					idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
					property: params.property,
					subjectId: params.subjectId,
				}),
				method: 'POST',
				path: '/v1/documents/acceptances',
			},
			options
		);
	}

	/**
	 * Whether a user accepted each document type, and whether they accepted
	 * the latest release that requires acceptance. Acceptances on their linked
	 * devices count. The answer is keyed by the types asked for
	 *
	 * @example
	 * const { data, error } = await inth.documents.check({
	 *   externalId: user.id,
	 *   types: ['privacy_policy'],
	 * });
	 * if (error || !data.privacy_policy.acceptedLatest) askToAccept();
	 */
	async check<const Types extends readonly InthDocumentType[]>(
		params: CheckDocumentsParams<Types>,
		options?: InthRequestOptions
	): Promise<InthResult<Readonly<Record<Types[number], InthDocumentCheck>>>> {
		// Copied once, so the query and the check below read the same list
		const types = [...params.types];
		const query = { externalId: params.externalId, types: types.join(',') };
		const unusable = uncarried(query);
		if (unusable !== undefined) {
			return unusableSegment(unusable);
		}
		// The answer must hold each type asked for: checked as it is read, so a
		// failure keeps its status and request id
		const answeredAll = v.pipe(
			checkAnswer,
			v.check(({ documents }) =>
				types.every((type) => Object.hasOwn(documents, type))
			)
		);
		const answer = await this.#send(
			answeredAll,
			{
				method: 'GET',
				path: `/v1/documents/check?${new URLSearchParams(query)}`,
			},
			options
		);
		if (answer.error) {
			return answer;
		}
		// SAFETY: the schema above found every type asked for among the results
		return ok(
			answer.data.documents as Readonly<
				Record<Types[number], InthDocumentCheck>
			>
		);
	}
}

/**
 * @example
 * import { Inth } from '@inth/node';
 *
 * const inth = new Inth({
 *   baseUrl: 'https://your-project.inth.app',
 *   secretKey: process.env.INTH_SECRET_KEY,
 * });
 */
export class Inth {
	/** Linking browsers to your users */
	readonly users: Users;
	/** Your legal documents, and who accepted them */
	readonly documents: Documents;
	/** What your users consent to */
	readonly consents: Consents;

	constructor(options: InthOptions = {}) {
		const environment = globalThis.process?.env;
		const secretKey = (
			options.secretKey ??
			environment?.INTH_SECRET_KEY ??
			''
		).trim();
		if (secretKey === '') {
			throw new Error(
				'Inth needs a secret key. Pass `secretKey`, or set INTH_SECRET_KEY.'
			);
		}
		let base = (options.baseUrl ?? environment?.INTH_URL ?? '').trim();
		while (base.endsWith('/')) {
			base = base.slice(0, -1);
		}
		if (base === '') {
			throw new Error(
				'Inth needs the URL of your project. Pass `baseUrl`, or set INTH_URL.'
			);
		}
		const unusableUrl = unusableBaseUrl(base);
		if (unusableUrl !== undefined) {
			throw new Error(unusableUrl);
		}
		const authorization = `Bearer ${secretKey}`;
		try {
			// Throws for a key a header cannot carry, such as one with a newline
			new Headers().set('authorization', authorization);
		} catch {
			throw new Error(
				'Inth cannot send this secret key: it holds characters a header cannot carry.'
			);
		}
		const fetcher = options.fetch ?? fetch;
		const unusable = unusableLimits(options);
		if (unusable !== undefined) {
			throw new Error(unusable);
		}

		/** One attempt: a parsed answer, or why there is none */
		const attempt = async <Schema extends v.GenericSchema>(
			schema: Schema,
			request: Parameters<Send>[1],
			signal: AbortSignal
		): Promise<
			| InthResult<v.InferOutput<Schema>>
			| {
					readonly error: InthError;
					/** Set when trying again within this call cannot help */
					readonly final?: true;
					readonly retryAfter: string | null;
			  }
		> => {
			const headers = new Headers({ 'user-agent': `inth-node/${version}` });
			if (!request.keyless) {
				headers.set('authorization', authorization);
			}
			if (request.body !== undefined) {
				headers.set('content-type', 'application/json');
			}
			let response: Response;
			try {
				response = await fetcher(`${base}${request.path}`, {
					body: request.body,
					headers,
					method: request.method,
					// A redirect is reported, not followed: some runtimes, Workers
					// among them, would send the key on to wherever it points
					redirect: 'manual',
					signal,
				});
			} catch (error) {
				return { error: fetchFailure(error, signal), retryAfter: null };
			}
			const settled = settledBeforeBody(response);
			if (settled !== undefined) {
				return settled;
			}
			// A `/v1` refusal also names it in the body, read below
			const requestId = response.headers.get('x-request-id') ?? undefined;
			// The body can still fail after the headers arrive. One that
			// stalls is a timeout and one that is cut off is a network failure;
			// neither is an answer in the wrong shape
			const text = await response.text().catch(() => undefined);
			if (text === undefined && !response.ok) {
				// The status says what happened, and its `Retry-After` still holds
				return {
					error: refusalError(response.status, undefined, requestId),
					retryAfter: response.headers.get('retry-after'),
				};
			}
			if (text === undefined) {
				return {
					error: new InthError(
						signal.aborted ? 'timeout' : 'network_error',
						signal.aborted
							? 'The API did not answer in time'
							: 'The answer was cut off',
						{ requestId, status: response.status }
					),
					retryAfter: null,
				};
			}
			// A body that is not JSON, such as a proxy's error page, is read as
			// no body: the status still says what happened
			const read = v.safeParse(json, text);
			const body = read.success ? read.output : undefined;
			if (!response.ok) {
				return {
					error: refusalError(response.status, body, requestId),
					retryAfter: response.headers.get('retry-after'),
				};
			}
			const parsed = v.safeParse(schema, body);
			return parsed.success
				? ok(parsed.output)
				: failed(
						new InthError(
							'unexpected_response',
							'The API answered in a shape this client does not read',
							{ requestId, status: response.status }
						)
					);
		};

		/** A call's own limits, else the client's, else the defaults */
		const limitsFor = (overrides: InthRequestOptions | undefined) => ({
			retries:
				overrides?.maxRetries ?? options.maxRetries ?? DEFAULT_MAX_RETRIES,
			timeout: overrides?.timeout ?? options.timeout ?? DEFAULT_TIMEOUT_MS,
		});

		const send: Send = async (schema, request, overrides) => {
			const { retries: asked, timeout } = limitsFor(overrides);
			const cancelled = overrides?.signal;
			const badLimits = unusableLimits({ maxRetries: asked, timeout });
			if (badLimits !== undefined) {
				return failed(new InthError('invalid_request', badLimits));
			}
			const retries = request.once ? 0 : asked;
			for (let tried = 0; ; tried += 1) {
				if (cancelled?.aborted) {
					return failed(new InthError('aborted', 'The call was cancelled'));
				}
				const limit = AbortSignal.timeout(timeout);
				// oxlint-disable-next-line no-await-in-loop -- Each retry waits for the try before it
				const result = await attempt(
					schema,
					request,
					cancelled ? AbortSignal.any([cancelled, limit]) : limit
				);
				if (result.error === null) {
					return result;
				}
				if (cancelled?.aborted) {
					return failed(new InthError('aborted', 'The call was cancelled'));
				}
				if (
					tried >= retries ||
					('final' in result && result.final) ||
					!RETRIED.has(result.error.code)
				) {
					return failed(result.error);
				}
				const delay = delayBefore(
					tried,
					'retryAfter' in result ? result.retryAfter : null
				);
				if (delay === null) {
					return failed(result.error);
				}
				// oxlint-disable-next-line no-await-in-loop -- The backoff between tries
				await wait(delay, cancelled);
			}
		};

		this.consents = new Consents(send);
		this.users = new Users(send);
		this.documents = new Documents(send);
	}
}
