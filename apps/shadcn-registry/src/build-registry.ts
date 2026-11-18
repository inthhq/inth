// oxlint-disable sort-keys -- Item JSON keeps the key order of shadcn's own registry, which reads better than alphabetical.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { registryItemSchema, registrySchema } from 'shadcn/schema';

import type { Base, Framework, RegistryFile, SetupItem, UiItem } from './items';
import {
	inthEntryByFramework,
	inthRange,
	frameworks,
	itemName,
	setupItems,
	sourceFolderByBase,
	styles,
	uiItems,
} from './items';

export interface BuildOptions {
	/** Absolute path to `apps/shadcn-registry`. */
	appDir: string;
	/** Where `{style}/{name}.json` is served, such as `https://c15t.com/r`. */
	baseUrl: string;
	/**
	 * What a dependency on an SDK package installs, given its name. Defaults
	 * to the package at {@link inthRange}.
	 */
	inthDependency?: (packageName: string) => string;
}

/** Output files keyed by path under `dist/r`. */
export type RegistryOutput = Map<string, unknown>;

// Named so the docs and tests can say which specifiers a UI item may use.
export const uiInthImports = ['@inth/react', '@inth/react/headless'];

const fromPattern = /(?<start>\bfrom\s+["'])(?<spec>[^"']+)(?<end>["'])/gu;
const sideEffectPattern = /^\s*import\s+["'](?<spec>[^"']+)["']/gmu;

// Every project of the framework already has these. Listing one as a
// dependency would make shadcn reinstall it at another version.
const providedPackages: Record<Framework, string[]> = {
	next: ['next', 'react', 'react-dom'],
	react: ['react', 'react-dom'],
	'tanstack-start': [
		'@tanstack/react-router',
		'@tanstack/react-start',
		'react',
		'react-dom',
	],
};

const isInthSpecifier = (spec: string): boolean =>
	spec === 'c15t' ||
	spec.startsWith('inth/') ||
	spec.startsWith('@inth/') ||
	spec.startsWith('@inth/');

const packageName = (spec: string): string => {
	const parts = spec.split('/');
	return spec.startsWith('@')
		? parts.slice(0, 2).join('/')
		: (parts[0] ?? spec);
};

/** Every module specifier a source file imports or re-exports from. */
export const scanImports = (content: string): string[] => {
	const specifiers = [
		...Array.from(content.matchAll(fromPattern)),
		...Array.from(content.matchAll(sideEffectPattern)),
	].map((match) => match.groups?.spec);
	return [...new Set(specifiers.filter((spec) => spec !== undefined))];
};

/**
 * Turns a React UI source into one framework's copy. The headless hooks
 * and components are the same modules under each framework's Inth entry
 * point, so only the import paths change.
 *
 * @param content - The React source.
 * @param file - The source path, for error messages.
 * @returns The source with `@inth/react` imports pointing at the framework's entry point.
 * @throws {Error} When the source imports an Inth entry point other than {@link uiInthImports}, which the other frameworks have no twin for.
 */
export const toFrameworkSource = (
	content: string,
	file: string,
	framework: Framework
): string =>
	content.replace(
		fromPattern,
		(match: string, start: string, spec: string, end: string) => {
			if (uiInthImports.includes(spec)) {
				const entry = inthEntryByFramework[framework];
				return `${start}${spec.replace('@inth/react', entry)}${end}`;
			}
			if (isInthSpecifier(spec)) {
				throw new Error(
					`${file} imports ${spec}. UI items may only import ${uiInthImports.join(' and ')}.`
				);
			}
			return match;
		}
	);

interface ItemContext {
	appDir: string;
	base: Base;
	inthDependency: (packageName: string) => string;
	framework: Framework;
	itemUrl: (name: string) => string;
	style: string;
}

interface ItemDependencies {
	dependencies: string[];
	registryDependencies: string[];
}

interface SourceFile {
	content: string;
	file: string;
}

interface ItemFile {
	path: string;
	type: RegistryFile['type'];
	target?: string;
	content: string;
}

/** One `{style}/{name}.json`, with keys in the order shadcn's own registry uses. */
interface ItemJson {
	$schema: string;
	name: string;
	type: 'registry:block' | 'registry:component';
	title: string;
	description: string;
	dependencies: string[];
	registryDependencies: string[];
	files: ItemFile[];
	envVars?: Record<string, string>;
	docs?: string;
}

const collectDependencies = (
	contents: SourceFile[],
	context: ItemContext
): ItemDependencies => {
	const dependencies = new Set<string>();
	const registryDependencies = new Set<string>();

	for (const { file, content } of contents) {
		for (const spec of scanImports(content)) {
			if (spec.startsWith('@/components/ui/')) {
				const name = spec.slice('@/components/ui/'.length);
				const vendored = path.join(
					context.appDir,
					'vendor',
					context.base,
					'components/ui',
					`${name}.tsx`
				);
				if (!existsSync(vendored)) {
					throw new Error(
						`${file} imports ${spec}, which isn't vendored for ${context.base}. Add it to vendor/${context.base} so check-types covers it.`
					);
				}
				registryDependencies.add(name);
			} else if (spec.startsWith('@/components/inth/')) {
				const name = spec.slice('@/components/inth/'.length);
				if (!uiItems.some((item) => item.name === name)) {
					throw new Error(
						`${file} imports ${spec}, which isn't a registry item.`
					);
				}
				registryDependencies.add(
					context.itemUrl(itemName(context.framework, name))
				);
			} else if (spec === '@/lib/utils') {
				registryDependencies.add('utils');
			} else if (spec.startsWith('@/') || spec.startsWith('.')) {
				throw new Error(
					`${file} imports ${spec}. Use @/components/ui, @/components/inth or @/lib/utils, which shadcn rewrites to the project's aliases.`
				);
			} else if (isInthSpecifier(spec)) {
				dependencies.add(context.inthDependency(packageName(spec)));
			} else if (
				!providedPackages[context.framework].includes(packageName(spec))
			) {
				dependencies.add(packageName(spec));
			}
		}
	}

	return {
		dependencies: [...dependencies].sort(),
		registryDependencies: [...registryDependencies].sort(),
	};
};

const filePath = (style: string, file: RegistryFile): string =>
	// With no target, shadcn installs a component at the part of its path
	// after `components/`, inside the project's components alias.
	file.type === 'registry:component'
		? `registry/${style}/components/inth/${file.source}`
		: `registry/${style}/${file.source}`;

const readSources = (
	item: UiItem | SetupItem,
	context: ItemContext
): (SourceFile & { registryFile: RegistryFile })[] => {
	const isSetup = 'framework' in item;
	const sourceDir = isSetup
		? `registry/setup/${item.framework}`
		: `registry/${sourceFolderByBase[context.base]}`;

	return item.files.map((registryFile) => {
		const file = `${sourceDir}/${registryFile.source}`;
		const raw = readFileSync(path.join(context.appDir, file), 'utf8');
		// Setup files already import their own framework's entry points.
		const content = isSetup
			? raw
			: toFrameworkSource(raw, file, context.framework);
		return { content, file, registryFile };
	});
};

const buildItem = (
	item: UiItem | SetupItem,
	context: ItemContext
): ItemJson => {
	const isSetup = 'framework' in item;
	const sources = readSources(item, context);
	const { dependencies, registryDependencies } = collectDependencies(
		sources,
		context
	);

	const files = sources.map(({ content, registryFile }): ItemFile => {
		const { target, type } = registryFile;
		const itemPath = filePath(context.style, registryFile);
		return target
			? { path: itemPath, type, target, content }
			: { path: itemPath, type, content };
	});

	const json: ItemJson = {
		$schema: 'https://ui.shadcn.com/schema/registry-item.json',
		name: itemName(context.framework, item.name),
		type: isSetup ? 'registry:block' : 'registry:component',
		title: item.title,
		description: item.description,
		dependencies,
		registryDependencies,
		files,
	};
	if (isSetup && item.envVars) {
		json.envVars = item.envVars;
	}
	if (item.docs) {
		json.docs = item.docs;
	}

	const parsed = registryItemSchema.safeParse(json);
	if (!parsed.success) {
		throw new Error(
			`${context.style}/${json.name}.json doesn't match the shadcn item schema: ${parsed.error.message}`
		);
	}
	// parsed.data reorders keys, so return what was checked as written.
	return json;
};

/**
 * Builds every item for every shadcn style, plus a `registry.json` index
 * per style. Items are identical across styles that share a base. Only
 * their file paths and cross-item URLs change.
 *
 * @param options - The app directory to read sources from and the URL the output is served at.
 * @throws {Error} When a source imports something the registry can't express, or an item fails shadcn's schema.
 */
export const buildRegistry = (options: BuildOptions): RegistryOutput => {
	const baseUrl = options.baseUrl.replace(/\/+$/u, '');
	const inthDependency =
		options.inthDependency ?? ((name: string) => `${name}@${inthRange}`);
	const output: RegistryOutput = new Map();

	for (const { base, name: style } of styles) {
		const itemUrl = (name: string) => `${baseUrl}/${style}/${name}.json`;
		const items = frameworks.flatMap((framework) => {
			const context = {
				appDir: options.appDir,
				base,
				inthDependency,
				framework,
				itemUrl,
				style,
			};
			return [
				...uiItems.map((item) => buildItem(item, context)),
				...setupItems
					.filter((item) => item.framework === framework)
					.map((item) => buildItem(item, context)),
			];
		});

		for (const item of items) {
			output.set(`${style}/${item.name}.json`, item);
		}

		const registry = {
			$schema: 'https://ui.shadcn.com/schema/registry.json',
			name: 'c15t',
			homepage: 'https://c15t.com',
			items: items.map(({ $schema: _schema, files, ...item }) => ({
				...item,
				files: files.map(({ content: _content, ...file }) => file),
			})),
		};
		const parsed = registrySchema.safeParse(registry);
		if (!parsed.success) {
			throw new Error(
				`${style}/registry.json doesn't match the shadcn registry schema: ${parsed.error.message}`
			);
		}
		output.set(`${style}/registry.json`, registry);
	}

	return output;
};
