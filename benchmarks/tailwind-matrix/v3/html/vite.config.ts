import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/**
 * The script-tag build's files a page with a backend loads. `c15t.js` loads
 * `c15t.hosted.js` from its own folder, which loads `c15t.dialog.js`.
 */
const SCRIPT_FILES = ['c15t.js', 'c15t.hosted.js', 'c15t.dialog.js'];

/**
 * Stands in for the CDN: emits `@c15t/browser`'s script-tag build next to
 * the page. Vite only builds the page's Tailwind stylesheet here.
 */
const c15tScript = (): Plugin => ({
	generateBundle() {
		for (const fileName of SCRIPT_FILES) {
			this.emitFile({
				fileName,
				source: readFileSync(
					fileURLToPath(import.meta.resolve(`@c15t/browser/${fileName}`)),
					'utf8'
				),
				type: 'asset',
			});
		}
	},
	name: 'c15t-script-tag',
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
	plugins: [c15tScript()],
});
