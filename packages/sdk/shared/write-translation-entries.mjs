#!/usr/bin/env node
/**
 * Writes a framework package's `translations/<language>` entries, so an app
 * imports `@inth/react/translations/de` instead of reaching into
 * `@inth/sdk`.
 *
 * Each entry re-exports the `@inth/sdk/translations/<language>` entry of the
 * same name, which registers that language's stock copy when it loads. The
 * language list comes from the `@inth/sdk` export map, so a new language
 * needs no change here. Packages list `./dist/translations/*.js` under
 * `sideEffects`, or a bundler drops `import '@inth/react/translations/de'`.
 *
 * Usage: node ../shared/write-translation-entries.mjs <jsDir> [typesDir]
 * unbuild configs call `writeTranslationEntries` from a hook instead, so the
 * files exist before unbuild checks the export map.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes `<jsDir>/translations/<language>.js` and the matching declarations
 * under `<typesDir>/translations/`.
 * @param {string} jsDir Directory of the built JavaScript.
 * @param {string} [typesDir] Directory of the declarations; `jsDir` if omitted.
 */
export const writeTranslationEntries = function writeTranslationEntries(
	jsDir,
	typesDir = jsDir
) {
	const sdkManifest = JSON.parse(
		readFileSync(new URL('../sdk/package.json', import.meta.url), 'utf8')
	);
	const names = Object.keys(sdkManifest.exports)
		.filter((key) => key.startsWith('./translations/'))
		.map((key) => key.slice('./translations/'.length));
	if (names.length === 0) {
		throw new Error('@inth/sdk exports no translations/<language> entries');
	}
	const jsOut = join(resolve(jsDir), 'translations');
	const typesOut = join(resolve(typesDir), 'translations');
	mkdirSync(jsOut, { recursive: true });
	mkdirSync(typesOut, { recursive: true });
	for (const name of names) {
		const source = `export * from '@inth/sdk/translations/${name}';\n`;
		writeFileSync(join(jsOut, `${name}.js`), source);
		writeFileSync(join(typesOut, `${name}.d.ts`), source);
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [jsDir = 'dist', typesDir] = process.argv.slice(2);
	writeTranslationEntries(jsDir, typesDir);
}
