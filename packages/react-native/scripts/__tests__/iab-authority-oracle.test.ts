import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vite-plus/test';

it('reproduces independent IAB authority bytes with the pinned reference codec', () => {
	const directory = mkdtempSync(join(tmpdir(), 'inth-iab-oracle-'));
	try {
		const output = join(directory, 'oracle.json');
		const generator = resolve(
			import.meta.dirname,
			'../generate-iab-authority-oracle.mjs'
		);
		const result = spawnSync('bun', [generator, output], { encoding: 'utf8' });
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(
			JSON.parse(
				readFileSync(
					resolve(
						import.meta.dirname,
						'../../../native-protocol/iab/authority-oracle.json'
					),
					'utf8'
				)
			)
		);
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
