/**
 * How Vite 8 (Rolldown), TanStack Start's bundler, splits the published
 * packages for a route that mounts the provider. Each first-load file is
 * one more request before the banner can show, and on HTTP/1.1 each costs
 * a phone about 13–15 ms.
 *
 * Rolldown keeps a module that lazy chunks share with the route in the
 * route's chunk only while its chunk graph has no static cycle, and its
 * cycle check counts every import record, used or not. One unused
 * re-export (`@inth/sdk/ui/utils/dom` re-exporting `setupColorScheme`) was
 * enough to split every shared module into its own file.
 *
 * `ConsentRoot` loads its engine with `import()`: the first-load files
 * hold the deferred shell, the banner's tap path and the boot-data reader.
 * The engine chunk brings the code that applies a streamed state with it,
 * so a streamed banner doesn't wait for one more request after the engine.
 * Both routes here mount a deferred root, so the small modules the shell
 * shares with the engine, the commit path and the other route each get a
 * file of their own: 12 files, about 13 KB after Brotli. An app whose
 * routes all use `ConsentRoot` loads 9.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

import { createDialogChunkPlugin } from '@inth/sdk/build';
import { build } from 'vite';
import { describe, expect, test } from 'vitest';

const rootEngineModule = /tanstack-start\/dist\/root-engine\.js$/u;
const dialogModule = /react\/dist\/deferred\/dialog\.js$/u;

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Two lazy routes, each mounting the provider, banner and dialog. */
const fixture: Record<string, string> = {
	entry:
		"globalThis.routes = [() => import('fixture:root-route'), () => import('fixture:provider-route')];",
	'provider-route': `import { createElement as h } from 'react';
import { ConsentBanner, ConsentDialog, ConsentProvider } from '@inth/tanstack-start';
export default () => h(ConsentProvider, { options: { projectUrl: '/api/c15t' } }, h(ConsentBanner), h(ConsentDialog));`,
	'root-route': `import { createElement as h } from 'react';
import { ConsentBanner, ConsentDialog, ConsentRoot } from '@inth/tanstack-start';
export default () => h(ConsentRoot, { state: { projectUrl: '/api/c15t' } }, h(ConsentBanner), h(ConsentDialog));`,
};

interface FirstLoad {
	files: string[];
	modules: string[];
	/** Brotli bytes of the first-load files. */
	brotli: number;
	/** Modules the root's engine chunk loads with it. */
	engineModules: string[];
	/** Files opening the dialog fetches that the first load did not. */
	dialogFiles: string[];
}

/**
 * Builds the fixture against `dist/` and lists the files a route loads
 * first, with the modules in them.
 */
const routeFirstLoad = async function routeFirstLoad(
	route: string,
	groupDialog = false
): Promise<FirstLoad> {
	const result = await build({
		build: {
			minify: false,
			rolldownOptions: {
				external: [/^react(?:$|\/)/u, /^react-dom(?:$|\/)/u],
				input: 'fixture:entry',
			},
			write: false,
		},
		configFile: false,
		logLevel: 'silent',
		plugins: [
			{
				load: (id) =>
					id.startsWith('\0fixture:')
						? fixture[id.slice('\0fixture:'.length)]
						: undefined,
				name: 'fixture',
				resolveId: (id) => (id.startsWith('fixture:') ? `\0${id}` : undefined),
			},
			// What `consentManifest()` adds to a browser build.
			...(groupDialog ? [createDialogChunkPlugin()] : []),
		],
		publicDir: false,
		resolve: {
			alias: [
				{
					find: /^@inth\/tanstack-start$/u,
					replacement: join(packageRoot, 'dist/index.js'),
				},
			],
		},
		root: packageRoot,
	});
	if (!('output' in result)) {
		throw new Error('expected a single build output');
	}
	const chunks = new Map(
		result.output.flatMap((item) =>
			item.type === 'chunk' ? [[item.fileName, item] as const] : []
		)
	);
	const routeChunk = [...chunks.values()].find(
		(chunk) => chunk.facadeModuleId === `\0fixture:${route}`
	);
	if (!routeChunk) {
		throw new Error(`no chunk for ${route}`);
	}
	/** `file` and every file it imports statically. */
	const closure = (file: string): Set<string> => {
		const loaded = new Set<string>();
		const pending = [file];
		for (let next = pending.pop(); next; next = pending.pop()) {
			if (!loaded.has(next)) {
				loaded.add(next);
				pending.push(
					...(chunks.get(next)?.imports ?? []).filter((dep) => chunks.has(dep))
				);
			}
		}
		return loaded;
	};
	const modulesOf = (files: Iterable<string>): string[] =>
		[...files].flatMap((file) => Object.keys(chunks.get(file)?.modules ?? {}));
	const firstLoad = closure(routeChunk.fileName);
	const engineChunk = [...chunks.values()].find((chunk) =>
		Object.keys(chunk.modules).some((id) => rootEngineModule.test(id))
	);
	const dialogChunk = [...chunks.values()].find((chunk) =>
		Object.keys(chunk.modules).some((id) => dialogModule.test(id))
	);
	return {
		brotli: [...firstLoad].reduce(
			(total, file) =>
				total + brotliCompressSync(chunks.get(file)?.code ?? '').length,
			0
		),
		dialogFiles: dialogChunk
			? [...closure(dialogChunk.fileName)].filter(
					(file) => !firstLoad.has(file)
				)
			: [],
		engineModules: engineChunk ? modulesOf(closure(engineChunk.fileName)) : [],
		files: [...firstLoad].sort(),
		modules: modulesOf(firstLoad),
	};
};

const streamedInitModule = /core\/dist\/runtime\/streamed-init\.js$/u;

/**
 * Code `ConsentRoot` loads with `import()` only when the browser runs init:
 * the full hosted transport, offline mode with its policy pack, and both
 * manifest resolvers.
 */
const deferredModules = [
	/core\/dist\/transports\/hosted\.js$/u,
	/core\/dist\/transports\/offline\.js$/u,
	/core\/dist\/transports\/manifest(?:-browser)?\.js$/u,
	/react\/dist\/transports\/offline\.js$/u,
];

describe('TanStack Start client chunks', () => {
	test.each([
		['root-route', 12],
		['provider-route', 22],
	])(
		'a %s loads at most %i files first',
		async (route, bound) => {
			// The route, the app entry, and the small modules the deferred
			// shell shares with lazy chunks (the engine, the commit path, the
			// stock surfaces) and with the other route. The provider route
			// also builds the banner's snapshot from the inline prefetch
			// before its engine loads, so it loads the policy and copy code.
			const { files } = await routeFirstLoad(route);
			expect(files.length, files.join('\n')).toBeLessThanOrEqual(bound);
		},
		60_000
	);

	test('a root route loads its engine on demand', async () => {
		const { brotli, modules } = await routeFirstLoad('root-route');
		expect(modules.some((id) => rootEngineModule.test(id))).toBe(false);
		expect(modules.some((id) => id.endsWith('react/dist/provider.js'))).toBe(
			false
		);
		// About 16 KB unminified; the engine's chunk group is several times that.
		// The returning-visitor path (the stored-choice gate and watcher, the
		// wake-up on a failed server start, the render's page object and the
		// live-option wake-up, and the plain-script checks that keep the early
		// start to what it can verify) sits in the first load. The build is
		// unminified, so it keeps Rolldown's `//#region <path>` comments: the
		// engine's modules sit under `../sdk/lib/core/dist/` since @inth/sdk,
		// which adds 18 bytes over 19,245 here. With the old paths the same
		// output is 19,228 bytes. The flat entry names (`@inth/sdk/engine` in
		// strings where `@inth/sdk/core` was) and the minifier's new local
		// names add 7 more, though the files' raw bytes went down.
		expect(brotli).toBeLessThanOrEqual(19_270);
	}, 60_000);

	test('a root route applies a streamed state with code its engine brings', async () => {
		const { engineModules, modules } = await routeFirstLoad('root-route');
		expect(modules.some((id) => streamedInitModule.test(id))).toBe(false);
		expect(engineModules.some((id) => streamedInitModule.test(id))).toBe(true);
	}, 60_000);

	test('a root route loads no init path, policy pack or resolver first', async () => {
		const { modules } = await routeFirstLoad('root-route');
		const initPaths = modules.filter((id) =>
			deferredModules.some((pattern) => pattern.test(id))
		);
		expect(initPaths).toEqual([]);
	}, 60_000);

	test("consentManifest()'s dialog group leaves the first load as it is and opens the dialog in fewer files", async () => {
		const plain = await routeFirstLoad('root-route');
		const grouped = await routeFirstLoad('root-route', true);
		expect(grouped.modules.toSorted()).toEqual(plain.modules.toSorted());
		expect(grouped.files.length).toBeLessThanOrEqual(plain.files.length);
		// This fixture's two routes set up c15t differently, so the dialog
		// shares code with each in its own way; an app with one setup gets
		// fewer files still.
		expect(
			grouped.dialogFiles.length,
			`${plain.dialogFiles.length} files before:\n${grouped.dialogFiles.join('\n')}`
		).toBeLessThan(plain.dialogFiles.length);
	}, 60_000);

	test('a provider route leaves that code to load on demand', async () => {
		const { modules } = await routeFirstLoad('provider-route');
		expect(modules.some((id) => streamedInitModule.test(id))).toBe(false);
	}, 60_000);
});
