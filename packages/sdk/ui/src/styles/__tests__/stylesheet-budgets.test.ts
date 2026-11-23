/**
 * Byte budgets for the public stylesheet entry points.
 *
 * The v6 Privacy Choices rules ship as opt-in entries
 * (`styles/privacy-choices.css`, its Tailwind 3 twin and the
 * `privacy-choices-dialog` sheet), so an app that imports `styles.css`, or
 * a surface that renders `first-paint` or `dialog`, pays nothing for UI it
 * doesn't render. The existing entries are budgeted at their size before
 * v6, rounded up to the next 50 bytes; the v6 entries at their measured
 * size plus about 10%. The per-presentation sheets have their budgets in
 * `presentation-sheets.test.ts`.
 *
 * These read the built artifacts: build `@inth/sdk/ui` first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import { describe, expect, test } from 'vitest';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');
const SHEETS_DIR = join(DIST_DIR, 'styles', 'sheets');

const readDist = function readDist(path: string): string {
	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @inth/sdk/ui first: bun run --cwd packages/sdk/ui build`
		);
	}
	return readFileSync(path, 'utf8');
};

const sheetText = async function sheetText(name: string): Promise<string> {
	const path = join(SHEETS_DIR, `${name}.js`);
	readDist(path);
	return ((await import(pathToFileURL(path).href)) as { css: string }).css;
};

const brotli = (text: string): number =>
	brotliCompressSync(text, {
		params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
	}).length;
const gzip = (text: string): number => gzipSync(text, { level: 9 }).length;

/**
 * Brotli 11 / gzip 9 bytes. Before v6, and still: `styles.css` 13,116 /
 * 15,266, `styles.tw3.css` 12,993 / 15,115, `first-paint` 8,066 / 9,203,
 * `dialog` 6,285 / 7,212. Raise these only for rules the classic UI needs.
 */
const EXISTING = {
	dialog: { brotli: 6300, gzip: 7250, sheet: 'dialog' },
	'first-paint': { brotli: 8100, gzip: 9250, sheet: 'first-paint' },
	'styles.css': { brotli: 13150, file: 'styles.css', gzip: 15300 },
	'styles.tw3.css': { brotli: 13000, file: 'styles.tw3.css', gzip: 15150 },
} as const;

/**
 * Measured when set: `styles/privacy-choices.css` 6,927 / 7,798, its
 * Tailwind 3 twin 6,825 / 7,666, `privacy-choices-dialog` 3,579 / 4,039.
 * Raise only for rules the v6 UI needs to paint.
 */
const V6 = {
	'privacy-choices-dialog': {
		brotli: 3950,
		gzip: 4450,
		sheet: 'privacy-choices-dialog',
	},
	'styles/privacy-choices.css': {
		brotli: 7650,
		file: 'styles/privacy-choices.css',
		gzip: 8600,
	},
	'styles/privacy-choices.tw3.css': {
		brotli: 7500,
		file: 'styles/privacy-choices.tw3.css',
		gzip: 8450,
	},
} as const;

type Budget = { brotli: number; gzip: number } & (
	| { file: string }
	| { sheet: string }
);

const textOf = async (budget: Budget): Promise<string> =>
	'file' in budget
		? readDist(join(DIST_DIR, budget.file))
		: await sheetText(budget.sheet);

describe('stylesheet budgets', () => {
	test.each(Object.entries(EXISTING) as [string, Budget][])(
		'%s stays at its size before v6',
		async (_name, budget) => {
			const css = await textOf(budget);

			expect(brotli(css)).toBeLessThanOrEqual(budget.brotli);
			expect(gzip(css)).toBeLessThanOrEqual(budget.gzip);
		}
	);

	test.each(Object.entries(V6) as [string, Budget][])(
		'%s stays within its budget',
		async (_name, budget) => {
			const css = await textOf(budget);

			expect(brotli(css)).toBeLessThanOrEqual(budget.brotli);
			expect(gzip(css)).toBeLessThanOrEqual(budget.gzip);
		}
	);
});
