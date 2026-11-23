/**
 * Builds a real Astro site and reads what reaches the page.
 *
 * The dialog islands load through an `import()` in the page script, and
 * whether Astro keeps the CSS those chunks import has changed between
 * versions: Astro 7 deletes it as unused. Only a real build shows which
 * stylesheets a page can reach, so this one runs Astro 7 itself.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import dialogClasses from '@inth/sdk/ui/styles/components/consent-dialog';
import iabBannerClasses from '@inth/sdk/ui/styles/components/iab-consent-banner';
import iabPanelClasses from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import managerClasses from '@inth/sdk/ui/styles/components/manager';
import { preferenceItemVariants } from '@inth/sdk/ui/styles/primitives';
import { afterAll, describe, expect, it } from 'vitest';

const FIXTURE = fileURLToPath(
	new URL('../../test/fixtures/astro-7', import.meta.url)
);

// The CLI rather than `build()` from `astro`: under this suite's Vite
// config, `astro` resolves to its browser stub. The fixture's config loads
// the built `@inth/astro`, so run `build` before this file.
const ASTRO_CLI = join(
	dirname(createRequire(import.meta.url).resolve('astro/package.json')),
	'bin/astro.mjs'
);

const outDirs: string[] = [];

afterAll(async () => {
	await Promise.all(
		outDirs.map((dir) => rm(dir, { force: true, recursive: true }))
	);
});

const buildFixture = async function buildFixture(
	ui: 'react' | 'svelte',
	iab = false,
	deferred = false
): Promise<string> {
	// Astro renames prerendered assets. Its output must share the source
	// filesystem; /tmp can be mounted separately in a linked worktree.
	const buildDir = join(FIXTURE, '.astro');
	await mkdir(buildDir, { recursive: true });
	const outDir = await mkdtemp(join(buildDir, `inth-${ui}-`));
	outDirs.push(outDir);
	await promisify(execFile)(
		process.execPath,
		[ASTRO_CLI, 'build', '--root', FIXTURE, '--outDir', outDir],
		{
			env: {
				...process.env,
				ASTRO_TELEMETRY_DISABLED: '1',
				INTH_ASTRO_CACHE_DIR: join(outDir, '.astro'),
				INTH_DEFERRED: deferred ? '1' : '0',
				INTH_IAB: iab ? '1' : '0',
				INTH_UI: ui,
				INTH_VITE_CACHE_DIR: join(outDir, '.vite'),
			},
		}
	);
	return outDir;
};

/**
 * Build the fixture and return every stylesheet its page can reach: the ones
 * the HTML links or inlines, and the ones a script links at runtime by URL.
 *
 * @param ui - The dialog adapter to build with.
 * @param iab - Whether to build the IAB banner and dialog.
 * @returns The HTML, inline and linked initial CSS, reachable deferred CSS,
 * and the page's scripts, which carry the sheets the client puts in.
 */
const buildReachableCSS = async function buildReachableCSS(
	ui: 'react' | 'svelte',
	iab = false
): Promise<{
	css: string;
	html: string;
	initialCSS: string;
	deferredCSS: string;
	scripts: string;
}> {
	const outDir = await buildFixture(ui, iab);
	const html = await readFile(join(outDir, 'index.html'), 'utf8');
	const assets = await readdir(join(outDir, '_astro'));
	const scripts = await Promise.all(
		assets
			.filter((name) => name.endsWith('.js'))
			.map((name) => readFile(join(outDir, '_astro', name), 'utf8'))
	);
	const references = [html, ...scripts].join('\n');
	const reachable = assets.filter(
		(name) => name.endsWith('.css') && references.includes(name)
	);
	const inline = [
		...html.matchAll(/<style[^>]*>(?<css>[\s\S]*?)<\/style>/gu),
	].map((match) => match.groups?.css ?? '');
	const linked = await Promise.all(
		reachable.map((name) => readFile(join(outDir, '_astro', name), 'utf8'))
	);
	const initialLinks = reachable.filter((name) => html.includes(name));
	const initialLinked = await Promise.all(
		initialLinks.map((name) => readFile(join(outDir, '_astro', name), 'utf8'))
	);
	return {
		css: [...linked, ...inline].join('\n'),
		deferredCSS: linked.join('\n'),
		html,
		initialCSS: [...initialLinked, ...inline].join('\n'),
		scripts: scripts.join('\n'),
	};
};

/**
 * The page's scripts, the files they load with `import()`, and each file's
 * static imports.
 */
const lazyChunks = async function lazyChunks(outDir: string): Promise<{
	names: string[];
	lazy: string[];
	code: (name: string) => string;
	staticClosure: (name: string) => string[];
}> {
	const dir = join(outDir, '_astro');
	const names = (await readdir(dir)).filter((name) => name.endsWith('.js'));
	const sources = new Map(
		await Promise.all(
			names.map(
				async (name) => [name, await readFile(join(dir, name), 'utf8')] as const
			)
		)
	);
	const code = (name: string): string => sources.get(name) ?? '';
	const lazy = new Set<string>();
	for (const source of sources.values()) {
		for (const match of source.matchAll(
			/import\(\s*[`'"]\.\/(?<file>[^`'"]+\.js)[`'"]\s*\)/gu
		)) {
			lazy.add(match.groups?.file ?? '');
		}
	}
	const staticImports = (name: string): string[] =>
		[
			...code(name).matchAll(
				/(?:from|import)\s*["']\.\/(?<file>[^"']+\.js)["']/gu
			),
		]
			.map((match) => match.groups?.file ?? '')
			.filter((file) => sources.has(file));
	const staticClosure = (name: string): string[] => {
		const seen = new Set<string>();
		const pending = [name];
		for (let next = pending.pop(); next; next = pending.pop()) {
			if (!seen.has(next)) {
				seen.add(next);
				pending.push(...staticImports(next));
			}
		}
		return [...seen];
	};
	return { code, lazy: [...lazy].sort(), names, staticClosure };
};

describe('an Astro build', () => {
	// The dialog renders these class names; without rules for them it opens
	// as unstyled text at the bottom of the page. Its sheets are modules the
	// client puts in, so their rules reach the page through a script.
	const dialogSelectors = [
		`.${dialogClasses.card}`,
		`.${dialogClasses.backdrop}`,
	];

	it('gives the React dialog its stylesheet', async () => {
		const { scripts } = await buildReachableCSS('react');
		for (const selector of dialogSelectors) {
			expect(scripts).toContain(selector);
		}
	}, 60_000);

	it('gives the Svelte dialog its stylesheets, and links none it does not render', async () => {
		const { css, scripts } = await buildReachableCSS('svelte');
		for (const selector of dialogSelectors) {
			expect(scripts).toContain(selector);
		}
		// The dialog renders with the sheets the client puts in. The widget's
		// rules come with the confirmations that render them, and the
		// primitive class maps only with the IAB panel, so the page links
		// neither stylesheet for the preferences dialog.
		expect(css).not.toContain(`.${managerClasses.manager}`);
		const [itemClass] = preferenceItemVariants().root().split(' ');
		expect(itemClass).toBeTruthy();
		expect(css).not.toContain(`.${itemClass}`);
	}, 60_000);

	it('loads the Svelte dialog body with its island, in one wave', async () => {
		const outDir = await buildFixture('svelte');
		const files = await lazyChunks(outDir);
		const island = files.names.find((name) =>
			name.startsWith('panel-surface.')
		);
		const body = files.names.find((name) =>
			files.code(name).includes('consent-dialog-done')
		);
		expect(island).toBeDefined();
		expect(body).toBeDefined();
		// The body sits in the island's own download: the island's chunk or
		// a chunk it imports statically, which loads beside it.
		expect(files.staticClosure(island ?? '')).toContain(body);
	}, 60_000);

	it.each(['react', 'svelte'] as const)(
		'keeps the embedded widget out of the %s dialog island and everything it loads',
		async (ui) => {
			// The dialog never renders `ConsentWidget`; only a page that puts
			// one on itself should download it.
			const outDir = await buildFixture(ui);
			const files = await lazyChunks(outDir);
			const island = files.names.find((name) =>
				name.startsWith('panel-surface.')
			);
			expect(island).toBeDefined();
			// The island's download and the dialog's: each chunk that renders
			// the dialog, with what it imports statically. A part the dialog
			// imports on demand, such as a confirmation, is not part of it.
			const dialogChunks = files.names.filter((name) =>
				files.code(name).includes('consent-dialog-done')
			);
			const reached = new Set(
				[island ?? '', ...dialogChunks].flatMap(files.staticClosure)
			);
			expect(
				[...reached].some((name) =>
					files.code(name).includes('consent-dialog-done')
				)
			).toBe(true);
			expect(
				[...reached].filter((name) =>
					files.code(name).includes('consent-widget-root')
				)
			).toEqual([]);
		},
		60_000
	);

	it.each(['react', 'svelte'] as const)(
		'names no chunk a %s page loads on demand like a consent banner',
		async (ui) => {
			// Vite names a lazy chunk after the module it imports, and content
			// blockers drop files named like a consent banner: the prompt's
			// containers and sheets, its options and the dialog load on demand.
			const outDir = await buildFixture(ui);
			const { lazy } = await lazyChunks(outDir);
			expect(lazy).toEqual(
				expect.arrayContaining([expect.stringMatching(/^card\./u)])
			);
			expect(
				lazy.filter((name) => /banner|consent|cookie|privacy|gdpr/iu.test(name))
			).toEqual([]);
		},
		60_000
	);

	it.each(['react', 'svelte'] as const)(
		'puts IAB banner CSS in the server HTML and defers both panel sheets for %s',
		async (ui) => {
			const { deferredCSS, html, initialCSS } = await buildReachableCSS(
				ui,
				true
			);
			expect(
				html.match(/data-inth-styles="inth-iab-first-paint"/gu)
			).toHaveLength(1);
			expect(
				html.indexOf('data-inth-styles="inth-iab-first-paint"')
			).toBeLessThan(html.indexOf('</head>'));
			expect(html).toContain('data-testid="iab-consent-banner-root"');
			expect(html).not.toMatch(/<link[^>]*rel="stylesheet"/u);
			expect(initialCSS).toContain(`.${iabBannerClasses.card}`);
			expect(initialCSS).not.toContain(`.${iabPanelClasses.card}`);
			expect(initialCSS).not.toContain(`.${managerClasses.manager}`);
			expect(deferredCSS).toContain(`.${iabPanelClasses.card}`);
			expect(deferredCSS).toContain(`.${managerClasses.manager}`);
			// Svelte's IAB dialog renders its rows with the primitives class
			// maps; without their rules a collapsed row shows open. React's
			// renders the widget's, so it links none.
			const [itemClass] = preferenceItemVariants().root().split(' ');
			expect(deferredCSS.includes(`.${itemClass}`)).toBe(ui === 'svelte');
		},
		60_000
	);

	it('ships the prompt sheets once in the outer page without repeating them in a server island', async () => {
		const outDir = await buildFixture('svelte', false, true);
		const { stdout } = await promisify(execFile)(process.execPath, [
			join(FIXTURE, 'render-deferred.mjs'),
			join(outDir, 'server', 'entry.mjs'),
		]);
		const { html, island } = JSON.parse(stdout) as {
			html: string;
			island: string;
		};
		expect(html.match(/data-inth-styles="inth-tokens"/gu)).toHaveLength(1);
		expect(html.match(/data-inth-styles="inth-card"/gu)).toHaveLength(1);
		expect(island).toContain('data-testid="consent-banner-root"');
		expect(island).not.toContain('data-inth-styles');
	}, 60_000);
});
