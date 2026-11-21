import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { docsOriginForVersion } from './docs-origin';
import {
	packageDocLink,
	packageIndexLinks,
	packagePromptLinks,
	restorePackageDocIncludes,
} from './rewrite-package-doc-links';

test('filtered bundles retain the actual theme source', async () => {
	const source = fileURLToPath(
		new URL('../packages/sdk/docs/customization/recipes.mdx', import.meta.url)
	);
	const markdown = await restorePackageDocIncludes(
		'[Error: Could not include file ../shared/examples/storybook-react/brand-theme.mdx]',
		source
	);
	expect(markdown).toContain('export const brandTheme = defineTheme(');
	expect(markdown).toContain('../assets/v3/brand-card.png');
	expect(markdown).toContain('../assets/v3/headless-bar.png');
	expect(markdown).not.toContain('[Error:');
});

test('unresolved conversion errors stop publication', async () => {
	await expect(
		restorePackageDocIncludes(
			'[Error: Could not find section "missing"]',
			'missing.mdx'
		)
	).rejects.toThrow('Incomplete documentation conversion');
});

const site = 'https://inth.com';
const files = new Set(['guides/data-fetching.md', 'frameworks/index.md']);

test('bundled links work offline and retain anchors', () => {
	expect(
		packageDocLink(
			'/docs/guides/data-fetching#what-is-a-consent-manifest',
			'frameworks/react/quickstart.md',
			files,
			site
		)
	).toBe('../../guides/data-fetching.md#what-is-a-consent-manifest');
	expect(
		packageDocLink('/docs/frameworks', 'guides/data-fetching.md', files, site)
	).toBe('../frameworks/index.md');
});

test('topics outside the bundle link to the website', () => {
	expect(
		packageDocLink('/docs/performance', 'guides/data-fetching.md', files, site)
	).toBe('https://inth.com/docs/performance');
	expect(
		packageDocLink('https://inth.com', 'guides/data-fetching.md', files, site)
	).toBe('https://inth.com');
});

test('relative website routes become local Markdown links', () => {
	expect(
		packageDocLink(
			'../data-fetching#setup',
			'guides/nested/example.md',
			files,
			site
		)
	).toBe('../data-fetching.md#setup');
	expect(
		packageDocLink(
			'../data-fetching.mdx',
			'guides/nested/example.md',
			files,
			site
		)
	).toBe('../data-fetching.md');
	expect(
		packageDocLink('../assets/example.png', 'guides/example.md', files, site)
	).toBe('../assets/example.png');
});

test('other root-relative site paths link to the website', () => {
	expect(packageDocLink('/llms-full.txt', 'index.md', files, site)).toBe(
		'https://inth.com/llms-full.txt'
	);
	expect(
		packageDocLink('//cdn.example.com/a.js', 'index.md', files, site)
	).toBe('//cdn.example.com/a.js');
});

const promptFiles = new Set([
	'migrate-from-c15t.md',
	'frameworks/next/quickstart.md',
	'frameworks/react/quickstart.md',
]);

test('prompt docs URLs become bundled files relative to the page', () => {
	expect(
		packagePromptLinks(
			'Read https://inth.com/docs/frameworks/next/quickstart.md first and follow it in order.',
			'frameworks/next/quickstart.md',
			promptFiles,
			site
		)
	).toBe('Read ./quickstart.md first and follow it in order.');
	expect(
		packagePromptLinks(
			'Read the guide: https://inth.com/docs/frameworks/next/quickstart.md, https://inth.com/docs/frameworks/react/quickstart.md or https://inth.com/docs/frameworks/javascript/quickstart.md. Then read https://inth.com/docs/migrate-from-c15t.md.',
			'migrate-from-c15t.md',
			promptFiles,
			site
		)
	).toBe(
		'Read the guide: ./frameworks/next/quickstart.md, ./frameworks/react/quickstart.md or https://inth.com/docs/frameworks/javascript/quickstart.md. Then read ./migrate-from-c15t.md.'
	);
});

test('bundled prompt paths drop autolink brackets', () => {
	expect(
		packagePromptLinks(
			'Read <https://inth.com/docs/migrate-from-c15t.md> and <https://inth.com/docs/frameworks/javascript/quickstart.md>.',
			'frameworks/next/quickstart.md',
			promptFiles,
			site
		)
	).toBe(
		'Read ../../migrate-from-c15t.md and <https://inth.com/docs/frameworks/javascript/quickstart.md>.'
	);
});

test('root-relative prompt paths resolve like links', () => {
	expect(
		packagePromptLinks(
			'Read /docs/migrate-from-c15t.md or /docs/frameworks/javascript/quickstart.md.',
			'frameworks/next/quickstart.md',
			promptFiles,
			site
		)
	).toBe(
		'Read ../../migrate-from-c15t.md or https://inth.com/docs/frameworks/javascript/quickstart.md.'
	);
});

test('prompt text keeps paths that are not site docs', () => {
	const text =
		'Proxy /api/inth, keep `src/docs/notes.md`, and read /docsets/x, https://inth.com/docsets/x or https://example.com/docs/a.md.';
	expect(
		packagePromptLinks(text, 'migrate-from-c15t.md', promptFiles, site)
	).toBe(text);
	expect(
		packagePromptLinks(
			'(/docs/migrate-from-c15t.md#prerequisites)\n/docs/frameworks/react/quickstart.md',
			'frameworks/next/quickstart.md',
			promptFiles,
			site
		)
	).toBe('(../../migrate-from-c15t.md#prerequisites)\n../react/quickstart.md');
});

test('AGENTS.md root-relative links resolve beside the docs directory', () => {
	expect(
		packageIndexLinks(
			'[Index](/docs/llms.txt) · [Full](/llms-full.txt) · [Guide](/docs/migrate-from-c15t) · [Kept](./docs/migrate-from-c15t.md)',
			promptFiles,
			site
		)
	).toBe(
		'[Index](https://inth.com/docs/llms.txt) · [Full](https://inth.com/llms-full.txt) · [Guide](./docs/migrate-from-c15t.md) · [Kept](./docs/migrate-from-c15t.md)'
	);
});

test('unbundled pages use the docs site of the package release', () => {
	const bundleFiles = new Set(['migrate-from-c15t.md']);
	const origin = docsOriginForVersion('0.0.0-alpha.0');
	expect(origin).toBe('https://inth.com');
	expect(
		packageDocLink(
			'/docs/frameworks/next/quickstart',
			'migrate-from-c15t.md',
			bundleFiles,
			origin
		)
	).toBe('https://inth.com/docs/frameworks/next/quickstart');
	expect(
		packagePromptLinks(
			'Read /docs/frameworks/react/quickstart.md, then /docs/migrate-from-c15t.md.',
			'migrate-from-c15t.md',
			bundleFiles,
			origin
		)
	).toBe(
		'Read https://inth.com/docs/frameworks/react/quickstart.md, then ./migrate-from-c15t.md.'
	);
	expect(packageIndexLinks('[Full](/llms-full.txt)', bundleFiles, origin)).toBe(
		'[Full](https://inth.com/llms-full.txt)'
	);
	expect(docsOriginForVersion('1.0.0')).toBe('https://inth.com');
});
