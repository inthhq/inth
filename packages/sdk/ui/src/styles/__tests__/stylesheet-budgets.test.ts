/**
 * Byte budgets for the public stylesheet entry points and the sheets that
 * load after the first paint. Each budget is the size measured when the
 * consent UI became the only UI, plus about 2%, rounded up to the next 50
 * bytes. The per-container sheets have their budgets in
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
 * Brotli 11 / gzip 9 bytes, measured: `styles.css` 17,213 / 20,090 and its
 * Tailwind 3 twin 17,108 / 19,933 (before, `styles.css` 13,120 / 15,207
 * plus the opt-in `styles/privacy-choices.css` 8,204 / 9,327: 21,324 /
 * 24,534 for a page that rendered the current UI), `first-paint` 9,473 /
 * 10,731 (7,971 / 9,068, without the prompt's containers), `dialog` 4,444
 * / 4,980 (as `privacy-choices-dialog`, 4,451 / 4,992), `widget` 4,916 /
 * 5,473 and `parts` 1,666 / 1,905. Raise only for rules the UI needs to
 * paint. `dialog` grew by about 185 / 200 for the rules that fit the
 * vendor table and long labels on a 320px screen. The forced-colours
 * rules for the switches, the selected option and the dialog's edge cost
 * `dialog` about 105 and `styles.css` about 145 brotli bytes.
 */
const BUDGETS = {
	dialog: { brotli: 4850, gzip: 5450, sheet: 'dialog' },
	'first-paint': { brotli: 9700, gzip: 10950, sheet: 'first-paint' },
	parts: { brotli: 1700, gzip: 1950, sheet: 'parts' },
	'styles.css': { brotli: 17800, file: 'styles.css', gzip: 20800 },
	'styles.tw3.css': { brotli: 17700, file: 'styles.tw3.css', gzip: 20650 },
	widget: { brotli: 5050, gzip: 5600, sheet: 'widget' },
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
	test.each(Object.entries(BUDGETS) as [string, Budget][])(
		'%s stays within its budget',
		async (_name, budget) => {
			const css = await textOf(budget);

			expect(brotli(css)).toBeLessThanOrEqual(budget.brotli);
			expect(gzip(css)).toBeLessThanOrEqual(budget.gzip);
		}
	);
});
