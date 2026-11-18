import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@analogjs/storybook-angular';
import { mergeConfig } from 'vite';
import type { Plugin } from 'vite';

const storybookDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = (...segments: string[]) =>
	path.resolve(storybookDir, '../../..', ...segments);

/**
 * Angular through Vite: `@analogjs/storybook-angular` runs
 * `@storybook/angular`'s renderer on Storybook's Vite builder, so the app
 * needs no Angular CLI workspace. Storybook builds each story's wrapper
 * component at runtime, so everything compiles JIT (Analog's default).
 *
 * `@inth/angular` and its component entry points resolve to their source,
 * so a component change shows up without an `ng-packagr` build. Its other `@c15t/*` imports resolve to
 * their built `dist`: the class maps and the stylesheets the stock surfaces
 * insert come from the same `@inth/sdk/ui` build, as they do in an app.
 */
/**
 * `@analogjs/vite-plugin-angular` adds the `style` resolve condition to
 * every import, which `@inth/sdk/ui`'s exports list before `import`. The class
 * maps the components import (`@inth/sdk/ui/styles/components/button`) would
 * then resolve to the stylesheet, which has no default export. The Angular
 * CLI applies `style` to stylesheet imports only; this restores that.
 */
const scriptConditionsOnly = (): Plugin => ({
	configResolved(resolved) {
		const scopes = [
			resolved.resolve,
			...Object.values(resolved.environments ?? {}).map(
				(environment) => environment.resolve
			),
		];
		for (const scope of scopes) {
			const conditions = scope?.conditions as string[] | undefined;
			const index = conditions?.indexOf('style') ?? -1;
			if (conditions && index !== -1) {
				conditions.splice(index, 1);
			}
		}
	},
	enforce: 'post',
	name: 'c15t-storybook-script-conditions',
});

const config: StorybookConfig = {
	addons: ['@storybook/addon-a11y'],
	framework: {
		name: '@analogjs/storybook-angular',
		options: {
			experimentalZoneless: true,
			tsconfig: path.resolve(storybookDir, 'tsconfig.json'),
		},
	},
	stories: ['../src/**/*.stories.ts'],
	viteFinal: (configLocal) =>
		mergeConfig(configLocal, {
			// Vite 8 minifies CSS with Lightning CSS, which rewrites the tokens'
			// `hsl()` colors as hex. Chromium then resolves the `color-mix()`
			// rules built on them to slightly different values than the other
			// Storybooks (Vite 7) serve, and the parity runner compares
			// computed colors exactly.
			build: { cssMinify: false },
			plugins: [scriptConditionsOnly()],
			resolve: {
				alias: [
					{
						find: /^@c15t\/conformance\/(?<capture1>.*)$/u,
						replacement: workspace('internals/conformance/src/$1'),
					},
					{
						find: /^@inth\/angular$/u,
						replacement: workspace('packages/sdk/angular/src/public-api.ts'),
					},
					{
						find: /^@inth\/angular\/(?<entry>consent-dialog|consent-dialog-trigger|consent-gate|consent-root|consent-widget|devtools|iab|primitives)$/u,
						replacement: workspace('packages/sdk/angular/$1/src/public-api.ts'),
					},
				],
			},
		}),
};

export default config;
