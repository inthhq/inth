#!/usr/bin/env bun

import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fg from 'fast-glob';
import type { Root } from 'mdast';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

import { docsOriginForVersion } from './docs-origin';
import {
	withFrameworkGroups,
	withPackageSetupLinks,
} from './package-doc-entry-points';
import type { PackageSkill } from './package-skill';
import { packageSkillName, renderPackageSkill } from './package-skill';
import {
	packageDocLink,
	packageIndexLinks,
	packagePromptLinks,
	restorePackageDocIncludes,
} from './rewrite-package-doc-links';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** leadtype reads `docs/` under this folder. */
const DOCS_SOURCE_ROOT = join(ROOT_DIR, 'packages/sdk');
const DOCS_DIR = 'packages/sdk/docs';

export interface PackageDocsConfig {
	name: string;
	outDir: string;
	summary: string;
	include: string[];
	/** Replaces leadtype's generic SKILL.md with Inth guidance. */
	skill: PackageSkill;
	/**
	 * Also writes the skill to `skills/<name>/`, with its own copy of `docs/`.
	 * Expo's `skills:sync` links only that layout, and an agent resolves a
	 * link from a linked skill lexically, so the skill cannot point to
	 * `../../docs`. Only packages without Inth dependencies use it: Expo also
	 * links skills from transitive dependencies.
	 */
	skillDirectory?: boolean;
}

export const PACKAGE_DOCS_CONFIGS: PackageDocsConfig[] = [
	{
		include: [
			'frameworks/react-native/**/*.mdx',
			'frameworks/swift/**/*.mdx',
			'frameworks/android/**/*.mdx',
			'guides/mobile-*.mdx',
			'integrations/overview.mdx',
			'integrations/firebase-analytics.mdx',
			'integrations/expo-observe.mdx',
			'integrations/posthog.mdx',
			'integrations/mixpanel-analytics.mdx',
			'integrations/amplitude.mdx',
			'integrations/sentry.mdx',
			'integrations/admob.mdx',
			'integrations/appsflyer.mdx',
			'integrations/adjust.mdx',
			'integrations/meta-app-events.mdx',
			'integrations/braze.mdx',
			'integrations/branch.mdx',
			'integrations/singular.mdx',
		],
		name: '@inth/react-native',
		outDir: 'packages/react-native',
		skill: {
			install: 'the maintainer-provided private @inth/react-native tarball',
			topic:
				'the project uses React Native, Expo development builds, Swift or Kotlin native consent',
		},
		skillDirectory: true,
		summary:
			'Build consent into React Native, Expo, SwiftUI, UIKit and Android apps. Follow a platform quickstart, keep optional SDKs behind consent gates, customize native screens or supply your own UI.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/react/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/react',
		outDir: 'packages/sdk/react',
		skill: {
			install: '`npm install @inth/react`',
			topic: 'the project is a React app, such as Vite or React Router',
		},
		summary: 'React consent components, hooks, Inth setup and customization.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/next/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/nextjs',
		outDir: 'packages/sdk/nextjs',
		skill: {
			install: '`npm install @inth/nextjs`',
			topic:
				'the project is a Next.js app with the App Router, Pages Router or static export',
		},
		summary:
			'Next.js App Router, Pages Router, static export and hydration with Inth.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/vue/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/vue',
		outDir: 'packages/sdk/vue',
		skill: {
			install: '`npm install @inth/vue`',
			topic: 'the project is a Vue app without Nuxt',
		},
		summary: 'Vue plugin, Vite setup and server rendering with Inth.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/nuxt/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/nuxt',
		outDir: 'packages/sdk/nuxt',
		skill: {
			install: '`npm install @inth/nuxt`',
			topic: 'the project is a Nuxt 3 or 4 app',
		},
		summary: 'Nuxt module, SSR, static hosting and components with Inth.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/svelte/**/*.mdx',
			'frameworks/sveltekit/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/svelte',
		outDir: 'packages/sdk/svelte',
		skill: {
			install: '`npm install @inth/svelte`',
			topic: 'the project is a Svelte or SvelteKit app',
		},
		summary:
			'Svelte and SvelteKit providers, request loading and static hosting with Inth.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/angular/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/angular',
		outDir: 'packages/sdk/angular',
		skill: {
			install: '`npm install @inth/angular`',
			topic:
				'the project is an Angular 20, 21 or 22 app, with or without `@angular/ssr`',
		},
		summary:
			'Angular provider, standalone components, signals, headless directives and server rendering with Inth.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/astro/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/astro',
		outDir: 'packages/sdk/astro',
		skill: {
			install: '`npm install @inth/astro`',
			topic: 'the project is an Astro site',
		},
		summary:
			'Astro static and server integration, dialog adapters and runtime ownership with Inth.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/tanstack-start/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/tanstack-start',
		outDir: 'packages/sdk/tanstack-start',
		skill: {
			install: '`npm install @inth/tanstack-start`',
			topic: 'the project is a TanStack Start app',
		},
		summary:
			'TanStack Start server functions, request middleware and consent boundaries with Inth.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/*/scripts.mdx',
			'frameworks/*/embeds.mdx',
			'frameworks/*/network-blocker.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/integrations',
		outDir: 'packages/sdk/integrations',
		skill: {
			install:
				'`npm install @inth/integrations` alongside the framework package',
			topic:
				'the project loads analytics, pixels, tag managers or embeds that must wait for consent',
		},
		summary:
			'Consent-aware vendor integrations and Consent Mode loading contracts for Inth.',
	},
	{
		include: [
			'performance.mdx',
			'migrate-from-c15t.mdx',
			'concepts/**/*.mdx',
			'guides/**/!(mobile-*).mdx',
			'frameworks/html/**/*.mdx',
			'frameworks/javascript/**/*.mdx',
			'customization/**/*.mdx',
			'integrations/**/*.mdx',
		],
		name: '@inth/sdk',
		outDir: 'packages/sdk/sdk',
		skill: {
			install:
				'a `<script>` tag for `@inth/sdk` from jsDelivr, or `npm install @inth/sdk`',
			topic:
				'the site is plain HTML, a CMS, a page builder or a static site generator, a bundled app without a UI framework, or code that uses the headless engine and `createConsentRuntime`',
		},
		summary:
			'Inth for plain HTML sites from one script tag, and for bundled JavaScript apps with the stock UI: data attributes, the window.inth API, customization, script and iframe gating, IAB and integrations.',
	},
];

const configsByName = new Map(
	PACKAGE_DOCS_CONFIGS.map((config) => [config.name, config])
);

const selectedConfigs = function selectedConfigs() {
	const requested = process.argv.slice(2);
	if (requested.length === 0 || requested.includes('all')) {
		return PACKAGE_DOCS_CONFIGS;
	}

	return requested.map((name) => {
		const config = configsByName.get(name);
		if (!config) {
			throw new Error(`Unsupported package docs target: ${name}`);
		}
		return config;
	});
};

const runLeadtype = async function runLeadtype(config: PackageDocsConfig) {
	const outDir = join(ROOT_DIR, config.outDir);
	rmSync(join(outDir, 'AGENTS.md'), { force: true });
	rmSync(join(outDir, 'docs'), { force: true, recursive: true });
	if (config.skillDirectory) {
		rmSync(join(outDir, 'skills'), { force: true, recursive: true });
	}

	const command = [
		'bunx',
		'leadtype',
		'generate',
		'--bundle',
		'--src',
		DOCS_SOURCE_ROOT,
		'--out',
		outDir,
		'--name',
		config.name,
		'--summary',
		config.summary,
	];

	for (const include of config.include) {
		command.push('--include', include);
	}

	const proc = Bun.spawn(command, {
		cwd: ROOT_DIR,
		env: {
			...process.env,
			// leadtype's MDX bundling exceeds Node's default heap on the larger
			// packages (core, react); raise it here so every caller — all CI
			// workflows and local builds — gets the fix in one place.
			NODE_OPTIONS:
				`${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=6144`.trim(),
		},
		stderr: 'inherit',
		stdout: 'inherit',
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(`leadtype package docs failed for ${config.name}`);
	}

	// Links to pages outside the bundle point at the Inth docs site.
	const { version } = JSON.parse(
		readFileSync(join(outDir, 'package.json'), 'utf8')
	) as { version: string };
	const siteOrigin = docsOriginForVersion(version);
	const docsDir = join(outDir, 'docs');
	const files = await fg('**/*.md', { cwd: docsDir });
	const bundledFiles = new Set(files);
	await Promise.all(
		files.map(async (file) => {
			const processor = remark()
				.use(remarkFrontmatter)
				.use(remarkGfm)
				.use(() => (tree: Root) => {
					visit(tree, (node) => {
						if (node.type === 'link' || node.type === 'definition') {
							node.url = packageDocLink(
								node.url,
								file,
								bundledFiles,
								siteOrigin
							);
						}
						// leadtype renders <Prompt> as a `prompt` code block, so its
						// docs paths are plain text rather than link nodes.
						if (node.type === 'code' && node.lang === 'prompt') {
							node.value = packagePromptLinks(
								node.value,
								file,
								bundledFiles,
								siteOrigin
							);
						}
					});
				});
			const path = join(docsDir, file);
			const content = await restorePackageDocIncludes(
				readFileSync(path, 'utf8'),
				join(ROOT_DIR, DOCS_DIR, file.replace(/\.md$/u, '.mdx'))
			);
			writeFileSync(path, String(await processor.process(content)));
		})
	);
	// Recipes retain their real screenshots when read from an installed package.
	if (existsSync(join(docsDir, 'customization/recipes.md'))) {
		cpSync(join(ROOT_DIR, DOCS_DIR, 'assets/v3'), join(docsDir, 'assets/v3'), {
			recursive: true,
		});
	}

	const agentsPath = join(outDir, 'AGENTS.md');
	const docsReadmePath = join(outDir, 'docs', 'README.md');
	const agentsContent = withFrameworkGroups(
		withPackageSetupLinks(
			packageIndexLinks(
				readFileSync(agentsPath, 'utf8'),
				bundledFiles,
				siteOrigin
			),
			bundledFiles
		)
	);
	writeFileSync(agentsPath, agentsContent);
	const skill = renderPackageSkill(config.name, config.skill, bundledFiles);
	writeFileSync(join(outDir, 'SKILL.md'), skill);
	mkdirSync(join(outDir, 'docs'), { recursive: true });
	writeFileSync(
		docsReadmePath,
		agentsContent.replaceAll('(./docs/', '(./'),
		'utf8'
	);
	if (config.skillDirectory) {
		const skillDir = join(outDir, 'skills', packageSkillName(config.name));
		cpSync(docsDir, join(skillDir, 'docs'), { recursive: true });
		writeFileSync(join(skillDir, 'SKILL.md'), skill);
	}
};

if (import.meta.main) {
	await Array.from(selectedConfigs()).reduce(
		async (previousIteration, config) => {
			await previousIteration;
			console.log(`Generating package docs for ${config.name}`);
			await runLeadtype(config);
		},
		Promise.resolve()
	);
}
