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
			/https:\/\/c15t\.com\/docs\/(?<route>(?:frameworks|guides|integrations)\/[a-z-/]+)/gu
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
				cwd: resolve(root, 'docs'),
			}
		)
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

test('mobile comparison claims say what ships today, not what is coming', () => {
	const pages = [
		'docs/shared/comparisons/mobile-c15t.mdx',
		'docs/comparisons/didomi.mdx',
		'docs/comparisons/onetrust.mdx',
		'docs/comparisons/usercentrics.mdx',
	];
	for (const page of pages) {
		const source = readFileSync(resolve(root, page), 'utf8');
		// A forecast goes stale when the work lands; the release checklist updates state.
		expect(source, page).not.toMatch(
			/in development|coming soon|planned|on the roadmap/iu
		);
		// Every missing feature names the pull request that adds it.
		const missing = source
			.split('\n')
			.filter(
				(line) => line.startsWith('|') && /not in the prerelease/iu.test(line)
			);
		const cited = missing.filter((line) =>
			/\[#\d+\]\(https:\/\/github\.com\/inthhq\/c15t-private\/pull\/\d+\)/u.test(
				line
			)
		);
		expect(cited, page).toEqual(missing);
	}
});
