/**
 * Assembles `@inth/sdk` from the private workspace packages it publishes.
 *
 * The engine, UI, translations, schema, IAB, dev tools and the vanilla
 * browser client keep their folders and builds under `packages/sdk`
 * as private packages named `@inth/sdk-<folder>`. This script copies each
 * one's built files into `lib/<folder>/` and rewrites the private names to
 * public subpaths: `@inth/sdk-core/runtime` becomes `@inth/sdk/runtime`, and
 * `@inth/sdk-browser` becomes `@inth/sdk`.
 *
 * Layout: the vanilla client is the root, and its entries and the engine's
 * sit at the top level. Where they collide, the client keeps the root and
 * the engine's root is `engine`. The client's `testing()` is the engine's,
 * so `testing` is the engine's entry; the client's `devtools` and the
 * shared dev tools are one entry; the client's IAB
 * entry is `iab-client`, since `iab` is the IAB engine. IAB, schema,
 * translations and UI keep their folder as a prefix.
 *
 * The copies keep every module as its own file, so a module that two entries
 * reach is one file and runs once. The rewritten imports are bare
 * self-references to this package, which Node and bundlers resolve through
 * the exports map below, so they keep its conditions (`style`, `node`,
 * `import`).
 *
 * Commands (from this package's folder):
 * - `node scripts/assemble.ts` builds `lib/`.
 * - `node scripts/assemble.ts --watch` rebuilds a package's copy when its
 *   build output changes.
 * - `node scripts/assemble.ts manifest` writes `exports`, `sideEffects`,
 *   `dependencies`, `main` and `types` into `package.json` from the private
 *   packages' manifests. `manifest --check` fails when they are out of date.
 */

import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	watch,
	writeFileSync,
} from 'node:fs';
import { dirname, join, matchesGlob, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	MERGED_ENTRIES,
	PARTS,
	toPublicSpecifier,
	toPublicSubpath,
} from '../../shared/sdk-parts.ts';
import type { Part } from '../../shared/sdk-parts.ts';

export const PACKAGE_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..'
);
const SDK_ROOT = resolve(PACKAGE_ROOT, '..');

type ExportTarget = string | null | { [condition: string]: ExportTarget };

interface Manifest {
	name: string;
	version: string;
	files?: string[];
	exports?: Record<string, ExportTarget>;
	sideEffects?: boolean | string[];
	dependencies?: Record<string, string>;
	[key: string]: unknown;
}

/**
 * Export keys that publish the same thing as another part's key, and so
 * are left out: the client's `testing()` is the engine's, under the same
 * name.
 */
const SAME_AS: readonly [Part, string, string][] = [
	['browser', './testing', './testing'],
];

const toLibTarget = function toLibTarget(
	part: Part,
	target: ExportTarget
): ExportTarget {
	if (target === null) {
		return null;
	}
	if (typeof target === 'string') {
		if (!target.startsWith('./')) {
			throw new Error(`${part}: export target ${target} is not relative`);
		}
		return `./lib/${part}/${target.slice(2)}`;
	}
	return Object.fromEntries(
		Object.entries(target).map(([condition, value]) => [
			condition,
			toLibTarget(part, value),
		])
	);
};

export const readPartManifest = function readPartManifest(
	part: Part
): Manifest {
	return JSON.parse(
		readFileSync(join(SDK_ROOT, part, 'package.json'), 'utf8')
	) as Manifest;
};

const isWorkspacePart = function isWorkspacePart(name: string) {
	return name.startsWith('@inth/sdk-');
};

/** The manifest fields this script owns, computed from the parts. */
export const computeManifestFields = function computeManifestFields() {
	const exports: Record<string, ExportTarget> = {};
	const sideEffects = new Set<string>();
	const dependencies: Record<string, string> = {};

	for (const part of PARTS) {
		const manifest = readPartManifest(part);
		for (const [key, target] of Object.entries(manifest.exports ?? {})) {
			const subpath = toPublicSubpath(part, key);
			if (
				key === './package.json' ||
				subpath in MERGED_ENTRIES ||
				SAME_AS.some(([p, k]) => p === part && k === key)
			) {
				continue;
			}
			if (subpath in exports) {
				throw new Error(`${part}: ${subpath} is exported twice`);
			}
			exports[subpath] = toLibTarget(part, target);
		}

		const declared = manifest.sideEffects;
		if (declared === undefined || declared === true) {
			// No declaration means every file may have side effects.
			sideEffects.add(`./lib/${part}/**`);
		} else if (Array.isArray(declared)) {
			for (const pattern of declared) {
				sideEffects.add(
					pattern.startsWith('./')
						? `./lib/${part}/${pattern.slice(2)}`
						: pattern
				);
			}
		}

		for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
			if (isWorkspacePart(name)) {
				continue;
			}
			if (dependencies[name] && dependencies[name] !== range) {
				throw new Error(
					`${name} is ${dependencies[name]} in one part and ${range} in ${part}`
				);
			}
			dependencies[name] = range;
		}
	}
	for (const subpath of Object.keys(MERGED_ENTRIES)) {
		const name = subpath.slice(2);
		// `types` must come first: resolvers take the first matching condition.
		// oxlint-disable-next-line sort-keys
		exports[subpath] = {
			types: `./lib/entries/${name}.d.ts`,
			import: `./lib/entries/${name}.js`,
			default: `./lib/entries/${name}.js`,
		};
	}
	exports['./package.json'] = './package.json';

	return {
		dependencies: Object.fromEntries(
			Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))
		),
		exports,
		main: './lib/browser/dist/index.js',
		sideEffects: [...sideEffects].sort(),
		types: './lib/browser/dist-types/index.d.ts',
	};
};

const MANIFEST_PATH = join(PACKAGE_ROOT, 'package.json');

const readOwnManifest = function readOwnManifest(): Manifest {
	return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
};

/** The package manifest with the computed fields applied. */
export const expectedManifest = function expectedManifest(): Manifest {
	const current = readOwnManifest();
	const fields = computeManifestFields();
	return {
		...current,
		dependencies: fields.dependencies,
		exports: fields.exports,
		main: fields.main,
		sideEffects: fields.sideEffects,
		types: fields.types,
	};
};

const serialize = function serialize(manifest: Manifest) {
	return `${JSON.stringify(manifest, null, '\t')}\n`;
};

/** Files a part publishes, as paths relative to its folder. */
export const listPartFiles = function listPartFiles(part: Part): string[] {
	const root = join(SDK_ROOT, part);
	const entries = readPartManifest(part).files ?? ['dist', 'dist-types'];
	const include = entries.filter((entry) => !entry.startsWith('!'));
	const exclude = entries
		.filter((entry) => entry.startsWith('!'))
		.map((entry) => entry.slice(1));
	const files: string[] = [];

	const walk = function walk(path: string) {
		const absolute = join(root, path);
		if (!existsSync(absolute)) {
			return;
		}
		if (statSync(absolute).isDirectory()) {
			for (const child of readdirSync(absolute)) {
				walk(path ? `${path}/${child}` : child);
			}
			return;
		}
		files.push(path);
	};

	for (const entry of include) {
		// Docs are generated for `@inth/sdk` itself.
		if (
			/^(?:docs|AGENTS\.md|SKILL\.md|README\.md|CHANGELOG\.md)$/u.test(entry)
		) {
			continue;
		}
		if (/[*?[]/u.test(entry)) {
			throw new Error(`${part}: files entry ${entry} is a glob`);
		}
		walk(entry);
	}

	return files.filter(
		(file) =>
			!exclude.some((pattern) => matchesGlob(file, pattern)) &&
			!/(?:^|\/)(?:__tests__|__screenshots__|__snapshots__|\.vitest-attachments)(?:\/|$)/u.test(
				file
			) &&
			!/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)
	);
};

const REWRITTEN = /\.(?:[cm]?js|[cm]?ts|tsx|jsx|css|json|map|vue|svelte)$/u;

/** The file an export key points at for `types` or for `import`. */
const exportFile = function exportFile(
	part: Part,
	key: string,
	kind: 'types' | 'import'
): string {
	let target = readPartManifest(part).exports?.[key];
	while (target && typeof target === 'object') {
		target =
			kind === 'types'
				? (target.types ?? null)
				: (target.import ?? target.default ?? null);
	}
	if (typeof target !== 'string') {
		throw new Error(`${part} exports no ${kind} file for ${key}`);
	}
	return `lib/${part}/${target.slice(2)}`;
};

/** A relative import of `file` (under the package root) from `fromDir`. */
const relativeImport = function relativeImport(fromDir: string, file: string) {
	// Declarations import a `.d.ts` file by its `.js` name.
	const path = relative(fromDir, file).replace(/\.d\.ts$/u, '.js');
	return path.startsWith('.') ? path : `./${path}`;
};

/**
 * The parts' imports of an entry that is merged into another: those point
 * at the part's own module, since the merged entry imports them back.
 */
const rewriteMergedImports = function rewriteMergedImports(
	text: string,
	file: string
): string {
	const kind = file.endsWith('.d.ts') ? 'types' : 'import';
	let out = text;
	for (const sources of Object.values(MERGED_ENTRIES)) {
		for (const [part, key] of sources) {
			const specifier = `@inth/sdk-${part}${key === '.' ? '' : key.slice(1)}`;
			const target = relativeImport(dirname(file), exportFile(part, key, kind));
			out = out
				.replaceAll(`'${specifier}'`, `'${target}'`)
				.replaceAll(`"${specifier}"`, `"${target}"`);
		}
	}
	return out;
};

/** Writes `lib/entries/<name>.js` and `.d.ts` for each merged entry. */
const writeMergedEntries = function writeMergedEntries() {
	const dir = join(PACKAGE_ROOT, 'lib', 'entries');
	rmSync(dir, { force: true, recursive: true });
	mkdirSync(dir, { recursive: true });
	for (const [subpath, sources] of Object.entries(MERGED_ENTRIES)) {
		const name = subpath.slice(2);
		for (const [kind, extension] of [
			['import', 'js'],
			['types', 'd.ts'],
		] as const) {
			const lines = sources.map(
				([part, key]) =>
					`export * from '${relativeImport('lib/entries', exportFile(part, key, kind))}';`
			);
			writeFileSync(
				join(dir, `${name}.${extension}`),
				`// @inth/sdk${subpath.slice(1)}: one entry for ${sources.map(([part, key]) => `${part}${key === '.' ? '' : key.slice(1)}`).join(' and ')}.\n${lines.join('\n')}\n`
			);
		}
	}
};

/**
 * Copies one part into `lib/<part>` and rewrites its private names.
 * Returns the number of files copied.
 */
export const assemblePart = function assemblePart(part: Part): number {
	const source = join(SDK_ROOT, part);
	const target = join(PACKAGE_ROOT, 'lib', part);
	rmSync(target, { force: true, recursive: true });
	const files = listPartFiles(part);
	if (!files.some((file) => file.startsWith('dist/'))) {
		throw new Error(
			`${part} has no dist/ output; build @inth/sdk-${part} first`
		);
	}
	for (const file of files) {
		const from = join(source, file);
		const to = join(target, file);
		mkdirSync(dirname(to), { recursive: true });
		if (REWRITTEN.test(file)) {
			const text = readFileSync(from, 'utf8');
			writeFileSync(
				to,
				toPublicSpecifier(rewriteMergedImports(text, `lib/${part}/${file}`))
			);
		} else {
			cpSync(from, to);
		}
	}
	return files.length;
};

/** Paths under `lib/` that still name a private package. */
export const findPrivateNames = function findPrivateNames(): string[] {
	const found: string[] = [];
	const walk = function walk(dir: string) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path);
			} else if (
				REWRITTEN.test(entry.name) &&
				readFileSync(path, 'utf8').includes('@inth/sdk-')
			) {
				found.push(relative(PACKAGE_ROOT, path));
			}
		}
	};
	walk(join(PACKAGE_ROOT, 'lib'));
	return found;
};

export const assemble = function assemble(parts: readonly Part[] = PARTS) {
	for (const part of parts) {
		assemblePart(part);
	}
	writeMergedEntries();
	const leaks = findPrivateNames();
	if (leaks.length > 0) {
		throw new Error(`Private package names left in:\n${leaks.join('\n')}`);
	}
};

const watchParts = function watchParts() {
	const pending = new Set<Part>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const flush = function flush() {
		const parts = [...pending];
		pending.clear();
		try {
			assemble(parts);
			// oxlint-disable-next-line no-console -- watch output
			console.log(`@inth/sdk: reassembled ${parts.join(', ')}`);
		} catch (error) {
			// oxlint-disable-next-line no-console -- watch output
			console.error(error);
		}
	};
	const schedule = function schedule(part: Part) {
		pending.add(part);
		clearTimeout(timer);
		timer = setTimeout(flush, 200);
	};
	for (const part of PARTS) {
		for (const dir of ['dist', 'dist-types']) {
			const path = join(SDK_ROOT, part, dir);
			mkdirSync(path, { recursive: true });
			watch(path, { recursive: true }, schedule.bind(null, part));
		}
	}
};

const main = function main(args: string[]) {
	if (args[0] === 'manifest') {
		const expected = serialize(expectedManifest());
		if (args.includes('--check')) {
			if (readFileSync(MANIFEST_PATH, 'utf8') !== expected) {
				// oxlint-disable-next-line no-console -- CLI output
				console.error(
					'packages/sdk/sdk/package.json is out of date. Run `node scripts/assemble.ts manifest`.'
				);
				process.exit(1);
			}
			return;
		}
		writeFileSync(MANIFEST_PATH, expected);
		return;
	}
	assemble();
	if (args.includes('--watch')) {
		watchParts();
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2));
}
