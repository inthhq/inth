/**
 * The prompt's surface and containers and the dialog's body load on demand.
 * `<inth-consent-banner>` loads its surface once a choice is owed, and
 * `<inth-consent-dialog>` its body when it opens or warms, each through a
 * dynamic import. This walks each entry point's static imports, across
 * entries too, and checks that none of them lands on those modules or
 * names their stylesheets.
 */
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, test } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

/** Every entry point's source, by its import name. */
const ENTRIES: Record<string, string> = {
	'@inth/angular': 'src/public-api.ts',
	'@inth/angular/consent-dialog': 'consent-dialog/src/public-api.ts',
	'@inth/angular/consent-dialog-trigger':
		'consent-dialog-trigger/src/public-api.ts',
	'@inth/angular/consent-gate': 'consent-gate/src/public-api.ts',
	'@inth/angular/consent-widget': 'consent-widget/src/public-api.ts',
	'@inth/angular/iab': 'iab/src/public-api.ts',
	'@inth/angular/primitives': 'primitives/src/public-api.ts',
	'@inth/angular/provider': 'provider/src/public-api.ts',
};

/**
 * The prompt modules every page loads: the banner component and the
 * loaders that reach the rest of the prompt.
 */
const EAGER_PROMPT_MODULES = new Set([
	'containers.ts',
	'index.ts',
	'prompt.ts',
]);

/**
 * The modules loaded on demand: the prompt's surface and containers, the
 * dialog's body, and the parts they share. `receipt-focus.ts` is the one
 * part the dialog link reads eagerly; it holds no UI.
 */
const isDeferredModule = (file: string): boolean =>
	(file.includes('/src/lib/prompt/') &&
		!EAGER_PROMPT_MODULES.has(basename(file))) ||
	/\/src\/lib\/dialog\/(?:dialog|layer|sheets)\.ts$/u.test(file) ||
	(file.includes('/src/lib/parts/') && !file.endsWith('/receipt-focus.ts'));

const DEFERRED_SPECIFIERS = [
	/^@inth\/sdk\/ui\/styles\/components\/consent-(?:banner|card|dialog|drawer|expand|surface)$/u,
	/^@inth\/sdk\/ui\/styles\/sheets\/(?:banner|card|dialog|drawer|expand|surface)-deferred$/u,
];

/** The module specifiers a file imports or re-exports for values. */
const staticImports = function staticImports(file: string): string[] {
	const source = ts.createSourceFile(
		file,
		readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS
	);
	const specifiers: string[] = [];
	for (const statement of source.statements) {
		if (ts.isImportDeclaration(statement)) {
			const clause = statement.importClause;
			const typeOnly =
				clause?.isTypeOnly === true ||
				(clause !== undefined &&
					clause.name === undefined &&
					clause.namedBindings !== undefined &&
					ts.isNamedImports(clause.namedBindings) &&
					clause.namedBindings.elements.length > 0 &&
					clause.namedBindings.elements.every((element) => element.isTypeOnly));
			if (!typeOnly && ts.isStringLiteral(statement.moduleSpecifier)) {
				specifiers.push(statement.moduleSpecifier.text);
			}
		} else if (
			ts.isExportDeclaration(statement) &&
			!statement.isTypeOnly &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier)
		) {
			specifiers.push(statement.moduleSpecifier.text);
		}
	}
	return specifiers;
};

const resolveRelative = function resolveRelative(
	from: string,
	specifier: string
): string {
	const base = resolve(dirname(from), specifier);
	for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
		try {
			readFileSync(candidate);
			return candidate;
		} catch {
			// Try the next form.
		}
	}
	throw new Error(`Cannot resolve ${specifier} from ${from}`);
};

/** Every file and external specifier an entry loads eagerly. */
const eagerGraph = function eagerGraph(entry: string) {
	const files = new Set<string>();
	const externals = new Set<string>();
	const pending = [resolve(ROOT, entry)];
	while (pending.length > 0) {
		const file = pending.pop() as string;
		if (files.has(file)) {
			continue;
		}
		files.add(file);
		for (const specifier of staticImports(file)) {
			if (specifier.startsWith('.')) {
				pending.push(resolveRelative(file, specifier));
			} else if (ENTRIES[specifier]) {
				pending.push(resolve(ROOT, ENTRIES[specifier]));
			} else {
				externals.add(specifier);
			}
		}
	}
	return { externals, files };
};

describe('the prompt and dialog bodies load on demand', () => {
	test.each(Object.keys(ENTRIES))(
		'%s reaches them only through dynamic imports',
		(name) => {
			const { externals, files } = eagerGraph(ENTRIES[name] as string);
			expect(
				[...files]
					.filter(isDeferredModule)
					.map((file) => file.slice(ROOT.length + 1))
			).toEqual([]);
			expect(
				[...externals].filter((specifier) =>
					DEFERRED_SPECIFIERS.some((pattern) => pattern.test(specifier))
				)
			).toEqual([]);
		}
	);

	test('the walk sees the modules the loaders reach', () => {
		// Guards the test itself: following the dynamic imports finds them.
		expect(
			readFileSync(resolve(ROOT, 'src/lib/dialog/dialog-loader.ts'), 'utf8')
		).toContain("import('./dialog')");
		expect(
			readFileSync(resolve(ROOT, 'src/lib/prompt/containers.ts'), 'utf8')
		).toContain("import('./surface')");
		for (const body of [
			'src/lib/dialog/dialog.ts',
			'src/lib/prompt/surface.ts',
		]) {
			const { externals, files } = eagerGraph(body);
			const reached = [...files].filter((file) => file !== resolve(ROOT, body));
			expect(reached.some(isDeferredModule)).toBe(true);
			expect(
				[...externals].some((specifier) =>
					DEFERRED_SPECIFIERS.some((pattern) => pattern.test(specifier))
				)
			).toBe(true);
		}
	});
});
