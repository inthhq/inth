import { describe, expect, test, vi } from 'vite-plus/test';

import { loadStaticManifest } from '../../../server/static-manifest.api';
import { InthApiError, isInthApiError, readApiError } from '../inth-api-error';
import { json } from './fixtures';

describe('readApiError', () => {
	test('reads the code, message, details and request ID from the body', async () => {
		const error = await readApiError(
			'Inth: /v1/consent/records',
			json(
				422,
				{
					error: {
						code: 'invalid_request',
						details: {
							fieldErrors: { property: ['Required'] },
							formErrors: [],
						},
						message: 'Invalid body',
					},
					requestId: 'req_body',
				},
				{ 'x-request-id': 'req_header' }
			)
		);

		expect(error).toBeInstanceOf(InthApiError);
		expect(isInthApiError(error)).toBe(true);
		expect(error).toMatchObject({
			code: 'invalid_request',
			details: { fieldErrors: { property: ['Required'] }, formErrors: [] },
			requestId: 'req_body',
			status: 422,
		});
		expect(error.message).toBe(
			'Inth: /v1/consent/records responded 422: Invalid body (invalid_request, request req_body)'
		);
	});

	test('falls back to the header request ID and a code for the status', async () => {
		const error = await readApiError(
			'Inth',
			new Response('<html>Gateway Timeout</html>', {
				headers: { 'x-request-id': 'req_gateway' },
				status: 504,
			})
		);

		expect(error).toMatchObject({
			code: 'gateway_timeout',
			requestId: 'req_gateway',
			status: 504,
		});
	});

	test('cancels a body still open after two seconds and reads the status', async () => {
		vi.useFakeTimers();
		try {
			const cancel = vi.fn();
			const body = new ReadableStream<Uint8Array>({
				cancel,
				start(controller) {
					controller.enqueue(new TextEncoder().encode('{"error":'));
				},
			});
			const pending = readApiError('Inth', new Response(body, { status: 502 }));
			await vi.advanceTimersByTimeAsync(2000);
			const error = await pending;

			expect(error).toMatchObject({ code: 'bad_gateway', status: 502 });
			expect(cancel).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	/** A 2 MiB body sent 64 KiB at a time, counting what was read. */
	const largeBody = () => {
		const chunk = new Uint8Array(64 * 1024).fill(0x20);
		const state = { cancelled: false, pulled: 0 };
		const body = new ReadableStream<Uint8Array>({
			cancel() {
				state.cancelled = true;
			},
			pull(controller) {
				if (state.pulled === 32) {
					controller.close();
					return;
				}
				state.pulled += 1;
				controller.enqueue(chunk);
			},
		});
		return { body, state };
	};

	test('stops reading a body past 16 KiB and reads the status', async () => {
		const { body, state } = largeBody();

		const error = await readApiError(
			'Inth',
			new Response(body, { status: 502 })
		);

		expect(error).toMatchObject({ code: 'bad_gateway', status: 502 });
		expect(state.cancelled).toBe(true);
		expect(state.pulled).toBeLessThan(4);
	});

	test('the static manifest loader reads no more of a large failure', async () => {
		const { body, state } = largeBody();

		await expect(
			loadStaticManifest(
				{
					fetch: () => Promise.resolve(new Response(body, { status: 502 })),
					manifestUrl: 'https://consent.example.com/v1/consent/manifest',
				},
				'@inth/test'
			)
		).rejects.toMatchObject({ status: 502 });
		expect(state.cancelled).toBe(true);
		expect(state.pulled).toBeLessThan(4);
	});

	test('keeps a code added after this client', async () => {
		const error = await readApiError(
			'Inth',
			json(409, { error: { code: 'new_code', message: 'm' }, requestId: 'r' })
		);

		expect(error.code).toBe('new_code');
	});

	test('reads Retry-After on a 429', async () => {
		const error = await readApiError(
			'Inth',
			json(
				429,
				{
					error: { code: 'rate_limited', message: 'slow down' },
					requestId: 'r',
				},
				{ 'retry-after': '30' }
			)
		);

		expect(error).toMatchObject({ code: 'rate_limited', retryAfter: 30 });
	});
});
