// @vitest-environment node
/**
 * The size of `inth.manifests.js`, which a page with remote scripts
 * downloads beside `inth.js`. The budget sits just above the current size,
 * so a change that grows the file has to raise it on purpose.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { expect, it } from 'vite-plus/test';

/**
 * Gzipped bytes. Level 1 was 4,690; level 2 brought it to 6,264, and the
 * checks on what a step calls and writes to 6,594.
 */
const BUDGET = 6650;

it('keeps inth.manifests.js within its gzip budget', () => {
	const file = resolve(
		dirname(fileURLToPath(import.meta.url)),
		'../../dist/inth.manifests.js'
	);

	expect(gzipSync(readFileSync(file)).length).toBeLessThanOrEqual(BUDGET);
});
