import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

import { DEVTOOLS_ICON_SVG } from '../runtime/devtools/render-devtools-page';

/**
 * The web theme is the source of the accent. It is read as text because
 * `@inth/sdk-ui` is not a dependency of this package.
 */
const THEME_SOURCE = readFileSync(
	resolve(import.meta.dirname, '../../../ui/src/theme/utils.ts'),
	'utf8'
);

/** The first `primary: '#rrggbb'` after `marker` in the web theme source. */
const primaryAfter = (marker: string): string => {
	const start = THEME_SOURCE.indexOf(marker);
	expect(start, marker).toBeGreaterThan(-1);
	const match = /\bprimary: '(#[0-9a-f]{6})'/iu.exec(
		THEME_SOURCE.slice(start)
	);
	if (!match?.[1]) {
		throw new Error(`No primary after ${marker}`);
	}
	return match[1].toLowerCase();
};

describe('Nuxt DevTools tab icon', () => {
	test('is drawn in the web primary, light and dark', () => {
		const light = primaryAfter('export const defaultTheme');
		const dark = primaryAfter('export const defaultDarkColors');

		expect(DEVTOOLS_ICON_SVG).toContain(
			`path{fill:${light}}@media (prefers-color-scheme:dark){path{fill:${dark}}}`
		);
	});
});
