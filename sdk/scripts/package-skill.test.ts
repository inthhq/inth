import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import fg from 'fast-glob';
import { expect, test } from 'vitest';

import { PACKAGE_DOCS_CONFIGS } from './generate-package-docs';
import { packageSkillName, renderPackageSkill } from './package-skill';

const docsRoot = fileURLToPath(new URL('../docs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test.each(PACKAGE_DOCS_CONFIGS)(
	'every $name bundle pattern matches a docs page',
	(config) => {
		const empty = config.include.filter(
			(pattern) => fg.sync(pattern, { cwd: docsRoot }).length === 0
		);
		expect(empty).toEqual([]);
	}
);

test.each(PACKAGE_DOCS_CONFIGS)(
	'$name publishes its generated docs and skill',
	(config) => {
		const manifest = JSON.parse(
			readFileSync(`${repoRoot}/${config.outDir}/package.json`, 'utf8')
		) as { files?: string[] };
		expect(manifest.files).toEqual(
			expect.arrayContaining(['AGENTS.md', 'SKILL.md', 'docs'])
		);
	}
);

test('the umbrella bundle covers every web framework directory', () => {
	const umbrella = PACKAGE_DOCS_CONFIGS.find(
		(config) => config.name === 'c15t'
	);
	const files = new Set(fg.sync(umbrella?.include ?? [], { cwd: docsRoot }));
	const quickstarts = fg.sync('frameworks/*/quickstart.mdx', {
		cwd: docsRoot,
		ignore: [
			'frameworks/react-native/**',
			'frameworks/swift/**',
			'frameworks/android/**',
		],
	});
	expect(quickstarts.filter((file) => !files.has(file))).toEqual([]);
	expect(files).toContain('frameworks/html/quickstart.mdx');
});

test('package skills link only to pages in the bundle', () => {
	const skill = renderPackageSkill(
		'@c15t/vue',
		{ install: '`npm install c15t`', topic: 'the project is a Vue app' },
		new Set([
			'concepts/choose-your-setup.md',
			'frameworks/vue/quickstart.md',
			'frameworks/nuxt/quickstart.md',
			'guides/verify-consent.md',
		])
	);
	expect(skill).toMatch(/^---\nname: c15t-vue\n/u);
	expect(skill).toContain('[Nuxt](./docs/frameworks/nuxt/quickstart.md)');
	expect(skill).toContain('[Vue](./docs/frameworks/vue/quickstart.md)');
	expect(skill).not.toContain('frameworks/next/');
	expect(skill).not.toContain('troubleshooting.md');
	expect(skill).toContain('Not recommended for production environments.');
	expect(skill).toContain('`npm install c15t`');
});

test('skills fit the package they ship in', () => {
	const browser = renderPackageSkill(
		'@c15t/browser',
		{ install: 'a script tag', topic: 'the site is plain HTML' },
		new Set(['frameworks/html/quickstart.md', 'frameworks/html/customize.md'])
	);
	expect(browser).toContain('data-c15t-category');
	expect(browser).toContain(
		'[HTML script tag customization](./docs/frameworks/html/customize.md)'
	);
	expect(browser).not.toContain('New apps install `c15t`');

	const next = renderPackageSkill(
		'@c15t/nextjs',
		{ install: '`npm install c15t`', topic: 'Next.js', umbrella: true },
		new Set()
	);
	expect(next).toContain('New apps install `c15t`');
});

test('the umbrella skill names the package instead of repeating c15t', () => {
	const skill = renderPackageSkill(
		'c15t',
		{ install: '`npm install c15t`', topic: 'the project uses c15t' },
		new Set()
	);
	expect(skill).toContain('\n# c15t (umbrella package)\n');
	expect(skill).toContain('with the c15t umbrella package.');
	expect(skill).not.toContain('c15t with c15t');
});

test('mobile skills describe native authority and link only bundled mobile guides', () => {
	const config = PACKAGE_DOCS_CONFIGS.find(
		(entry) => entry.name === '@c15t/react-native'
	);
	expect(config).toBeDefined();
	if (!config) {
		throw new Error('Missing mobile bundle');
	}
	const files = new Set([
		'frameworks/react-native/quickstart.md',
		'frameworks/react-native/offline.md',
	]);
	const skill = renderPackageSkill(config.name, config.skill, files);
	expect(skill).toContain('(./docs/frameworks/react-native/quickstart.md)');
	expect(skill).toContain('(./docs/frameworks/react-native/offline.md)');
	expect(skill).not.toContain('(./docs/frameworks/react-native/expo.md)');
	expect(skill).toContain('private prerelease');
	expect(skill).toContain('CommitResult.ok');
	expect(skill).toContain('ATT is separate');
	expect(skill).not.toContain('choices in the browser');
	expect(skill).not.toContain('data-c15t-category');
});

test.each(PACKAGE_DOCS_CONFIGS.filter((config) => config.skillDirectory))(
	'$name ships a skill that still works once Expo links it',
	(config) => {
		const manifest = JSON.parse(
			readFileSync(`${repoRoot}/${config.outDir}/package.json`, 'utf8')
		) as {
			files?: string[];
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
		};
		expect(manifest.files).toContain('skills');
		// Expo links the `skills/` directory of transitive dependencies too, so
		// a c15t dependency that also ships one would link a second c15t skill
		// into every app that installs this package. A dependency without a
		// `skills/` directory (such as the web engine, an optional peer) links
		// nothing.
		const dependencies = Object.keys({
			...manifest.dependencies,
			...manifest.peerDependencies,
			...manifest.optionalDependencies,
		});
		const linkedSkills = new Set(
			PACKAGE_DOCS_CONFIGS.filter((other) => other.skillDirectory).map(
				(other) => other.name
			)
		);
		expect(dependencies.filter((name) => linkedSkills.has(name))).toEqual([]);

		const bundled = new Set(
			fg
				.sync(config.include, { cwd: docsRoot })
				.map((file) => file.replace(/\.mdx$/u, '.md'))
		);
		const skill = renderPackageSkill(config.name, config.skill, bundled);
		// Expo uses the directory name and skills-npm the frontmatter name.
		const name = /^name: (?<name>.+)$/mu.exec(skill)?.groups?.name;
		expect(name).toBe(packageSkillName(config.name));
		expect(name).toMatch(/^[A-Za-z0-9._-]+$/u);
		expect(skill).toMatch(/^description: \S/mu);

		// Agents read the skill through `.claude/skills/<name>` and resolve
		// `..` against that link, so a path out of the skill directory breaks.
		const paths = [...skill.matchAll(/\.{1,2}\/[\w./-]*[\w/]/gu)].map(
			([path]) => path
		);
		expect(paths.length).toBeGreaterThan(0);
		expect(
			paths.filter(
				(path) =>
					!path.startsWith('./docs/') ||
					!(path === './docs/README.md' || bundled.has(path.slice(7)))
			)
		).toEqual([]);
	}
);
