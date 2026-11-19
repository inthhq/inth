/**
 * Installs packed `@inth/sdk`, `@inth/react`, `@inth/svelte`, `@inth/vue` and
 * `@inth/nuxt` tarballs into new projects outside the workspace, then builds
 * and type-checks them.
 *
 * It checks what a user of the published packages gets:
 * - the tarballs and their `package.json` files name no private
 *   `@inth/sdk-*` package;
 * - every `@inth/sdk` and `@inth/react` entry has types under
 *   `moduleResolution: bundler` and `node16`, and every `@inth/svelte`,
 *   `@inth/vue` and `@inth/nuxt` entry under `bundler`;
 * - a React app, a Svelte app and a Nuxt app build, stylesheets included;
 * - `@inth/react/postcss-tailwind3` unwraps the layers of the installed UI
 *   stylesheet;
 * - two `@inth/sdk` entries load one copy of a shared module in Node;
 * - strict install: an app that installs only `@inth/react`, with no
 *   hoisting, type-checks every `@inth/react` import the docs show and builds,
 *   and the React docs import nothing from `@inth/sdk`.
 *
 * Run after `pnpm sdk:build`, from the repository root:
 * `node packages/sdk/sdk/scripts/verify-packed-install.ts [--keep]`.
 * It needs the npm registry for third-party packages.
 */

import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { PACKAGE_ROOT } from './assemble.ts';

const SDK_ROOT = resolve(PACKAGE_ROOT, '..');
const PACKED = ['sdk', 'react', 'svelte', 'vue', 'nuxt'] as const;

const run = function run(
	command: string,
	args: string[],
	cwd: string,
	env: Record<string, string> = {}
) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, CI: '1', ...env },
	});
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(' ')} failed in ${cwd}\n${result.stdout}\n${result.stderr}`
		);
	}
	return result.stdout;
};

const check = function check(condition: boolean, message: string) {
	if (!condition) {
		throw new Error(message);
	}
	// oxlint-disable-next-line no-console -- CLI output
	console.log(`ok - ${message}`);
};

const root = mkdtempSync(join(tmpdir(), 'inth-packed-'));
const tarballs = join(root, 'tarballs');
mkdirSync(tarballs);

const packed: Record<string, string> = {};
for (const folder of PACKED) {
	const manifest = JSON.parse(
		readFileSync(join(SDK_ROOT, folder, 'package.json'), 'utf8')
	) as { name: string };
	const file = join(tarballs, `${folder}.tgz`);
	run(
		'pnpm',
		['--config.ignore-scripts=true', 'pack', '--out', file],
		join(SDK_ROOT, folder)
	);
	packed[manifest.name] = file;
}

// The tarballs as installed: nothing in them may name a private package.
const unpacked = join(root, 'unpacked');
for (const [name, file] of Object.entries(packed)) {
	const dir = join(unpacked, name);
	mkdirSync(dir, { recursive: true });
	run('tar', ['-xzf', file, '-C', dir, '--strip-components=1'], root);
	// grep exits 1 when nothing matches.
	const leaks = spawnSync('grep', ['-rlI', '-e', '@inth/sdk-', '.'], {
		cwd: dir,
		encoding: 'utf8',
	}).stdout.trim();
	check(leaks === '', `${name} tarball names no private package`);
}
const files = run('tar', ['-tzf', packed['@inth/sdk'] ?? ''], root);
check(
	files.includes('package/lib/browser/dist/inth.js') &&
		files.includes('package/lib/browser/dist/inth.testing.js'),
	'@inth/sdk ships the script-tag files under their current names'
);

const write = function write(path: string, text: string) {
	mkdirSync(join(root, path, '..'), { recursive: true });
	writeFileSync(join(root, path), text);
};

write(
	'package.json',
	JSON.stringify(
		{
			dependencies: {
				'@inth/nuxt': `file:${packed['@inth/nuxt']}`,
				'@inth/react': `file:${packed['@inth/react']}`,
				'@inth/sdk': `file:${packed['@inth/sdk']}`,
				'@inth/svelte': `file:${packed['@inth/svelte']}`,
				'@inth/vue': `file:${packed['@inth/vue']}`,
				nuxt: '4.6.0',
				react: '19.2.7',
				'react-dom': '19.2.7',
				svelte: '^5.20.0',
				vue: '^3.5.0',
			},
			devDependencies: {
				'@sveltejs/kit': '^2.63.0',
				'@sveltejs/vite-plugin-svelte': '^7.3.1',
				'@types/node': '25.5.0',
				'@types/react': '^19.2.0',
				'@types/react-dom': '^19.2.0',
				'@vitejs/plugin-react': '6.0.3',
				postcss: '8.5.10',
				typescript: '6.0.3',
				vite: '8.1.3',
			},
			name: 'inth-packed-consumer',
			private: true,
			type: 'module',
		},
		null,
		2
	)
);
write(
	'pnpm-workspace.yaml',
	[
		'overrides:',
		`  "@inth/sdk": "file:${packed['@inth/sdk']}"`,
		`  "@inth/react": "file:${packed['@inth/react']}"`,
		`  "@inth/vue": "file:${packed['@inth/vue']}"`,
		'minimumReleaseAge: 0',
		// Keep packages under node_modules, where type lookups walk up to @types.
		'enableGlobalVirtualStore: false',
		'',
	].join('\n')
);
run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], root);

const installedManifest = function installedManifest(name: string) {
	return JSON.parse(
		readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')
	) as {
		dependencies?: Record<string, string>;
		exports: Record<string, unknown>;
	};
};
for (const name of Object.keys(packed)) {
	const dependencies = Object.keys(installedManifest(name).dependencies ?? {});
	check(
		!dependencies.some((dependency) => dependency.startsWith('@inth/sdk-')),
		`${name} depends on no private package`
	);
}

// Type-check one import of every entry, under both resolution modes.
const typeEntries = function typeEntries(name: string) {
	return Object.keys(installedManifest(name).exports)
		.filter(
			(key) =>
				key !== './package.json' &&
				!key.includes('*') &&
				!/\.(?:css|js|vue|svelte|astro|tsx)$/u.test(key)
		)
		.map((key) => `${name}${key.slice(1)}`);
};
const typeCheck = function typeCheck(
	label: string,
	specifiers: string[],
	resolution: 'bundler' | 'node16',
	base = '.',
	extraOptions: Record<string, unknown> = {}
) {
	const dir = join(base, `types-${label}-${resolution}`);
	write(
		`${dir}/entries.ts`,
		specifiers
			.map(
				(specifier, index) =>
					`import type * as entry${index} from '${specifier}';\nexport type { entry${index} };`
			)
			.join('\n')
	);
	write(
		`${dir}/tsconfig.json`,
		JSON.stringify({
			compilerOptions: {
				jsx: 'react-jsx',
				lib: ['dom', 'esnext'],
				module: resolution === 'node16' ? 'node16' : 'esnext',
				moduleResolution: resolution,
				noEmit: true,
				skipLibCheck: false,
				strict: true,
				target: 'es2022',
				types: ['node'],
				...extraOptions,
			},
			files: ['entries.ts'],
		})
	);
	run(join(root, base, 'node_modules/.bin/tsc'), ['-p', dir], root);
	check(
		true,
		`${specifiers.length} ${label} entries have types under ${resolution}`
	);
};
for (const resolution of ['bundler', 'node16'] as const) {
	typeCheck('sdk', typeEntries('@inth/sdk'), resolution);
	typeCheck('react', typeEntries('@inth/react'), resolution);
}
typeCheck('svelte', typeEntries('@inth/svelte'), 'bundler');
// The Vue component declarations keep their stylesheet imports, which
// TypeScript 6 checks unless an app turns this off or skips library checks.
const vueOptions = { noUncheckedSideEffectImports: false };
typeCheck('vue', typeEntries('@inth/vue'), 'bundler', '.', vueOptions);
// Nuxt's own dependencies ship declarations that fail a full library check
// (webpack, @babel/core), so this proves only that every entry resolves.
typeCheck('nuxt', typeEntries('@inth/nuxt'), 'bundler', '.', {
	...vueOptions,
	skipLibCheck: true,
});

// A React app with the stock UI and stylesheets.
write(
	'react/index.html',
	'<div id="root"></div><script type="module" src="./main.tsx"></script>'
);
write(
	'react/main.tsx',
	`import '@inth/react/styles.css';
import '@inth/react/iab/styles.css';
import { createRoot } from 'react-dom/client';
import { ConsentBanner, ConsentDialog, InthProvider } from '@inth/react';

createRoot(document.getElementById('root')!).render(
	<InthProvider options={{ projectUrl: 'https://example.inth.app' }}>
		<ConsentBanner />
		<ConsentDialog />
	</InthProvider>
);
`
);
write(
	'react/vite.config.js',
	`import react from '@vitejs/plugin-react';
export default { plugins: [react()], root: import.meta.dirname };
`
);
run(
	join(root, 'node_modules/.bin/vite'),
	['build', '-c', 'react/vite.config.js'],
	root
);
const reactAssets = readdirSync(join(root, 'react/dist/assets'));
check(
	reactAssets.some((file) => file.endsWith('.js')) &&
		reactAssets.some((file) => file.endsWith('.css')),
	'a React app built from the tarballs, with its CSS'
);
const reactCss = reactAssets
	.filter((file) => file.endsWith('.css'))
	.map((file) => readFileSync(join(root, 'react/dist/assets', file), 'utf8'))
	.join('');
check(
	reactCss.includes('--inth-'),
	'@inth/react/styles.css brings the UI tokens'
);

// A Svelte app.
write(
	'svelte/index.html',
	'<div id="app"></div><script type="module" src="./main.js"></script>'
);
write(
	'svelte/App.svelte',
	`<script>
	import { ConsentBanner, ConsentDialog, InthProvider } from '@inth/svelte';
</script>

<InthProvider options={{ projectUrl: 'https://example.inth.app' }}>
	<ConsentBanner />
	<ConsentDialog />
</InthProvider>
`
);
write(
	'svelte/main.js',
	`import '@inth/svelte/styles.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') });
`
);
write(
	'svelte/vite.config.js',
	`import { svelte } from '@sveltejs/vite-plugin-svelte';
export default { plugins: [svelte()], root: import.meta.dirname };
`
);
run(
	join(root, 'node_modules/.bin/vite'),
	['build', '-c', 'svelte/vite.config.js'],
	root
);
check(
	readdirSync(join(root, 'svelte/dist/assets')).some((file) =>
		file.endsWith('.css')
	),
	'a Svelte app built from the tarballs, with its CSS'
);

// The Tailwind 3 plugin, from the framework package, on the installed UI CSS.
write(
	'tailwind3.mjs',
	`import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import plugin from '@inth/react/postcss-tailwind3';

const require = createRequire(import.meta.url);
const from = require.resolve('@inth/sdk/ui/styles.css');
const result = await postcss([plugin]).process(readFileSync(from, 'utf8'), { from });
console.log(JSON.stringify({ from, before: /@layer components/u.test(readFileSync(from, 'utf8')), after: /@layer components/u.test(result.css) }));
`
);
const tailwind = JSON.parse(run('node', ['tailwind3.mjs'], root)) as {
	after: boolean;
	before: boolean;
};
check(
	tailwind.before && !tailwind.after,
	'@inth/react/postcss-tailwind3 unwraps the installed UI layers'
);

// One copy of a module that two entries reach.
write(
	'instance.mjs',
	`const root = await import('@inth/sdk');
const events = await import('@inth/sdk/events');
console.log(String(root.getEventDispatcher === events.getEventDispatcher));
`
);
check(
	run('node', ['instance.mjs'], root).trim() === 'true',
	'@inth/sdk and @inth/sdk/events share one module in Node'
);

// A Nuxt app on the module, with an imported component and a language.
write(
	'nuxt-app/nuxt.config.ts',
	`import { hosted } from '@inth/nuxt';

export default defineNuxtConfig({
	inth: { mode: hosted(), projectUrl: 'https://example.inth.app' },
	compatibilityDate: '2026-07-04',
	modules: ['@inth/nuxt'],
});
`
);
write(
	'nuxt-app/app/app.vue',
	`<script setup lang="ts">
import '@inth/nuxt/translations/de';
import ConsentBanner from '@inth/nuxt/components/consent-banner';
</script>

<template>
	<InthProvider />
	<ConsentBanner v-if="false" />
	<ConsentDialogLink>Privacy settings</ConsentDialogLink>
</template>
`
);
run(join(root, 'node_modules/.bin/nuxt'), ['build', 'nuxt-app'], root, {
	INTH_ON_BUILD_ERROR: 'runtime',
});
check(
	existsSync(join(root, 'nuxt-app/.output/server/index.mjs')),
	'a Nuxt app built from the tarballs with the @inth/nuxt module'
);

// Strict install: an app that installs only @inth/react, in pnpm's isolated
// layout with nothing hoisted, so an import of @inth/sdk from app code fails.
// It sits outside the first project, whose node_modules Node would find.
const strict = relative(root, mkdtempSync(join(tmpdir(), 'inth-strict-')));
const DOCS_ROOT = join(SDK_ROOT, 'docs');
const IMPORT =
	/(?:from\s+|import\s*\(\s*|import\s+)["'](?<specifier>@inth\/[a-z-]+(?:\/[^"'?]*)?)["']/gu;
const REACT_DOCS = [
	'frameworks/react/',
	'shared/react/',
	'shared/examples/react/',
	'shared/build-manifests/react.mdx',
];
const mdxFiles = (readdirSync(DOCS_ROOT, { recursive: true }) as string[])
	.filter((file) => file.endsWith('.mdx'))
	.map((file) => file.split('\\').join('/'));
const documented = new Set<string>();
const sdkInReactDocs: string[] = [];
for (const file of mdxFiles) {
	const text = readFileSync(join(DOCS_ROOT, file), 'utf8');
	for (const match of text.matchAll(IMPORT)) {
		const specifier = match.groups?.specifier ?? '';
		if (/^@inth\/react(?:\/|$)/u.test(specifier)) {
			documented.add(specifier);
		}
		if (
			specifier.startsWith('@inth/sdk') &&
			REACT_DOCS.some((prefix) => file.startsWith(prefix))
		) {
			sdkInReactDocs.push(`${file}: ${specifier}`);
		}
	}
}
check(
	sdkInReactDocs.length === 0,
	`the React docs import nothing from @inth/sdk${sdkInReactDocs.length > 0 ? `\n${sdkInReactDocs.join('\n')}` : ''}`
);

write(
	`${strict}/package.json`,
	JSON.stringify(
		{
			dependencies: {
				'@inth/react': `file:${packed['@inth/react']}`,
				react: '19.2.7',
				'react-dom': '19.2.7',
			},
			devDependencies: {
				'@types/node': '25.5.0',
				'@types/react': '^19.2.0',
				'@types/react-dom': '^19.2.0',
				'@vitejs/plugin-react': '6.0.3',
				typescript: '6.0.3',
				vite: '8.1.3',
			},
			name: 'inth-strict-consumer',
			private: true,
			type: 'module',
		},
		null,
		2
	)
);
write(
	`${strict}/pnpm-workspace.yaml`,
	[
		// @inth/react depends on this @inth/sdk version, which is not on the
		// registry yet. An override does not make it a direct dependency.
		'overrides:',
		`  "@inth/sdk": "file:${packed['@inth/sdk']}"`,
		'hoist: false',
		'publicHoistPattern: []',
		'minimumReleaseAge: 0',
		'enableGlobalVirtualStore: false',
		'',
	].join('\n')
);
run(
	'pnpm',
	['install', '--ignore-scripts', '--no-frozen-lockfile'],
	join(root, strict)
);
check(
	!existsSync(join(root, strict, 'node_modules/@inth/sdk')) &&
		spawnSync('node', ['-e', "import('@inth/sdk')"], {
			cwd: join(root, strict),
		}).status !== 0,
	'the strict app cannot import @inth/sdk'
);
const documentedTypes = [...documented].filter(
	(specifier) => !specifier.endsWith('.css')
);
typeCheck('documented-react', documentedTypes, 'bundler', strict);
write(
	`${strict}/app/index.html`,
	'<div id="root"></div><script type="module" src="./main.tsx"></script>'
);
write(
	`${strict}/app/main.tsx`,
	`import '@inth/react/styles.css';
import '@inth/react/translations/de';
import { createRoot } from 'react-dom/client';
import {
	ConsentBanner,
	ConsentDialog,
	InthProvider,
	hosted,
	type Vendor,
} from '@inth/react';
import { defineExperiment } from '@inth/react/engine';
import { ConsentGPP } from '@inth/react/gpp';
import { projectUrl } from '@inth/react/generated';

const vendors: Vendor[] = [];
export const experiment = defineExperiment({
	arms: { wall: { prompt: { variant: 'wall' } } },
	id: 'banner-shape',
});

createRoot(document.getElementById('root')!).render(
	<InthProvider
		options={{
			mode: hosted(),
			projectUrl: projectUrl ?? 'https://example.inth.app',
			vendors,
		}}
	>
		<ConsentGPP />
		<ConsentBanner />
		<ConsentDialog />
	</InthProvider>
);
`
);
write(
	`${strict}/vite.config.js`,
	`import react from '@vitejs/plugin-react';
import { consentManifest } from '@inth/react/build';
export default {
	plugins: [react(), consentManifest({ projectUrl: 'https://example.inth.app' })],
	root: import.meta.dirname + '/app',
};
`
);
run(
	join(root, strict, 'node_modules/.bin/vite'),
	['build'],
	join(root, strict)
);
const strictAssets = readdirSync(join(root, strict, 'app/dist/assets'));
check(
	strictAssets.some((file) => file.endsWith('.js')) &&
		strictAssets.some((file) => file.endsWith('.css')),
	`the strict app builds with only @inth/react installed (${documented.size} documented @inth/react imports, ${documentedTypes.length} type-checked)`
);

if (process.argv.includes('--keep')) {
	// oxlint-disable-next-line no-console -- CLI output
	console.log(`kept ${root} and ${join(root, strict)}`);
} else {
	rmSync(join(root, strict), { force: true, recursive: true });
	rmSync(root, { force: true, recursive: true });
}
