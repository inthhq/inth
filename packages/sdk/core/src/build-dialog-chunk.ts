/**
 * Fewer files for the stock dialog's on-demand code, in a Rolldown (Vite 8)
 * browser build.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * The modules that open the stock dialog: what each adapter's `import()`
 * for it loads. React's deferred root and aggregate `ConsentDialog`
 * (`deferred/dialog`), and Vue's (`components/manager.vue`). Installed
 * packages under `node_modules/@inth/…`, and the real path
 * `packages/<name>/dist/…` from a workspace or linked install. `@inth/sdk`
 * ships the engine under `lib/core/dist/…`.
 */
const DIALOG_ROOT =
	/[\\/](?:@inth|packages(?:[\\/]sdk)?)[\\/](?:react[\\/]dist[\\/]deferred[\\/]dialog\.js|vue[\\/]dist[\\/]runtime[\\/]components[\\/]manager\.vue)$/u;

/**
 * What an accept or reject before the engine loads: the commit chunk of
 * React's and Vue's deferred roots and core's script loader.
 */
const TAP_ROOT =
	/[\\/](?:@inth|packages(?:[\\/]sdk)?)[\\/](?:react[\\/]dist[\\/]deferred[\\/]commit|vue[\\/]dist[\\/]runtime[\\/]deferred[\\/]commit|(?:sdk[\\/]lib[\\/])?core[\\/]dist[\\/]modules[\\/]script-loader[\\/]index)\.js$/u;

/**
 * The consent engine each deferred root loads after the page: React's
 * (`deferred/client-engine`, `deferred/engine`), Next.js's and TanStack
 * Start's (`root-engine`) and Vue's (`runtime/deferred/engine`).
 */
const ENGINE_ROOT =
	/[\\/](?:@inth|packages(?:[\\/]sdk)?)[\\/](?:react[\\/]dist[\\/]deferred[\\/](?:client-)?engine|(?:nextjs|tanstack-start)[\\/]dist[\\/]root-engine|vue[\\/]dist[\\/]runtime[\\/]deferred[\\/]engine)\.js$/u;

/**
 * The stock banner a deferred root's engine renders, which loads with the
 * engine: React's (`components/prompt/index`) and Vue's
 * (`components/prompt.vue`). It counts as the engine's.
 */
const ENGINE_BANNER =
	/[\\/](?:@inth|packages(?:[\\/]sdk)?)[\\/](?:react[\\/]dist[\\/]components[\\/]prompt[\\/]index\.js|vue[\\/]dist[\\/]runtime[\\/]components[\\/]prompt\.vue)$/u;

/**
 * c15t's chunks that load only when a visitor asks for them: the standalone
 * preference widget, the IAB preference center, the deferred dialog's
 * wrapper and the save path outside a preference surface. They may import
 * the dialog's files and decide nothing. Any other chunk outside c15t's
 * loaders counts as loaded with the page.
 */
const ON_DEMAND =
	/[\\/](?:@inth|packages(?:[\\/]sdk)?)[\\/](?:react[\\/]dist[\\/](?:components[\\/](?:preferences|iab-panel)[\\/]index\.js|aggregate-components\.js)|vue[\\/]dist[\\/]runtime[\\/]components[\\/](?:preferences|iab-panel)\.vue|(?:sdk[\\/]lib[\\/])?core[\\/]dist[\\/]preference-draft\.js)$/u;

/** Stylesheets, and the style blocks of Vue and Svelte components. */
const STYLE_MODULE =
	/\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)|[?&]type=style(?:&|$)/u;

/** `import … from '…'`, `import '…'` and `export … from '…'`. */
const STATEMENT =
	/\b(?:import|export)\s*(?:\*\s*as\s*[\w$]+|\*|\{[^}]*\}|[\w$]+\s*,\s*(?:\*\s*as\s*[\w$]+|\{[^}]*\})|[\w$]+)?\s*(?:from\s*)?(?:"[^"\n]+"|'[^'\n]+')/gu;

/** Comments, whitespace and semicolons: what a pure re-export file has left. */
const FILLER = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|[\s;]+/gu;

/** The slice of a Rolldown module's info the groups read. */
interface DialogModuleInfo {
	code?: string | null;
	dynamicImporters: readonly string[];
	importedIds: readonly string[];
	importers: readonly string[];
	isEntry: boolean;
}

/** What Rolldown passes a group's `name` function. */
interface DialogChunkingContext {
	getModuleInfo: (id: string) => DialogModuleInfo | null;
}

/** A Rolldown code-splitting group whose `name` picks its modules. */
export interface DialogChunkGroup {
	debugName: string;
	includeDependenciesRecursively: false;
	name: (id: string, context: DialogChunkingContext) => string | null;
}

/** Names a module asks of another, or all of them. */
type Wanted = ReadonlySet<string> | 'all';

/** One import or re-export statement of a module. */
interface Statement {
	/** `export … from`: names re-exported, as `exported → imported`. */
	exports?: Map<string, string> | 'star' | { namespace: string };
	/** `import … from`: the names it imports. */
	imports?: Wanted;
	specifier: string;
}

/** The names in `{ a, b as c }`, as `[local or exported, imported]`. */
const bindings = function bindings(list: string): [string, string][] {
	return list
		.slice(1, -1)
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const [imported = '', , renamed] = part.split(/\s+/u);
			return [renamed ?? imported, imported];
		});
};

/** The import and re-export statements in `code`. */
const scan = function scan(code: string): Statement[] {
	const statements: Statement[] = [];
	for (const [text] of code.matchAll(STATEMENT)) {
		const keyword = text.startsWith('import') ? 'import' : 'export';
		const quote = text.at(-1) ?? '"';
		const opening = text.lastIndexOf(quote, text.length - 2);
		const specifier = text.slice(opening + 1, -1);
		const clause = text
			.slice(keyword.length, opening)
			.replace(/\bfrom\s*$/u, '')
			.trim();
		if (keyword === 'export') {
			if (!/\bfrom\s*["']/u.test(text)) {
				continue;
			}
			if (clause.startsWith('{')) {
				statements.push({ exports: new Map(bindings(clause)), specifier });
			} else if (clause.startsWith('*') && clause.includes('as')) {
				statements.push({
					exports: { namespace: clause.split(/\s+/u).pop() ?? '' },
					specifier,
				});
			} else {
				statements.push({ exports: 'star', specifier });
			}
			continue;
		}
		const names = new Set<string>();
		let all = !clause || clause.includes('*');
		for (const part of clause.split(/,(?![^{]*\})/u)) {
			const trimmed = part.trim();
			if (trimmed.startsWith('{')) {
				for (const [, imported] of bindings(trimmed)) {
					names.add(imported);
				}
			} else if (trimmed && !trimmed.startsWith('*')) {
				names.add('default');
			}
		}
		// `import '…'` keeps the module's side effects: all of it.
		all ||= names.size === 0;
		statements.push({ imports: all ? 'all' : names, specifier });
	}
	return statements;
};

/** Names a module exports itself: declarations, `export { … }`, `export { … } from`. */
const ownExports = function ownExports(
	code: string,
	statements: readonly Statement[]
): Set<string> {
	const names = new Set<string>();
	for (const [text] of code.matchAll(
		/\bexport\s+(?:default\b|(?:async\s+)?function\*?\s*[\w$]+|(?:const|let|var|class)\s+[\w$]+)/gu
	)) {
		names.add(
			text.endsWith('default') ? 'default' : (text.split(/[\s*]+/u).pop() ?? '')
		);
	}
	for (const [text] of code.matchAll(/\bexport\s*\{[^}]*\}(?!\s*from)/gu)) {
		for (const [name] of bindings(text.slice(text.indexOf('{')))) {
			names.add(name);
		}
	}
	for (const { exports } of statements) {
		if (exports instanceof Map) {
			for (const exported of exports.keys()) {
				names.add(exported);
			}
		} else if (exports && exports !== 'star') {
			names.add(exports.namespace);
		}
	}
	return names;
};

/** Whether a module only re-exports: nothing of its own runs. */
const isBarrel = function isBarrel(code: string): boolean {
	return (
		code.replace(STATEMENT, '').replace(FILLER, '') === '' &&
		/\bexport\b/u.test(code)
	);
};

/** `id` without a query or the null-byte prefix of virtual modules. */
const bare = (id: string): string => id.replace(/^\0/u, '').split('?')[0] ?? id;

/** The package a bare specifier names: `@scope/name` or `name`. */
const packageOf = function packageOf(specifier: string): string {
	const parts = specifier.split('/');
	return specifier.startsWith('@')
		? parts.slice(0, 2).join('/')
		: (parts[0] ?? '');
};

/** Parts whose `@inth/sdk` entries keep the part's name as a prefix. */
const PREFIXED_PARTS = new Set(['iab', 'schema', 'translations', 'ui']);

/**
 * The files an `@inth/sdk` subpath may name, most likely first. The root
 * is the browser client, `engine` the engine's root, `devtools` the merged
 * entry and `iab-client` the client's IAB build. `iab/*`, `schema/*`,
 * `translations/*` and `ui/*` keep their part's prefix. Every other entry
 * is the engine's, or else the client's.
 */
const sdkFiles = function sdkFiles(subpath: string): string[] {
	if (!subpath) {
		return ['lib/browser/dist/index'];
	}
	if (subpath === 'engine') {
		return ['lib/core/dist/index'];
	}
	if (subpath === 'devtools') {
		return ['lib/entries/devtools'];
	}
	if (subpath === 'iab-client') {
		return ['lib/browser/dist/iab'];
	}
	const [part = '', ...rest] = subpath.split('/');
	if (PREFIXED_PARTS.has(part)) {
		const inner = rest.join('/') || 'index';
		return part === 'translations'
			? [
					`lib/translations/dist/languages/${inner}`,
					`lib/translations/dist/${inner}`,
				]
			: [`lib/${part}/dist/${inner}`];
	}
	return [`lib/core/dist/${subpath}`, `lib/browser/dist/${subpath}`];
};

/**
 * Which of `candidates` the specifier names, or `undefined` when that is
 * not certain.
 */
const resolveSpecifier = function resolveSpecifier(
	from: string,
	specifier: string,
	candidates: readonly string[]
): string | undefined {
	if (specifier.startsWith('.')) {
		const directory = bare(from).replace(/[\\/][^\\/]*$/u, '');
		const segments = `${directory}/${specifier}`.split(/[\\/]/u);
		const path: string[] = [];
		for (const segment of segments) {
			if (segment === '..') {
				path.pop();
			} else if (segment !== '.') {
				path.push(segment);
			}
		}
		const target = path.join('/');
		const found = candidates.filter((candidate) => {
			const plain = bare(candidate).replace(/\\/gu, '/');
			return (
				plain === target ||
				plain.replace(/\.[cm]?[jt]sx?$/u, '') ===
					target.replace(/\.[cm]?[jt]sx?$/u, '')
			);
		});
		return found.length === 1 ? found[0] : undefined;
	}
	const name = packageOf(specifier);
	const [scope, unscoped = name] = name.startsWith('@')
		? name.split('/')
		: [undefined, name];
	const roots = [`/node_modules/${name}/`];
	if (scope === '@inth') {
		// A workspace folder: `@inth/react` in `packages/sdk/react`, the
		// private `@inth/sdk-core` in `packages/sdk/core`, and `@inth/sdk`
		// in `packages/sdk/sdk`.
		const folder = unscoped.startsWith('sdk-') ? unscoped.slice(4) : unscoped;
		roots.push(`/packages/sdk/${folder}/`);
		if (folder !== 'sdk') {
			roots.push(`/packages/${folder}/`);
		}
	}
	const inPackage = candidates.filter((candidate) => {
		const plain = bare(candidate).replace(/\\/gu, '/');
		return roots.some((root) => plain.includes(root));
	});
	if (inPackage.length <= 1) {
		return inPackage[0];
	}
	// Several files of one package: c15t's packages publish `dist/<subpath>`
	// for `<name>/<subpath>`, and `dist/index` for the package itself.
	const subpath = specifier.slice(name.length + 1);
	const files =
		name === '@inth/sdk' ? sdkFiles(subpath) : [`dist/${subpath || 'index'}`];
	for (const file of files) {
		const exact = inPackage.filter((candidate) => {
			const plain = bare(candidate).replace(/\\/gu, '/');
			return [`/${file}.js`, `/${file}/index.js`].some((end) =>
				plain.endsWith(end)
			);
		});
		if (exact.length > 0) {
			return exact.length === 1 ? exact[0] : undefined;
		}
	}
	return undefined;
};

/**
 * Which modules the build includes from a set of roots, following bindings
 * through files that only re-export, as Rolldown does for packages without
 * side effects: a module a barrel re-exports counts only when something
 * asks the barrel for one of its names. Whatever the scan cannot tell
 * counts as included.
 */
const createReach = function createReach(
	info: (id: string) => DialogModuleInfo | null
) {
	const statements = new Map<string, Statement[]>();
	const statementsOf = (id: string): Statement[] => {
		let found = statements.get(id);
		if (!found) {
			found = scan(info(id)?.code ?? '');
			statements.set(id, found);
		}
		return found;
	};
	const exportsByModule = new Map<string, Set<string>>();
	const ownExportsOf = (id: string): Set<string> => {
		let found = exportsByModule.get(id);
		if (!found) {
			found = ownExports(info(id)?.code ?? '', statementsOf(id));
			exportsByModule.set(id, found);
		}
		return found;
	};
	const barrels = new Map<string, boolean>();
	const barrel = (id: string): boolean => {
		let found = barrels.get(id);
		if (found === undefined) {
			const code = info(id)?.code;
			found = typeof code === 'string' && isBarrel(code);
			barrels.set(id, found);
		}
		return found;
	};
	return function reach(roots: Iterable<string>): Set<string> {
		// A root is a chunk's entry, even when it only re-exports.
		const included = new Set<string>(roots);
		const asked = new Map<string, Wanted>();
		const queue: [string, Wanted][] = [...included].map((root) => [
			root,
			'all',
		]);
		const ask = (id: string, wanted: Wanted): void => {
			if (wanted !== 'all' && wanted.size === 0) {
				// Asked for nothing: a package without side effects drops it.
				return;
			}
			const before = asked.get(id);
			if (before === 'all') {
				return;
			}
			let merged: Wanted = wanted;
			if (before && wanted !== 'all') {
				merged = new Set([...before, ...wanted]);
				if (merged.size === before.size) {
					return;
				}
			}
			asked.set(id, merged);
			queue.push([id, merged]);
		};
		while (queue.length) {
			const [id, wanted] = queue.pop() as [string, Wanted];
			const imported = info(id)?.importedIds ?? [];
			const own = statementsOf(id);
			const isBarrelModule = barrel(id);
			if (!isBarrelModule) {
				included.add(id);
			}
			// `export … from` passes on only the names asked of this module,
			// in a file that only re-exports and in one with code of its own.
			const forward = (target: string, exports: Statement['exports']) => {
				if (exports === 'star') {
					// A name the module exports itself shadows `export *`.
					const shadowing = ownExportsOf(id);
					ask(
						target,
						wanted === 'all'
							? 'all'
							: new Set([...wanted].filter((name) => !shadowing.has(name)))
					);
				} else if (exports instanceof Map) {
					const names = new Set<string>();
					for (const [exported, original] of exports) {
						if (wanted === 'all' || wanted.has(exported)) {
							names.add(original);
						}
					}
					if (names.size) {
						ask(target, names);
					}
				} else if (
					exports &&
					(wanted === 'all' || wanted.has(exports.namespace))
				) {
					ask(target, 'all');
				}
			};
			const matched = new Set<string>();
			const placed = own.map((statement) =>
				resolveSpecifier(id, statement.specifier, imported)
			);
			for (const target of placed) {
				if (target) {
					matched.add(target);
				}
			}
			// One specifier the scan cannot place (a `#…` import alias, say)
			// and one resolved import left over: they are the same module.
			const left = imported.filter((candidate) => !matched.has(candidate));
			const lost = placed.filter((target) => !target).length;
			const [only] = left;
			if (lost === 1 && left.length === 1 && only) {
				placed[placed.indexOf(undefined)] = only;
				matched.add(only);
			}
			let unresolved = false;
			for (const [index, statement] of own.entries()) {
				const target = placed[index];
				if (!target) {
					unresolved = true;
				} else if (statement.exports) {
					forward(target, statement.exports);
				} else {
					ask(target, statement.imports ?? 'all');
				}
			}
			// What the scan could not place counts as asked for in full.
			for (const candidate of imported) {
				if (!matched.has(candidate) && (unresolved || !isBarrelModule)) {
					ask(candidate, 'all');
				}
			}
		}
		return included;
	};
};

/** A short, stable name for a set of module ids. */
const hashOf = function hashOf(text: string): string {
	let hash = 5381;
	for (let index = 0; index < text.length; index += 1) {
		hash = (hash * 33 + (text.codePointAt(index) ?? 0)) % 4_294_967_291;
	}
	return hash.toString(36);
};

/** Who loads a module: the page, or one of c15t's on-demand loaders. */
type Loader = 'page' | 'dialog' | 'engine' | 'tap';

/** The on-demand loaders a group may serve, in group-name order. */
const ON_DEMAND_LOADERS = ['dialog', 'engine', 'tap'] as const;

/** Group names, by the loaders that need their modules. */
const GROUP_NAMES: Record<string, string> = {
	dialog: 'c15t-dialog',
	'dialog+engine': 'c15t-dialog-engine',
	'dialog+engine+tap': 'c15t-dialog-shared',
	'dialog+tap': 'c15t-dialog-tap',
};

/**
 * Creates the Rolldown group that gives the stock dialog's on-demand code
 * a few files instead of one per set of importers.
 *
 * Rolldown gives each set of modules the same chunks import a chunk of its
 * own. The dialog shares a different few modules with the engine, the
 * commit path, the banner and each lazy part, so on a Nuxt or TanStack
 * Start page a Customize tap before the engine fetched 17 to 24 small
 * files. Over HTTP/1.1 the browser opens six connections per host, so they
 * arrived in waves, a round trip each.
 *
 * Each module the dialog includes is filed by the loaders that include it:
 * the dialog alone (`c15t-dialog`), the dialog and the engine
 * (`c15t-dialog-engine`), the dialog and what an accept or reject before
 * the engine loads (`c15t-dialog-tap`), or all three
 * (`c15t-dialog-shared`), plus the dialog's stylesheets
 * (`c15t-dialog-styles`). Every chunk that imports one of these files
 * needs all of it, so the engine and an accept fetch no dialog code, and a
 * Customize tap fetches three or four files. A module anything else
 * includes (an entry, a route, a component the app loads on demand, the
 * banner's chunk) stays where Rolldown puts it, so the page loads exactly
 * the code it did. A lazy chunk only the dialog, the engine or a tap
 * imports, such as the dialog's floating trigger, loads after them: it
 * may import their files and keeps its own modules.
 *
 * What each loader includes is worked out from the modules' imports,
 * following bindings through files that only re-export, as Rolldown does
 * for packages without side effects (`createReach`). Whatever that cannot
 * tell counts as included.
 *
 * `includeDependenciesRecursively` is off: with it, Rolldown moves every
 * dependency of the dialog, the first load's included, into the group, and
 * the page's entry would import the dialog's chunk.
 *
 * @returns The group.
 * @internal
 */
export const createDialogChunkGroup =
	function createDialogChunkGroup(): DialogChunkGroup {
		let infoOf: (id: string) => DialogModuleInfo | null = () => null;
		const infos = new Map<string, DialogModuleInfo | null>();
		const info = (id: string) => {
			if (!infos.has(id)) {
				infos.set(id, infoOf(id));
			}
			return infos.get(id) ?? null;
		};
		const reach = createReach(info);
		const roots: Record<Loader, Set<string>> = {
			dialog: new Set(),
			engine: new Set(),
			page: new Set(),
			tap: new Set(),
		};
		const sets: Record<Loader, Set<string>> = {
			dialog: new Set(),
			engine: new Set(),
			page: new Set(),
			tap: new Set(),
		};
		const stale = new Set<Loader>();
		const included = (loader: Loader): Set<string> => {
			if (stale.delete(loader)) {
				sets[loader] = reach(roots[loader]);
			}
			return sets[loader];
		};
		/** The loaders whose roots include `id`, from the roots known so far. */
		const loadersOf = (id: string): Loader[] =>
			(['page', ...ON_DEMAND_LOADERS] as const).filter((loader) =>
				included(loader).has(id)
			);
		// What each lazy root the page loads includes, such as a route.
		const byRoot = new Map<string, Set<string>>();
		const includedBy = (root: string): Set<string> => {
			let found = byRoot.get(root);
			if (!found) {
				found = reach([root]);
				byRoot.set(root, found);
			}
			return found;
		};
		const entries = new Set<string>();
		let entrySet = new Set<string>();
		let entriesStale = false;

		// Which loader a chunk root belongs to. A lazy module that only the
		// dialog, the engine or a tap imports loads after them and belongs to
		// none; one the page imports belongs to the page.
		const loaderOfRoot = new Map<string, Loader[]>();
		// `classify` and `discover` call each other.
		let discover: (id: string, depth?: number) => void = () => undefined;
		const classify = (root: string, depth: number): Loader[] => {
			const known = loaderOfRoot.get(root);
			if (known) {
				return known;
			}
			const module = info(root);
			let loaders: Loader[];
			if (!module || module.isEntry) {
				loaders = ['page'];
			} else if (DIALOG_ROOT.test(root)) {
				loaders = ['dialog'];
			} else if (ENGINE_ROOT.test(root) || ENGINE_BANNER.test(root)) {
				loaders = ['engine'];
			} else if (TAP_ROOT.test(root)) {
				loaders = ['tap'];
			} else if (ON_DEMAND.test(bare(root))) {
				loaders = [];
			} else if (depth > 8) {
				loaders = ['page'];
			} else {
				// Settled as the page's while it is worked out: a cycle counts
				// as loaded with the page.
				loaderOfRoot.set(root, ['page']);
				const found = new Set<Loader>();
				for (const importer of module.dynamicImporters) {
					discover(importer, depth + 1);
					const of = loadersOf(importer);
					for (const loader of of.length ? of : (['page'] as const)) {
						found.add(loader);
					}
				}
				// Loaded only after the dialog, the engine or a tap: it may import
				// their files, but its own modules decide nothing.
				loaders = found.has('page') ? ['page'] : [];
			}
			loaderOfRoot.set(root, loaders);
			return loaders;
		};
		/** Files every chunk root above `id` under its loaders. */
		const discovered = new Set<string>();
		discover = (id: string, depth = 0): void => {
			if (discovered.has(id)) {
				return;
			}
			discovered.add(id);
			const queue = [id];
			while (queue.length) {
				const current = queue.pop() as string;
				const module = info(current);
				if (module?.isEntry && !entries.has(current)) {
					entries.add(current);
					entriesStale = true;
				}
				if (module?.isEntry || module?.dynamicImporters.length) {
					for (const loader of classify(current, depth)) {
						if (!roots[loader].has(current)) {
							roots[loader].add(current);
							stale.add(loader);
						}
					}
				}
				for (const importer of module?.importers ?? []) {
					// A module already discovered had its roots filed.
					if (!discovered.has(importer)) {
						discovered.add(importer);
						queue.push(importer);
					}
				}
			}
		};
		return {
			debugName: 'c15t-dialog',
			includeDependenciesRecursively: false,
			name(id, context) {
				infoOf = (candidate) => context.getModuleInfo(candidate);
				discover(id);
				const loaders = loadersOf(id);
				if (!loaders.includes('dialog')) {
					return null;
				}
				if (entriesStale) {
					entriesStale = false;
					entrySet = reach(entries);
				}
				if (entrySet.has(id)) {
					// Every page loads it with the entry.
					return null;
				}
				// The lazy roots the page loads that include it, such as the
				// routes that render the provider. Each of them, like the
				// dialog, needs every module filed under the same set.
				const pages = [...roots.page]
					.filter((root) => !entries.has(root) && includedBy(root).has(id))
					.sort();
				const loaded = loaders.filter((loader) => loader !== 'page');
				if (STYLE_MODULE.test(id)) {
					// Only sheets nothing but the dialog loads: the banner keeps
					// its own.
					return pages.length === 0 && loaded.length === 1
						? 'c15t-dialog-styles'
						: null;
				}
				const name = GROUP_NAMES[loaded.join('+')];
				if (!name || !pages.length) {
					return name ?? null;
				}
				return `${name}-${hashOf(pages.join('\n'))}`;
			},
		};
	};

/** The slice of Rolldown's output options {@link createDialogChunkPlugin} edits. */
interface OutputOptionsLike {
	advancedChunks?: unknown;
	codeSplitting?: boolean | { groups?: unknown[] };
	inlineDynamicImports?: boolean;
	manualChunks?: unknown;
}

/**
 * The plugin context the hook reads. `watchMode`, which Rollup's and
 * Rolldown's `meta` both have, lets Rollup's context fit the type.
 */
interface OutputHookContext {
	environment?: { name: string };
	meta: { rolldownVersion?: string; watchMode: boolean };
}

/** The plugin that adds {@link createDialogChunkGroup} to a browser build. */
export interface DialogChunkPlugin {
	apply: 'build';
	name: string;
	/** Notes the build's `preserveEntrySignatures`. */
	options: (
		this: { environment?: { name: string } },
		options: { preserveEntrySignatures?: unknown }
	) => undefined;
	outputOptions: (
		this: OutputHookContext,
		options: OutputOptionsLike
	) =>
		| {
				codeSplitting: { groups: unknown[] };
				inlineDynamicImports?: boolean;
		  }
		| undefined;
}

/**
 * Gives the stock dialog's on-demand code a few files
 * ({@link createDialogChunkGroup}) in the browser build of a Vite that
 * bundles with Rolldown (Vite 8). A build without React's or Vue's stock
 * dialog gets a group that takes nothing. Rollup (Vite 7 and earlier), server builds, builds that keep
 * strict entry signatures (SvelteKit), and apps that set `manualChunks` or
 * `advancedChunks` or turn code splitting off are left alone; groups the app
 * sets in `codeSplitting` come first.
 *
 * @param environment - The Vite environment that builds for the browser.
 * @returns The Vite plugin.
 * @internal
 */
export const createDialogChunkPlugin = function createDialogChunkPlugin(
	environment = 'client'
): DialogChunkPlugin {
	const signatures = new Map<string | undefined, unknown>();
	return {
		apply: 'build',
		name: 'c15t:dialog-chunk',
		options(options) {
			signatures.set(this.environment?.name, options.preserveEntrySignatures);
			return undefined;
		},
		outputOptions(options) {
			const { codeSplitting } = options;
			const signature =
				signatures.get(this.environment?.name) ?? signatures.get(undefined);
			if (
				this.environment?.name !== environment ||
				!this.meta.rolldownVersion ||
				// Rolldown refuses this group with strict entry signatures.
				signature === 'strict' ||
				options.manualChunks !== undefined ||
				options.advancedChunks !== undefined ||
				options.inlineDynamicImports === true ||
				codeSplitting === false
			) {
				return undefined;
			}
			const settings = typeof codeSplitting === 'object' ? codeSplitting : {};
			return {
				...options,
				codeSplitting: {
					...settings,
					groups: [...(settings.groups ?? []), createDialogChunkGroup()],
				},
			};
		},
	};
};
