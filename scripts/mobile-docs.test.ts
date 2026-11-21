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
			/https:\/\/inth\.com\/docs\/(?<route>(?:frameworks|guides|integrations)\/[a-z-/]+)/gu
		),
	];
	expect(routes.map((match) => match.groups?.route)).toEqual(
		expect.arrayContaining([
			'frameworks/react-native/quickstart',
			'frameworks/react-native/expo',
			'frameworks/swift/quickstart',
			'frameworks/android/quickstart',
			'guides/mobile-iab',
			'guides/mobile-verify',
			'integrations/overview',
		])
	);
	const pages = new Set(
		fg.sync(
			['frameworks/**/*.mdx', 'guides/**/*.mdx', 'integrations/**/*.mdx'],
			{
				cwd: resolve(root, 'packages/sdk/docs'),
			}
		)
	);
	for (const route of routes) {
		expect(pages).toContain(`${route.groups?.route}.mdx`);
	}
});

test('the mobile bundle covers every public mobile guide and advertises native setup', () => {
	const config = PACKAGE_DOCS_CONFIGS.find(
		(entry) => entry.name === '@inth/react-native'
	);
	expect(config).toBeDefined();
	const included = fg.sync(config?.include ?? [], {
		cwd: resolve(root, 'packages/sdk/docs'),
	});
	for (const topic of topics) {
		expect(included).toContain(`frameworks/react-native/${topic}.mdx`);
	}
	for (const guide of [
		'frameworks/swift/quickstart.mdx',
		'frameworks/swift/uikit.mdx',
		'frameworks/android/quickstart.mdx',
		'guides/mobile-iab.mdx',
		'guides/mobile-verify.mdx',
		'integrations/overview.mdx',
		'integrations/firebase-analytics.mdx',
		'integrations/posthog.mdx',
		'integrations/mixpanel-analytics.mdx',
		'integrations/amplitude.mdx',
		'integrations/sentry.mdx',
	]) {
		expect(included).toContain(guide);
	}
	const setup = withPackageSetupLinks(
		'# Mobile\n',
		new Set(included.map((file) => file.replace(/\.mdx$/u, '.md')))
	);
	for (const file of [
		'frameworks/react-native/quickstart.md',
		'frameworks/react-native/expo.md',
		'frameworks/react-native/bare.md',
		'frameworks/swift/quickstart.md',
		'frameworks/swift/uikit.md',
		'frameworks/android/quickstart.md',
	]) {
		expect(setup).toContain(`./docs/${file}`);
	}
});

test('the mobile bundle includes every integration guide for a mobile helper', () => {
	const config = PACKAGE_DOCS_CONFIGS.find(
		(entry) => entry.name === '@inth/react-native'
	);
	const included = new Set(
		fg.sync(config?.include ?? [], { cwd: resolve(root, 'packages/sdk/docs') })
	);
	// A guide that names a mobile helper package documents an export of the
	// tarball, so it must ship with it.
	const mobileHelper =
		/@inth\/react-native\/integrations|`InthApple`|com\.inth\.android\.integrations/u;
	const guides = fg
		.sync('integrations/*.mdx', { cwd: resolve(root, 'packages/sdk/docs') })
		.filter((file) =>
			mobileHelper.test(
				readFileSync(resolve(root, 'packages/sdk/docs', file), 'utf8')
			)
		);
	expect(guides.length).toBeGreaterThan(5);
	expect(guides.filter((file) => !included.has(file))).toEqual([]);
});

test('mobile setup examples come from checked source and survive Markdown conversion', async () => {
	const regions = collectExampleRegions(root);
	await Promise.all(
		['quickstart', 'expo', 'bare', 'apple', 'android', 'usage', 'headless'].map(
			async (topic) => {
				const filename = resolve(
					root,
					`packages/sdk/docs/frameworks/react-native/${topic}.mdx`
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

/**
 * Pages on the private repository: the repository itself and any pull request or
 * issue in the `inthhq` organisation. The Maven package host
 * (`maven.pkg.github.com/inthhq/inth`) is a dependency source, not a page,
 * so a host label before `github.com` does not count.
 */
const PRIVATE_REPO_PAGE =
	/(?<![\w.-])github\.com\/inthhq\/(?:c15t-private\b|[\w.-]+\/(?:pull|issues)\/\d)/iu;

test('docs never link to the private repository, which inth.com readers cannot open', async () => {
	expect(
		PRIVATE_REPO_PAGE.test('https://github.com/inthhq/c15t-private/pull/1')
	).toBe(true);
	expect(PRIVATE_REPO_PAGE.test('github.com/inthhq/other/issues/2')).toBe(true);
	expect(
		PRIVATE_REPO_PAGE.test('https://maven.pkg.github.com/inthhq/inth')
	).toBe(false);
	const files = await fg('packages/sdk/docs/**/*.{md,mdx}', { cwd: root });
	expect(files.length).toBeGreaterThan(0);
	const linked = files.filter((file) =>
		PRIVATE_REPO_PAGE.test(readFileSync(resolve(root, file), 'utf8'))
	);
	expect(linked).toEqual([]);
});
