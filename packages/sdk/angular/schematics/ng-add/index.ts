/**
 * `ng add @inth/angular`: adds `provideInth()` to the app's root providers
 * and, unless `components` is false, the consent banner and dialog to the
 * root component. It edits source files once and adds no build steps.
 *
 * The Angular CLI loads this file with `require`, so it builds to CommonJS.
 * `@angular-devkit/schematics`, `@schematics/angular`, `@angular/compiler`
 * and `typescript` come from the app: every Angular CLI app has them. The
 * compiler is ESM only, and every Node version Angular 22 supports can
 * `require` it.
 */
import { dirname, join, normalize } from 'node:path/posix';

import type {
	Rule,
	SchematicContext,
	Tree,
	UpdateRecorder,
} from '@angular-devkit/schematics';
import {
	SchematicsException,
	callRule,
	chain,
} from '@angular-devkit/schematics';
import {
	parseTemplate,
	TmplAstRecursiveVisitor,
	tmplAstVisitAll,
} from '@angular/compiler';
import type { TmplAstElement } from '@angular/compiler';
import { addRootProvider, readWorkspace } from '@schematics/angular/utility';
import ts from 'typescript';

/** Options from `schema.json`. */
export interface NgAddOptions {
	/** The application project to change. */
	project?: string;
	/** The backend URL. Empty means the docs' placeholder. */
	projectUrl?: string;
	/** Whether to add the banner and dialog to the root component. */
	components?: boolean;
}

interface RootComponentFile {
	path: string;
	className: string;
}

interface Template {
	text: string;
	/** Adds the tags; inline templates go through the component's recorder. */
	append: (tags: string[], recorder: UpdateRecorder) => void;
}

const PACKAGE_NAME = '@inth/angular';
const PLACEHOLDER_URL = 'https://your-project.inth.app';
const PLACEHOLDER_COMMENT =
	'// Replace with the backend URL of your Inth project.';
/** The indent of a provider in an Angular CLI `app.config.ts`. */
const DEFAULT_BASE_INDENT = '    ';
const DEFAULT_INDENT_UNIT = '  ';

const COMPONENTS = [
	{ from: PACKAGE_NAME, name: 'ConsentBanner', tag: 'inth-consent-banner' },
	{
		from: `${PACKAGE_NAME}/consent-dialog`,
		name: 'ConsentDialog',
		tag: 'inth-consent-dialog',
	},
] as const;

const readText = (tree: Tree, path: string): string => tree.readText(path);

const parse = (tree: Tree, path: string): ts.SourceFile =>
	ts.createSourceFile(path, readText(tree, path), ts.ScriptTarget.Latest, true);

const quote = (value: string): string =>
	`'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/** A Tree path as TypeScript sees it, and back. */
const toProgramPath = (path: string): string =>
	path.startsWith('/') ? path : `/${path}`;
const toTreePath = (fileName: string): string => fileName.replace(/^\//u, '');

/** Resolves an import to a local source file, or `undefined`. */
type ImportResolver = (
	specifier: string,
	fromFile: string
) => string | undefined;

/** The project's resolver over a given Tree: every rule reads its own. */
type ResolverFor = (tree: Tree) => ImportResolver;

/** TypeScript's file reads, served from the Tree. */
const treeHost = (tree: Tree) => ({
	fileExists: (fileName: string) => tree.exists(toTreePath(fileName)),
	readFile: (fileName: string) =>
		tree.exists(toTreePath(fileName))
			? readText(tree, toTreePath(fileName))
			: undefined,
});

/**
 * The compiler options of `tsconfig`, with `extends` followed, as the
 * project's build reads them.
 */
const compilerOptionsOf = (
	tree: Tree,
	tsconfig: string | undefined
): ts.CompilerOptions => {
	const host = treeHost(tree);
	const parsed =
		tsconfig === undefined
			? undefined
			: ts.parseJsonConfigFileContent(
					ts.readConfigFile(toProgramPath(tsconfig), host.readFile).config ??
						{},
					{ ...host, readDirectory: () => [], useCaseSensitiveFileNames: true },
					dirname(toProgramPath(tsconfig)),
					undefined,
					toProgramPath(tsconfig)
				).options;
	return {
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		...parsed,
	};
};

/**
 * Resolves imports TypeScript's way, with the project's `paths`, `baseUrl`
 * and index files, to source files inside `sourceRoot`. Packages, and
 * anything outside the source root, resolve to `undefined`.
 */
const createImportResolver = (
	tree: Tree,
	sourceRoot: string,
	tsconfig?: string
): ImportResolver => {
	const root = `${normalize(sourceRoot).replace(/\/$/u, '')}/`;
	const options = compilerOptionsOf(tree, tsconfig);
	const host = treeHost(tree);
	const aliases = options.paths !== undefined || options.baseUrl !== undefined;
	return (specifier, fromFile) => {
		// A bare specifier is a package unless the config maps it.
		if (!(specifier.startsWith('.') || aliases)) {
			return undefined;
		}
		const { resolvedModule } = ts.resolveModuleName(
			specifier,
			toProgramPath(fromFile),
			options,
			host
		);
		if (
			!resolvedModule ||
			resolvedModule.isExternalLibraryImport ||
			resolvedModule.extension !== ts.Extension.Ts
		) {
			return undefined;
		}
		const path = toTreePath(resolvedModule.resolvedFileName);
		return path.startsWith(root) ? path : undefined;
	};
};

/** How many local files the provider search reads, so a large app stays fast. */
const MAX_REACHED_FILES = 200;

/**
 * The main file and every local file it reaches through imports and
 * re-exports, nearest first, such as `app.config.ts` and a providers file
 * it imports.
 */
const filesReachedFrom = (
	tree: Tree,
	mainFile: string,
	resolve: ImportResolver
): string[] => {
	const files = [mainFile];
	for (
		let index = 0;
		index < files.length && files.length < MAX_REACHED_FILES;
		index += 1
	) {
		const file = files[index] as string;
		for (const statement of parse(tree, file).statements) {
			const specifier =
				(ts.isImportDeclaration(statement) ||
					ts.isExportDeclaration(statement)) &&
				statement.moduleSpecifier &&
				ts.isStringLiteral(statement.moduleSpecifier)
					? statement.moduleSpecifier.text
					: undefined;
			const path = specifier && resolve(specifier, file);
			if (path && !files.includes(path) && files.length < MAX_REACHED_FILES) {
				files.push(path);
			}
		}
	}
	return files;
};

/** Picks the project by name, or the only application in the workspace. */
const resolveProject = async (
	tree: Tree,
	name: string | undefined
): Promise<string> => {
	const workspace = await readWorkspace(tree);
	if (name) {
		if (!workspace.projects.has(name)) {
			throw new SchematicsException(`Project "${name}" does not exist.`);
		}
		return name;
	}
	const applications = [...workspace.projects]
		.filter(([, project]) => project.extensions.projectType === 'application')
		.map(([projectName]) => projectName);
	const [only] = applications;
	if (applications.length === 1 && only) {
		return only;
	}
	throw new SchematicsException(
		'Pass --project with the application to add Inth to.'
	);
};

/** The project's `main.ts`, from `browser` (application builder) or `main`. */
const findMainFile = async (
	tree: Tree,
	projectName: string
): Promise<string> => {
	const workspace = await readWorkspace(tree);
	const options = workspace.projects.get(projectName)?.targets.get('build')
		?.options as Record<string, unknown> | undefined;
	const main = options?.browser ?? options?.main;
	if (typeof main !== 'string' || !tree.exists(main)) {
		throw new SchematicsException(
			`Could not find the main file of project "${projectName}".`
		);
	}
	return normalize(main);
};

/**
 * The tsconfig the project builds with: the build target's `tsConfig`, else
 * the project's `tsconfig.app.json`, else the workspace's `tsconfig.json`.
 */
const findTsConfig = async (
	tree: Tree,
	projectName: string
): Promise<string | undefined> => {
	const project = (await readWorkspace(tree)).projects.get(projectName);
	const options = project?.targets.get('build')?.options as
		| Record<string, unknown>
		| undefined;
	return [
		typeof options?.tsConfig === 'string' ? options.tsConfig : undefined,
		join(project?.root ?? '', 'tsconfig.app.json'),
		'tsconfig.json',
	].find((path) => path !== undefined && tree.exists(path));
};

/**
 * `addRootProvider` puts the call after the last provider on the same line,
 * indented for an Angular CLI app config. Move it to its own line when the
 * previous provider has one, and indent it to match the file.
 */
const formatProvider = (
	tree: Tree,
	mainFile: string,
	inserted: string,
	expression: (base: string, unit: string) => string,
	resolve: ImportResolver
): void => {
	for (const file of filesReachedFrom(tree, mainFile, resolve)) {
		const text = readText(tree, file);
		const index = text.indexOf(inserted);
		if (index !== -1) {
			const lineStart = text.lastIndexOf('\n', index) + 1;
			const before = text.slice(lineStart, index);
			const indent = /^\s*/u.exec(before)?.[0] ?? '';
			const unit = indent.startsWith('\t') ? '\t' : DEFAULT_INDENT_UNIT;
			const ownLine = before.endsWith(', ') && !before.includes('[');
			const recorder = tree.beginUpdate(file);
			if (ownLine) {
				recorder.remove(index - 1, inserted.length + 1);
				recorder.insertLeft(
					index - 1,
					`\n${indent}${expression(indent, unit)}`
				);
			} else {
				recorder.remove(index, inserted.length);
				recorder.insertLeft(index, expression(indent, unit));
			}
			tree.commitUpdate(recorder);
			return;
		}
	}
};

/** The `projectUrl` the options ask for, quoted. */
const backendOf = (options: NgAddOptions): string =>
	quote(options.projectUrl?.trim() || PLACEHOLDER_URL);

/** The provider call to add by hand, on one line. */
const providerExpression = (options: NgAddOptions): string =>
	`provideInth({ projectUrl: ${backendOf(options)} })`;

/** What the provider rules leave for the rules after them. */
interface ProviderOutcome {
	/** Whether `provideInth()` could not be added. */
	failed: boolean;
}

/** The part of an Observable the schematics engine returns. */
interface Subscribable<Value> {
	subscribe: (observer: {
		complete: () => void;
		error: (error: unknown) => void;
		next: (value: Value) => void;
	}) => unknown;
}

/**
 * The last value an Observable emits, once it completes. RxJS 7's
 * `lastValueFrom` without RxJS: the peer range includes RxJS 6, which has
 * no `lastValueFrom`.
 *
 * @returns Its last value, or `undefined` when it emits none.
 * @throws {unknown} What the Observable errors with.
 * @internal
 */
export const lastValue = function lastValue<Value>(
	observable: Subscribable<Value>
): Promise<Value | undefined> {
	return new Promise((resolve, reject) => {
		let last: Value | undefined;
		observable.subscribe({
			complete: () => {
				resolve(last);
			},
			error: reject,
			next: (value) => {
				last = value;
			},
		});
	});
};

const providerRules = (
	project: string,
	mainFile: string,
	options: NgAddOptions,
	context: SchematicContext,
	resolverFor: ResolverFor,
	outcome: ProviderOutcome
): Rule[] => {
	const answer = options.projectUrl?.trim();
	const bodyLines = [
		...(answer ? [] : [PLACEHOLDER_COMMENT]),
		`projectUrl: ${backendOf(options)},`,
	];
	const expression = (base: string, unit: string): string =>
		[
			'provideInth({',
			...bodyLines.map((line) => `${base}${unit}${line}`),
			`${base}})`,
		].join('\n');
	const inserted = expression(DEFAULT_BASE_INDENT, DEFAULT_INDENT_UNIT);

	const addProvider = addRootProvider(project, ({ code, external }) => {
		const provide = external('provideInth', PACKAGE_NAME);
		const text = inserted.replace('provideInth(', `${provide}(`);
		return code`${text}`;
	});

	return [
		// `addRootProvider` finds only a plain `bootstrapApplication(...)`
		// call, not one through a namespace import. Then say what to add.
		async (tree, ruleContext) => {
			try {
				return (
					(await lastValue(callRule(addProvider, tree, ruleContext))) ?? tree
				);
			} catch {
				outcome.failed = true;
				context.logger.warn(
					`Could not add provideInth() to the providers of ${mainFile}. Add ${providerExpression(options)} to your application's providers.`
				);
				return tree;
			}
		},
		(tree) => {
			if (!outcome.failed) {
				formatProvider(tree, mainFile, inserted, expression, resolverFor(tree));
			}
		},
		() => {
			if (!answer) {
				context.logger.warn(
					`Replace ${PLACEHOLDER_URL} in provideInth() with the backend URL of your Inth project.`
				);
			}
		},
	];
};

/**
 * Stand-ins for the modules whose exports the schematic looks for. It only
 * asks whether a name resolves to one of these declarations, so it reads
 * none of the installed packages.
 */
const MODULE_STUBS: Readonly<Record<string, { file: string; text: string }>> = {
	'@angular/core': {
		file: '/__angular_core__.d.ts',
		text: 'export declare function Component(...metadata: unknown[]): any;\nexport declare function importProvidersFrom(...sources: unknown[]): any;\nexport declare function makeEnvironmentProviders(providers: unknown[]): any;\nexport declare function mergeApplicationConfig(...configs: unknown[]): any;\n',
	},
	'@angular/platform-browser': {
		file: '/__angular_platform_browser__.d.ts',
		text: 'export declare function bootstrapApplication(...args: unknown[]): any;\n',
	},
	[PACKAGE_NAME]: {
		file: '/__inth_angular__.d.ts',
		text: 'export declare function provideInth(...options: unknown[]): unknown;\nexport declare class ConsentBanner {}\n',
	},
	[`${PACKAGE_NAME}/consent-dialog`]: {
		file: '/__inth_angular_consent_dialog__.d.ts',
		text: 'export declare class ConsentDialog {}\n',
	},
};
const STUB_TEXT = new Map(
	Object.values(MODULE_STUBS).map(({ file, text }) => [file, text])
);

/**
 * A type-checked program over `files`, with imports resolved by `resolve`
 * and the `@inth/angular` entry points mapped to their stand-ins.
 */
const createAppProgram = (
	tree: Tree,
	files: readonly string[],
	resolve: ImportResolver
): ts.Program => {
	const read = (fileName: string): string | undefined =>
		STUB_TEXT.get(fileName) ?? treeHost(tree).readFile(fileName);
	const host: ts.CompilerHost = {
		fileExists: (fileName) => read(fileName) !== undefined,
		getCanonicalFileName: (fileName) => fileName,
		getCurrentDirectory: () => '/',
		getDefaultLibFileName: () => 'lib.d.ts',
		getNewLine: () => '\n',
		getSourceFile: (fileName, languageVersion) => {
			const text = read(fileName);
			return text === undefined
				? undefined
				: ts.createSourceFile(fileName, text, languageVersion, true);
		},
		readFile: read,
		resolveModuleNameLiterals: (literals, containingFile) =>
			literals.map((literal) => {
				const local =
					MODULE_STUBS[literal.text]?.file ??
					resolve(literal.text, toTreePath(containingFile));
				return {
					resolvedModule:
						local === undefined
							? undefined
							: {
									extension: local.endsWith('.d.ts')
										? ts.Extension.Dts
										: ts.Extension.Ts,
									resolvedFileName: toProgramPath(local),
								},
				};
			}),
		useCaseSensitiveFileNames: () => true,
		writeFile: () => undefined,
	};
	return ts.createProgram({
		host,
		options: {
			module: ts.ModuleKind.ESNext,
			noLib: true,
			noResolve: false,
			target: ts.ScriptTarget.Latest,
			types: [],
		},
		rootNames: files.map(toProgramPath),
	});
};

/**
 * Whether the name at `node` resolves, through imports, aliases, namespaces
 * and re-exports, to `name` exported by `from`, one of
 * {@link MODULE_STUBS}. Every lookup of a framework or Inth export goes
 * through here, so a local binding of the same name never counts.
 */
const resolvesTo = (
	checker: ts.TypeChecker,
	node: ts.Node,
	from: string,
	name: string
): boolean => {
	let symbol = checker.getSymbolAtLocation(
		ts.isPropertyAccessExpression(node) ? node.name : node
	);
	// oxlint-disable-next-line no-bitwise -- `SymbolFlags` is a bit set.
	if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
		symbol = checker.getAliasedSymbol(symbol);
	}
	return (
		symbol?.name === name &&
		(symbol.declarations?.some(
			(declaration) =>
				declaration.getSourceFile().fileName === MODULE_STUBS[from]?.file
		) ??
			false)
	);
};

/**
 * The first of `files` that calls `@inth/angular`'s `provideInth`.
 *
 * The type checker resolves each call's callee through imports, aliases,
 * namespaces and local re-exports, so a barrel or `provideInth as consent`
 * counts, and a local function of that name or the text in a comment does
 * not.
 *
 * @param files - The reachable files, in search order.
 */
const findProvideInthCall = (
	tree: Tree,
	files: readonly string[],
	resolve: ImportResolver
): string | undefined => {
	const program = createAppProgram(tree, files, resolve);
	const checker = program.getTypeChecker();
	const calls = (node: ts.Node): boolean =>
		(ts.isCallExpression(node) &&
			resolvesTo(checker, node.expression, PACKAGE_NAME, 'provideInth')) ||
		(ts.forEachChild(node, calls) ?? false);
	return files.find((file) => {
		const source = program.getSourceFile(toProgramPath(file));
		return source !== undefined && calls(source);
	});
};

/** A name `source` binds at its top level. */
interface TopLevelBinding {
	readonly name: ts.Identifier;
	/** Whether it binds only a type, which the `imports` array cannot use. */
	readonly typeOnly: boolean;
	/**
	 * The `type` keyword to delete to make it a value import, when that
	 * changes nothing else: an inline `type` specifier, or `import type`
	 * with this one name.
	 */
	readonly typeKeyword?:
		| { readonly start: number; readonly end: number }
		| undefined;
}

/** The `type` keyword at `start` in `text`, with the space after it. */
const keywordAt = (
	text: string,
	start: number
): { start: number; end: number } => {
	const at = text.indexOf('type', start);
	let end = at + 'type'.length;
	while (/\s/u.test(text[end] ?? '')) {
		end += 1;
	}
	return { end, start: at };
};

/** The names `source` binds at its top level: imports and declarations. */
const topLevelBindings = (source: ts.SourceFile): TopLevelBinding[] =>
	source.statements.flatMap((statement): TopLevelBinding[] => {
		if (ts.isImportDeclaration(statement)) {
			const clause = statement.importClause;
			const bindings = clause?.namedBindings;
			const clauseTypeOnly = clause?.isTypeOnly ?? false;
			const single =
				bindings !== undefined &&
				ts.isNamedImports(bindings) &&
				bindings.elements.length === 1 &&
				!clause?.name;
			const value = (name: ts.Identifier): TopLevelBinding => ({
				name,
				typeKeyword:
					clauseTypeOnly && single
						? keywordAt(
								source.text,
								statement.getStart(source) + 'import'.length
							)
						: undefined,
				typeOnly: clauseTypeOnly,
			});
			return [
				...(clause?.name ? [value(clause.name)] : []),
				...(bindings && ts.isNamespaceImport(bindings)
					? [value(bindings.name)]
					: []),
				...(bindings && ts.isNamedImports(bindings)
					? bindings.elements.map((element) =>
							element.isTypeOnly
								? {
										name: element.name,
										typeKeyword: keywordAt(
											source.text,
											element.getStart(source)
										),
										typeOnly: true,
									}
								: value(element.name)
						)
					: []),
			];
		}
		const value = (name: ts.Identifier): TopLevelBinding => ({
			name,
			typeOnly: false,
		});
		if (ts.isVariableStatement(statement)) {
			return statement.declarationList.declarations.flatMap((declaration) =>
				ts.isIdentifier(declaration.name) ? [value(declaration.name)] : []
			);
		}
		return (ts.isClassDeclaration(statement) ||
			ts.isFunctionDeclaration(statement) ||
			ts.isEnumDeclaration(statement)) &&
			statement.name
			? [value(statement.name)]
			: [];
	});

/** Every identifier `source` uses, so a new alias shadows none of them. */
const identifiersIn = (source: ts.SourceFile): Set<string> => {
	const names = new Set<string>();
	const visit = (node: ts.Node): void => {
		if (ts.isIdentifier(node)) {
			names.add(node.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return names;
};

/** Collects element names, inside control-flow and `@defer` blocks too. */
class ElementNames extends TmplAstRecursiveVisitor {
	readonly names = new Set<string>();

	override visitElement(element: TmplAstElement): void {
		this.names.add(element.name);
		super.visitElement(element);
	}
}

/**
 * The elements a template renders, as Angular parses it: a tag in an HTML
 * comment or a string is not one.
 */
const templateElements = (text: string, path: string): Set<string> => {
	const visitor = new ElementNames();
	tmplAstVisitAll(visitor, parseTemplate(text, path).nodes);
	return visitor.names;
};

/** How the root component refers to one Inth component. */
interface ComponentBinding {
	readonly from: string;
	readonly imported: string;
	/** The name in `imports: [...]` and the template's scope. */
	readonly local: string;
	/** Whether the file still needs an import of it. */
	readonly needsImport: boolean;
	/** A `type` keyword to delete so the existing import binds the value. */
	readonly typeKeyword?:
		| { readonly start: number; readonly end: number }
		| undefined;
}

/**
 * The name the root component uses for each Inth component: a binding that
 * already resolves to it, else its own name, else an unused alias such as
 * `InthConsentBanner` when a local binding has the name.
 */
const bindComponents = (
	program: ts.Program,
	source: ts.SourceFile
): ComponentBinding[] => {
	const checker = program.getTypeChecker();
	const bindings = topLevelBindings(source);
	const used = identifiersIn(source);
	return COMPONENTS.map(({ from, name }) => {
		const existing = bindings.find((binding) =>
			resolvesTo(checker, binding.name, from, name)
		);
		// A type-only binding names the class but cannot go in `imports`:
		// drop its `type` keyword when that is all it takes, else import the
		// value under a free name.
		if (existing && (!existing.typeOnly || existing.typeKeyword)) {
			return {
				from,
				imported: name,
				local: existing.name.text,
				needsImport: false,
				typeKeyword: existing.typeOnly ? existing.typeKeyword : undefined,
			};
		}
		const candidates = [name, `Inth${name}`];
		let local = candidates.find((candidate) => !used.has(candidate));
		for (let suffix = 2; local === undefined; suffix += 1) {
			const candidate = `Inth${name}${suffix}`;
			local = used.has(candidate) ? undefined : candidate;
		}
		return { from, imported: name, local, needsImport: true };
	});
};

/**
 * The class `@angular/platform-browser`'s `bootstrapApplication(...)`
 * starts, as the call names it, whatever the call imports it as.
 */
const findBootstrapArgument = (
	checker: ts.TypeChecker,
	node: ts.Node
): ts.Identifier | undefined => {
	if (
		ts.isCallExpression(node) &&
		resolvesTo(
			checker,
			node.expression,
			'@angular/platform-browser',
			'bootstrapApplication'
		)
	) {
		const [component] = node.arguments;
		return component && ts.isIdentifier(component) ? component : undefined;
	}
	return ts.forEachChild(node, (child) =>
		findBootstrapArgument(checker, child)
	);
};

/**
 * Follows `bootstrapApplication(Component)` to the class it starts, through
 * relative imports, path aliases and re-exports.
 */
const findRootComponentFile = (
	tree: Tree,
	mainFile: string,
	resolve: ImportResolver
): RootComponentFile | undefined => {
	const program = createAppProgram(tree, [mainFile], resolve);
	const source = program.getSourceFile(toProgramPath(mainFile));
	const checker = program.getTypeChecker();
	const identifier = source && findBootstrapArgument(checker, source);
	if (!identifier) {
		return undefined;
	}
	let symbol = checker.getSymbolAtLocation(identifier);
	// oxlint-disable-next-line no-bitwise -- `SymbolFlags` is a bit set.
	if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
		symbol = checker.getAliasedSymbol(symbol);
	}
	const declaration = symbol?.declarations?.find(ts.isClassDeclaration);
	const path = declaration && toTreePath(declaration.getSourceFile().fileName);
	// A root component declared in main.ts itself is edited there.
	return declaration?.name && path
		? { className: declaration.name.text, path }
		: undefined;
};

/** An expression without `as`, `satisfies` or parentheses around it. */
const unwrap = (node: ts.Expression): ts.Expression =>
	ts.isAsExpression(node) ||
	ts.isSatisfiesExpression(node) ||
	ts.isParenthesizedExpression(node)
		? unwrap(node.expression)
		: node;

/**
 * What a walk of the root providers found: `provideInth()`, no
 * `provideInth()`, or a value it cannot follow statically, such as a
 * function that returns the config or a conditional.
 */
type RootProviders = 'found' | 'absent' | 'unknown';

/** `found` if any is, else `unknown` if any is, else `absent`. */
const anyOf = (results: readonly RootProviders[]): RootProviders => {
	if (results.includes('found')) {
		return 'found';
	}
	return results.includes('unknown') ? 'unknown' : 'absent';
};

/** A property name as written: `providers`, `'providers'` or `"providers"`. */
const propertyName = (name: ts.PropertyName): string | undefined =>
	ts.isIdentifier(name) ||
	ts.isStringLiteral(name) ||
	ts.isNoSubstitutionTemplateLiteral(name)
		? name.text
		: undefined;

/**
 * Whether the root injector gets `@inth/angular`'s `provideInth()`. From
 * `bootstrapApplication(App, config)`, it follows `config` (inline, a name
 * of one through imports and `const` aliases, spreads of others, and each
 * config `mergeApplicationConfig` merges) to its `providers` (a property,
 * shorthand or a string key), then the providers: arrays, spreads,
 * `concat`, names of arrays, and `importProvidersFrom` or
 * `makeEnvironmentProviders`. A call outside the root, such as on a route,
 * does not count. A value it cannot follow statically is `unknown`.
 */
const rootProvidesInth = (
	tree: Tree,
	mainFile: string,
	resolve: ImportResolver
): RootProviders => {
	const program = createAppProgram(tree, [mainFile], resolve);
	const checker = program.getTypeChecker();
	const source = program.getSourceFile(toProgramPath(mainFile));
	const bootstrap =
		source &&
		(function find(node: ts.Node): ts.CallExpression | undefined {
			if (
				ts.isCallExpression(node) &&
				resolvesTo(
					checker,
					node.expression,
					'@angular/platform-browser',
					'bootstrapApplication'
				)
			) {
				return node;
			}
			return ts.forEachChild(node, find);
		})(source);

	/** The symbol a name stands for, through imports and aliases. */
	const symbolOf = (node: ts.Node): ts.Symbol | undefined => {
		let symbol = ts.isShorthandPropertyAssignment(node)
			? checker.getShorthandAssignmentValueSymbol(node)
			: checker.getSymbolAtLocation(
					ts.isPropertyAccessExpression(node) ? node.name : node
				);
		// oxlint-disable-next-line no-bitwise -- `SymbolFlags` is a bit set.
		if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
			symbol = checker.getAliasedSymbol(symbol);
		}
		return symbol;
	};
	/** A `const`'s initializer, or `undefined` for anything else. */
	const constValue = (node: ts.Node): ts.Expression | undefined => {
		const declaration = symbolOf(node)?.valueDeclaration;
		return declaration &&
			ts.isVariableDeclaration(declaration) &&
			// oxlint-disable-next-line no-bitwise -- `NodeFlags` is a bit set.
			ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const
			? declaration.initializer
			: undefined;
	};
	/** Whether a call goes to a function declared in the app's own code. */
	const callsLocalCode = (call: ts.CallExpression): boolean => {
		const declaration = symbolOf(call.expression)?.valueDeclaration;
		const file = declaration?.getSourceFile();
		return file !== undefined && !file.isDeclarationFile;
	};
	const wraps = (call: ts.CallExpression, name: string): boolean =>
		resolvesTo(checker, call.expression, '@angular/core', name);

	const visiting = new Set<ts.Node>();
	const walk = <Result extends RootProviders | 'unset'>(
		node: ts.Node | undefined,
		step: (expression: ts.Expression) => Result,
		missing: Result
	): Result => {
		if (!node || visiting.has(node)) {
			return missing;
		}
		visiting.add(node);
		try {
			return step(unwrap(node as ts.Expression));
		} finally {
			visiting.delete(node);
		}
	};
	const named = <Result extends RootProviders | 'unset'>(
		expression: ts.Expression,
		then: (value: ts.Expression) => Result
	): Result | 'unknown' => {
		const value = constValue(expression);
		return value ? then(value) : 'unknown';
	};

	const providers = (node: ts.Node | undefined): RootProviders =>
		walk(
			node,
			(expression) => {
				if (ts.isArrayLiteralExpression(expression)) {
					return anyOf(
						expression.elements.map((element) => providers(element))
					);
				}
				if (ts.isSpreadElement(expression)) {
					return providers(expression.expression);
				}
				if (ts.isConditionalExpression(expression)) {
					const branches = [
						providers(expression.whenTrue),
						providers(expression.whenFalse),
					];
					return branches.every((branch) => branch === 'absent')
						? 'absent'
						: 'unknown';
				}
				if (
					ts.isIdentifier(expression) ||
					ts.isPropertyAccessExpression(expression)
				) {
					return named(expression, providers);
				}
				if (!ts.isCallExpression(expression)) {
					// A provider object such as `{ provide, useValue }`.
					return 'absent';
				}
				if (
					resolvesTo(
						checker,
						expression.expression,
						PACKAGE_NAME,
						'provideInth'
					)
				) {
					return 'found';
				}
				if (
					wraps(expression, 'importProvidersFrom') ||
					wraps(expression, 'makeEnvironmentProviders')
				) {
					return anyOf(
						expression.arguments.map((argument) => providers(argument))
					);
				}
				const callee = expression.expression;
				if (
					ts.isPropertyAccessExpression(callee) &&
					callee.name.text === 'concat'
				) {
					return anyOf([
						providers(callee.expression),
						...expression.arguments.map((argument) => providers(argument)),
					]);
				}
				// The app's own function could return anything; a library's
				// provider function, such as `provideRouter()`, is not Inth's.
				return callsLocalCode(expression) ? 'unknown' : 'absent';
			},
			'absent'
		);

	/**
	 * What a config sets `providers` to: a walk result, `unset` when it sets
	 * none, or `unknown` when it may. Object members apply in order, last
	 * write wins, as in JavaScript: a later `providers` replaces what an
	 * earlier spread set, and a later spread replaces it in turn when it
	 * sets one.
	 */
	const config = (node: ts.Node | undefined): RootProviders | 'unset' =>
		walk<RootProviders | 'unset'>(
			node,
			(expression) => {
				if (ts.isObjectLiteralExpression(expression)) {
					let slot: RootProviders | 'unset' = 'unset';
					for (const property of expression.properties) {
						if (ts.isSpreadAssignment(property)) {
							const spread = config(property.expression);
							if (spread !== 'unset') {
								slot = spread;
							}
						} else if (ts.isShorthandPropertyAssignment(property)) {
							if (property.name.text === 'providers') {
								const value = constValue(property);
								slot = value ? providers(value) : 'unknown';
							}
						} else if (ts.isPropertyAssignment(property)) {
							const name = propertyName(property.name);
							if (name === undefined) {
								// A computed key could be `providers`.
								slot = 'unknown';
							} else if (name === 'providers') {
								slot = providers(property.initializer);
							}
						}
					}
					return slot;
				}
				if (
					ts.isIdentifier(expression) ||
					ts.isPropertyAccessExpression(expression)
				) {
					return named(expression, config);
				}
				if (
					ts.isCallExpression(expression) &&
					wraps(expression, 'mergeApplicationConfig')
				) {
					// It concatenates every config's providers.
					const merged = expression.arguments.map((argument) =>
						config(argument)
					);
					return merged.every((slot) => slot === 'unset')
						? 'unset'
						: anyOf(merged.map((slot) => (slot === 'unset' ? 'absent' : slot)));
				}
				return 'unknown';
			},
			'unset'
		);

	if (!bootstrap) {
		return 'absent';
	}
	const root = config(bootstrap.arguments[1]);
	return root === 'unset' ? 'absent' : root;
};

/** The metadata of `className`'s `@angular/core` `@Component(...)`. */
const findComponentMetadata = (
	checker: ts.TypeChecker,
	source: ts.SourceFile,
	className: string
): ts.ObjectLiteralExpression | undefined => {
	const declaration = source.statements.find(
		(statement): statement is ts.ClassDeclaration =>
			ts.isClassDeclaration(statement) && statement.name?.text === className
	);
	const decorator = (
		declaration ? (ts.getDecorators(declaration) ?? []) : []
	).find(
		({ expression }) =>
			ts.isCallExpression(expression) &&
			resolvesTo(checker, expression.expression, '@angular/core', 'Component')
	);
	const [metadata] =
		decorator && ts.isCallExpression(decorator.expression)
			? decorator.expression.arguments
			: [];
	return metadata && ts.isObjectLiteralExpression(metadata)
		? metadata
		: undefined;
};

const findProperty = (
	metadata: ts.ObjectLiteralExpression,
	name: string
): ts.PropertyAssignment | undefined =>
	metadata.properties.find(
		(property): property is ts.PropertyAssignment =>
			ts.isPropertyAssignment(property) &&
			(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
			property.name.text === name
	);

const isStringLike = (
	node: ts.Expression | undefined
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
	node !== undefined &&
	(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));

/** The inline `template` string, or the file `templateUrl` names. */
const findTemplate = (
	tree: Tree,
	componentPath: string,
	metadata: ts.ObjectLiteralExpression
): Template | undefined => {
	const inline = findProperty(metadata, 'template')?.initializer;
	if (isStringLike(inline)) {
		return {
			append: (tags, recorder) => {
				const body = inline.getText().slice(1, -1);
				// Before the whitespace that indents the closing quote.
				const trailing = /\s*$/u.exec(body)?.[0] ?? '';
				const insertAt = inline.getEnd() - 1 - trailing.length;
				if (ts.isStringLiteral(inline) || !body.includes('\n')) {
					recorder.insertLeft(insertAt, tags.join(''));
					return;
				}
				const lastLine =
					body
						.slice(0, body.length - trailing.length)
						.split('\n')
						.at(-1) ?? '';
				const indent = /^\s*/u.exec(lastLine)?.[0] ?? '';
				recorder.insertLeft(
					insertAt,
					tags.map((tag) => `\n${indent}${tag}`).join('')
				);
			},
			text: inline.text,
		};
	}
	const url = findProperty(metadata, 'templateUrl')?.initializer;
	if (!isStringLike(url)) {
		return undefined;
	}
	const path = normalize(join(dirname(componentPath), url.text));
	if (!tree.exists(path)) {
		return undefined;
	}
	const text = readText(tree, path);
	return {
		append: (tags) => {
			const separator = text === '' || text.endsWith('\n') ? '' : '\n';
			tree.overwrite(path, `${text}${separator}${tags.join('\n')}\n`);
		},
		text,
	};
};

/** Adds the names to an import of `from`, or adds that import. */
const addEsImport = (
	recorder: UpdateRecorder,
	source: ts.SourceFile,
	bindings: readonly ComponentBinding[],
	from: string
): void => {
	const specifiers = bindings.map(({ imported, local }) =>
		imported === local ? imported : `${imported} as ${local}`
	);
	const imports = source.statements.filter(ts.isImportDeclaration);
	const existing = imports.find(
		(declaration) =>
			ts.isStringLiteral(declaration.moduleSpecifier) &&
			declaration.moduleSpecifier.text === from &&
			!declaration.importClause?.isTypeOnly &&
			declaration.importClause?.namedBindings !== undefined &&
			ts.isNamedImports(declaration.importClause.namedBindings)
	)?.importClause?.namedBindings;
	const last =
		existing && ts.isNamedImports(existing)
			? existing.elements.at(-1)
			: undefined;
	if (last) {
		recorder.insertRight(last.getEnd(), `, ${specifiers.join(', ')}`);
		return;
	}
	const statement = `import { ${specifiers.join(', ')} } from '${from}';`;
	const lastImport = imports.at(-1);
	if (lastImport) {
		recorder.insertRight(lastImport.getEnd(), `\n${statement}`);
	} else {
		recorder.insertLeft(0, `${statement}\n\n`);
	}
};

/** Adds the names to `imports: [...]`, or adds that property. */
const addToImportsArray = (
	recorder: UpdateRecorder,
	source: ts.SourceFile,
	metadata: ts.ObjectLiteralExpression,
	imports: ts.PropertyAssignment | undefined,
	names: string[]
): void => {
	if (imports && ts.isArrayLiteralExpression(imports.initializer)) {
		const array = imports.initializer;
		const last = array.elements.at(-1);
		if (last) {
			recorder.insertRight(last.getEnd(), `, ${names.join(', ')}`);
		} else {
			recorder.insertRight(array.getStart(source) + 1, names.join(', '));
		}
		return;
	}
	const [first] = metadata.properties;
	const property = `imports: [${names.join(', ')}]`;
	if (!first) {
		recorder.insertLeft(metadata.getStart(source) + 1, ` ${property} `);
		return;
	}
	const start = first.getStart(source);
	const lineStart = source.text.lastIndexOf('\n', start) + 1;
	const indent = source.text.slice(lineStart, start);
	recorder.insertLeft(
		start,
		indent.trim() === '' ? `${property},\n${indent}` : `${property}, `
	);
};

/** Adds `ConsentBanner` and `ConsentDialog` to the bootstrapped component. */
const addComponents = (
	tree: Tree,
	mainFile: string,
	context: SchematicContext,
	resolve: ImportResolver
): void => {
	const manual = (reason: string): void => {
		context.logger.warn(
			`${reason} Add ConsentBanner from ${PACKAGE_NAME} and ConsentDialog from ${PACKAGE_NAME}/consent-dialog to your root component's imports, and <inth-consent-banner /> <inth-consent-dialog /> to its template.`
		);
	};

	const componentFile = findRootComponentFile(tree, mainFile, resolve);
	if (!componentFile) {
		manual(
			`Could not find the component that bootstrapApplication() starts in ${mainFile}.`
		);
		return;
	}
	// The program parses the file as the tree holds it, so its offsets are
	// the recorder's.
	const program = createAppProgram(tree, [componentFile.path], resolve);
	const source =
		program.getSourceFile(toProgramPath(componentFile.path)) ??
		parse(tree, componentFile.path);
	const metadata = findComponentMetadata(
		program.getTypeChecker(),
		source,
		componentFile.className
	);
	if (!metadata) {
		manual(
			`Could not read the @Component() metadata of ${componentFile.className} in ${componentFile.path}.`
		);
		return;
	}
	const imports = findProperty(metadata, 'imports');
	if (imports && !ts.isArrayLiteralExpression(imports.initializer)) {
		manual(`The imports of ${componentFile.path} are not an array literal.`);
		return;
	}
	const template = findTemplate(tree, componentFile.path, metadata);
	if (!template) {
		manual(
			`Could not find a template string or templateUrl file in ${componentFile.path}.`
		);
		return;
	}

	const present = templateElements(template.text, componentFile.path);
	const missingTags = COMPONENTS.filter(({ tag }) => !present.has(tag)).map(
		({ tag }) => `<${tag} />`
	);
	const bound = bindComponents(program, source);
	const importedNames = new Set(
		imports && ts.isArrayLiteralExpression(imports.initializer)
			? imports.initializer.elements.map((element) => element.getText(source))
			: []
	);
	const missingImports = bound
		.filter(({ local }) => !importedNames.has(local))
		.map(({ local }) => local);
	const toImport = bound.filter(({ needsImport }) => needsImport);

	// One recorder: its offsets all refer to the file as parsed above.
	const recorder = tree.beginUpdate(componentFile.path);
	for (const { typeKeyword } of bound) {
		if (typeKeyword) {
			recorder.remove(typeKeyword.start, typeKeyword.end - typeKeyword.start);
		}
	}
	// Imports added at one offset keep their order.
	for (const from of new Set(toImport.map((binding) => binding.from))) {
		addEsImport(
			recorder,
			source,
			toImport.filter((binding) => binding.from === from),
			from
		);
	}
	if (missingImports.length > 0) {
		addToImportsArray(recorder, source, metadata, imports, missingImports);
	}
	if (missingTags.length > 0) {
		template.append(missingTags, recorder);
	}
	tree.commitUpdate(recorder);
};

/**
 * Adds Inth to an Angular application.
 *
 * @param options - Options from the prompts or command line.
 */
export const ngAdd =
	(options: NgAddOptions): Rule =>
	async (tree, context) => {
		const project = await resolveProject(tree, options.project);
		const mainFile = await findMainFile(tree, project);
		const rules: Rule[] = [];
		const outcome: ProviderOutcome = { failed: false };

		const sourceRoot =
			(await readWorkspace(tree)).projects.get(project)?.sourceRoot ??
			dirname(mainFile);
		const tsconfig = await findTsConfig(tree, project);
		const resolverFor: ResolverFor = (host) =>
			createImportResolver(host, sourceRoot, tsconfig);
		const resolve = resolverFor(tree);
		const root = rootProvidesInth(tree, mainFile, resolve);
		if (root === 'found') {
			context.logger.info(
				'The root providers already include provideInth(); leaving them as they are.'
			);
		} else if (root === 'unknown') {
			// A second provider would split the consent state; the user
			// knows what their config builds. The components throw if it
			// builds none, so they wait for the user too.
			outcome.failed = true;
			context.logger.warn(
				`Could not tell whether the root providers in ${mainFile} include provideInth(): the config is built in a way ng-add cannot follow. If they do not, add ${providerExpression(options)} to them.`
			);
		} else {
			// A call outside the root providers, such as on a route, gives
			// that part of the app its own consent state; the root still
			// needs one.
			const elsewhere = findProvideInthCall(
				tree,
				filesReachedFrom(tree, mainFile, resolve),
				resolve
			);
			if (elsewhere) {
				context.logger.warn(
					`${elsewhere} calls provideInth() outside the application's root providers. Adding one to the root providers; remove the other unless that part of the app needs its own consent state.`
				);
			}
			rules.push(
				...providerRules(
					project,
					mainFile,
					options,
					context,
					resolverFor,
					outcome
				)
			);
		}

		if (options.components !== false) {
			rules.push((host) => {
				// The components throw without a provider: with none added, the
				// user adds both, so the app never runs half set up.
				if (outcome.failed) {
					context.logger.warn(
						`Add ConsentBanner from ${PACKAGE_NAME} and ConsentDialog from ${PACKAGE_NAME}/consent-dialog to your root component's imports, and <inth-consent-banner /> <inth-consent-dialog /> to its template, once provideInth() is in the providers.`
					);
					return;
				}
				addComponents(host, mainFile, context, resolverFor(host));
			});
		}

		return chain(rules);
	};
