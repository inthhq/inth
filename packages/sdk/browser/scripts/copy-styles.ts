/**
 * Writes the stylesheets bundler users load in the page: `dist/inth.css`
 * and `dist/inth.iab.css`.
 *
 * Bundler users who mount the UI into the light DOM (`shadow: false`,
 * `styles: false`) import `@inth/sdk/styles.css`. In the shadow root the
 * stock sheet is one `<style>` and each surface adds `@inth/sdk-ui`'s
 * sheets for itself when it renders, before the stock sheet; a page that
 * brings its own stylesheet gets none of those, so this file carries them
 * all, in the same order: every container's, the options' and the
 * dialog's, then the stock sheet. Runs after `rslib build`, which cleans
 * `dist/` first.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { stylesheet as iabStylesheet } from '../src/generated/iab-styles';
import { stylesheet } from '../src/generated/styles';
import { adapterStyles } from '../src/iab/iab-adapter-styles.model';

const dist = resolve(import.meta.dirname, '../dist');

/** The surfaces' sheets, in the order they add themselves. */
const SURFACE_SHEETS = [
	'surface',
	'card',
	'banner',
	'drawer',
	'expand',
	'dialog',
] as const;

const surfaceSheets = await Promise.all(
	SURFACE_SHEETS.map(async (name) => {
		const module = (await import(`@inth/sdk-ui/styles/sheets/${name}`)) as {
			css: string;
		};
		return module.css;
	})
);

await mkdir(dist, { recursive: true });
await writeFile(
	join(dist, 'inth.css'),
	[...surfaceSheets, stylesheet].join('\n')
);
await writeFile(join(dist, 'inth.iab.css'), iabStylesheet + adapterStyles);
