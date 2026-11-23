/**
 * The mobile package carries no consent kernel and no TCF codec.
 *
 * This package renders what a native core decides and hands it back over the
 * TurboModule bridge. That boundary is the reason the SDK exists, and it is
 * easy to lose quietly: `@inth/sdk/engine` is a devDependency, so a stray runtime
 * import type-checks, lints, and passes tests on a desktop before anyone notices
 * a JavaScript consent engine shipped inside the app bundle. The TC String
 * fixtures lane adds `@iabtechlabtcf/core` as a devDependency for the same
 * reason, and that package is a test-time oracle, nothing more.
 *
 * So the rule is checked against the source that actually ships: any *value*
 * import of a workspace package or of the reference encoder is a bug. Type-only
 * imports are fine and expected, because they erase at build time and cost the
 * bundle nothing.
 *
 * Web is the one exception, and it is a platform, not a loophole. A web build
 * has no native core, so the `.web` twins (`native/create-consent-client.web.ts` and the
 * files under `web/`) run the browser engine from `@inth/sdk/engine`. Metro picks a
 * `.web` file on web only, so the rule holds for every file an iOS or Android
 * bundle can read, and the twins may reach `@inth/sdk/engine` and nothing else.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import {
	isForbiddenModule,
	isWebEngineModule,
	isWebOnlyFile,
	moduleReferences,
} from './helpers/module-boundary';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');

/** Specifiers that must never reach the app bundle as a runtime dependency. */
const FORBIDDEN = ['c15t', '@inth/sdk', '@c15t/backend', '@iabtechlabtcf/core'];

/**
 * Every `import`/`re-export … from '…'` statement, so the specifier and its
 * clause can be judged together. Statements span lines, hence `s`.
 */
const IMPORT_STATEMENT =
	/(?<lead>^|\n)[ \t]*(?<kind>import|export)\s+(?:(?<clause>[\s\S]*?)\s+from\s+)?['"](?<specifier>[^'"]+)['"]/gu;

/** Whether every named binding in a clause is erased by the compiler. */
const isTypeOnlyClause = function isTypeOnlyClause(
	kind: string,
	clause: string | undefined
): boolean {
	if (kind === 'import' && clause?.startsWith('type ')) {
		return true;
	}

	if (!clause || clause.startsWith('* as ') || !clause.startsWith('{')) {
		return false;
	}

	return clause
		.slice(1, clause.lastIndexOf('}'))
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.every((entry) => entry.startsWith('type '));
};

const sources = (function sources(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);

		if (statSync(full).isDirectory()) {
			// Test code is where the oracle is allowed to live.
			if (entry !== '__tests__' && entry !== 'node_modules') {
				sources(full, acc);
			}
			continue;
		}

		if (['.ts', '.tsx'].includes(extname(entry)) && !entry.endsWith('.d.ts')) {
			acc.push(full);
		}
	}

	return acc;
})(SRC);

/** Files an iOS or Android bundle can read. */
const nativeSources = sources.filter((file) => !isWebOnlyFile(file));

/** The `.web` files, which only a web bundle reads. */
const webSources = sources.filter(isWebOnlyFile);

test('the shipped source is large enough for this guard to mean anything', () => {
	// A guard that walks nothing passes, which is the worst kind of green.
	expect(nativeSources.length).toBeGreaterThan(20);
	expect(webSources.map((file) => relative(SRC, file)).sort()).toEqual([
		'native/create-consent-client.web.ts',
		'native/presenter.web.ts',
		'web/create-web-consent-client.web.ts',
		'web/web-options-from-manifest.web.ts',
	]);
});

test('no runtime import of the consent kernel or the TCF codec', () => {
	const offenders: string[] = [];

	for (const file of nativeSources) {
		const text = readFileSync(file, 'utf8');

		for (const match of text.matchAll(IMPORT_STATEMENT)) {
			const specifier = match.groups?.specifier ?? '';
			const base = specifier.startsWith('@')
				? specifier.split('/').slice(0, 2).join('/')
				: specifier;

			if (
				FORBIDDEN.includes(base) &&
				!isTypeOnlyClause(match.groups?.kind ?? 'import', match.groups?.clause)
			) {
				offenders.push(`${relative(SRC, file)}: ${specifier}`);
			}
		}
	}

	expect(offenders).toEqual([]);
});

test('the kernel and the codec stay devDependencies, and only web may peer on the kernel', () => {
	const manifest = JSON.parse(
		readFileSync(join(SRC, '..', 'package.json'), 'utf8')
	) as {
		dependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
		peerDependenciesMeta?: Record<string, { optional?: boolean }>;
	};

	for (const name of FORBIDDEN) {
		expect(manifest.dependencies?.[name], name).toBeUndefined();
		expect(manifest.optionalDependencies?.[name], name).toBeUndefined();
	}
	// A native app installs nothing for web: the kernel is an optional peer.
	expect(
		Object.keys(manifest.peerDependencies ?? {}).filter(isForbiddenModule)
	).toEqual(['@inth/sdk']);
	expect(manifest.peerDependenciesMeta?.['@inth/sdk']?.optional).toBe(true);
});

test('source declarations and lazy imports cannot name web packages either', () => {
	for (const file of nativeSources) {
		expect(
			moduleReferences(readFileSync(file, 'utf8')).filter(isForbiddenModule),
			file
		).toEqual([]);
	}
});

test('the web twins reach the browser engine and no other web package', () => {
	for (const file of webSources) {
		const web = moduleReferences(readFileSync(file, 'utf8')).filter(
			isForbiddenModule
		);
		expect(
			web.filter((specifier) => !isWebEngineModule(specifier)),
			file
		).toEqual([]);
	}
	// The guard reads the file that runs the engine.
	expect(
		moduleReferences(
			readFileSync(join(SRC, 'web/create-web-consent-client.web.ts'), 'utf8')
		).some(isWebEngineModule)
	).toBe(true);
});

test('no file an iOS or Android bundle reads names a web twin', () => {
	const offenders: string[] = [];

	for (const file of nativeSources) {
		for (const specifier of moduleReferences(readFileSync(file, 'utf8'))) {
			if (
				specifier.startsWith('.') &&
				/\.web(?:\.[cm]?[jt]sx?)?$/u.test(specifier)
			) {
				offenders.push(`${relative(SRC, file)}: ${specifier}`);
			}
		}
	}

	expect(offenders).toEqual([]);
});

test('each platform twin exports what its native module exports', async () => {
	const pairs = [
		[await import('../native/create-consent-client'), await import('../native/create-consent-client.web')],
		[
			await import('../native/presenter'),
			await import('../native/presenter.web'),
		],
	] as const;

	for (const [native, web] of pairs) {
		expect(Object.keys(web).sort()).toEqual(Object.keys(native).sort());
	}
	// The web twin loads the browser engine, which takes a while on a busy runner.
}, 30_000);
