import { parse } from '@babel/parser';

const object = function object(
	value: unknown
): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
};

const isRequireResolve = function isRequireResolve(
	callee: Record<string, unknown>
): boolean {
	if (
		callee.type !== 'MemberExpression' ||
		!object(callee.object) ||
		callee.object.type !== 'Identifier' ||
		callee.object.name !== 'require' ||
		!object(callee.property)
	) {
		return false;
	}
	return callee.computed
		? callee.property.type === 'StringLiteral' &&
				callee.property.value === 'resolve'
		: callee.property.type === 'Identifier' &&
				callee.property.name === 'resolve';
};

/** All external module references, including erased and lazy imports. */
export const moduleReferences = function moduleReferences(
	source: string
): string[] {
	const references: string[] = [];
	const file = parse(source, {
		plugins: ['typescript', 'jsx'],
		sourceType: 'unambiguous',
	});
	const visit = function visit(node: unknown): void {
		if (!object(node)) {
			return;
		}
		let specifier: unknown;
		if (
			node.type === 'ImportDeclaration' ||
			node.type === 'ExportNamedDeclaration' ||
			node.type === 'ExportAllDeclaration'
		) {
			specifier = node.source;
		} else if (
			node.type === 'CallExpression' &&
			object(node.callee) &&
			(node.callee.type === 'Import' ||
				node.callee.name === 'require' ||
				isRequireResolve(node.callee)) &&
			Array.isArray(node.arguments)
		) {
			[specifier] = node.arguments;
		} else if (node.type === 'TSImportType') {
			specifier = node.argument;
		} else if (node.type === 'TSExternalModuleReference') {
			specifier = node.expression;
		}
		if (
			object(specifier) &&
			specifier.type === 'StringLiteral' &&
			typeof specifier.value === 'string'
		) {
			references.push(specifier.value);
		}
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) {
				value.forEach(visit);
			} else if (object(value)) {
				visit(value);
			}
		}
	};
	visit(file);
	return references;
};

/** The web SDK packages: @inth/sdk and the framework packages. */
const WEB_PACKAGE =
	/^@inth\/(?:sdk|react|nextjs|vue|svelte|angular|astro|tanstack-start|integrations)(?:\/|$)/u;

export const isForbiddenModule = function isForbiddenModule(
	specifier: string
): boolean {
	return (
		specifier === 'c15t' ||
		specifier.startsWith('c15t/') ||
		specifier.startsWith('@c15t/') ||
		WEB_PACKAGE.test(specifier) ||
		specifier.startsWith('@iabtechlabtcf/')
	);
};

/** The engine's entries in @inth/sdk, which sit at its top level. */
const ENGINE_ENTRY =
	/^@inth\/sdk\/(?:engine|build|consent-categories|consent-record|events|experiment|generated|iab-support|libs|modes|modules|preference-draft|runtime|server|static|surface-actions|surface-state|testing|transports)(?:\/|$)/u;

/**
 * Whether a module is the browser consent engine the web twins run on.
 *
 * The engine's entries in `@inth/sdk` are what a `.web` file may reach. The
 * IAB codec, the vanilla client, the backend and the framework packages stay
 * forbidden everywhere.
 */
export const isWebEngineModule = function isWebEngineModule(
	specifier: string
): boolean {
	return ENGINE_ENTRY.test(specifier);
};

/**
 * Whether a file only a web bundle can reach: a `.web` module, source or built.
 *
 * Metro and the other React Native web bundlers resolve `x.web.js` in place of
 * `x.js` on web only, so nothing in an iOS or Android bundle reads one.
 */
export const isWebOnlyFile = function isWebOnlyFile(path: string): boolean {
	return /\.web\.(?:[cm]?[jt]sx?|d\.ts)$/u.test(path);
};
