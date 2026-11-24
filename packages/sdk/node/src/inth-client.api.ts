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
 * missed. Only two things throw: `new Inth()`, an `InthError` for options it
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
/** The latest time a `Date` can hold, and the latest `acceptedAt` the API takes */
const MAX_EPOCH_MS = 8_640_000_000_000_000;
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
	 * `https://your-project.inth.app`. Defaults to `INTH_PROJECT_URL`
	 */
	readonly projectUrl?: string;
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

/**
 * The codes worth trying again later: the client tries these again itself,
 * within `maxRetries`, before it returns one
 */
const RETRIED: ReadonlySet<InthErrorCode> = new Set([
	'network_error',
	'rate_limited',
	'server_error',
	'timeout',
]);

/**
 * The API's own code for a refusal. The `/v1` routes send one of the listed
 * codes; any other string is kept as it came
 */
export type InthApiCode =
	| Schemas['V1Error']['error']['code']
	// oxlint-disable-next-line typescript/ban-types -- `string & {}` keeps the listed codes in autocomplete
	| (string & {});

/** What the API found wrong with a body it refused */
export interface InthErrorDetails {
	/** The messages for each field, such as `effectiveDate` */
	readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
	/** The messages about the body as a whole */
	readonly formErrors: readonly string[];
}

/**
 * A call that failed, returned rather than thrown. `new Inth()` also throws
 * one, with the code `invalid_request`, for options it cannot use
 */
export class InthError extends Error {
	/** Always `InthError`, for logs */
	override readonly name = 'InthError';
	/** Why, as a value to branch on */
	readonly code: InthErrorCode;
	/** The HTTP status, or 0 when no response arrived */
	readonly status: number;
	/** The API's own code, such as `identity_conflict`, when it sent one */
	readonly apiCode: InthApiCode | undefined;
	/** The fields the API refused and why, when it said */
	readonly details: InthErrorDetails | undefined;
	/** The id to quote to support, when the API sent one */
	readonly requestId: string | undefined;
	/**
	 * What `fetch` or the body read threw, for an answer that never arrived.
	 * Declared here so the published type has it whatever `lib` a caller
	 * compiles with; `Error` sets it
	 */
	declare readonly cause: unknown;
	/**
	 * Whether sending the same call again later may succeed: a network
	 * failure, a timeout, a 429 or a 5xx. The client tries these again itself
	 * within `maxRetries`, unless the API asked for a longer wait than it
	 * makes or the edge challenged the call. Always false for
	 * `documents.publish`: a failed publish may have been stored, so check
	 * `documents.current` before you publish again
	 */
	readonly retryable: boolean;
	/**
	 * How long the API asked you to wait before trying again, in
	 * milliseconds from when it answered, when it said
	 */
	readonly retryAfter: number | undefined;

	constructor(
		code: InthErrorCode,
		message: string,
		options: {
			readonly status?: number;
			readonly apiCode?: InthApiCode;
			readonly details?: InthErrorDetails;
			readonly requestId?: string;
			/** Defaults to whether `code` is one worth trying again */
			readonly retryable?: boolean;
			readonly retryAfter?: number;
			/** What `fetch` or the body read threw, for an answer that never arrived */
			readonly cause?: unknown;
		} = {}
	) {
		// Set only when there is one, so an error without a cause has no
		// `cause` of its own
		super(
			message,
			options.cause === undefined ? undefined : { cause: options.cause }
		);
		this.code = code;
		this.status = options.status ?? 0;
		this.apiCode = options.apiCode;
		this.details = options.details;
		this.requestId = options.requestId;
		this.retryable = options.retryable ?? RETRIED.has(code);
		this.retryAfter = options.retryAfter;
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
 * // The import makes this file extend @inth/node rather than replace it
 * import '@inth/node';
 *
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

const epochMs = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(0),
	v.maxValue(MAX_EPOCH_MS)
);

const consentSyncBasis = v.variant('kind', [
	v.object({
		fingerprint: v.pipe(v.string(), v.minLength(1)),
		kind: v.literal('choice-v1'),
	}),
	v.object({
		kind: v.literal('legacy-v2'),
		materialFingerprint: v.optional(v.pipe(v.string(), v.minLength(1))),
	}),
]);

const consentAnswer = v.object({
	/** Each category the user answered, and whether they grant it now */
	categories: ownRecord(v.boolean()),
	/** Effective opt-out state across the person and their linked devices */
	optOut: v.nullable(
		v.object({
			advertising: v.boolean(),
			limitSensitive: v.boolean(),
			recordedAt: epochMs,
			rights: v.array(v.string()),
			sale: v.boolean(),
		})
	),
	/** Cross-domain sync snapshot for the browser provider */
	sync: v.object({
		checkedAt: epochMs,
		choices: ownRecord(
			v.object({
				basis: consentSyncBasis,
				confirmedAt: epochMs,
				expiresAt: v.optional(epochMs),
				value: v.boolean(),
			})
		),
		externalId: v.string(),
		/** Per opt-out right, the latest time this person opted back in to it */
		optIn: v.optional(ownRecord(epochMs)),
		optOut: v.nullable(
			v.object({
				method: v.string(),
				recordedAt: epochMs,
				rights: v.array(v.string()),
			})
		),
		vendors: ownRecord(
			v.object({
				confirmedAt: epochMs,
				value: v.boolean(),
			})
		),
	}),
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
				/** For a refused body, what was wrong with each field */
				details: v.fallback(
					v.optional(
						v.object({
							fieldErrors: v.optional(ownRecord(v.array(v.string()))),
							formErrors: v.optional(v.array(v.string())),
						})
					),
					undefined
				),
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

/** Whether a user accepted one document type */
export type InthDocumentCheck =
	Answer<'getV1DocumentsCheck'>['documents'][string];
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
	Holds<Same<v.InferOutput<typeof checkSchema>, InthDocumentCheck>>,
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
	readonly identityProvider?: string;
}

/** True when `T` is a union of more than one member */
type IsUnion<T, All = T> = T extends unknown
	? [All] extends [T]
		? false
		: true
	: never;

/** True when `T` names exactly one document type */
type IsOneType<T> = string extends T
	? false
	: true extends IsUnion<T>
		? false
		: true;

/** The types a fixed list is sure to hold: each element that names one type */
type SureTypes<Types extends readonly InthDocumentType[]> = {
	[Index in keyof Types]: IsOneType<Types[Index]> extends true
		? Types[Index]
		: never;
}[number];

/** One list's answer: its sure types required, any other it may hold optional */
type ChecksFor<Types extends readonly InthDocumentType[]> =
	number extends Types['length']
		? Readonly<Partial<Record<Types[number], InthDocumentCheck>>>
		: Readonly<
				{ [Type in SureTypes<Types>]: InthDocumentCheck } & {
					[
						Type in Exclude<Types[number], SureTypes<Types>>
					]?: InthDocumentCheck;
				}
			>;

/**
 * The answer to `documents.check`, keyed by the types asked for. A type
 * written in the call, such as `['privacy_policy']`, is sure to have an entry.
 * A list built at run time, or an element that may be one of several types,
 * may leave a type out, so its entry is optional. One of several lists, such
 * as `isEu ? ['terms_eu'] : ['terms_us']`, is answered as one of their answers
 */
export type InthDocumentChecks<Types extends readonly InthDocumentType[]> =
	Types extends unknown ? ChecksFor<Types> : never;

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
	readonly identityProvider?: string;
}

const identityTokenSchema = v.object({
	/** When it stops working, as an ISO date. One hour after it was made */
	expiresAt: v.string(),
	/** Pass it to the browser's `identify()` as `identityToken` */
	token: v.string(),
});

/** A short-lived proof, for the browser, that it belongs to one of your users */
export type InthIdentityToken = Schemas['IdentityTokenResponse'];

/** Fails to compile when the schema above stops matching the document */
// oxlint-disable-next-line no-unused-vars -- Checked by the compiler, never used
type IdentityTokenMatchesTheDocument = Holds<
	Same<v.InferOutput<typeof identityTokenSchema>, InthIdentityToken>
>;

/** A body read as JSON */
const json = v.pipe(v.string(), v.parseJson());

/** Why these limits cannot be used, or `undefined` when they can */
const unusableLimits = (limits: {
	readonly maxRetries?: number | undefined;
	readonly timeout?: number | undefined;
}):
	| { readonly name: 'maxRetries' | 'timeout'; readonly reason: string }
	| undefined => {
	const { maxRetries, timeout } = limits;
	if (
		maxRetries !== undefined &&
		!(Number.isInteger(maxRetries) && maxRetries >= 0)
	) {
		return { name: 'maxRetries', reason: 'must be a whole number, 0 or more' };
	}
	if (
		timeout !== undefined &&
		!(Number.isInteger(timeout) && timeout > 0 && timeout <= MAX_TIMEOUT_MS)
	) {
		return {
			name: 'timeout',
			reason: `must be a whole number of milliseconds, from 1 to ${MAX_TIMEOUT_MS}`,
		};
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
const unusableProjectUrl = (base: string): string | undefined => {
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
	asked: number | undefined
): number | null => {
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
		return new InthError('timeout', 'The API did not answer in time', {
			cause: error,
		});
	}
	return new InthError(
		'network_error',
		error instanceof Error ? error.message : 'The request failed',
		{ cause: error }
	);
};

/**
 * The field errors a refusal sent. `undefined` for details in another form,
 * such as `{ reason }`, which are not field errors
 */
const fieldErrorsOf = (
	sent:
		| {
				readonly fieldErrors?: InthErrorDetails['fieldErrors'];
				readonly formErrors?: InthErrorDetails['formErrors'];
		  }
		| undefined
): InthErrorDetails | undefined =>
	sent?.fieldErrors === undefined && sent?.formErrors === undefined
		? undefined
		: {
				fieldErrors: sent.fieldErrors ?? {},
				formErrors: sent.formErrors ?? [],
			};

/** A refusal, read from whichever error shape the body carries */
const refusalError = (
	response: Response,
	body: unknown,
	requestId: string | undefined,
	/** What the body read threw, for a refusal whose body never arrived */
	cause?: unknown
): InthError => {
	const { status } = response;
	const refused = v.safeParse(refusal, body);
	const output = refused.success ? refused.output : undefined;
	return new InthError(
		codeForStatus(status),
		output?.message ?? output?.error?.message ?? `The API answered ${status}`,
		{
			apiCode: output?.cause?.code ?? output?.code ?? output?.error?.code,
			cause,
			details: fieldErrorsOf(output?.error?.details),
			requestId: requestId ?? output?.requestId,
			retryAfter: askedWait(response.headers.get('retry-after')),
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
): { readonly error: InthError; readonly final: true } | undefined => {
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
				{
					...details,
					retryAfter: askedWait(response.headers.get('retry-after')),
				}
			),
			final: true,
		};
	}
	return undefined;
};

/**
 * `value` percent-encoded, or `undefined` for a string no URL can carry,
 * such as one with a lone UTF-16 surrogate, which `encodeURIComponent` throws on
 */
const encoded = (value: string): string | undefined => {
	try {
		return encodeURIComponent(value);
	} catch {
		return undefined;
	}
};

/**
 * `value` as one path segment, or `undefined` when it cannot be one. A dot
 * segment would move the request to another route, and an empty one would
 * name none. Path only: in a query, `.` is an ordinary value
 */
const segment = (value: string): string | undefined =>
	value === '' || value === '.' || value === '..' ? undefined : encoded(value);

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
		return value !== undefined && encoded(value) === undefined;
	});

/**
 * A refusal the client makes itself, before sending anything, for one
 * field: shaped as the API's own, so `details.fieldErrors` names the field
 */
const refusedField = (name: string, reason: string): InthResult<never> => {
	const message = `\`${name}\` ${reason}`;
	return failed(
		new InthError('invalid_request', message, {
			details: { fieldErrors: { [name]: [message] }, formErrors: [] },
		})
	);
};

/** The refusal for a query value no URL can carry */
const unusableQuery = (name: string): InthResult<never> =>
	refusedField(
		name,
		'cannot be sent in a URL: it holds a character no URL can carry, such as a lone UTF-16 surrogate'
	);

/** The refusal for a parameter no URL can carry */
const unusableSegment = (name: string): InthResult<never> =>
	refusedField(
		name,
		'cannot be sent in a URL: it is empty or a dot segment, or holds a character no URL can carry'
	);

/**
 * The body as text, or why it could not be read. Gives up when `signal`
 * aborts and cancels the body: a fetch's own body stops with the signal, but
 * a body an injected `fetch` made may not, and must not hold the call
 */
const readText = async (
	response: Response,
	signal: AbortSignal
): Promise<{ readonly text: string } | { readonly failure: unknown }> => {
	let giveUp = (): void => undefined;
	const aborted = new Promise<{ readonly failure: unknown }>((resolve) => {
		giveUp = () => {
			void discard(response);
			resolve({ failure: signal.reason });
		};
	});
	if (signal.aborted) {
		giveUp();
	} else {
		signal.addEventListener('abort', giveUp, { once: true });
	}
	const reading = (async () => {
		try {
			return { text: await response.text() };
		} catch (error) {
			return { failure: error };
		}
	})();
	try {
		return await Promise.race([reading, aborted]);
	} finally {
		signal.removeEventListener('abort', giveUp);
	}
};

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

/**
 * Reads the body of a 2xx: its data, or `undefined` when it has another
 * shape. A function, not a schema, so the published types need no validator
 */
type Reader<Data> = (body: unknown) => { readonly data: Data } | undefined;

/** A reader for `schema` */
const reader =
	<Schema extends v.GenericSchema>(
		schema: Schema
	): Reader<v.InferOutput<Schema>> =>
	(body) => {
		const parsed = v.safeParse(schema, body);
		return parsed.success ? { data: parsed.output } : undefined;
	};

type Send = <Data>(
	read: Reader<Data>,
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
) => Promise<InthResult<Data>>;

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

/**
 * Full consent check document returned by `consents.check()`, including
 * effective `categories`, effective `optOut`, and the `sync` snapshot
 */
export type UserConsent = Schemas['ConsentCheckResponse'];

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
	 * if (!error && data.categories.marketing === true) sendNewsletter();
	 */
	async check(
		params: CheckConsentParams,
		options?: InthRequestOptions
	): Promise<InthResult<UserConsent>> {
		const unusable = uncarried({
			externalId: params.externalId,
			property: params.property,
		});
		if (unusable !== undefined) {
			return unusableQuery(unusable);
		}
		const query = new URLSearchParams({ externalId: params.externalId });
		if (params.property !== undefined) {
			query.set('property', params.property);
		}
		return await this.#send(
			reader(consentAnswer),
			{
				method: 'GET',
				path: `/v1/consent/check?${query}`,
			},
			options
		);
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
			reader(linkAnswer),
			{
				body: JSON.stringify({
					externalId: params.externalId,
					identityProvider: params.identityProvider,
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
	 * if (error) throw error;
	 * // In the browser:
	 * // await client.identify({ externalId: user.id, identityToken: data.token });
	 */
	async createIdentityToken(
		params: CreateIdentityTokenParams,
		options?: InthRequestOptions
	): Promise<InthResult<InthIdentityToken>> {
		const body: Schemas['IdentityTokenRequest'] = {
			externalId: params.externalId,
			identityProvider: params.identityProvider,
		};
		return await this.#send(
			reader(identityTokenSchema),
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
	/** The version's id */
	id: v.string(),
	/** False for a small edit that people who accepted before need not accept */
	requiresAcceptance: v.boolean(),
	/** Such as `privacy_policy`, `terms_us` or `terms_eu` */
	type: v.string(),
	/** The name you gave this version, such as `2026-11-18` */
	version: v.string(),
});

/**
 * A version of a legal document, as `publish()` stored it and `current()`
 * finds it. Send its `hash` back with an acceptance
 */
export type InthDocument = Schemas['DocumentCurrentResponse']['document'];

/** The answer to a publish, and to a read of the version in force */
const documentAnswer = v.object({ document: documentSchema });

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
	Holds<
		Same<
			v.InferOutput<typeof documentAnswer>,
			Schemas['DocumentPublishResponse']
		>
	>,
	Holds<
		Same<
			v.InferOutput<typeof documentAnswer>,
			Schemas['DocumentCurrentResponse']
		>
	>,
	Holds<Same<v.InferOutput<typeof acceptedAnswer>, InthAcceptances>>,
];

export interface PublishDocumentParams {
	/** The document type, such as `privacy_policy` or `terms_us` */
	readonly type: InthDocumentType;
	/** Your name for this version, such as `2026-11-18` */
	readonly version: string;
	/** `hashDocument()` of the published file */
	readonly hash: string;
	/** When it takes effect: a `Date`, or an ISO 8601 date such as `2026-11-18` */
	readonly effectiveDate: Date | string;
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
	/**
	 * When: a `Date`, or milliseconds since the epoch. Defaults to the time
	 * of the call
	 */
	readonly acceptedAt?: Date | number;
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

/**
 * The time a `Date` names, in milliseconds since the epoch, `NaN` for an
 * invalid one, or `undefined` for anything else. Read with
 * `Date.prototype.getTime`, which throws on anything else, not `instanceof`,
 * so a `Date` made in another realm, such as a `vm` context, is read too
 */
const timeOf = (value: unknown): number | undefined => {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}
	try {
		return Date.prototype.getTime.call(value);
	} catch {
		return undefined;
	}
};

/** The refusal for a date that names no time, such as `new Date('')` */
const invalidDate = (name: string): InthResult<never> =>
	refusedField(name, 'is an invalid date');

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
	): Promise<InthResult<InthDocument>> {
		const effectiveTime = timeOf(params.effectiveDate);
		if (Number.isNaN(effectiveTime)) {
			return invalidDate('effectiveDate');
		}
		const body: Schemas['DocumentPublishRequest'] = {
			effectiveDate:
				effectiveTime === undefined
					? String(params.effectiveDate)
					: new Date(effectiveTime).toISOString(),
			hash: params.hash,
			requiresAcceptance: params.requiresAcceptance,
			version: params.version,
		};
		const type = segment(params.type);
		if (type === undefined) {
			return unusableSegment('type');
		}
		const answer = await this.#send(
			reader(documentAnswer),
			{
				body: JSON.stringify(body),
				method: 'PUT',
				once: true,
				path: `/v1/documents/${type}/current`,
			},
			options
		);
		if (answer.error?.retryable) {
			// It may have been stored, so it must not be sent again unchecked. A
			// rate limit, the API's or the edge's, refused it before any store
			const { error } = answer;
			const stored =
				error.code === 'rate_limited'
					? ''
					: '. The version may have been stored: check documents.current before you publish again';
			return failed(
				new InthError(error.code, `${error.message}${stored}`, {
					apiCode: error.apiCode,
					cause: error.cause,
					details: error.details,
					requestId: error.requestId,
					retryAfter: error.retryAfter,
					retryable: false,
					status: error.status,
				})
			);
		}
		return answer.error ? answer : ok(answer.data.document);
	}

	/**
	 * The version in force. Fetch it when you show the document, and send its
	 * `hash` back with `accept()`. `not_found` when the
	 * type has no version yet
	 *
	 * @example
	 * const { data: terms, error } = await inth.documents.current({
	 *   type: 'terms_us',
	 * });
	 * if (error) throw error;
	 * // Link to terms.version. Keep terms.hash on the server, such as in the
	 * // session, to record with the acceptance: never take it from the form
	 */
	async current(
		params: CurrentDocumentParams,
		options?: InthRequestOptions
	): Promise<InthResult<InthDocument>> {
		const type = segment(params.type);
		if (type === undefined) {
			return unusableSegment('type');
		}
		const answer = await this.#send(
			reader(documentAnswer),
			{
				keyless: true,
				method: 'GET',
				path: `/v1/documents/${type}/current`,
			},
			options
		);
		return answer.error ? answer : ok(answer.data.document);
	}

	/**
	 * Records that a person, or a device, accepted documents. All are
	 * recorded, or none. Safe to retry: the call sends one idempotency key on
	 * each try
	 *
	 * @example
	 * // The releases your server showed and kept, never hashes from the form
	 * const shown = await readShownDocuments(request);
	 * const { error } = await inth.documents.accept({
	 *   externalId: user.id,
	 *   acceptances: shown,
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
		const acceptedTime = timeOf(params.acceptedAt);
		if (Number.isNaN(acceptedTime)) {
			return invalidDate('acceptedAt');
		}
		// A Date and a number are held to the one range the API takes
		const acceptedAt =
			acceptedTime ??
			(typeof params.acceptedAt === 'number' ? params.acceptedAt : Date.now());
		if (
			!(
				Number.isSafeInteger(acceptedAt) &&
				acceptedAt >= 0 &&
				acceptedAt <= MAX_EPOCH_MS
			)
		) {
			return refusedField(
				'acceptedAt',
				`must be a whole number of milliseconds since the epoch, from 0 to ${MAX_EPOCH_MS}`
			);
		}
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
			reader(recordedAll),
			{
				body: JSON.stringify({
					acceptances,
					acceptedAt,
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
	 * // A failed check says nothing about the user: do not ask them again
	 * if (error) throw error;
	 * if (!data.privacy_policy.acceptedLatest) askToAccept();
	 */
	async check<const Types extends readonly InthDocumentType[]>(
		params: CheckDocumentsParams<Types>,
		options?: InthRequestOptions
	): Promise<InthResult<InthDocumentChecks<Types>>> {
		// Copied once, so the query and the check below read the same list
		const types = [...params.types];
		const query = { externalId: params.externalId, types: types.join(',') };
		const unusable = uncarried(query);
		if (unusable !== undefined) {
			return unusableQuery(unusable);
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
			reader(answeredAll),
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
		return ok(answer.data.documents as InthDocumentChecks<Types>);
	}
}

/** What `new Inth()` throws for options it cannot use */
const unusableSetup = (message: string): InthError =>
	new InthError('invalid_request', message);

/**
 * @example
 * import { Inth } from '@inth/node';
 *
 * const inth = new Inth({
 *   projectUrl: 'https://your-project.inth.app',
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
		// Workers without `nodejs_compat` have no `process`: pass both there
		const environment = globalThis.process?.env;
		// A caller without types may pass anything
		for (const name of ['secretKey', 'projectUrl'] as const) {
			const value: unknown = options[name];
			if (value !== undefined && typeof value !== 'string') {
				throw unusableSetup(`\`${name}\` must be a string.`);
			}
		}
		const secretKey = (
			options.secretKey ??
			environment?.INTH_SECRET_KEY ??
			''
		).trim();
		if (secretKey === '') {
			throw unusableSetup(
				'Inth needs a secret key. Pass `secretKey`, or set INTH_SECRET_KEY.'
			);
		}
		let base = (
			options.projectUrl ??
			environment?.INTH_PROJECT_URL ??
			''
		).trim();
		while (base.endsWith('/')) {
			base = base.slice(0, -1);
		}
		if (base === '') {
			throw unusableSetup(
				'Inth needs the URL of your project. Pass `projectUrl`, or set INTH_PROJECT_URL.'
			);
		}
		const unusableUrl = unusableProjectUrl(base);
		if (unusableUrl !== undefined) {
			throw unusableSetup(unusableUrl);
		}
		const authorization = `Bearer ${secretKey}`;
		try {
			// Throws for a key a header cannot carry, such as one with a newline
			new Headers().set('authorization', authorization);
		} catch {
			throw unusableSetup(
				'Inth cannot send this secret key: it holds characters a header cannot carry.'
			);
		}
		// The global is read on each call, not here: a test may replace it after
		// the client is made, and a runtime without one fails a call, not setup
		const fetcher: typeof fetch =
			options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		const unusable = unusableLimits(options);
		if (unusable !== undefined) {
			throw unusableSetup(`\`${unusable.name}\` ${unusable.reason}`);
		}

		/** One attempt: a parsed answer, or why there is none */
		const attempt = async <Data>(
			read: Reader<Data>,
			request: Parameters<Send>[1],
			signal: AbortSignal
		): Promise<
			| InthResult<Data>
			| {
					readonly error: InthError;
					/** Set when trying again within this call cannot help */
					readonly final?: true;
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
				return { error: fetchFailure(error, signal) };
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
			const bodyRead = await readText(response, signal);
			const text = 'text' in bodyRead ? bodyRead.text : undefined;
			const readFailure = 'failure' in bodyRead ? bodyRead.failure : undefined;
			if (text === undefined && !response.ok) {
				// The status says what happened, and its `Retry-After` still holds
				return {
					error: refusalError(response, undefined, requestId, readFailure),
				};
			}
			if (text === undefined) {
				return {
					error: new InthError(
						signal.aborted ? 'timeout' : 'network_error',
						signal.aborted
							? 'The API did not answer in time'
							: 'The answer was cut off',
						{ cause: readFailure, requestId, status: response.status }
					),
				};
			}
			// A body that is not JSON, such as a proxy's error page, is read as
			// no body: the status still says what happened
			const asJson = v.safeParse(json, text);
			const body = asJson.success ? asJson.output : undefined;
			if (!response.ok) {
				return { error: refusalError(response, body, requestId) };
			}
			const parsed = read(body);
			return parsed
				? ok(parsed.data)
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

		const send: Send = async (read, request, overrides) => {
			const { retries: asked, timeout } = limitsFor(overrides);
			const cancelled = overrides?.signal;
			const badLimits = unusableLimits({ maxRetries: asked, timeout });
			if (badLimits !== undefined) {
				return refusedField(badLimits.name, badLimits.reason);
			}
			const retries = request.once ? 0 : asked;
			for (let tried = 0; ; tried += 1) {
				if (cancelled?.aborted) {
					return failed(new InthError('aborted', 'The call was cancelled'));
				}
				const limit = AbortSignal.timeout(timeout);
				// oxlint-disable-next-line no-await-in-loop -- Each retry waits for the try before it
				const result = await attempt(
					read,
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
				const delay = delayBefore(tried, result.error.retryAfter);
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
