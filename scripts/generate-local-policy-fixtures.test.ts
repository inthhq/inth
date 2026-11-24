import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vite-plus/test';

const committed = resolve(
	import.meta.dirname,
	'../packages/native-protocol/local-policy/parity.json'
);

it('keeps the native in-code policy fixture in step with the backend normalizer', () => {
	const directory = mkdtempSync(join(tmpdir(), 'inth-local-policy-'));
	try {
		const result = spawnSync(
			'bun',
			[
				resolve(import.meta.dirname, 'generate-local-policy-fixtures.ts'),
				directory,
			],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(
			JSON.parse(readFileSync(join(directory, 'parity.json'), 'utf8'))
		).toEqual(JSON.parse(readFileSync(committed, 'utf8')));
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
