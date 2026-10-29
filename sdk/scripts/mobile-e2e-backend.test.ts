import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { it, expect } from 'vitest';

it('keeps observer routes reachable while the consent backend is unavailable', async () => {
	const out = await mkdtemp(join(tmpdir(), 'c15t-backend-'));
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
