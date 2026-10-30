import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fg from 'fast-glob';
import { convertMdxToMarkdown } from 'leadtype/convert';
import { defaultRemarkPlugins, remarkInclude } from 'leadtype/remark';
import { expect, test } from 'vitest';

import { collectExampleRegions } from './example-doc-sources';
import { PACKAGE_DOCS_CONFIGS } from './generate-package-docs';
import { withPackageSetupLinks } from './package-doc-entry-points';

const root = fileURLToPath(new URL('..', import.meta.url));
const topics = [
	'quickstart',
	'expo',
	'bare',
	'usage',
	'native-behaviour',
	'configuration',
	'offline',
	'iab',
	'identity',
	'customize',
	'headless',
	'platform-support',
	'apple',
	'android',
	'verify',
	'troubleshooting',
];

test('advertised mobile README guides have public source pages', () => {
	const source = readFileSync(
		resolve(root, 'packages/react-native/readme.json'),
		'utf8'
	);
	const routes = [
		...source.matchAll(
			/https:\/\/c15t\.com\/docs\/(?<route>frameworks\/react-native\/[a-z-]+)/gu
		),
	];
	expect(routes.length).toBeGreaterThanOrEqual(topics.length);
	const pages = new Set(
		fg.sync('frameworks/react-native/*.mdx', { cwd: resolve(root, 'docs') })
	);
	for (const route of routes) {
		expect(pages).toContain(`${route.groups?.route}.mdx`);
	}
});

test('the mobile bundle covers every public mobile guide and advertises native setup', () => {
	const config = PACKAGE_DOCS_CONFIGS.find(
		(entry) => entry.name === '@c15t/react-native'
	);
	expect(config).toBeDefined();
	const included = fg.sync(config?.include ?? [], {
		cwd: resolve(root, 'docs'),
	});
	for (const topic of topics) {
		expect(included).toContain(`frameworks/react-native/${topic}.mdx`);
	}
	const setup = withPackageSetupLinks(
		'# Mobile\n',
		new Set(topics.map((topic) => `frameworks/react-native/${topic}.md`))
	);
	for (const topic of ['quickstart', 'expo', 'bare', 'apple', 'android']) {
		expect(setup).toContain(`./docs/frameworks/react-native/${topic}.md`);
	}
});

test('mobile setup examples come from checked source and survive Markdown conversion', async () => {
	const regions = collectExampleRegions(root);
	await Promise.all(
		['quickstart', 'expo', 'bare', 'apple', 'android', 'usage', 'headless'].map(
			async (topic) => {
				const filename = resolve(
					root,
					`docs/frameworks/react-native/${topic}.mdx`
				);
				const content = readFileSync(filename, 'utf8');
				const includes = [
					...content.matchAll(/<include src="(?<source>[^"]+)"/gu),
				];
				expect(includes.length).toBeGreaterThan(0);
				for (const include of includes) {
					const path = resolve(filename, '..', include.groups?.source ?? '');
					expect(
						regions.some((region) => resolve(root, region.destination) === path)
					).toBe(true);
				}
				const { markdown } = await convertMdxToMarkdown(filename, [
					remarkInclude,
					...defaultRemarkPlugins,
				]);
				expect(markdown).toContain('```');
				expect(markdown).not.toMatch(/<(?:include|Tabs|CommandTabs)\b/u);
			}
		)
	);
});
