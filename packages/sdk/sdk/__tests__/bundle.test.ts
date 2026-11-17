/**
 * What a bundler sees when an app imports `@inth/sdk` entries: one copy of
 * every module however many entries reach it, and only the modules an
 * entry needs.
 */
import { spawnSync } from 'node:child_process';

import { build } from 'esbuild';
import { describe, expect, test } from 'vitest';

import { PACKAGE_ROOT } from '../scripts/assemble';

/**
 * Bundles `contents` the way an app build splits it, and returns the inputs
 * of the chunks the page loads first: the entry and the chunks it imports
 * statically. Chunks behind `import()` load only when used.
 */
const bundle = async function bundle(contents: string) {
	const result = await build({
		bundle: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		format: 'esm',
		logLevel: 'silent',
		metafile: true,
		minify: true,
		outdir: '/out',
		platform: 'browser',
		splitting: true,
		stdin: { contents, loader: 'js', resolveDir: PACKAGE_ROOT },
		write: false,
	});
	const { outputs } = result.metafile;
	const entry = Object.keys(outputs).find(
		(key) => outputs[key]?.entryPoint === '<stdin>'
	);
	const firstLoad = new Set<string>();
	const visit = function visit(key: string | undefined) {
		if (!key || firstLoad.has(key)) {
			return;
		}
		firstLoad.add(key);
		for (const imported of outputs[key]?.imports ?? []) {
			if (imported.kind === 'import-statement' && !imported.external) {
				visit(imported.path);
			}
		}
	};
	visit(entry);
	return {
		all: Object.keys(result.metafile.inputs).filter(
			(input) => input !== '<stdin>'
		),
		firstLoad: [
			...new Set(
				[...firstLoad].flatMap((key) => Object.keys(outputs[key]?.inputs ?? {}))
			),
		].filter((input) => input !== '<stdin>'),
	};
};

/** Inputs that come from this package, by their path under `lib/`. */
const sdkInputs = function sdkInputs(inputs: string[]) {
	return inputs.filter((input) => input.startsWith('lib/'));
};

describe('one module instance', () => {
	test('entries from different parts share every module they both reach', async () => {
		const { all: inputs } = await bundle(`
			import { init } from '@inth/sdk';
			import { getEventDispatcher } from '@inth/sdk/events';
			import { createConsentRuntime } from '@inth/sdk/runtime';
			import { createConsentKernel } from '@inth/sdk/engine';
			import { createIAB } from '@inth/sdk/iab';
			import { mountDevTools, createDevTools } from '@inth/sdk/devtools';
			import { testing, createTestingMode } from '@inth/sdk/testing';
			console.log(init, getEventDispatcher, createConsentRuntime, createConsentKernel, createIAB, mountDevTools, createDevTools, testing, createTestingMode);
		`);
		// Every input is a file under lib/ or a third-party dependency: none
		// comes from the private workspace folders.
		expect(
			inputs.filter(
				(input) => !input.startsWith('lib/') && !input.includes('node_modules')
			)
		).toEqual([]);
		// esbuild keys inputs by path, so a module bundled twice would show
		// up under a second path. Each part's file appears once.
		const own = sdkInputs(inputs);
		expect(new Set(own).size).toBe(own.length);
		expect(own).toContain('lib/core/dist/events.js');
	});

	test('Node loads one copy of a module that two entries re-export', () => {
		const script = `
			const root = await import('@inth/sdk');
			const events = await import('@inth/sdk/events');
			const devtools = await import('@inth/sdk/devtools');
			const sharedDevTools = await import('./lib/dev-tools/dist/index.js');
			const testing = await import('@inth/sdk/testing');
			const engineTesting = await import('./lib/core/dist/testing.js');
			console.log(JSON.stringify([
				root.getEventDispatcher === events.getEventDispatcher,
				devtools.createDevTools === sharedDevTools.createDevTools,
				testing.createTestingMode === engineTesting.createTestingMode,
			]));
		`;
		const result = spawnSync(
			process.execPath,
			['--input-type=module', '-e', script],
			{ cwd: PACKAGE_ROOT, encoding: 'utf8' }
		);
		expect(result.stderr).toBe('');
		expect(JSON.parse(result.stdout)).toEqual([true, true, true]);
	});
});

describe('tree-shaking', () => {
	test('a hosted client leaves out dev tools, IAB, testing and other languages', async () => {
		const inputs = sdkInputs(
			(
				await bundle(`
					import { init } from '@inth/sdk';
					init({ projectUrl: 'https://example.inth.app' });
				`)
			).firstLoad
		);
		expect(
			inputs.filter((input) => input.startsWith('lib/dev-tools/'))
		).toEqual([]);
		expect(inputs.filter((input) => input.startsWith('lib/iab/'))).toEqual([]);
		expect(inputs.filter((input) => /testing/u.test(input))).toEqual([]);
		expect(
			inputs.filter(
				(input) =>
					input.startsWith('lib/translations/dist/languages/') ||
					input === 'lib/translations/dist/all.js'
			)
		).toEqual([]);
	});

	test('a per-language import pulls in only that language', async () => {
		const inputs = sdkInputs(
			(
				await bundle(`
					import { translations } from '@inth/sdk/translations/de';
					console.log(translations);
				`)
			).all
		);
		expect(
			inputs.filter(
				(input) =>
					input.startsWith('lib/translations/dist/languages/') ||
					input === 'lib/translations/dist/all.js'
			)
		).toEqual(['lib/translations/dist/languages/de.js']);
	});
});
