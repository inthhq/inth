import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/**
 * The script-tag build's files a page with a backend loads. `inth.js` loads
 * `inth.hosted.js` from its own folder, which loads `inth.choices.js`.
 */
const SCRIPT_FILES = ['inth.js', 'inth.hosted.js', 'inth.choices.js'];

/**
 * Stands in for the CDN: emits `@inth/sdk`'s script-tag build next to
 * the page. Vite only builds the page's Tailwind stylesheet here.
 */
const inthScript = (): Plugin => ({
	generateBundle() {
		for (const fileName of SCRIPT_FILES) {
			this.emitFile({
				fileName,
				source: readFileSync(
					fileURLToPath(import.meta.resolve(`@inth/sdk/${fileName}`)),
					'utf8'
				),
				type: 'asset',
			});
		}
	},
	name: 'inth-script-tag',
});

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				index: fileURLToPath(new URL('index.html', import.meta.url)),
				'light-dom': fileURLToPath(new URL('light-dom.html', import.meta.url)),
			},
		},
	},
	plugins: [inthScript()],
});
