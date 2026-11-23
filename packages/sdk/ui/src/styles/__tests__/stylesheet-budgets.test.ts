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
 * Brotli 11 / gzip 9 bytes. Before v6: `styles.css` 13,116 / 15,266,
 * `styles.tw3.css` 12,993 / 15,115, `first-paint` 8,066 / 9,203, `dialog`
 * 6,285 / 7,212. The opaque primary-tint `@supports` block (PR #128) adds
 * about 50-90 B brotli to the first three. Raise these only for rules the
 * classic UI needs.
 */
const EXISTING = {
	dialog: { brotli: 6300, gzip: 7250, sheet: 'dialog' },
	'first-paint': { brotli: 8150, gzip: 9350, sheet: 'first-paint' },
	'styles.css': { brotli: 13250, file: 'styles.css', gzip: 15400 },
	'styles.tw3.css': { brotli: 13100, file: 'styles.tw3.css', gzip: 15250 },
} as const;

/**
 * Measured when set: `styles/privacy-choices.css` 6,927 / 7,798, its
 * Tailwind 3 twin 6,825 / 7,666, `privacy-choices-dialog` 3,579 / 4,039.
 * Raise only for rules the v6 UI needs to paint.
 *
 * The classic banner and dialog variables the v6 parts fall back to, with
 * the React banner's grouped actions and underlined policy links, brought
 * `styles/privacy-choices.css` to 7,649 / 8,629 and its Tailwind 3 twin to
 * 7,550 / 8,495, so their budgets are 7,700 / 8,700 and 7,600 / 8,550.
 *
 * `privacy-choices-dialog` was raised to 4,155 / 4,664 when it took over
 * the switch, category row and disclosure rules, so neither the v6 dialog
 * nor a banner panel loads the classic `dialog` sheet (about 7.5 KB gzip).
 *
 * The React dialog's rules, each reading its classic-variable fallback,
 * with the underlined policy links and the bar's heavier button selector,
 * brought `styles/privacy-choices.css` to 8,204 / 9,327 and its Tailwind 3
 * twin to 8,093 / 9,191, so their budgets are 8,250 / 9,400 and
 * 8,150 / 9,250.
 */
const V6 = {
	'privacy-choices-dialog': {
		brotli: 4500,
		gzip: 5050,
		sheet: 'privacy-choices-dialog',
	},
	'styles/privacy-choices.css': {
		brotli: 8250,
		file: 'styles/privacy-choices.css',
		gzip: 9400,
	},
	'styles/privacy-choices.tw3.css': {
		brotli: 8150,
		file: 'styles/privacy-choices.tw3.css',
		gzip: 9250,
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
