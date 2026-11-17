import { fileURLToPath } from 'node:url';

import { transformWithOxc } from 'vite';
import { defineConfig } from 'vitest/config';

const demoScriptPath = fileURLToPath(
	new URL(
		'../internals/fixtures/sveltekit-demo/src/lib/consent-manager/demo-scripts.ts',
		import.meta.url
	)
);

export default defineConfig({
	// Root tooling tests run before package builds or SvelteKit preparation.
	oxc: { exclude: [demoScriptPath] },
	plugins: [
		{
			enforce: 'pre',
			name: 'repository-sources-before-package-builds',
			resolveId(source, importer) {
				// The mobile exporter lives in the CLI and imports these packages by
				// name. Repository tests run before package builds, so exercise their
				// real sources here.
				if (
					source === '../packages/sdk/schema/dist/index.js' ||
					source === '@c15t/schema'
				) {
					return fileURLToPath(
						new URL('../packages/sdk/schema/src/index.ts', import.meta.url)
					);
				}
				if (
					source === '../packages/sdk/translations/dist/index.js' ||
					source === '@c15t/translations'
				) {
					return fileURLToPath(
						new URL(
							'../packages/sdk/translations/src/index.ts',
							import.meta.url
						)
					);
				}
				if (source === '@c15t/translations/en') {
					return fileURLToPath(
						new URL(
							'../packages/sdk/translations/src/translations/en.ts',
							import.meta.url
						)
					);
				}
				// The manifest runtime only imports core's debug emitter at runtime.
				// Resolve that real implementation without requiring a core build.
				if (
					source === '@c15t/core' &&
					importer?.endsWith('/packages/sdk/integrations/src/engine/runtime.ts')
				) {
					return fileURLToPath(
						new URL(
							'../packages/sdk/core/src/libs/script-loader/debug.ts',
							import.meta.url
						)
					);
				}
				// The `imports` field points at the build; use the server runner's
				// source instead.
				if (
					source === '#inline-start' &&
					importer?.endsWith('/packages/sdk/integrations/src/engine/runtime.ts')
				) {
					return fileURLToPath(
						new URL(
							'../packages/sdk/integrations/src/engine/inline-start.ts',
							import.meta.url
						)
					);
				}
			},
			transform(code, id) {
				if (id === demoScriptPath) {
					return transformWithOxc(code, id, { tsconfig: false });
				}
			},
		},
	],
	resolve: {
		alias: Object.fromEntries(
			[
				['google-tag', 'analytics/google-tag'],
				['meta-pixel', 'ads-and-pixels/meta-pixel'],
				['microsoft-clarity', 'analytics/microsoft-clarity'],
				['tiktok-pixel', 'ads-and-pixels/tiktok-pixel'],
			].map(([entry, source]) => [
				`@c15t/integrations/${entry}`,
				fileURLToPath(
					new URL(
						`../packages/sdk/integrations/src/vendors/${source}.ts`,
						import.meta.url
					)
				),
			])
		),
	},
	root: fileURLToPath(new URL('.', import.meta.url)),
	test: {
		coverage: {
			enabled: true,
			include: ['**/*.ts', '!**/*.d.ts', '!**/node_modules/**'],
			provider: 'istanbul',
			reportOnFailure: true,
			reporter: ['text', 'json-summary', 'json', 'html'],
			reportsDirectory: './coverage',
		},
		environment: 'node',
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/build/**',
			'**/.cache/**',
			'**/coverage/**',
		],
		include: ['**/*.test.ts'],
	},
});
