import { describe, expect, test, vi } from 'vitest';

import { InthApiError, isInthApiError, readInthApiError } from '../error';
import { json } from './fixtures';

describe('readInthApiError', () => {
	test('reads the code, message, details and request ID from the body', async () => {
		const error = await readInthApiError(
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
		const error = await readInthApiError(
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
			const pending = readInthApiError(
				'Inth',
				new Response(body, { status: 502 })
			);
			await vi.advanceTimersByTimeAsync(2000);
			const error = await pending;

			expect(error).toMatchObject({ code: 'bad_gateway', status: 502 });
			expect(cancel).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	test('keeps a code added after this client', async () => {
		const error = await readInthApiError(
			'Inth',
			json(409, { error: { code: 'new_code', message: 'm' }, requestId: 'r' })
		);

		expect(error.code).toBe('new_code');
	});

	test('reads Retry-After on a 429', async () => {
		const error = await readInthApiError(
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
