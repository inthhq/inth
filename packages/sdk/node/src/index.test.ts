/**
 * `@inth/node` against a stubbed `fetch`: what it sends and how it reads each
 * answer, as the `/v1` wire contract defines them.
 */

import { runInNewContext } from 'node:vm';

import * as v from 'valibot';
import { assert, describe, it } from 'vitest';

import document from '../../schema/vendor/backend-openapi/openapi.json' with { type: 'json' };
import { hashDocument, Inth } from './index';
import type { InthOptions, InthRequestOptions } from './index';
import { version } from './version';

const SECRET = 'inth_prj_test';
const PROJECT_URL = 'https://project.example.test';
const UUID = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
/** The hashes of the terms and the privacy policy the tests accept */
const TERMS_HASH = `sha256:${'a'.repeat(64)}`;
const PRIVACY_HASH = `sha256:${'b'.repeat(64)}`;

interface Sent {
	readonly url: string;
	readonly method: string;
	readonly headers: Record<string, string>;
	readonly body: unknown;
}

/**
 * A client whose `fetch` records each request and answers with the next of
 * `responses`, repeating the last
 */
const stubbed = (
	responses: readonly (() => Response)[],
	options: InthOptions = {}
) => {
	const sent: Sent[] = [];
	const inth = new Inth({
		baseUrl: PROJECT_URL,
		fetch: async (input, init) => {
			const request = new Request(input, init);
			const text = await request.text();
			sent.push({
				body: text === '' ? undefined : JSON.parse(text),
				headers: Object.fromEntries(request.headers),
				method: request.method,
				url: request.url,
			});
			const next = responses[Math.min(sent.length - 1, responses.length - 1)];
			return next ? next() : Response.error();
		},
		secretKey: SECRET,
		...options,
	});
	return { inth, sent };
};

const KEYED = {
	authorization: `Bearer ${SECRET}`,
	'user-agent': `inth-node/${version}`,
};
const KEYED_JSON = { ...KEYED, 'content-type': 'application/json' };

const limited = () =>
	Response.json(
		{ code: 'RATE_LIMITED', error: 'Too Many Requests' },
		{ headers: { 'retry-after': '0', 'x-request-id': 'req_1' }, status: 429 }
	);
const TERMS_CHECKED = { terms_us: { accepted: true, acceptedLatest: true } };
const checked = () => Response.json({ documents: TERMS_CHECKED });
/** The call the tests of retries and limits make */
const checkTerms = (inth: Inth, options?: InthRequestOptions) =>
	inth.documents.check({ externalId: 'user_7', types: ['terms_us'] }, options);

describe('what each call sends', () => {
	it.each([UUID, 'sub_2bVfLq8pZ3kXn'])(
		'links subject %s to a user on the /v1 link route',
		async (subjectId) => {
			const { inth, sent } = stubbed([
				() =>
					Response.json({
						externalId: 'user_1',
						subjectId: UUID,
						verifiedBy: 'secret_key',
					}),
			]);

			const linked = await inth.users.identify({
				externalId: 'user_1',
				provider: 'workos',
				subjectId,
			});

			assert.deepStrictEqual(sent, [
				{
					body: { externalId: 'user_1', identityProvider: 'workos' },
					headers: KEYED_JSON,
					method: 'POST',
					url: `${PROJECT_URL}/v1/subjects/${subjectId}/link`,
				},
			]);
			// A c15t id is answered with the subject's UUID
			assert.deepStrictEqual(linked, {
				data: {
					externalId: 'user_1',
					subjectId: UUID,
					verifiedBy: 'secret_key',
				},
				error: null,
			});
		}
	);

	it('checks document acceptances on the /v1 route', async () => {
		const { inth, sent } = stubbed([
			() =>
				Response.json({
					documents: {
						privacy_policy: { accepted: true, acceptedLatest: false },
						terms_us: { accepted: false, acceptedLatest: false },
					},
				}),
		]);

		const outcome = await inth.documents.check({
			externalId: 'user 1',
			types: ['privacy_policy', 'terms_us'],
		});

		assert.deepStrictEqual(sent, [
			{
				body: undefined,
				headers: KEYED,
				method: 'GET',
				url: `${PROJECT_URL}/v1/documents/check?externalId=user+1&types=privacy_policy%2Cterms_us`,
			},
		]);
		assert.deepStrictEqual(outcome.data, {
			privacy_policy: { accepted: true, acceptedLatest: false },
			terms_us: { accepted: false, acceptedLatest: false },
		});
	});

	it('checks consent on the /v1 check route, for one property or for all', async () => {
		const { inth, sent } = stubbed([
			() => Response.json({ categories: { marketing: false } }),
			() => Response.json({ categories: {} }),
		]);

		const everywhere = await inth.consents.check({ externalId: 'user 1' });
		await inth.consents.check({
			externalId: 'user 1',
			property: 'com.example.app',
		});

		assert.deepStrictEqual(
			sent.map((request) => request.url),
			[
				`${PROJECT_URL}/v1/consent/check?externalId=user+1`,
				`${PROJECT_URL}/v1/consent/check?externalId=user+1&property=com.example.app`,
			]
		);
		assert.deepStrictEqual(sent[0]?.headers, KEYED);
		assert.deepStrictEqual(everywhere, {
			data: { marketing: false },
			error: null,
		});
	});

	it('mints an identity token on the /v1 route', async () => {
		const { inth, sent } = stubbed([
			() =>
				Response.json({
					expiresAt: '2026-11-18T01:00:00.000Z',
					token: 'token_1',
				}),
		]);

		await inth.users.createIdentityToken({ externalId: 'user_1' });

		assert.deepStrictEqual(sent, [
			{
				body: { externalId: 'user_1' },
				headers: KEYED_JSON,
				method: 'POST',
				url: `${PROJECT_URL}/v1/subjects/identity-tokens`,
			},
		]);
	});

	it('sends the key on exactly the routes the API document secures', async () => {
		const { inth, sent } = stubbed([() => Response.json({})]);
		await inth.users.identify({ externalId: 'user_1', subjectId: UUID });
		await inth.users.createIdentityToken({ externalId: 'user_1' });
		await inth.documents.check({ externalId: 'user_1', types: ['terms_us'] });
		await inth.consents.check({ externalId: 'user_1' });
		await inth.documents.publish({
			effectiveDate: '2026-11-18',
			hash: `sha256:${'0'.repeat(64)}`,
			type: 'terms_us',
			version: '1',
		});
		await inth.documents.current({ type: 'terms_us' });
		await inth.documents.accept({
			acceptances: [{ hash: TERMS_HASH, type: 'terms_us' }],
			context: { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' },
			externalId: 'user_1',
		});

		const paths = Object.entries(
			v.parse(
				v.record(
					v.string(),
					v.record(
						v.string(),
						v.looseObject({ security: v.optional(v.array(v.unknown())) })
					)
				),
				document.paths
			)
		);
		assert.strictEqual(sent.length, 7);
		for (const request of sent) {
			const { pathname } = new URL(request.url);
			const [, operations] =
				paths.find(([path]) =>
					new RegExp(`^${path.replaceAll(/\{\w+\}/gu, '[^/]+')}$`, 'u').test(
						pathname
					)
				) ?? [];
			const security = operations?.[request.method.toLowerCase()]?.security;
			assert.isDefined(security, `${request.method} ${pathname}`);
			assert.strictEqual(
				'authorization' in request.headers,
				security.length > 0,
				`${request.method} ${pathname}`
			);
		}
	});

	it('calls the project URL it was given, without a trailing slash', async () => {
		const { inth, sent } = stubbed([checked], { baseUrl: `${PROJECT_URL}/` });
		await checkTerms(inth);
		assert.strictEqual(
			sent[0]?.url,
			`${PROJECT_URL}/v1/documents/check?externalId=user_7&types=terms_us`
		);
	});
});

describe('a /v1 refusal', () => {
	const refusedWith =
		(status: number, code: string, headers: Record<string, string> = {}) =>
		() =>
			Response.json(
				{ error: { code, message: `Refused: ${code}` }, requestId: 'req_body' },
				{ headers, status }
			);

	it.each([
		{ code: 'invalid_request', expected: 'invalid_request', status: 400 },
		{ code: 'invalid_request', expected: 'invalid_request', status: 422 },
		{ code: 'unauthorized', expected: 'unauthorized', status: 401 },
		{ code: 'identity_token_invalid', expected: 'unauthorized', status: 401 },
		{ code: 'forbidden', expected: 'forbidden', status: 403 },
		{ code: 'not_found', expected: 'not_found', status: 404 },
		{ code: 'identity_conflict', expected: 'conflict', status: 409 },
		{ code: 'document_unknown', expected: 'conflict', status: 409 },
		{ code: 'payload_too_large', expected: 'invalid_request', status: 413 },
		{ code: 'rate_limited', expected: 'rate_limited', status: 429 },
		{ code: 'server_error', expected: 'server_error', status: 500 },
		{ code: 'bad_gateway', expected: 'server_error', status: 502 },
		{ code: 'gateway_timeout', expected: 'server_error', status: 504 },
	])(
		'$status $code is $expected, with its code, message and request id',
		async ({ code, expected, status }) => {
			const { inth } = stubbed([refusedWith(status, code)], {
				maxRetries: 0,
			});

			const refused = await inth.users.identify({
				externalId: 'user_1',
				subjectId: UUID,
			});

			assert.strictEqual(refused.data, null);
			assert.deepStrictEqual(
				{
					apiCode: refused.error?.apiCode,
					code: refused.error?.code,
					message: refused.error?.message,
					requestId: refused.error?.requestId,
					status: refused.error?.status,
				},
				{
					apiCode: code,
					code: expected,
					message: `Refused: ${code}`,
					requestId: 'req_body',
					status,
				}
			);
		}
	);

	it('keeps the refusal it can read when one field has an unexpected type', async () => {
		const { inth } = stubbed([
			() =>
				Response.json(
					{
						code: 400,
						error: {
							code: 'invalid_request',
							message: 'externalId is required',
						},
						requestId: 'req_body',
					},
					{ status: 400 }
				),
		]);
		const refused = await checkTerms(inth);
		assert.deepStrictEqual(
			{
				apiCode: refused.error?.apiCode,
				message: refused.error?.message,
				requestId: refused.error?.requestId,
			},
			{
				apiCode: 'invalid_request',
				message: 'externalId is required',
				requestId: 'req_body',
			}
		);
	});

	it('keeps the half of a nested refusal it can read', async () => {
		for (const [error, expected] of [
			[
				{ code: 404, message: 'No such document' },
				{ apiCode: undefined, message: 'No such document' },
			],
			[
				{ code: 'document_unknown', message: 7 },
				{ apiCode: 'document_unknown', message: 'The API answered 404' },
			],
		] as const) {
			const { inth } = stubbed([
				() => Response.json({ error, requestId: 'req_1' }, { status: 404 }),
			]);
			// oxlint-disable-next-line no-await-in-loop -- One stubbed client at a time
			const refused = await checkTerms(inth);
			assert.deepStrictEqual(
				{ apiCode: refused.error?.apiCode, message: refused.error?.message },
				expected
			);
		}
	});

	it('takes the request id from the header when there is one', async () => {
		const { inth } = stubbed([
			refusedWith(404, 'not_found', { 'x-request-id': 'req_header' }),
		]);
		const refused = await inth.documents.check({
			externalId: 'user_1',
			types: ['privacy_policy'],
		});
		assert.strictEqual(refused.error?.requestId, 'req_header');
	});
});

describe('retries and limits', () => {
	it('tries a rate-limited request again, and answers once it gets through', async () => {
		const { inth, sent } = stubbed([limited, limited, checked]);
		assert.deepStrictEqual(await checkTerms(inth), {
			data: TERMS_CHECKED,
			error: null,
		});
		assert.strictEqual(sent.length, 3);
	});

	it('gives up after its retries, with the code at the top of the refusal', async () => {
		const { inth, sent } = stubbed([limited]);
		const refused = await checkTerms(inth, { maxRetries: 1 });
		assert.deepStrictEqual(
			{
				apiCode: refused.error?.apiCode,
				code: refused.error?.code,
				requestId: refused.error?.requestId,
			},
			{ apiCode: 'RATE_LIMITED', code: 'rate_limited', requestId: 'req_1' }
		);
		assert.strictEqual(sent.length, 2);
	});

	it('tries again after a proxy times out with 408', async () => {
		const { inth, sent } = stubbed([
			() => new Response('Request Timeout', { status: 408 }),
			() =>
				Response.json({
					documents: { terms_us: { accepted: true, acceptedLatest: true } },
				}),
		]);
		const outcome = await inth.documents.check({
			externalId: 'user_1',
			types: ['terms_us'],
		});
		assert.strictEqual(sent.length, 2);
		assert.isNull(outcome.error);
	});

	it('reports an edge challenge as rate limited, and does not add to the burst', async () => {
		const challenge = () =>
			new Response('<title>Vercel Security Checkpoint</title>', {
				headers: {
					'content-type': 'text/html',
					'x-vercel-mitigated': 'challenge',
				},
				status: 403,
			});
		const { inth, sent } = stubbed([challenge, challenge, challenge]);
		const outcome = await inth.documents.check({
			externalId: 'user_1',
			types: ['terms_us'],
		});
		assert.strictEqual(sent.length, 1);
		assert.strictEqual(outcome.error?.code, 'rate_limited');
		assert.strictEqual(outcome.error?.status, 403);
	});

	it('does not retry a challenge whose page fails to arrive', async () => {
		const challenge = () =>
			new Response(
				new ReadableStream({
					start: (controller) => controller.error(new Error('reset')),
				}),
				{ headers: { 'x-vercel-mitigated': 'challenge' }, status: 403 }
			);
		const { inth, sent } = stubbed([challenge, challenge, challenge]);
		const outcome = await inth.documents.check({
			externalId: 'user_1',
			types: ['terms_us'],
		});
		assert.strictEqual(sent.length, 1);
		assert.strictEqual(outcome.error?.code, 'rate_limited');
	});

	it('reports an edge deny as a refusal, not as a limit to wait out', async () => {
		const { inth, sent } = stubbed([
			() =>
				new Response('Forbidden', {
					headers: { 'x-vercel-mitigated': 'deny' },
					status: 403,
				}),
		]);
		const outcome = await inth.documents.check({
			externalId: 'user_1',
			types: ['terms_us'],
		});
		assert.strictEqual(sent.length, 1);
		assert.strictEqual(outcome.error?.code, 'forbidden');
	});

	it('does not try a refused request again', async () => {
		const { inth, sent } = stubbed([
			() => Response.json({ message: 'Unauthorized' }, { status: 401 }),
		]);
		const refused = await checkTerms(inth);
		assert.strictEqual(refused.error?.code, 'unauthorized');
		assert.strictEqual(sent.length, 1);
	});

	it('returns the refusal at once when the API asks for a longer wait than it makes', async () => {
		const { inth, sent } = stubbed([
			() =>
				Response.json(
					{ code: 'RATE_LIMITED' },
					{ headers: { 'retry-after': '60' }, status: 429 }
				),
			checked,
		]);
		const refused = await checkTerms(inth);
		assert.strictEqual(refused.error?.code, 'rate_limited');
		assert.strictEqual(sent.length, 1);
	});

	it('reports a body that stalls as a timeout, and tries again', async () => {
		let calls = 0;
		const inth = new Inth({
			baseUrl: PROJECT_URL,
			fetch: (_url, init) => {
				calls += 1;
				const signal = init?.signal;
				// Headers arrive, then the body never does
				const body = new ReadableStream({
					start: (controller) => {
						signal?.addEventListener('abort', () =>
							controller.error(signal.reason)
						);
					},
				});
				return Promise.resolve(
					new Response(body, {
						headers: { 'content-type': 'application/json' },
					})
				);
			},
			maxRetries: 1,
			secretKey: SECRET,
			timeout: 20,
		});
		const stalled = await checkTerms(inth);
		assert.strictEqual(stalled.error?.code, 'timeout');
		assert.strictEqual(calls, 2);
	});

	it('reports an answer cut off mid-body as a network failure, and tries again', async () => {
		let calls = 0;
		const inth = new Inth({
			baseUrl: PROJECT_URL,
			fetch: () => {
				calls += 1;
				const body = new ReadableStream({
					start: (controller) => {
						controller.error(new TypeError('terminated'));
					},
				});
				return Promise.resolve(new Response(body));
			},
			maxRetries: 1,
			secretKey: SECRET,
		});
		const cut = await checkTerms(inth);
		assert.strictEqual(cut.error?.code, 'network_error');
		assert.strictEqual(calls, 2);
	});

	it.each([
		{ maxRetries: Number.POSITIVE_INFINITY },
		{ maxRetries: Number.NaN },
		{ timeout: -1 },
		{ timeout: Number.NaN },
	])(
		'answers a call given %o with an error, and sends nothing',
		async (limits) => {
			const { inth, sent } = stubbed([limited]);
			const refused = await checkTerms(inth, limits);
			assert.strictEqual(refused.error?.code, 'invalid_request');
			assert.strictEqual(sent.length, 0);
		}
	);

	it('takes only a timeout that a timer can wait out', async () => {
		for (const timeout of [1.5, 0, 2 ** 31]) {
			assert.throws(
				() => new Inth({ baseUrl: PROJECT_URL, secretKey: SECRET, timeout }),
				/whole number of milliseconds/u
			);
		}
		const { inth, sent } = stubbed([checked]);
		const refused = await checkTerms(inth, { timeout: 1.5 });
		assert.strictEqual(refused.error?.code, 'invalid_request');
		assert.strictEqual(sent.length, 0);
	});

	it('reports a redirect instead of following it with the key', async () => {
		const redirects: string[] = [];
		const inth = new Inth({
			baseUrl: PROJECT_URL,
			fetch: (input, init) => {
				redirects.push(new Request(input, init).redirect);
				return Promise.resolve(
					new Response(null, {
						headers: { location: 'https://elsewhere.example/v1' },
						status: 307,
					})
				);
			},
			secretKey: SECRET,
		});
		const redirected = await checkTerms(inth);
		assert.deepStrictEqual(redirects, ['manual']);
		assert.strictEqual(redirected.error?.code, 'unexpected_response');
		assert.strictEqual(redirected.error?.status, 307);
		assert.match(redirected.error?.message ?? '', /elsewhere\.example/u);
	});

	it('returns an edge challenge whose body never finishes cancelling', async () => {
		const { inth } = stubbed([
			() =>
				new Response(
					new ReadableStream({
						cancel: () =>
							new Promise<void>(() => {
								// Never settles
							}),
					}),
					{ headers: { 'x-vercel-mitigated': 'challenge' }, status: 403 }
				),
		]);
		const challenged = await checkTerms(inth, { timeout: 1000 });
		assert.strictEqual(challenged.error?.code, 'rate_limited');
	});

	it('reports a timeout as one, whatever error fetch rejects with', async () => {
		const inth = new Inth({
			baseUrl: PROJECT_URL,
			// Rejects with a plain AbortError once the signal fires, as some
			// fetch implementations do in place of a TimeoutError
			fetch: (_input, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () =>
						reject(new DOMException('The operation was aborted', 'AbortError'))
					);
				}),
			maxRetries: 0,
			secretKey: SECRET,
			timeout: 10,
		});
		const timedOut = await checkTerms(inth);
		assert.strictEqual(timedOut.error?.code, 'timeout');
	});

	it('stops when the caller cancels', async () => {
		const { inth, sent } = stubbed([checked]);
		const cancelled = await checkTerms(inth, { signal: AbortSignal.abort() });
		assert.strictEqual(cancelled.error?.code, 'aborted');
		assert.strictEqual(sent.length, 0);
	});
});

describe('answers it cannot use', () => {
	it('reports an answer that leaves out a type that was asked for', async () => {
		const { inth } = stubbed([() => Response.json({ documents: {} })]);
		const answer = await inth.documents.check({
			externalId: 'user_7',
			types: ['privacy_policy'],
		});
		assert.strictEqual(answer.error?.code, 'unexpected_response');
	});

	it('reports a link answer that names no subject', async () => {
		const { inth } = stubbed([() => Response.json({ externalId: 'user_1' })]);
		const answer = await inth.users.identify({
			externalId: 'user_1',
			subjectId: UUID,
		});
		assert.strictEqual(answer.error?.code, 'unexpected_response');
	});
});

it('cannot be made with a project URL it cannot use', () => {
	const make = (baseUrl: string) => () =>
		new Inth({ baseUrl, secretKey: SECRET });
	// No scheme: fetch would refuse every call, so the constructor does
	assert.throws(make('your-project.inth.app'), /full URL/u);
	// The key must not cross a network in the clear
	assert.throws(make('http://your-project.inth.app'), /https/u);
	assert.throws(make('ftp://your-project.inth.app'), /https/u);
	// Each route is added to the end, where a query or fragment would hide it
	for (const swallowing of [
		'https://your-project.inth.app/?region=eu',
		'https://your-project.inth.app?',
		'https://your-project.inth.app/#top',
	]) {
		assert.throws(make(swallowing), /query or a fragment/u);
	}
	assert.throws(
		make('https://user:pass@your-project.inth.app'),
		/user name or password/u
	);
	for (const local of [
		'http://localhost:8787',
		'http://127.0.0.1:3000',
		'http://[::1]:3000',
		'http://my-project.localhost:3000',
	]) {
		// Called directly: a throw fails the test, naming the URL
		make(local)();
	}
});

it('cannot be made without a key or a project URL', () => {
	assert.throws(() => new Inth({ baseUrl: PROJECT_URL, secretKey: ' ' }));
	assert.throws(() => new Inth({ baseUrl: ' ', secretKey: SECRET }));
	// Pasted with a line break inside
	assert.throws(
		() => new Inth({ baseUrl: PROJECT_URL, secretKey: 'inth_prj_\ntest' })
	);
});

describe('documents', () => {
	const HASH =
		'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
	const DOCUMENT = {
		effectiveDate: '2026-11-18T00:00:00.000Z',
		hash: HASH,
		requiresAcceptance: true,
		type: 'terms_us',
		version: '2026-11-18',
	};
	/** A recorded acceptance of each of `types` */
	const acceptedFor =
		(...types: string[]) =>
		() =>
			Response.json({
				acceptances: types.map((type) => ({
					acceptedAt: 1763467200000,
					// The hash each type is sent with below
					hash: type === 'privacy_policy' ? PRIVACY_HASH : TERMS_HASH,
					type,
					version: '2026-11-18',
				})),
				subjectId: UUID,
			});
	const ACCEPTED = acceptedFor('terms_us');
	const ACCEPTANCE = {
		acceptances: [{ hash: TERMS_HASH, type: 'terms_us' }],
		acceptedAt: 1763467200000,
		context: { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' },
		externalId: 'user_123',
	};
	const UUID_TEXT =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
	/** The idempotency key a recorded request sent */
	const keyOf = (sent: Sent | undefined) =>
		v.parse(v.object({ idempotencyKey: v.string() }), sent?.body)
			.idempotencyKey;

	describe('publish retries', () => {
		const PUBLISH = {
			effectiveDate: '2026-11-18T00:00:00.000Z',
			hash: HASH,
			type: 'terms_us',
			version: '2026-11-18',
		};
		const publishedOk = () =>
			Response.json({ document: { ...DOCUMENT, id: 'doc_1' } });

		it('never tries a publish again, which a newer one may have followed', async () => {
			for (const failure of [
				() => new Response('Gateway Timeout', { status: 504 }),
				limited,
			]) {
				const { inth, sent } = stubbed([failure, publishedOk]);
				// oxlint-disable-next-line no-await-in-loop -- One stubbed client at a time
				const published = await inth.documents.publish(PUBLISH);
				assert.isNotNull(published.error);
				assert.strictEqual(sent.length, 1);
			}
		});
	});

	it('publishes a version on the /v1 route', async () => {
		const { inth, sent } = stubbed([
			() =>
				Response.json({
					document: { ...DOCUMENT, id: 'doc_1' },
				}),
		]);

		const published = await inth.documents.publish({
			effectiveDate: '2026-11-18T00:00:00.000Z',
			hash: HASH,
			requiresAcceptance: false,
			type: 'terms_us',
			version: '2026-11-18',
		});

		assert.deepStrictEqual(sent, [
			{
				body: {
					effectiveDate: '2026-11-18T00:00:00.000Z',
					hash: HASH,
					requiresAcceptance: false,
					version: '2026-11-18',
				},
				headers: KEYED_JSON,
				method: 'PUT',
				url: `${PROJECT_URL}/v1/documents/terms_us/current`,
			},
		]);
		assert.deepStrictEqual(published, {
			data: { ...DOCUMENT, id: 'doc_1' },
			error: null,
		});
	});

	it('reads the version in force on the /v1 route, without the key', async () => {
		const answer = { document: { ...DOCUMENT, id: 'doc_1' } };
		const { inth, sent } = stubbed([() => Response.json(answer)]);

		const current = await inth.documents.current({ type: 'terms_us' });

		// The route needs no key, so it is not sent
		assert.deepStrictEqual(sent, [
			{
				body: undefined,
				headers: { 'user-agent': KEYED['user-agent'] },
				method: 'GET',
				url: `${PROJECT_URL}/v1/documents/terms_us/current`,
			},
		]);
		assert.deepStrictEqual(current, { data: answer, error: null });
	});

	it("records acceptances for a person, with the visitor's context", async () => {
		const { inth, sent } = stubbed([acceptedFor('terms_us', 'privacy_policy')]);

		const accepted = await inth.documents.accept({
			...ACCEPTANCE,
			acceptances: [
				{ hash: TERMS_HASH, type: 'terms_us' },
				{ hash: PRIVACY_HASH, type: 'privacy_policy' },
			],
			property: 'www.example.com',
		});

		const key = keyOf(sent[0]);
		assert.match(String(key), UUID_TEXT);
		assert.deepStrictEqual(sent, [
			{
				body: {
					acceptances: [
						{ hash: TERMS_HASH, type: 'terms_us' },
						{ hash: PRIVACY_HASH, type: 'privacy_policy' },
					],
					acceptedAt: 1763467200000,
					context: { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' },
					externalId: 'user_123',
					idempotencyKey: key,
					property: 'www.example.com',
				},
				headers: KEYED_JSON,
				method: 'POST',
				url: `${PROJECT_URL}/v1/documents/acceptances`,
			},
		]);
		assert.deepStrictEqual(
			accepted.data?.acceptances.map(({ type }) => type),
			['terms_us', 'privacy_policy']
		);
	});

	it('reports a success that leaves out a document that was sent, with its request id', async () => {
		const { inth } = stubbed([
			() =>
				Response.json(
					{
						acceptances: [
							{
								acceptedAt: 1763467200000,
								hash: HASH,
								type: 'terms_us',
								version: '2026-11-18',
							},
						],
						subjectId: UUID,
					},
					{ headers: { 'x-request-id': 'req_partial' } }
				),
		]);

		const accepted = await inth.documents.accept({
			...ACCEPTANCE,
			acceptances: [
				{ hash: TERMS_HASH, type: 'terms_us' },
				{ hash: PRIVACY_HASH, type: 'privacy_policy' },
			],
		});

		assert.deepStrictEqual(
			{
				code: accepted.error?.code,
				requestId: accepted.error?.requestId,
				status: accepted.error?.status,
			},
			{ code: 'unexpected_response', requestId: 'req_partial', status: 200 }
		);
	});

	it('reports a receipt for another release of the type sent', async () => {
		const { inth } = stubbed([
			() =>
				Response.json({
					acceptances: [
						{
							acceptedAt: 1763467200000,
							hash: `sha256:${'c'.repeat(64)}`,
							type: 'terms_us',
							version: '2026-01-01',
						},
					],
					subjectId: UUID,
				}),
		]);
		const accepted = await inth.documents.accept(ACCEPTANCE);
		assert.strictEqual(accepted.error?.code, 'unexpected_response');
	});

	it('refuses a query value no URL can carry, rather than ask about another', async () => {
		const { inth, sent } = stubbed([checked]);
		const consent = await inth.consents.check({ externalId: 'user_\uD800' });
		const documents = await inth.documents.check({
			externalId: 'user_\uD800',
			types: ['terms_us'],
		});
		assert.strictEqual(consent.error?.code, 'invalid_request');
		assert.strictEqual(documents.error?.code, 'invalid_request');
		assert.strictEqual(sent.length, 0);
	});

	it('refuses a subject id no URL can carry, without sending it', async () => {
		const { inth, sent } = stubbed([checked]);
		const linked = await inth.users.identify({
			externalId: 'user_1',
			subjectId: 'sub_\uD800',
		});
		assert.strictEqual(linked.error?.code, 'invalid_request');
		assert.strictEqual(sent.length, 0);
	});

	it('records acceptances for a device by its subject id alone', async () => {
		const { inth, sent } = stubbed([ACCEPTED]);

		await inth.documents.accept({
			acceptances: ACCEPTANCE.acceptances,
			acceptedAt: ACCEPTANCE.acceptedAt,
			context: {},
			subjectId: 'sub_2bVfLq8pZ3kXn',
		});

		assert.deepStrictEqual(sent[0]?.body, {
			acceptances: ACCEPTANCE.acceptances,
			acceptedAt: ACCEPTANCE.acceptedAt,
			context: {},
			idempotencyKey: keyOf(sent[0]),
			subjectId: 'sub_2bVfLq8pZ3kXn',
		});
	});

	it('sends one idempotency key and time on each retry of a call', async () => {
		const { inth, sent } = stubbed([
			() =>
				Response.json(
					{
						error: { code: 'bad_gateway', message: 'Bad gateway' },
						requestId: 'req_1',
					},
					{ headers: { 'retry-after': '0' }, status: 502 }
				),
			ACCEPTED,
		]);

		const { acceptedAt: _, ...withoutTime } = ACCEPTANCE;
		const accepted = await inth.documents.accept(withoutTime);

		assert.strictEqual(accepted.error, null);
		assert.strictEqual(sent.length, 2);
		assert.match(String(keyOf(sent[0])), UUID_TEXT);
		assert.deepStrictEqual(sent[1]?.body, sent[0]?.body);
	});

	it('makes a new idempotency key for each call, unless given one', async () => {
		const { inth, sent } = stubbed([ACCEPTED]);

		await inth.documents.accept(ACCEPTANCE);
		await inth.documents.accept(ACCEPTANCE);
		await inth.documents.accept({ ...ACCEPTANCE, idempotencyKey: UUID });
		await inth.documents.accept({ ...ACCEPTANCE, idempotencyKey: UUID });

		const keys = sent.map(keyOf);
		assert.notStrictEqual(keys[0], keys[1]);
		assert.deepStrictEqual(keys.slice(2), [UUID, UUID]);
	});
});

describe('hashDocument', () => {
	it.each([
		{
			bytes: '',
			hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
		},
		{
			bytes: 'test',
			hash: 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
		},
	])('hashes "$bytes" to $hash', async ({ bytes, hash }) => {
		const encoded = new TextEncoder().encode(bytes);
		assert.strictEqual(await hashDocument(encoded), hash);
		assert.strictEqual(await hashDocument(encoded.buffer), hash);
	});

	it('refuses text, which has no single byte form', () => {
		assert.throws(
			// @ts-expect-error -- A caller without types may pass readFile(path, 'utf8')
			() => hashDocument('Terms of service'),
			TypeError
		);
	});

	it('reads bytes made in another realm, and any view of them', async () => {
		const vector =
			'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
		const elsewhere: unknown = runInNewContext(
			'new Uint8Array([116, 101, 115, 116])'
		);
		assert.isTrue(ArrayBuffer.isView(elsewhere));
		if (ArrayBuffer.isView(elsewhere)) {
			assert.strictEqual(await hashDocument(elsewhere), vector);
		}
		// `test` in the middle of a larger buffer
		const padded = new TextEncoder().encode('xtesty');
		assert.strictEqual(
			await hashDocument(new DataView(padded.buffer, 1, 4)),
			vector
		);
		const shared = new SharedArrayBuffer(4);
		new Uint8Array(shared).set(new TextEncoder().encode('test'));
		assert.strictEqual(await hashDocument(shared), vector);
	});

	it('hashes the bytes as they are, line endings included', async () => {
		const encode = (text: string) => new TextEncoder().encode(text);
		assert.notStrictEqual(
			await hashDocument(encode('Terms\r\n')),
			await hashDocument(encode('Terms\n'))
		);
	});
});
