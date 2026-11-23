/**
 * A page on the classic design downloads no Privacy Choices (v6) code.
 * The v6 prompt, its options and the v6 dialog are chunks every entry
 * reaches only through a dynamic import, so this walks each entry point's
 * static imports, across entries too, and checks that none of them lands
 * on v6 code or names a v6 stylesheet.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
 * The v6 modules. `presentation.ts` holds the stock banner's loaders,
 * whose only references to v6 code are dynamic imports and types.
 */
const isV6Module = (file: string): boolean =>
	(file.includes('/src/lib/privacy-choices/') &&
		!file.endsWith('/src/lib/privacy-choices/receipt-focus.ts')) ||
	(file.includes('/src/lib/banner/privacy-choices/') &&
		!file.endsWith('/presentation.ts'));

const V6_SPECIFIERS = [
	/^@inth\/sdk\/ui\/styles\/components\/privacy-choices$/u,
	/^@inth\/sdk\/ui\/styles\/sheets\/privacy-choices/u,
	/^@inth\/sdk\/ui\/styles\/components\/consent-(card|bar|drawer|surface|expand)$/u,
	/^@inth\/sdk\/ui\/styles\/sheets\/(card|bar|drawer|surface|expand)-/u,
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

describe('a classic page loads no Privacy Choices code', () => {
	test.each(Object.keys(ENTRIES))(
		'%s reaches v6 code only through dynamic imports',
		(name) => {
			const { externals, files } = eagerGraph(ENTRIES[name] as string);
			expect(
				[...files].filter(isV6Module).map((file) => file.slice(ROOT.length + 1))
			).toEqual([]);
			expect(
				[...externals].filter((specifier) =>
					V6_SPECIFIERS.some((pattern) => pattern.test(specifier))
				)
			).toEqual([]);
		}
	);

	test('the walk sees the v6 modules the loaders reach', () => {
		// Guards the test itself: following the dynamic imports finds them.
		const loader = resolve(
			ROOT,
			'src/lib/dialog/privacy-choices-dialog-loader.ts'
		);
		expect(readFileSync(loader, 'utf8')).toContain(
			"import('../privacy-choices/dialog/privacy-choices-dialog')"
		);
		const { files } = eagerGraph(
			'src/lib/privacy-choices/dialog/privacy-choices-dialog.ts'
		);
		expect([...files].some(isV6Module)).toBe(true);
	});
});
