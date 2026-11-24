import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

const thisDirectory = dirname(fileURLToPath(import.meta.url));

/** The package root, which is where the manifest's export map is defined. */
const packageRoot = join(thisDirectory, '../../..');
const manifestPath = join(packageRoot, 'package.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
	exports: Record<string, Record<string, unknown>>;
	name: string;
};

const pluginExports = manifest.exports['./expo-plugin'] ?? {};
const requireSpecifier = pluginExports.require;
const importSpecifier = pluginExports.import;

// A manifest that lost either condition means Expo cannot load the plugin at
// all, so say that rather than let every assertion below compare against
// `undefined`.
if (
	typeof requireSpecifier !== 'string' ||
	typeof importSpecifier !== 'string'
) {
	throw new Error(
		'./expo-plugin needs both a "require" and an "import" condition in packages/react-native/package.json, otherwise Expo resolves the plugin to an ES module it cannot require.'
	);
}

/**
 * Resolve and load the way Expo does: `@expo/require-utils` hands the specifier
 * to Node's CommonJS resolver, then `require()`s whatever file comes back. A
 * self-reference is the same resolution from inside the package.
 */
const requireFromPackage = createRequire(manifestPath);

const entryPath = function entryPath(specifier: string): string {
	return resolve(packageRoot, specifier.replace(/^\.\//u, ''));
};

const cjsEntryPath = entryPath(requireSpecifier);

/** Load the built file, failing with the reason rather than an ENOENT stack. */
const builtCjsEntry = function builtCjsEntry(): Record<string, unknown> {
	if (!existsSync(cjsEntryPath)) {
		throw new Error(
			`${cjsEntryPath} is missing. Run \`bun run build\` in packages/react-native before this test.`
		);
	}

	return requireFromPackage(cjsEntryPath) as Record<string, unknown>;
};

describe('the CommonJS plugin entry', () => {
	it('publishes a require condition ahead of import and default', () => {
		// Node takes the first condition key that matches, so the order is part
		// of the contract: a `require` placed after `import` would never fire.
		expect(Object.keys(pluginExports)).toEqual([
			'types',
			'require',
			'import',
			'default',
		]);
		expect(requireSpecifier).toBe('./dist/expo-plugin/index.cjs');
		expect(importSpecifier).toBe('./dist/expo-plugin/index.js');
	});

	it('resolves the published subpath to the .cjs for a require', () => {
		const resolved = requireFromPackage.resolve(`${manifest.name}/expo-plugin`);

		expect(resolve(resolved)).toBe(cjsEntryPath);
	});

	it('loads under require() with the plugin on the default export', () => {
		const loaded = builtCjsEntry();

		expect(typeof loaded.default).toBe('function');
		expect(typeof loaded.withInth).toBe('function');
		expect(typeof loaded.applyParamsOnConfig).toBe('function');
		expect(typeof loaded.InthPluginError).toBe('function');
	});

	it("is one bundled file that loads the app's expo/config-plugins", () => {
		const code = readFileSync(cjsEntryPath, 'utf8');

		expect(code).toMatch(/["']use strict["']/u);
		expect(code).not.toMatch(/^\s*import\s*[{'"*]/mu);
		expect(code).not.toMatch(/^\s*export\s*[{'*]/mu);
		// A second copy of @expo/config-plugins would register its mods through a
		// separate `withMod` and another SDK's helpers, so the bundle requires the
		// copy the app's `expo` re-exports and names no other.
		expect(code).toMatch(/\((?<quote>["'])expo\/config-plugins\k<quote>\)/u);
		expect(code).not.toContain('@expo/config-plugins');
	});

	it('names the expo peer when it cannot resolve expo/config-plugins', () => {
		builtCjsEntry();
		const directory = mkdtempSync(join(tmpdir(), 'inth-plugin-no-expo-'));
		try {
			const isolated = join(directory, 'index.cjs');
			writeFileSync(isolated, readFileSync(cjsEntryPath));
			expect(() => createRequire(isolated)(isolated)).toThrowError(
				/InthPluginError|expo is a peer dependency/u
			);
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});
});

describe('the ES module plugin entry', () => {
	it('stays published alongside the CommonJS one', () => {
		const esmEntryPath = entryPath(importSpecifier);

		expect(existsSync(esmEntryPath)).toBe(true);
		expect(readFileSync(esmEntryPath, 'utf8')).toContain('export default');
	});
});

/**
 * A throwaway app whose `node_modules` holds this package and the workspace's
 * `expo`, which is all Expo's resolver reads.
 */
const withTemporaryApp = function withTemporaryApp<ResultType>(
	run: (projectRoot: string) => ResultType
): ResultType {
	const projectRoot = mkdtempSync(join(tmpdir(), 'inth-app-plugin-'));
	try {
		mkdirSync(join(projectRoot, 'node_modules/@inth'), { recursive: true });
		symlinkSync(packageRoot, join(projectRoot, 'node_modules', manifest.name));
		symlinkSync(
			dirname(requireFromPackage.resolve('expo/package.json')),
			join(projectRoot, 'node_modules/expo')
		);
		return run(projectRoot);
	} finally {
		rmSync(projectRoot, { force: true, recursive: true });
	}
};

describe('the root app.plugin.js', () => {
	it('is published and exported, so Expo SDK 55 can resolve it', () => {
		const { files } = manifest as unknown as { files: string[] };

		expect(files).toContain('app.plugin.js');
		// SDK 55 resolves `<package>/app.plugin.js` through the export map.
		expect(manifest.exports['./app.plugin.js']).toBe('./app.plugin.js');
	});

	it('loads through Expo and configures the app like the subpath', () => {
		builtCjsEntry();
		const requireFromExpo = createRequire(
			requireFromPackage.resolve('expo/package.json')
		);
		const { resolveConfigPluginFunctionWithInfo } = requireFromExpo(
			'@expo/config-plugins/build/utils/plugin-resolver'
		) as {
			resolveConfigPluginFunctionWithInfo: (
				projectRoot: string,
				reference: string
			) => {
				isPluginFile: boolean;
				plugin: (config: unknown, props: unknown) => Record<string, unknown>;
				pluginFile: string;
			};
		};

		withTemporaryApp((projectRoot) => {
			const apply = (reference: string) => {
				const resolved = resolveConfigPluginFunctionWithInfo(
					projectRoot,
					reference
				);
				const config = resolved.plugin(
					{
						_internal: { projectRoot },
						android: { package: 'com.example.app' },
						ios: { bundleIdentifier: 'com.example.app' },
						name: 'Example',
						slug: 'example',
					},
					{
						androidMavenRepository: { url: 'https://maven.example.com/inth' },
						projectUrl: 'https://acme.inth.app',
						skipNativeBuildCheck: true,
					}
				);
				const mods = config.mods as Record<string, Record<string, unknown>>;
				return {
					config: {
						extra: config.extra,
						history: config._internal,
						ios: config.ios,
						mods: Object.fromEntries(
							Object.entries(mods).map(([platform, entries]) => [
								platform,
								Object.keys(entries).sort(),
							])
						),
					},
					resolved,
				};
			};

			const root = apply(manifest.name);
			const subpath = apply(`${manifest.name}/expo-plugin`);

			expect(root.resolved.isPluginFile).toBe(true);
			expect(root.resolved.pluginFile.endsWith('app.plugin.js')).toBe(true);
			expect(root.resolved.plugin).toBe(subpath.resolved.plugin);
			expect(root.config).toEqual(subpath.config);
			expect(root.config.extra).toMatchObject({
				inth: { projectUrl: 'https://acme.inth.app' },
			});
		});
	});
});
