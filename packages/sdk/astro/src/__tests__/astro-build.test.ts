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

	it('gives the Svelte dialog its stylesheets', async () => {
		const { css, scripts } = await buildReachableCSS('svelte');
		for (const selector of dialogSelectors) {
			expect(scripts).toContain(selector);
		}
		// The Svelte island links the widget's rules and the primitive class
		// maps it renders.
		expect(css).toContain(`.${managerClasses.manager}`);
		const [itemClass] = preferenceItemVariants().root().split(' ');
		expect(itemClass).toBeTruthy();
		expect(css).toContain(`.${itemClass}`);
	}, 60_000);

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
