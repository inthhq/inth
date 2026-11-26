// @vitest-environment node
/**
 * The sizes of `inth.manifests.js`, which a page with remote scripts
 * downloads beside `inth.js`, and of `inth.manifests3.js`, which it
 * downloads in its place when a manifest requires level 3. Each budget sits
 * just above the current size, so a change that grows a file has to raise
 * it on purpose.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { expect, it } from 'vite-plus/test';

/**
 * Gzipped bytes. `inth.manifests.js`: level 1 was 4,690, level 2 brought it
 * to 6,264, the checks on what a step calls and writes to 6,594, and level 3
 * to 6,665, since its steps build into `inth.manifests3.js` only. Refusing
 * prototype names in every name, removing tags nested steps insert on
 * dispose, and tying a promise to its load brought it to 6,793, and
 * `globals` to 9,267: about 1,400 for the list of platform globals no
 * manifest may declare, the rest for the root, native call and browser
 * object checks. Checking what a stub or a queued callback calls when
 * called, and which push an array call may use, brought it to 9,487, and
 * stopping a later-run list once its load ends, marking a refusal for
 * code not yet loaded, and `setGlobal.ifNullish`, to 9,583.
 * `inth.manifests3.js`, the same runtime with level 3: 8,986, then 9,126
 * with those and level 3's `requires` check, flag names and `lost` outside
 * a callback, 11,592 with `globals`, 11,630 with the `defer` step, 11,817
 * with the call-time checks, and 11,936 with the later-run, refusal and
 * `ifNullish` changes. Level 4 leaves them about there: the engine loads,
 * checks and runs adapters (`withAdapters`), so neither runtime file has
 * adapter code.
 */
const BUDGETS = {
	'inth.manifests.js': 9590,
	'inth.manifests3.js': 11975,
};

it.each(Object.entries(BUDGETS))(
	'keeps %s within its gzip budget',
	(name, budget) => {
		const file = resolve(
			dirname(fileURLToPath(import.meta.url)),
			'../../dist',
			name
		);

		expect(gzipSync(readFileSync(file)).length).toBeLessThanOrEqual(budget);
	}
);

it('keeps the level 3 steps out of inth.manifests.js', () => {
	const read = (name: string) =>
		readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '../../dist', name),
			'utf8'
		);

	// The level 3 part's own parser message.
	expect(read('inth.manifests.js')).not.toContain('nests steps more than');
	expect(read('inth.manifests3.js')).toContain('nests steps more than');
});
