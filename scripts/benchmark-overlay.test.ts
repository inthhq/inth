import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, it } from 'vitest';

import { replaceBenchmarkFixtures } from './benchmark-overlay';

it('removes retired routes, includes new fixtures, and preserves base product code', () => {
	const root = mkdtempSync(join(tmpdir(), 'inth-overlay-'));
	try {
		for (const arm of ['base', 'head']) {
			const cwd = join(root, arm);
			mkdirSync(join(cwd, 'benchmarks/app'), { recursive: true });
			execFileSync('git', ['init', '--quiet'], { cwd });
			writeFileSync(join(cwd, 'product.ts'), arm);
			writeFileSync(
				join(cwd, 'benchmarks/app/package.json'),
				JSON.stringify({
					dependencies: { dependency: arm },
					scripts: { bench: arm },
				})
			);
			writeFileSync(join(cwd, 'benchmarks/app/route.ts'), arm);
			execFileSync('git', ['add', '.'], { cwd });
		}
		const base = join(root, 'base');
		const head = join(root, 'head');
		rmSync(join(head, 'benchmarks/app/route.ts'));
		writeFileSync(join(head, 'benchmarks/app/new.ts'), 'new fixture');
		replaceBenchmarkFixtures(head, base);
		expect(existsSync(join(base, 'benchmarks/app/route.ts'))).toBe(false);
		expect(readFileSync(join(base, 'benchmarks/app/new.ts'), 'utf8')).toBe(
			'new fixture'
		);
		expect(readFileSync(join(base, 'product.ts'), 'utf8')).toBe('base');
		const manifest = JSON.parse(
			readFileSync(join(base, 'benchmarks/app/package.json'), 'utf8')
		);
		expect(manifest.dependencies).toEqual({ dependency: 'base' });
		expect(manifest.scripts).toEqual({ bench: 'head' });
		writeFileSync(
			join(head, 'benchmarks/app/package.json'),
			JSON.stringify({ dependencies: { missing: '1.0.0' } })
		);
		expect(() => replaceBenchmarkFixtures(head, base)).toThrow(
			'absent from the base manifest'
		);
		// A harness only the head has is left out of the base tree: it cannot
		// be measured on both sides and must not be installed against the base
		// lockfile.
		writeFileSync(
			join(head, 'benchmarks/app/package.json'),
			JSON.stringify({ dependencies: { dependency: 'head' } })
		);
		mkdirSync(join(head, 'benchmarks/new-harness/src'), { recursive: true });
		writeFileSync(
			join(head, 'benchmarks/new-harness/package.json'),
			JSON.stringify({ dependencies: { dependency: 'head' } })
		);
		writeFileSync(join(head, 'benchmarks/new-harness/src/run.ts'), 'new');
		replaceBenchmarkFixtures(head, base);
		expect(existsSync(join(base, 'benchmarks/new-harness'))).toBe(false);
		expect(readFileSync(join(base, 'benchmarks/app/new.ts'), 'utf8')).toBe(
			'new fixture'
		);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

it.each([
	{ automatic: false, iabAutomatic: false },
	{ automatic: true, iabAutomatic: false },
	{ automatic: true, iabAutomatic: true },
])(
	'keeps overlaid fixtures styled, automatic=$automatic, IAB=$iabAutomatic',
	({ automatic, iabAutomatic }) => {
		const root = mkdtempSync(join(tmpdir(), 'inth-overlay-styles-'));
		try {
			for (const arm of ['base', 'head']) {
				const cwd = join(root, arm);
				mkdirSync(cwd, { recursive: true });
				execFileSync('git', ['init', '--quiet'], { cwd });
				for (const path of [
					'benchmarks/nextjs-browser-bench/app/_bench/with-consent.css',
					'benchmarks/tanstack-start-browser-bench/src/bench/with-consent-iab.css',
					'benchmarks/sveltekit-browser-bench/src/routes/ssr/+layout.svelte',
				]) {
					const target = join(cwd, path);
					mkdirSync(dirname(target), { recursive: true });
					writeFileSync(
						target,
						path.endsWith('.css')
							? '@import "./app.css";\n'
							: '<script lang="ts">\n</script>\n<p>Measured page</p>'
					);
				}
				execFileSync('git', ['add', '.'], { cwd });
			}
			const base = join(root, 'base');
			if (automatic) {
				for (const path of [
					'packages/sdk/react/src/components/shared/surface-styles.tsx',
					'packages/sdk/svelte/src/lib/surface-styles.ts',
				]) {
					mkdirSync(dirname(join(base, path)), { recursive: true });
					writeFileSync(join(base, path), 'export {};');
				}
			}
			if (iabAutomatic) {
				const path = join(
					base,
					'packages/sdk/react/src/components/shared/iab-first-paint-sheets.ts'
				);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, 'export {};');
			}
			replaceBenchmarkFixtures(join(root, 'head'), base);
			const next = readFileSync(
				join(
					base,
					'benchmarks/nextjs-browser-bench/app/_bench/with-consent.css'
				),
				'utf8'
			);
			const iab = readFileSync(
				join(
					base,
					'benchmarks/tanstack-start-browser-bench/src/bench/with-consent-iab.css'
				),
				'utf8'
			);
			const svelte = readFileSync(
				join(
					base,
					'benchmarks/sveltekit-browser-bench/src/routes/ssr/+layout.svelte'
				),
				'utf8'
			);
			expect(next.includes('@inth/nextjs/styles.css')).toBe(!automatic);
			expect(iab.includes('@inth/tanstack-start/styles.css')).toBe(
				!iabAutomatic
			);
			expect(iab.includes('@inth/tanstack-start/iab/styles.css')).toBe(
				!iabAutomatic
			);
			expect(svelte.includes("import '@inth/svelte/styles.css';")).toBe(
				!automatic
			);
			expect(svelte).toContain('<p>Measured page</p>');
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	}
);

it('gives the base copy of a fixture the older form of an API the head introduced', () => {
	const root = mkdtempSync(join(tmpdir(), 'inth-overlay-api-'));
	try {
		const gate = 'benchmarks/nuxt-browser-bench/app/pages/gate/index.vue';
		const headPage = [
			"import { onMounted, watch } from 'vue';",
			'',
			"import { useConsentSnapshot, useScriptLoader } from '#inth/composables';",
			'',
			'const snapshot = useConsentSnapshot();',
			'// The scripts come from the page URL, so they register in the browser, as',
			'// the other gate pages do with useScriptLoader.',
			'useScriptLoader(gateScripts());',
			'onMounted(() => {',
			'\tupdateGateBridge(snapshot.value);',
			'});',
			'',
		].join('\n');
		for (const arm of ['base', 'head']) {
			const cwd = join(root, arm);
			mkdirSync(dirname(join(cwd, gate)), { recursive: true });
			execFileSync('git', ['init', '--quiet'], { cwd });
			writeFileSync(join(cwd, gate), headPage);
			execFileSync('git', ['add', '.'], { cwd });
		}
		const head = join(root, 'head');
		const composable =
			'packages/sdk/vue/src/runtime/composables/script-loader.ts';
		mkdirSync(dirname(join(head, composable)), { recursive: true });
		writeFileSync(join(head, composable), 'export const useScriptLoader = 1;');

		// The base lacks the composable: its page uses core's loader.
		const base = join(root, 'base');
		replaceBenchmarkFixtures(head, base);
		const rewritten = readFileSync(join(base, gate), 'utf8');
		expect(rewritten).toContain(
			'createScriptLoader({ kernel, scripts: gateScripts() })'
		);
		expect(rewritten).not.toContain('useScriptLoader');

		// A base that has it keeps the head's page as written.
		const newer = join(root, 'newer');
		mkdirSync(dirname(join(newer, gate)), { recursive: true });
		mkdirSync(dirname(join(newer, composable)), { recursive: true });
		execFileSync('git', ['init', '--quiet'], { cwd: newer });
		writeFileSync(join(newer, gate), 'old');
		writeFileSync(join(newer, composable), 'export const useScriptLoader = 1;');
		execFileSync('git', ['add', '.'], { cwd: newer });
		replaceBenchmarkFixtures(head, newer);
		expect(readFileSync(join(newer, gate), 'utf8')).toBe(headPage);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

it('gives each older base the root names it exports', () => {
	const root = mkdtempSync(join(tmpdir(), 'inth-overlay-root-'));
	try {
		const fixtures: Record<string, [string, string]> = {
			'benchmarks/kit/+layout.svelte': [
				"<script>\n\timport { InthProvider } from '@inth/svelte/kit';\n</script>\n<InthProvider state={data.consent} />",
				"<script>\n\timport { ConsentRoot as InthProvider } from '@inth/svelte';\n</script>\n<InthProvider state={data.consent} />",
			],
			'benchmarks/next/provider.tsx': [
				[
					"import { ConsentBanner, InthProvider } from '@inth/nextjs';",
					"import type { InthProviderProps } from '@inth/nextjs';",
					"import { InthProvider as ReactProvider } from '@inth/nextjs/react';",
					"import type { InthProviderOptions as ReactProviderOptions } from '@inth/nextjs/react';",
					'export const x = <InthProvider state={s}><ReactProvider /></InthProvider>;',
				].join('\n'),
				[
					"import { ConsentBanner } from '@inth/nextjs';",
					"import { ConsentRoot as InthProvider } from '@inth/nextjs';",
					"import type { ConsentRootProps as InthProviderProps } from '@inth/nextjs';",
					"import { ConsentProvider as ReactProvider } from '@inth/nextjs';",
					"import type { ConsentProviderOptions as ReactProviderOptions } from '@inth/nextjs';",
					'export const x = <InthProvider state={s}><ReactProvider /></InthProvider>;',
				].join('\n'),
			],
			'benchmarks/nuxt/consent-mount.vue': [
				'<template>\n\t<InthProvider />\n</template>',
				'<template>\n\t<ConsentRoot />\n</template>',
			],
			'benchmarks/react/entry.ts': [
				"export { InthProvider, ConsentBanner } from '@inth/react';",
				"export { ConsentBanner } from '@inth/react';\nexport { ConsentProvider as InthProvider } from '@inth/react';",
			],
		};
		const write = (path: string, content: string) => {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, content);
		};
		const make = (
			arm: string,
			{ reactEntry, renamed }: { reactEntry: boolean; renamed: boolean }
		) => {
			const cwd = join(root, arm);
			for (const [file, [head]] of Object.entries(fixtures)) {
				write(join(cwd, file), head);
			}
			write(
				join(cwd, 'packages/sdk/react/src/provider.tsx'),
				renamed
					? 'export const InthProvider = 1;'
					: 'export const ConsentProvider = 1;'
			);
			if (reactEntry) {
				write(
					join(cwd, 'packages/sdk/nextjs/src/react.ts'),
					"export * from '@inth/react';"
				);
			}
			execFileSync('git', ['init', '--quiet'], { cwd });
			execFileSync('git', ['add', '.'], { cwd });
			return cwd;
		};
		const current = { reactEntry: true, renamed: true };
		const head = make('head', current);

		const base = make('base', { reactEntry: false, renamed: false });
		replaceBenchmarkFixtures(head, base);
		for (const [file, [, old]] of Object.entries(fixtures)) {
			expect(readFileSync(join(base, file), 'utf8')).toBe(old);
		}

		// The root is already InthProvider, but React's provider has no
		// `/react` entry yet: only those imports move, to `@inth/react`.
		const renamedOnly = make('renamed-only', {
			reactEntry: false,
			renamed: true,
		});
		replaceBenchmarkFixtures(head, renamedOnly);
		expect(
			readFileSync(join(renamedOnly, 'benchmarks/next/provider.tsx'), 'utf8')
		).toBe(
			[
				"import { ConsentBanner, InthProvider } from '@inth/nextjs';",
				"import type { InthProviderProps } from '@inth/nextjs';",
				"import { InthProvider as ReactProvider } from '@inth/react';",
				"import type { InthProviderOptions as ReactProviderOptions } from '@inth/react';",
				'export const x = <InthProvider state={s}><ReactProvider /></InthProvider>;',
			].join('\n')
		);
		for (const file of [
			'benchmarks/kit/+layout.svelte',
			'benchmarks/nuxt/consent-mount.vue',
			'benchmarks/react/entry.ts',
		]) {
			expect(readFileSync(join(renamedOnly, file), 'utf8')).toBe(
				fixtures[file]?.[0]
			);
		}

		// A base with both keeps the head's files.
		const newer = make('newer', current);
		replaceBenchmarkFixtures(head, newer);
		for (const [file, [headSource]] of Object.entries(fixtures)) {
			expect(readFileSync(join(newer, file), 'utf8')).toBe(headSource);
		}
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});
