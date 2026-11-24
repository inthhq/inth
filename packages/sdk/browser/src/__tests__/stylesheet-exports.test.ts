// @vitest-environment node
/**
 * The stylesheets `package.json` exports exist after a build. They are
 * written by `scripts/copy-styles.ts`, not by rslib, so nothing else checks
 * that the two agree on a file name.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vite-plus/test';

const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');

const manifest = JSON.parse(
	readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')
) as {
	exports: Record<string, unknown>;
};

const stylesheetTargets = Object.values(manifest.exports).filter(
	(target): target is string =>
		typeof target === 'string' && target.endsWith('.css')
);

it('exports at least the UI and IAB stylesheets', () => {
	expect(stylesheetTargets).toEqual(
		expect.arrayContaining(['./dist/inth.css', './dist/inth.iab.css'])
	);
});

it.each(stylesheetTargets)('builds %s', (target) => {
	expect(existsSync(resolve(PACKAGE_ROOT, target))).toBe(true);
});
