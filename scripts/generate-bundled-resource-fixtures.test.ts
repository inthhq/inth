import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vitest';

const committed = resolve(
	import.meta.dirname,
	'../packages/native-protocol/bundled-policy/invalid-resources.json'
);

it('keeps the malformed bundled-resource fixture in step with its generator', () => {
	const directory = mkdtempSync(join(tmpdir(), 'c15t-invalid-resources-'));
	try {
		const result = spawnSync(
			'bun',
			[
				resolve(import.meta.dirname, 'generate-bundled-resource-fixtures.ts'),
				directory,
			],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(
			JSON.parse(
				readFileSync(join(directory, 'invalid-resources.json'), 'utf8')
			)
		).toEqual(JSON.parse(readFileSync(committed, 'utf8')));
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
