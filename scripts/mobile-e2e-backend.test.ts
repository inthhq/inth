import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { it, expect } from 'vitest';

it('keeps observer routes reachable while the consent backend is unavailable', async () => {
	const out = await mkdtemp(join(tmpdir(), 'inth-backend-'));
	const process = spawn(
		'python3',
		[
			new URL(
				'../internals/fixtures/react-native-bare/scripts/e2e-backend.py',
				import.meta.url
			).pathname,
			'--port',
			'0',
			'--out',
			out,
		],
		{ stdio: 'ignore' }
	);
	try {
		await expect
			.poll(
				() => readFile(join(out, 'backend-ready'), 'utf8').catch(() => ''),
				{ timeout: 3000 }
			)
			.not.toBe('');
		const port = await readFile(join(out, 'backend-ready'), 'utf8');
		const url = `http://127.0.0.1:${port}`;
		expect((await (await fetch(`${url}/e2e/state`)).json()).backendOnline).toBe(
			false
		);
		await expect(
			fetch(`${url}/api/self-host/v1/consent/init`)
		).rejects.toThrow();
		const frozenBody =
			'{ "consentAction" : "necessary", "answer" : { "categories" : {} } }';
		await expect(
			fetch(`${url}/api/self-host/v1/consent/records`, {
				body: frozenBody,
				method: 'POST',
			})
		).rejects.toThrow();
		const [attempt] = (
			await readFile(join(out, 'delivery-attempts.jsonl'), 'utf8')
		)
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(attempt).toMatchObject({
			body: JSON.parse(frozenBody),
			online: false,
			rawHex: Buffer.from(frozenBody).toString('hex'),
		});

		expect(
			(
				await fetch(`${url}/e2e/network`, {
					body: JSON.stringify({ online: true }),
					method: 'POST',
				})
			).ok
		).toBe(true);
		expect(
			(await (await fetch(`${url}/api/self-host/v1/consent/init`)).json())
				.policyResolution.status
		).toBe('matched');
		expect((await fetch(`${url}/api/self-host/init`)).status).toBe(404);
		expect((await (await fetch(`${url}/e2e/state`)).json()).saves).toEqual([]);
	} finally {
		process.kill();
		await rm(out, { force: true, recursive: true });
	}
});

it('exposes fixed expiry controls only in the expiry fixture', async () => {
	const out = await mkdtemp(join(tmpdir(), 'inth-expiry-backend-'));
	const process = spawn(
		'python3',
		[
			new URL(
				'../internals/fixtures/react-native-bare/scripts/e2e-backend.py',
				import.meta.url
			).pathname,
			'--port',
			'0',
			'--out',
			out,
			'--scenario',
			'expiry',
		],
		{ stdio: 'ignore' }
	);
	try {
		await expect
			.poll(
				() => readFile(join(out, 'backend-ready'), 'utf8').catch(() => ''),
				{ timeout: 3000 }
			)
			.not.toBe('');
		const url = `http://127.0.0.1:${await readFile(join(out, 'backend-ready'), 'utf8')}`;
		const initial = await (await fetch(`${url}/e2e/control`)).json();
		expect(initial).toMatchObject({
			expiresAt: 1793232001000,
			now: 1793232000000,
		});
		expect(initial.categories).toEqual([
			'necessary',
			'functionality',
			'experience',
			'measurement',
			'marketing',
		]);
		const narrowed = {
			categories: ['necessary', 'measurement'],
			now: initial.expiresAt,
		};
		await fetch(`${url}/e2e/control`, {
			body: JSON.stringify(narrowed),
			method: 'POST',
		});
		expect(await (await fetch(`${url}/e2e/control`)).json()).toEqual({
			...narrowed,
			expiresAt: initial.expiresAt,
		});
		await expect(
			fetch(`${url}/api/self-host/v1/consent/init`)
		).rejects.toThrow();
		expect((await (await fetch(`${url}/e2e/state`)).json()).saves).toEqual([]);
	} finally {
		process.kill();
		await rm(out, { force: true, recursive: true });
	}
});

it('records a /v1 body once per idempotency key, as the backend does', async () => {
	const out = await mkdtemp(join(tmpdir(), 'c15t-records-backend-'));
	const process = spawn(
		'python3',
		[
			new URL(
				'../internals/fixtures/react-native-bare/scripts/e2e-backend.py',
				import.meta.url
			).pathname,
			'--port',
			'0',
			'--out',
			out,
		],
		{ stdio: 'ignore' }
	);
	try {
		await expect
			.poll(
				() => readFile(join(out, 'backend-ready'), 'utf8').catch(() => ''),
				{ timeout: 3000 }
			)
			.not.toBe('');
		const url = `http://127.0.0.1:${await readFile(join(out, 'backend-ready'), 'utf8')}`;
		await fetch(`${url}/e2e/network`, {
			body: JSON.stringify({ online: true }),
			method: 'POST',
		});
		// The body both native cores send, pinned by the shared protocol fixture.
		const { body } = JSON.parse(
			await readFile(
				new URL(
					'../packages/native-protocol/save-body-explicit-partial.json',
					import.meta.url
				),
				'utf8'
			)
		).expected.request;
		const post = (payload: unknown) =>
			fetch(`${url}/api/self-host/v1/consent/records`, {
				body: JSON.stringify(payload),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			});

		const first = await post(body);
		expect(first.status).toBe(200);
		expect(first.headers.get('x-request-id')).toBeTruthy();
		const answer = await first.json();
		expect(answer).toEqual({
			recordId: expect.any(String),
			subjectId: body.subjectId,
		});
		expect(await (await post(body)).json()).toEqual(answer);

		const conflict = await post({ ...body, property: 'com.example.other' });
		expect(conflict.status).toBe(409);
		expect((await conflict.json()).error.code).toBe('conflict');

		const refused = await post({
			...body,
			answer: { categories: {} },
			idempotencyKey: '019c1c38-a400-7100-8000-0000000001ff',
		});
		expect(refused.status).toBe(400);
		expect((await refused.json()).error.code).toBe('invalid_request');

		const malformed = await post({
			...body,
			confirmed: [{}],
			idempotencyKey: '019c1c38-a400-7100-8000-0000000002ff',
		});
		expect(malformed.status).toBe(400);

		expect((await (await fetch(`${url}/e2e/state`)).json()).saves).toEqual([
			body,
		]);
	} finally {
		process.kill();
		await rm(out, { force: true, recursive: true });
	}
});
