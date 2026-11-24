import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vite-plus/test';

const committed = resolve(
	import.meta.dirname,
	'../packages/native-protocol/iab'
);
const fixtureFiles = (directory: string) =>
	readdirSync(directory)
		.filter((file) => file.startsWith('banner-summary-'))
		.sort();

it('keeps the native banner summary fixtures in step with the web function', () => {
	const directory = mkdtempSync(join(tmpdir(), 'inth-banner-summary-'));
	try {
		const result = spawnSync(
			'bun',
			[
				resolve(import.meta.dirname, 'generate-iab-banner-summary-fixtures.ts'),
				directory,
			],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(fixtureFiles(directory)).toEqual(fixtureFiles(committed));
		for (const file of fixtureFiles(directory)) {
			expect(
				JSON.parse(readFileSync(join(directory, file), 'utf8')),
				file
			).toEqual(JSON.parse(readFileSync(join(committed, file), 'utf8')));
		}
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
