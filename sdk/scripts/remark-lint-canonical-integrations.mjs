import { readdirSync, readFileSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

const defaultDocsRoot = fileURLToPath(new URL('../docs', import.meta.url));
const platforms =
	'(?:react-native|mobile|native|android|ios|apple|kotlin|jetpack-compose|compose|swiftui|swift|uikit|expo|rn|web|browser|react|next-js|nextjs|next|tanstack-start|nuxt-js|nuxt|vue-js|vue|astro|sveltekit|svelte-kit|svelte|angular-js|angular|solid-js|solid|javascript|js|html)';
const platformPrefix = new RegExp(`^(?:${platforms}-(?:(?:for|on)-)?)`, 'u');
const platformSuffix = new RegExp(`(?:-(?:(?:for|on)-)?${platforms})$`, 'u');
const pageRolePrefix =
	/^(?:integrations?|setup|guides?|sdks?)-(?:(?:for|on)-)?/u;
const pageRoleSuffix = /-(?:integrations?|setup|guides?|sdks?)$/u;

// Published vendor entry points already own their documentation routes.
// docs-validation.test.ts checks these against the integration registry.
const integrationPackage = JSON.parse(
	readFileSync(
		new URL('../packages/integrations/package.json', import.meta.url),
		'utf8'
	)
);
const registeredRoutes = new Set(
	Object.entries(integrationPackage.exports)
		.filter(([, entry]) => entry.types?.includes('/vendors/'))
		.map(([subpath]) => `integrations/${subpath.slice(2)}.mdx`)
);

/** @param {string} value Page title or filename to normalize. */
const slugify = (value) =>
	value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-|-$/gu, '');

/**
 * @param {string} content MDX source with optional YAML frontmatter.
 * @param {string} path Page path relative to the docs root.
 */
const pageMetadata = (content, path) => {
	const frontmatter = content.match(
		/^---\r?\n(?<yaml>[\s\S]*?)\r?\n---(?:\r?\n|$)/u
	);
	const parsed = parseDocument(frontmatter?.groups?.yaml ?? '');
	const [error] = parsed.errors;
	if (error) {
		throw new Error(`Invalid frontmatter in docs/${path}: ${error.message}`);
	}
	const document = parsed.toJS() ?? {};
	const aliases =
		document.integrationAliases === undefined
			? []
			: document.integrationAliases;
	if (
		!Array.isArray(aliases) ||
		!aliases.every((alias) => typeof alias === 'string' && slugify(alias))
	) {
		throw new Error(
			`integrationAliases must be an array of nonempty names. (docs/${path})`
		);
	}
	return {
		aliases: aliases.map(slugify),
		title: typeof document.title === 'string' ? slugify(document.title) : '',
	};
};

/** @param {string} slug Normalized page name with optional platform or page-role qualifiers. */
const withoutQualifiers = (slug) => {
	let current = slug;
	while (true) {
		const next = current
			.replace(platformPrefix, '')
			.replace(platformSuffix, '')
			.replace(pageRolePrefix, '')
			.replace(pageRoleSuffix, '');
		if (next === current) {
			return current;
		}
		current = next;
	}
};

/** @param {string} value Page title or filename. */
const identitiesFor = (value) => {
	const identity = withoutQualifiers(value);
	return [
		...new Set(
			[
				identity,
				withoutQualifiers(
					identity.replace(/-(?:(?:session-)?replay|analytics)$/u, '')
				),
			].filter(Boolean)
		),
	];
};

/** @typedef {{canonical: string} | {conflicts: string[]}} IntegrationPageIssue */

/**
 * Find duplicate vendor setup from a page title, filename or parent directory.
 * Shared snippets are excluded; body mentions and links do not identify a page.
 * Canonical pages can declare product names in frontmatter integrationAliases.
 * Published vendor routes win collisions. Other collisions need an explicit
 * decision, rather than a filename heuristic that can replace an existing URL.
 *
 * @param {string} docsRoot Absolute documentation directory.
 * @returns {(path: string, content: string) => IntegrationPageIssue | undefined} Duplicate or ambiguous page identity.
 */
export const createCanonicalIntegrationCheck = (docsRoot) => {
	/** @type {Map<string, Set<string>>} */
	const vendors = new Map();
	for (const name of readdirSync(resolve(docsRoot, 'integrations'))) {
		if (
			!name.endsWith('.mdx') ||
			['overview.mdx', 'building-integrations.mdx'].includes(name)
		) {
			continue;
		}
		const path = `integrations/${name}`;
		const metadata = pageMetadata(
			readFileSync(resolve(docsRoot, path), 'utf8'),
			path
		);
		const aliases = [
			...[basename(name, '.mdx'), metadata.title].flatMap(identitiesFor),
			// Declared names are exact aliases. "Google Analytics" must not add "Google".
			...metadata.aliases,
		];
		for (const alias of aliases) {
			const paths = vendors.get(alias) ?? new Set();
			paths.add(path);
			vendors.set(alias, paths);
		}
	}

	return (path, content) => {
		const localPath = relative(docsRoot, resolve(path)).split(sep).join('/');
		if (
			localPath.startsWith('../') ||
			/^(?:shared|_shared|_partials|assets)\//u.test(localPath) ||
			!localPath.endsWith('.mdx')
		) {
			return undefined;
		}
		const metadata = pageMetadata(content, localPath);
		const identities = [
			...[metadata.title, ...localPath.slice(0, -4).split('/')].flatMap(
				identitiesFor
			),
			...metadata.aliases,
		];
		for (const identity of identities) {
			const paths = [...(vendors.get(identity) ?? [])];
			const registered = paths.filter((candidate) =>
				registeredRoutes.has(candidate)
			);
			const candidates = registered.length > 0 ? registered : paths;
			if (candidates.length > 1) {
				return { conflicts: candidates.sort() };
			}
			const [canonical] = candidates;
			if (canonical && canonical !== localPath) {
				return { canonical };
			}
		}
		return undefined;
	};
};

/**
 * Keep each vendor's web and mobile setup on one canonical integration page.
 *
 * @param {{docsRoot?: string}} [options] Override the source directory for fixtures.
 * @returns {import('unified').Transformer} Remark transformer.
 */
export default function remarkLintCanonicalIntegrations(options = {}) {
	const docsRoot = resolve(options.docsRoot ?? defaultDocsRoot);
	const check = createCanonicalIntegrationCheck(docsRoot);
	return (_tree, file) => {
		if (!file.path) {
			return;
		}
		const issue = check(file.path, String(file));
		if (issue) {
			file.fail(
				'canonical' in issue
					? `Keep this vendor's web and mobile setup together in docs/${issue.canonical}; remove the separate vendor page.`
					: `Ambiguous integration pages: ${issue.conflicts.map((path) => `docs/${path}`).join(', ')}. Keep the established route and consolidate the duplicate.`,
				{ column: 1, line: 1 },
				'c15t:canonical-integration-page'
			);
		}
	};
}
