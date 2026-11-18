import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { InthPluginError } from './errors';

/** Release builds fail when the manifest fetch fails; debug builds warn and continue. */
export type ManifestBuild = 'release' | 'debug';

/** Validated `bundleManifest` settings. */
export interface ResolvedBundleManifest {
	readonly allowStaleManifest: boolean;
	/** The build is a `dryRun` build, so the command takes the relaxed URL rule. */
	readonly dryRun: boolean;
	readonly expiresInDays: number | null;
	readonly languages: readonly string[];
	/** Where the fetched copy is kept, relative to the Expo project. */
	readonly out: string;
	/**
	 * The app's declared vendor scope, so the bundled GVL holds the same vendors the
	 * runtime discloses rather than the whole list. Empty keeps every vendor.
	 */
	readonly vendors: readonly number[];
}

/**
 * Which kind of build this prebuild feeds.
 *
 * `C15T_MANIFEST_BUILD` wins. Otherwise only `expo run:*` counts as debug, and
 * only with no `--release` and with no variant or configuration, or one whose
 * name says debug (`Debug`, `demoDebug`). Any other name, such as `Production`,
 * is release. So is everything that is not `expo run:*`, including a bare
 * `expo prebuild` and EAS Build. A release binary never ships without the
 * manifest just because its build had an unexpected name.
 */
export const manifestBuild = function manifestBuild(
	argv: readonly string[],
	env: Readonly<Record<string, string | undefined>>
): ManifestBuild {
	const declared = env.C15T_MANIFEST_BUILD?.trim().toLowerCase();
	if (declared === 'release' || declared === 'debug') {
		return declared;
	}
	const command = argv.find((token) => token.startsWith('run:'));
	if (command === undefined) {
		return 'release';
	}
	const releaseFlag = argv.some((token, index) => {
		const value = /^--(?:variant|configuration)(?:=(?<name>.*))?$/u.exec(token);
		if (value === null) {
			return token === '--release';
		}
		const name = value.groups?.name ?? argv[index + 1] ?? '';
		return name.startsWith('-') || !/debug/iu.test(name);
	});
	return releaseFlag ? 'release' : 'debug';
};

/** The app's own `c15t` binary. The plugin never downloads one. */
export const resolveCli = function resolveCli(projectRoot: string): string {
	let manifest: string;
	try {
		manifest = createRequire(join(projectRoot, 'package.json')).resolve(
			'@c15t/cli/package.json'
		);
	} catch {
		throw new InthPluginError(
			'bundleManifest runs `c15t mobile-manifest`, and @c15t/cli is not ' +
				'installed in this project. Add @c15t/cli to devDependencies.'
		);
	}
	const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as {
		bin?: string | Record<string, string>;
	};
	const entry = typeof bin === 'string' ? bin : bin?.c15t;
	if (entry === undefined) {
		throw new InthPluginError('@c15t/cli has no c15t binary to run.');
	}
	return resolve(dirname(manifest), entry);
};

/** Arguments for `c15t mobile-manifest`. */
export const manifestArguments = function manifestArguments(
	projectUrl: string,
	settings: ResolvedBundleManifest,
	out: string,
	build: ManifestBuild
): string[] {
	return [
		'mobile-manifest',
		'--backend-url',
		projectUrl,
		'--out',
		out,
		'--build',
		build,
		...(settings.dryRun ? ['--dry-run'] : []),
		...(settings.allowStaleManifest ? ['--allow-stale-manifest'] : []),
		...(settings.expiresInDays === null
			? []
			: ['--expires-in-days', String(settings.expiresInDays)]),
		...(settings.languages.length > 0
			? ['--languages', settings.languages.join(',')]
			: []),
		...(settings.vendors.length > 0
			? ['--vendors', settings.vendors.join(',')]
			: []),
	];
};

const runs = new Map<string, Promise<void>>();

/**
 * Fetch the manifest once per prebuild, however many platform mods ask for it.
 *
 * The CLI decides what a failed fetch means: it exits non-zero only for a
 * release build with no reusable copy, which fails the prebuild here.
 */
export const fetchBundledManifest = function fetchBundledManifest(
	projectRoot: string,
	projectUrl: string,
	settings: ResolvedBundleManifest,
	build: ManifestBuild,
	dependencies = { resolveCli, spawn }
): Promise<void> {
	const out = resolve(projectRoot, settings.out);
	const key = `${out}\n${build}`;
	const existing = runs.get(key);
	if (existing !== undefined) {
		return existing;
	}
	const run = new Promise<void>((_resolve, _reject) => {
		const child = dependencies.spawn(
			process.execPath,
			[
				dependencies.resolveCli(projectRoot),
				...manifestArguments(projectUrl, settings, out, build),
			],
			{ cwd: projectRoot, stdio: 'inherit' }
		);
		child.once('error', _reject);
		child.once('close', (code) => {
			if (code === 0) {
				_resolve();
			} else {
				_reject(
					new InthPluginError(
						`c15t mobile-manifest could not fetch the manifest for this ${build} build. ` +
							'Connect the build to the network, set bundleManifest.allowStaleManifest ' +
							'to reuse the last fetched copy, or set C15T_MANIFEST_BUILD=debug for a debug build.'
					)
				);
			}
		});
	});
	runs.set(key, run);
	return run;
};
