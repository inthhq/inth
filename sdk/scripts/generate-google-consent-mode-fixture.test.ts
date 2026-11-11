import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vitest';

const FILE = 'consent-mode-v2.json';
const committed = resolve(
	import.meta.dirname,
	'../native/protocol/google-consent-mode',
	FILE
);

it('keeps the native Consent Mode fixture in step with the web mapping', () => {
	const directory = mkdtempSync(join(tmpdir(), 'c15t-consent-mode-'));
	try {
		const result = spawnSync(
			'bun',
			[
				resolve(import.meta.dirname, 'generate-google-consent-mode-fixture.ts'),
				directory,
			],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(readFileSync(join(directory, FILE), 'utf8'))).toEqual(
			JSON.parse(readFileSync(committed, 'utf8'))
		);
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
