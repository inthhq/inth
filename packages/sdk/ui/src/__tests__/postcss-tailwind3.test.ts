import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AcceptedPlugin } from 'postcss';
import postcss, { parse } from 'postcss';
import { describe, expect, test } from 'vitest';

import tailwind3Plugin, { isInthUiStylesheetPath } from '../postcss-tailwind3';
import * as pluginModule from '../postcss-tailwind3';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
// This checkout's `packages/`, whose package.json files name Inth packages.
const PACKAGES_DIR = join(TEST_DIR, '..', '..', '..');

const layeredCss = `
@layer theme, base, components, utilities;

:root {
	--inth-color-primary: #0f172a;
}

@layer components {
	.inth-ui-button-a1b2c {
		background: var(--inth-color-primary);
	}
}

@layer utilities {
	.inth-ui-force {
		color: red;
	}
}
`;

const processCss = async function processCss(from: string) {
	const result = await postcss([tailwind3Plugin]).process(layeredCss, { from });
	return result.css;
};

describe('@inth/sdk/ui/postcss-tailwind3', () => {
	test('unwraps @layer blocks for built @inth/sdk/ui stylesheets in node_modules', async () => {
		const css = await processCss(
			'/app/node_modules/@inth/sdk/lib/ui/dist/styles/components/button.css'
		);

		expect(css).toContain('.inth-ui-button-a1b2c');
		expect(css).toContain('.inth-ui-force');
		expect(css).not.toMatch(/@layer\b/u);
	});

	test('unwraps @layer blocks for built @inth/sdk/ui stylesheets in the monorepo', async () => {
		const css = await processCss(
			join(PACKAGES_DIR, 'ui', 'dist', 'styles', 'components', 'button.css')
		);

		expect(css).toContain('.inth-ui-button-a1b2c');
		expect(css).not.toMatch(/@layer\b/u);
	});

	test('unwraps @layer blocks for the UI stylesheets @inth/sdk assembles in the monorepo', async () => {
		const css = await processCss(
			join(PACKAGES_DIR, 'sdk', 'lib', 'ui', 'dist', 'styles.css')
		);

		expect(css).not.toMatch(/@layer\b/u);
	});

	test('leaves app stylesheets untouched', async () => {
		const css = await processCss('/app/src/app/globals.css');

		expect(css).toContain('@layer theme, base, components, utilities');
		expect(css).toContain('@layer components');
		expect(css).toContain('@layer utilities');
	});

	test('leaves a consumer workspace package named like a inth one alone', async () => {
		const root = mkdtempSync(join(tmpdir(), 'inth-tw3-'));
		const packageDir = join(root, 'packages', 'react');
		mkdirSync(join(packageDir, 'dist'), { recursive: true });
		writeFileSync(
			join(packageDir, 'package.json'),
			JSON.stringify({ name: '@acme/react' })
		);

		const css = await processCss(join(packageDir, 'dist', 'x.css'));

		expect(css).toContain('@layer components');
		expect(css).toContain('@layer utilities');
	});

	test('removes bare @layer order statements for scoped inth files', async () => {
		const css = await postcss([tailwind3Plugin]).process(
			'@layer properties, theme, base, components, utilities;',
			{
				from: '/app/node_modules/@inth/sdk/lib/ui/dist/styles/components/button.css',
			}
		);

		expect(css.css.trim()).toBe('');
	});

	test('leaves no @layer in any built layered sheet', async () => {
		// Every layered sheet opens with the layer order statement; Tailwind 3
		// has no layers to order, so the plugin drops it along with the blocks.
		// The entrypoints matter most: apps import `styles.css` directly.
		for (const file of [
			'styles.css',
			'iab/styles.css',
			'styles/primitives.css',
			'styles/privacy-choices.css',
		]) {
			const from = join(TEST_DIR, '..', '..', 'dist', file);
			// oxlint-disable-next-line no-await-in-loop -- Four small files.
			const result = await postcss([tailwind3Plugin]).process(
				readFileSync(from, 'utf8'),
				{ from }
			);

			expect(result.css, file).toContain('.inth-ui-');
			expect(result.css, file).not.toMatch(/@layer\b/u);
		}
	});

	test('unwraps inth rules inlined into an app stylesheet', async () => {
		// Vite and postcss-import inline `@import`ed files before other
		// plugins run. The inlined nodes keep their own source file, so the
		// plugin unwraps Inth's layers and leaves the app's own alone.
		const app = parse(
			'@tailwind components;\n@layer components { .app-card { color: red; } }',
			{ from: '/app/src/index.css' }
		);
		const inlined = parse(layeredCss, {
			from: '/app/node_modules/@inth/sdk/lib/ui/dist/styles.css',
		});
		app.append(inlined.nodes);

		const result = await postcss([tailwind3Plugin]).process(app, {
			from: '/app/src/index.css',
		});
		const layers = [...result.css.matchAll(/@layer [^{;]+/gu)].map((match) =>
			match[0].trim()
		);

		expect(layers).toEqual(['@layer components']);
		expect(result.css).toContain('.app-card');
		expect(result.css).toContain('.inth-ui-button-a1b2c');
	});

	test('normalizes the in-process module namespace into a working plugin', async () => {
		// PostCSS (and Next's wrapper) unwrap a `postcss` property, so the
		// module namespace itself must normalize into a working plugin
		// without a CommonJS build.
		const result = await postcss([
			pluginModule as unknown as AcceptedPlugin,
		]).process(layeredCss, {
			from: '/app/node_modules/@inth/sdk/lib/ui/dist/styles/components/button.css',
		});

		expect(result.css).toContain('.inth-ui-button-a1b2c');
		expect(result.css).not.toMatch(/@layer\b/u);
	});

	test('loads through a real require() of the built dist entry', () => {
		// Next.js `require()`s string plugin names from postcss.config.* and
		// receives the ESM namespace via require(esm). Drive that path for
		// real: a plain-Node subprocess (outside Vitest's Vite pipeline)
		// requires `@inth/sdk/ui/postcss-tailwind3` against the built dist — the
		// turbo test task depends on build, so dist exists — and feeds the
		// result to postcss.
		const raw = execFileSync(
			process.execPath,
			[
				join(TEST_DIR, 'postcss-require-probe.mjs'),
				layeredCss,
				'/app/node_modules/@inth/sdk/lib/ui/dist/styles/components/button.css',
			],
			{ encoding: 'utf8' }
		);
		const { css } = JSON.parse(raw) as { css: string };

		expect(css).toContain('.inth-ui-button-a1b2c');
		expect(css).toContain('.inth-ui-force');
		expect(css).not.toMatch(/@layer\b/u);
	});

	test('unwraps inth layers that an @import inlined into an app stylesheet', async () => {
		// Vite and postcss-import inline `@import '@inth/svelte/styles.css'`
		// before Tailwind runs, so the root is the app's file and only the
		// inlined nodes remember that they came from Inth. Left layered,
		// Tailwind 3 adopts them as its own components layer and purges them.
		const root = parse(
			'@tailwind components;\n@layer components { .app-card { color: red; } }',
			{ from: '/app/src/app.css' }
		);
		root.prepend(
			parse(layeredCss, {
				from: '/app/node_modules/@inth/sdk/lib/ui/dist/styles.css',
			}).nodes
		);

		const { css } = await postcss([tailwind3Plugin]).process(root, {
			from: '/app/src/app.css',
		});

		expect(css).toContain('.inth-ui-button-a1b2c');
		expect(css).not.toContain('@layer theme, base, components, utilities');
		expect(css.match(/@layer components/gu)).toHaveLength(1);
		expect(css).toMatch(/@layer components \{ \.app-card/u);
	});

	test('unwraps inth layers inside an adapter stylesheet that imports @inth/sdk/ui', async () => {
		// Astro injects `@inth/astro/styles.css`, which opens with the layer
		// order and then imports `@inth/sdk/ui/styles.css`.
		const from = '/app/node_modules/@inth/astro/dist/styles.css';
		const root = parse(
			'@layer properties, theme, base, components, utilities;',
			{ from }
		);
		root.append(
			parse(layeredCss, {
				from: '/app/node_modules/@inth/sdk/lib/ui/dist/styles.css',
			}).nodes
		);

		const { css } = await postcss([tailwind3Plugin]).process(root, { from });

		expect(css).toContain('.inth-ui-button-a1b2c');
		expect(css).not.toMatch(/@layer\b/u);
	});

	test('matches realistic package paths only', () => {
		for (const path of [
			'/app/node_modules/@inth/sdk/lib/ui/dist/styles.css',
			'/app/node_modules/.pnpm/@inth+sdk@3.0.0/node_modules/@inth/sdk/lib/ui/dist/styles/dialog.css',
			'/app/node_modules/@inth/svelte/dist/styles.css',
			'/app/node_modules/@inth/astro/dist/styles.css',
			'/app/node_modules/@inth/sdk/lib/browser/dist/inth.css',
			'/app/node_modules/@inth/react/dist/styles.css',
			join(PACKAGES_DIR, 'svelte', 'dist', 'styles.css'),
			// Astro's Vite pipeline processes the dialog sheet with a query.
			'/app/node_modules/@inth/sdk/lib/ui/dist/styles/dialog.css?transform-only',
		]) {
			expect(isInthUiStylesheetPath(path)).toBe(true);
		}
		for (const path of [
			'/app/node_modules/@other/ui/dist/styles.css',
			'/app/node_modules/inth-theme/dist/styles.css',
			'/app/node_modules/@inth/cli/dist/styles.css',
			'/repo/packages/web/dist/styles.css',
			// Another monorepo's workspace package with an Inth-like name.
			'/home/dev/app/packages/sdk/react/dist/styles.css',
			'/app/src/styles.css',
		]) {
			expect(isInthUiStylesheetPath(path)).toBe(false);
		}
	});

	test('matches realistic @inth/sdk/ui paths', () => {
		expect(
			isInthUiStylesheetPath(
				'/app/node_modules/@inth/sdk/lib/ui/dist/styles/components/button.css'
			)
		).toBe(true);
		expect(
			isInthUiStylesheetPath(
				join(PACKAGES_DIR, 'ui', 'dist', 'styles', 'components', 'button.css')
			)
		).toBe(true);
		expect(
			isInthUiStylesheetPath(
				'/app/node_modules/@inth/sdk/lib/ui/dist/styles.css'
			)
		).toBe(true);
		expect(
			isInthUiStylesheetPath(
				'C:\\app\\node_modules\\@inth\\sdk\\lib\\ui\\dist\\iab\\styles.css'
			)
		).toBe(true);
		expect(
			isInthUiStylesheetPath(
				'/app/node_modules/@inth/sdk/lib/ui/dist/styles.tw3.css'
			)
		).toBe(true);
		expect(
			isInthUiStylesheetPath('/app/dist/styles/components/button.css')
		).toBe(false);
		expect(isInthUiStylesheetPath('/app/dist/styles.css')).toBe(false);
		expect(
			isInthUiStylesheetPath(
				'/app/node_modules/@inth/sdk/lib/browser/dist/inth.css'
			)
		).toBe(true);
		expect(
			isInthUiStylesheetPath(
				'/app/node_modules/@inth/sdk/lib/browser/dist/inth.iab.css'
			)
		).toBe(true);
		expect(
			isInthUiStylesheetPath(
				'/app/node_modules/@inth/sdk/lib/browser/dist/inth.js'
			)
		).toBe(false);
		expect(
			isInthUiStylesheetPath('/app/node_modules/other-ui/dist/styles.css')
		).toBe(false);
	});
});
