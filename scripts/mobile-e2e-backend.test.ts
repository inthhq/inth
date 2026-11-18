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
		await expect(fetch(`${url}/api/self-host/init`)).rejects.toThrow();
		const frozenBody = '{ "consentAction" : "necessary", "choice" : {} }';
		await expect(
			fetch(`${url}/api/self-host/subjects`, {
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
			(await (await fetch(`${url}/api/self-host/init`)).json()).policyResolution
				.status
		).toBe('matched');
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
		await expect(fetch(`${url}/api/self-host/init`)).rejects.toThrow();
		expect((await (await fetch(`${url}/e2e/state`)).json()).saves).toEqual([]);
	} finally {
		process.kill();
		await rm(out, { force: true, recursive: true });
	}
});
