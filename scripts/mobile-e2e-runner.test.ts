import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vite-plus/test';

it.each([
	['OK (1 test)\nINSTRUMENTATION_CODE: -1', 0],
	['FAILURES!!!\nTests run: 1, Failures: 1\nINSTRUMENTATION_CODE: -1', 1],
	['INSTRUMENTATION_FAILED: Process crashed.\nINSTRUMENTATION_CODE: 0', 1],
])('preserves the actual Android runner result for %s', async (log, exit) => {
	const out = await mkdtemp(join(tmpdir(), 'inth-android-result-'));
	try {
		const input = join(out, 'test.log');
		const report = join(out, 'result.xml');
		await writeFile(input, log);
		const result = spawnSync('python3', [
			new URL(
				'../internals/fixtures/react-native-bare/scripts/android-instrumentation-result.py',
				import.meta.url
			).pathname,
			input,
			report,
		]);
		expect(result.status).toBe(exit);
		const xml = await readFile(report, 'utf8');
		expect(xml).toContain(`failures="${exit}"`);
		expect(xml).toContain('consentJourney');
	} finally {
		await rm(out, { force: true, recursive: true });
	}
});
