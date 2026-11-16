// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { logging, strings } from '@angular-devkit/core';
import { callRule } from '@angular-devkit/schematics';
import type { Rule, Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import type { UnitTestTree } from '@angular-devkit/schematics/testing';
import { lastValueFrom } from 'rxjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { lastValue, ngAdd } from './index';
import type { NgAddOptions } from './index';

const require = createRequire(import.meta.url);
const angularRunner = new SchematicTestRunner(
	'@schematics/angular',
	join(
		dirname(require.resolve('@schematics/angular/package.json')),
		'collection.json'
	)
);
const runner = new SchematicTestRunner(
	'@c15t/angular',
	join(__dirname, '..', 'collection.json')
);

const schema = JSON.parse(
	readFileSync(join(__dirname, 'schema.json'), 'utf8')
) as { properties: Record<string, { default?: unknown }> };

/** The defaults `schema.json` declares, as the Angular CLI applies them. */
const schemaDefaults: NgAddOptions = Object.fromEntries(
	Object.entries(schema.properties)
		.filter(([, property]) => property.default !== undefined)
		.map(([name, property]) => [name, property.default])
);

const createApp = async (
	options: Record<string, unknown> = {}
): Promise<UnitTestTree> => {
	const workspace = await angularRunner.runSchematic('workspace', {
		name: 'workspace',
		newProjectRoot: 'projects',
		version: '22.0.0',
	});
	return angularRunner.runSchematic(
		'application',
		{ name: 'app', skipTests: true, ...options },
		workspace
	);
};

const run = async (
	tree: Tree,
	options: NgAddOptions = {}
): Promise<{ tree: Tree; warnings: string[] }> => {
	const warnings: string[] = [];
	// `callRule` without a parent context logs to a null logger, so the
	// rule runs with one that records warnings.
	const logger = new logging.Logger('ng-add');
	const subscription = logger.subscribe((entry) => {
		if (entry.level === 'warn') {
			warnings.push(entry.message);
		}
	});
	const rule: Rule = (host, context) =>
		callRule(ngAdd({ ...schemaDefaults, ...options }), host, {
			...context,
			logger,
		});
	try {
		const result = await lastValueFrom(runner.callRule(rule, tree));
		return { tree: result, warnings };
	} finally {
		subscription.unsubscribe();
	}
};

const root = 'projects/app/src';

describe('ng-add', () => {
	it('declares hosted mode and components as the defaults', () => {
		expect(schemaDefaults).toEqual({ components: true, mode: 'hosted' });
	});

	it('names options so their command-line flags reach the schematic', () => {
		// The CLI turns `backendURL` into `--backend-url`, then parses that
		// back as `backendUrl`, so an acronym in a name drops the flag.
		const names = Object.keys(schema.properties);
		expect(
			names.filter((name) => strings.camelize(strings.dasherize(name)) !== name)
		).toEqual([]);
	});

	it('adds provideC15t and the components to a standalone app', async () => {
		const { tree, warnings } = await run(await createApp(), {
			backendUrl: 'https://acme.inth.app',
		});

		const config = tree.readText(`${root}/app/app.config.ts`);
		expect(config).toContain(
			"import { hosted, provideC15t } from '@c15t/angular';"
		);
		expect(config).toMatch(
			/provideRouter\(routes\),\n {4}provideC15t\(\{\n {6}mode: hosted\(\{ backendURL: 'https:\/\/acme\.inth\.app' \}\),\n {4}\}\)\n/u
		);
		expect(config).not.toContain('Replace with');

		const component = tree.readText(`${root}/app/app.ts`);
		expect(component).toContain(
			"import { ConsentBanner } from '@c15t/angular';\nimport { ConsentDialog } from '@c15t/angular/consent-dialog';"
		);
		expect(component).toMatch(
			/imports: \[RouterOutlet, ConsentBanner, ConsentDialog\]/u
		);
		expect(tree.readText(`${root}/app/app.html`)).toMatch(
			/<router-outlet \/>\n<c15t-consent-banner \/>\n<c15t-consent-dialog \/>\n$/u
		);
		expect(warnings).toEqual([]);
	});

	it('uses the placeholder URL with a comment when no URL is given', async () => {
		const { tree, warnings } = await run(await createApp());

		const config = tree.readText(`${root}/app/app.config.ts`);
		expect(config).toContain(
			"// Replace with the backend URL of your Inth project.\n      mode: hosted({ backendURL: 'https://your-project.inth.app' }),"
		);
		expect(warnings).toEqual([
			expect.stringContaining('Replace https://your-project.inth.app'),
		]);
	});

	it('adds the tags to an inline template', async () => {
		const { tree } = await run(await createApp({ inlineTemplate: true }));

		const component = tree.readText(`${root}/app/app.ts`);
		expect(component).toMatch(
			/<router-outlet \/>\n {4}<c15t-consent-banner \/>\n {4}<c15t-consent-dialog \/>\n {2}`/u
		);
		expect(tree.exists(`${root}/app/app.html`)).toBe(false);
	});

	it('finds app.component.ts', async () => {
		const { tree } = await run(await createApp({ fileNameStyleGuide: '2016' }));

		const component = tree.readText(`${root}/app/app.component.ts`);
		expect(component).toContain('ConsentBanner, ConsentDialog]');
		expect(tree.readText(`${root}/app/app.component.html`)).toContain(
			'<c15t-consent-dialog />'
		);
	});

	it('adds providers to bootstrapApplication without an app config', async () => {
		const app = await createApp();
		app.overwrite(
			`${root}/main.ts`,
			[
				"import { bootstrapApplication } from '@angular/platform-browser';",
				"import { App } from './app/app';",
				'',
				'bootstrapApplication(App).catch((err) => console.error(err));',
				'',
			].join('\n')
		);
		const { tree } = await run(app);

		const main = tree.readText(`${root}/main.ts`);
		expect(main).toContain(
			"import { hosted, provideC15t } from '@c15t/angular';"
		);
		expect(main).toContain(
			"  providers: [provideC15t({\n    // Replace with the backend URL of your Inth project.\n    mode: hosted({ backendURL: 'https://your-project.inth.app' }),\n  })]"
		);
		expect(tree.readText(`${root}/app/app.ts`)).toContain(
			'ConsentBanner, ConsentDialog]'
		);
	});

	it('changes nothing the second time', async () => {
		const first = await run(await createApp());
		const files = (tree: Tree): Record<string, string> =>
			Object.fromEntries(
				['app/app.config.ts', 'app/app.ts', 'app/app.html', 'main.ts'].map(
					(file) => [file, tree.readText(`${root}/${file}`)]
				)
			);
		const before = files(first.tree);
		const second = await run(first.tree);

		expect(files(second.tree)).toEqual(before);
		expect(before['app/app.config.ts']?.match(/provideC15t\(/gu)).toHaveLength(
			1
		);
	});

	it('adds the providers when provideC15t( appears only in a comment or string', async () => {
		const app = await createApp();
		const config = `${root}/app/app.config.ts`;
		app.overwrite(
			config,
			`// TODO: add provideC15t() here.\nconst note = 'provideC15t(';\n${app.readText(config)}`
		);
		const { tree } = await run(app);

		expect(tree.readText(config)).toMatch(/\n {4}provideC15t\(\{\n/u);
	});

	it('finds provideC15t in a file the app config imports', async () => {
		const app = await createApp();
		const config = `${root}/app/app.config.ts`;
		const providers = `${root}/app/consent.providers.ts`;
		app.create(
			providers,
			"import { hosted, provideC15t } from '@c15t/angular';\n\nexport const consentProviders = [\n\tprovideC15t({ mode: hosted({ backendURL: '/api/c15t' }) }),\n];\n"
		);
		app.overwrite(
			config,
			`import { consentProviders } from './consent.providers';\n${app
				.readText(config)
				.replace(
					'provideRouter(routes)',
					'provideRouter(routes), ...consentProviders'
				)}`
		);
		const before = app.readText(config);
		const { tree } = await run(app);

		expect(tree.readText(config)).toBe(before);
		expect(tree.readText(providers).match(/provideC15t\(/gu)).toHaveLength(1);
	});

	it('ignores a local function named provideC15t', async () => {
		const app = await createApp();
		const config = `${root}/app/app.config.ts`;
		app.create(
			`${root}/app/legacy-consent.ts`,
			'function provideC15t(): unknown[] {\n\treturn [];\n}\n\nexport const legacyConsent = provideC15t();\n'
		);
		app.overwrite(
			config,
			`import { legacyConsent } from './legacy-consent';\n${app.readText(config)}`
		);
		const { tree } = await run(app);

		expect(tree.readText(config)).toContain(
			"import { hosted, provideC15t } from '@c15t/angular';"
		);
		expect(tree.readText(config)).toMatch(/\n {4}provideC15t\(\{\n/u);
	});

	it('counts an aliased provideC15t import', async () => {
		const app = await createApp();
		const config = `${root}/app/app.config.ts`;
		app.overwrite(
			config,
			`import { hosted, provideC15t as consent } from '@c15t/angular';\n${app
				.readText(config)
				.replace(
					'provideRouter(routes)',
					"provideRouter(routes), consent({ mode: hosted({ backendURL: '/api/c15t' }) })"
				)}`
		);
		const before = app.readText(config);
		const { tree } = await run(app);

		expect(tree.readText(config)).toBe(before);
	});

	it('counts provideC15t through a namespace import', async () => {
		const app = await createApp();
		const config = `${root}/app/app.config.ts`;
		app.overwrite(
			config,
			`import * as c15t from '@c15t/angular';\n${app
				.readText(config)
				.replace(
					'provideRouter(routes)',
					"provideRouter(routes), c15t.provideC15t({ mode: c15t.hosted({ backendURL: '/api/c15t' }) })"
				)}`
		);
		const before = app.readText(config);
		const { tree } = await run(app);

		expect(tree.readText(config)).toBe(before);
	});

	it.each([
		['provideC15t', 'provideC15t'],
		['provideC15t as consent', 'consent'],
	])(
		'counts provideC15t re-exported by a local barrel (%s)',
		async (exported, called) => {
			const app = await createApp();
			const config = `${root}/app/app.config.ts`;
			app.create(
				`${root}/app/consent/index.ts`,
				`export { hosted, ${exported} } from '@c15t/angular';\n`
			);
			app.overwrite(
				config,
				`import { hosted, ${called} } from './consent';\n${app
					.readText(config)
					.replace(
						'provideRouter(routes)',
						`provideRouter(routes), ${called}({ mode: hosted({ backendURL: '/api/c15t' }) })`
					)}`
			);
			const before = app.readText(config);
			const { tree } = await run(app);

			expect(tree.readText(config)).toBe(before);
		}
	);

	it.each([
		[
			'paths',
			{
				'tsconfig.app.json': {
					compilerOptions: { paths: { '@app/*': ['./src/app/*'] } },
					extends: '../../tsconfig.json',
					files: ['src/main.ts'],
				},
			},
		],
		[
			'extends',
			{
				'tsconfig.app.json': {
					extends: './tsconfig.paths.json',
					files: ['src/main.ts'],
				},
				'tsconfig.paths.json': {
					compilerOptions: { paths: { '@app/*': ['./src/app/*'] } },
					extends: '../../tsconfig.json',
				},
			},
		],
	])(
		'follows a tsconfig path alias to an existing provider (%s)',
		async (_name, configs) => {
			const app = await createApp();
			for (const [file, json] of Object.entries(configs)) {
				const path = `projects/app/${file}`;
				const text = JSON.stringify(json, null, 2);
				if (app.exists(path)) {
					app.overwrite(path, text);
				} else {
					app.create(path, text);
				}
			}
			app.create(
				`${root}/app/consent/providers.ts`,
				"import { hosted, provideC15t } from '@c15t/angular';\n\nexport const consentProviders = [\n\tprovideC15t({ mode: hosted({ backendURL: '/api/c15t' }) }),\n];\n"
			);
			const config = `${root}/app/app.config.ts`;
			app.overwrite(
				config,
				`import { consentProviders } from '@app/consent/providers';\n${app
					.readText(config)
					.replace(
						'provideRouter(routes)',
						'provideRouter(routes), ...consentProviders'
					)}`
			);
			const before = app.readText(config);
			const { tree } = await run(app);

			expect(tree.readText(config)).toBe(before);
		}
	);

	it('aliases a component whose name a local binding already uses', async () => {
		const app = await createApp();
		const component = `${root}/app/app.ts`;
		app.create(`${root}/app/my-banner.ts`, 'export class ConsentBanner {}\n');
		app.overwrite(
			component,
			app
				.readText(component)
				.replace(
					"import { RouterOutlet } from '@angular/router';",
					"import { RouterOutlet } from '@angular/router';\nimport { ConsentBanner } from './my-banner';"
				)
				.replace(
					'@Component({',
					'export const banner = ConsentBanner;\n\n@Component({'
				)
		);
		const { tree } = await run(app);
		const text = tree.readText(component);

		expect(text).toContain("import { ConsentBanner } from './my-banner';");
		expect(text).toContain(
			"import { ConsentBanner as C15tConsentBanner } from '@c15t/angular';"
		);
		expect(text).toMatch(
			/imports: \[RouterOutlet, C15tConsentBanner, ConsentDialog\]/u
		);
	});

	it("reuses a binding that already is c15t's component", async () => {
		const app = await createApp();
		const component = `${root}/app/app.ts`;
		app.create(
			`${root}/app/consent/index.ts`,
			"export { ConsentBanner } from '@c15t/angular';\n"
		);
		app.overwrite(
			component,
			app
				.readText(component)
				.replace(
					"import { RouterOutlet } from '@angular/router';",
					"import { RouterOutlet } from '@angular/router';\nimport { ConsentBanner } from './consent';"
				)
		);
		const { tree } = await run(app);
		const text = tree.readText(component);

		expect(text).not.toMatch(
			/import \{[^}]*ConsentBanner[^}]*\} from '@c15t\/angular'/u
		);
		expect(text.match(/ConsentBanner/gu)).toHaveLength(2);
		expect(text).toMatch(
			/imports: \[RouterOutlet, ConsentBanner, ConsentDialog\]/u
		);
	});

	it('finds the root component through a tsconfig path alias', async () => {
		const app = await createApp();
		app.overwrite(
			'projects/app/tsconfig.app.json',
			JSON.stringify({
				compilerOptions: { paths: { '@app/*': ['./src/app/*'] } },
				extends: '../../tsconfig.json',
				files: ['src/main.ts'],
			})
		);
		const main = `${root}/main.ts`;
		app.overwrite(
			main,
			app.readText(main).replace("from './app/app'", "from '@app/app'")
		);
		const { tree, warnings } = await run(app, {
			backendUrl: 'https://acme.inth.app',
		});

		expect(warnings).toEqual([]);
		expect(tree.readText(`${root}/app/app.ts`)).toMatch(
			/imports: \[RouterOutlet, ConsentBanner, ConsentDialog\]/u
		);
	});

	it('adds the components to a root component declared in main.ts', async () => {
		const app = await createApp();
		const main = `${root}/main.ts`;
		app.overwrite(
			main,
			[
				"import { Component } from '@angular/core';",
				"import { bootstrapApplication } from '@angular/platform-browser';",
				"import { appConfig } from './app/app.config';",
				'',
				"@Component({ imports: [], selector: 'app-root', template: '<h1>Hi</h1>' })",
				'class App {}',
				'',
				'bootstrapApplication(App, appConfig).catch((err) => console.error(err));',
				'',
			].join('\n')
		);
		const { tree, warnings } = await run(app, {
			backendUrl: 'https://acme.inth.app',
		});
		const text = tree.readText(main);

		expect(warnings).toEqual([]);
		expect(text).toContain("import { ConsentBanner } from '@c15t/angular';");
		expect(text).toMatch(/imports: \[\s*ConsentBanner, ConsentDialog\s*\]/u);
		expect(text).toContain('<c15t-consent-banner />');
	});

	it.each([
		[
			'import type { ConsentBanner }',
			"import type { ConsentBanner } from '@c15t/angular';",
		],
		[
			'import { type ConsentBanner }',
			"import { type ConsentBanner } from '@c15t/angular';",
		],
	])(
		'turns a type-only binding into a value import (%s)',
		async (_name, line) => {
			const app = await createApp();
			const component = `${root}/app/app.ts`;
			app.overwrite(
				component,
				app
					.readText(component)
					.replace(
						"import { RouterOutlet } from '@angular/router';",
						`import { RouterOutlet } from '@angular/router';\n${line}\nexport type Banner = ConsentBanner;`
					)
			);
			const { tree } = await run(app);
			const text = tree.readText(component);

			expect(text).not.toMatch(/\btype \{|\btype ConsentBanner\b/u);
			expect(text).toMatch(
				/^import \{[^}]*\bConsentBanner\b[^}]*\} from '@c15t\/angular';$/mu
			);
			expect(text).toMatch(
				/imports: \[RouterOutlet, ConsentBanner, ConsentDialog\]/u
			);
		}
	);

	it('imports the value under a free name beside a shared import type', async () => {
		const app = await createApp();
		const component = `${root}/app/app.ts`;
		const line = "import type { ConsentBanner, Theme } from '@c15t/angular';";
		app.overwrite(
			component,
			app
				.readText(component)
				.replace(
					"import { RouterOutlet } from '@angular/router';",
					`import { RouterOutlet } from '@angular/router';\n${line}\nexport type Banner = [ConsentBanner, Theme];`
				)
		);
		const { tree } = await run(app);
		const text = tree.readText(component);

		expect(text).toContain(line);
		expect(text).toContain(
			"import { ConsentBanner as C15tConsentBanner } from '@c15t/angular';"
		);
		expect(text).toMatch(
			/imports: \[RouterOutlet, C15tConsentBanner, ConsentDialog\]/u
		);
	});

	it('adds a tag that appears only in an HTML comment', async () => {
		const app = await createApp();
		const html = `${root}/app/app.html`;
		app.overwrite(
			html,
			'<!-- <c15t-consent-banner /> goes here -->\n<router-outlet />\n'
		);
		const { tree } = await run(app);

		expect(tree.readText(html)).toBe(
			'<!-- <c15t-consent-banner /> goes here -->\n<router-outlet />\n<c15t-consent-banner />\n<c15t-consent-dialog />\n'
		);
	});

	it('counts a tag inside a control-flow block', async () => {
		const app = await createApp();
		const html = `${root}/app/app.html`;
		app.overwrite(
			html,
			'<router-outlet />\n@if (ready) {\n  <c15t-consent-banner />\n}\n@defer {\n  <c15t-consent-dialog />\n}\n'
		);
		const before = app.readText(html);
		const { tree } = await run(app);

		expect(tree.readText(html)).toBe(before);
	});

	it.each([
		[
			'aliased bootstrapApplication',
			'main.ts',
			[
				[
					"import { bootstrapApplication } from '@angular/platform-browser';",
					"import { bootstrapApplication as boot } from '@angular/platform-browser';",
				],
				['bootstrapApplication(App', 'boot(App'],
			],
		],
		[
			'aliased Component',
			'app/app.ts',
			[
				[
					"import { Component, signal } from '@angular/core';",
					"import { Component as NgComponent, signal } from '@angular/core';",
				],
				['@Component({', '@NgComponent({'],
			],
		],
		[
			'namespaced Component',
			'app/app.ts',
			[
				[
					"import { Component, signal } from '@angular/core';",
					"import * as ng from '@angular/core';",
				],
				['@Component({', '@ng.Component({'],
				['= signal(', '= ng.signal('],
			],
		],
	] as const)('adds the components through %s', async (_name, file, edits) => {
		const app = await createApp();
		const path = `${root}/${file}`;
		let text = app.readText(path);
		for (const [from, to] of edits) {
			text = text.replace(from, to);
		}
		app.overwrite(path, text);
		const { tree, warnings } = await run(app, {
			backendUrl: 'https://acme.inth.app',
		});

		expect(warnings).toEqual([]);
		expect(tree.readText(`${root}/app/app.ts`)).toMatch(
			/imports: \[RouterOutlet, ConsentBanner, ConsentDialog\]/u
		);
	});

	it('adds neither the provider nor the components through a namespaced bootstrapApplication', async () => {
		const app = await createApp();
		const main = `${root}/main.ts`;
		app.overwrite(
			main,
			app
				.readText(main)
				.replace(
					"import { bootstrapApplication } from '@angular/platform-browser';",
					"import * as browser from '@angular/platform-browser';"
				)
				.replace('bootstrapApplication(App', 'browser.bootstrapApplication(App')
		);
		const component = app.readText(`${root}/app/app.ts`);
		const { tree, warnings } = await run(app, {
			backendUrl: 'https://acme.inth.app',
		});

		// The CLI's provider helper cannot follow a namespaced bootstrap call.
		// Components without a provider would throw at run time, so ng-add
		// adds neither and says what to add.
		expect(warnings).toEqual([
			expect.stringContaining('Could not add provideC15t()'),
			expect.stringContaining('Add ConsentBanner from @c15t/angular'),
		]);
		expect(tree.readText(`${root}/app/app.ts`)).toBe(component);
	});

	it('adds a root provider when the only provideC15t is on a route', async () => {
		const app = await createApp();
		const routes = `${root}/app/app.routes.ts`;
		app.overwrite(
			routes,
			[
				"import { Routes } from '@angular/router';",
				"import { hosted, provideC15t } from '@c15t/angular';",
				'',
				'export const routes: Routes = [',
				'\t{',
				"\t\tpath: 'account',",
				"\t\tproviders: [provideC15t({ mode: hosted({ backendURL: '/api/c15t' }) })],",
				'\t\tchildren: [],',
				'\t},',
				'];',
				'',
			].join('\n')
		);
		const config = `${root}/app/app.config.ts`;
		const { tree, warnings } = await run(app, {
			backendUrl: 'https://acme.inth.app',
		});

		expect(tree.readText(config)).toMatch(/\n {4}provideC15t\(\{\n/u);
		expect(warnings).toEqual([expect.stringContaining('app/app.routes.ts')]);
	});

	it.each([
		['importProvidersFrom', 'importProvidersFrom(...consentProviders)'],
		['makeEnvironmentProviders', 'makeEnvironmentProviders(consentProviders)'],
	])(
		'counts provideC15t inside %s in the root providers',
		async (wrapper, call) => {
			const app = await createApp();
			const config = `${root}/app/app.config.ts`;
			app.create(
				`${root}/app/consent.providers.ts`,
				"import { hosted, provideC15t } from '@c15t/angular';\n\nexport const consentProviders = [\n\tprovideC15t({ mode: hosted({ backendURL: '/api/c15t' }) }),\n];\n"
			);
			app.overwrite(
				config,
				`import { ${wrapper} } from '@angular/core';\nimport { consentProviders } from './consent.providers';\n${app
					.readText(config)
					.replace('provideRouter(routes)', `provideRouter(routes), ${call}`)}`
			);
			const before = app.readText(config);
			const { tree } = await run(app);

			expect(tree.readText(config)).toBe(before);
		}
	);

	it('follows mergeApplicationConfig in main.ts to an existing provider', async () => {
		const app = await createApp();
		const main = `${root}/main.ts`;
		app.overwrite(
			main,
			[
				"import { mergeApplicationConfig } from '@angular/core';",
				"import { bootstrapApplication } from '@angular/platform-browser';",
				"import { hosted, provideC15t } from '@c15t/angular';",
				"import { appConfig } from './app/app.config';",
				"import { App } from './app/app';",
				'',
				'const consentConfig = {',
				"\tproviders: [provideC15t({ mode: hosted({ backendURL: '/api/c15t' }) })],",
				'};',
				'',
				'bootstrapApplication(App, mergeApplicationConfig(appConfig, consentConfig));',
				'',
			].join('\n')
		);
		const files = [main, `${root}/app/app.config.ts`];
		const before = files.map((file) => app.readText(file));
		const { tree, warnings } = await run(app, { components: false });

		expect(warnings).toEqual([]);
		expect(files.map((file) => tree.readText(file))).toEqual(before);
	});

	it("follows a merged server config to the browser config's provider", async () => {
		const app = await createApp();
		const config = `${root}/app/app.config.ts`;
		app.overwrite(
			config,
			`import { hosted, provideC15t } from '@c15t/angular';\n${app
				.readText(config)
				.replace(
					'provideRouter(routes)',
					"provideRouter(routes), provideC15t({ mode: hosted({ backendURL: '/api/c15t' }) })"
				)}`
		);
		app.create(
			`${root}/app/app.config.server.ts`,
			[
				"import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';",
				"import { appConfig } from './app.config';",
				'',
				'const serverConfig: ApplicationConfig = { providers: [] };',
				'',
				'export const config = mergeApplicationConfig(appConfig, serverConfig);',
				'',
			].join('\n')
		);
		const main = `${root}/main.ts`;
		app.overwrite(
			main,
			app
				.readText(main)
				.replace(
					"import { appConfig } from './app/app.config';",
					"import { config } from './app/app.config.server';"
				)
				.replace(
					'bootstrapApplication(App, appConfig)',
					'bootstrapApplication(App, config)'
				)
		);
		const files = [main, config, `${root}/app/app.config.server.ts`];
		const before = files.map((file) => app.readText(file));
		const { tree, warnings } = await run(app, { components: false });

		expect(warnings).toEqual([]);
		expect(files.map((file) => tree.readText(file))).toEqual(before);
	});

	describe('every way a config can carry its providers', () => {
		const header = [
			"import { ApplicationConfig, importProvidersFrom, makeEnvironmentProviders, mergeApplicationConfig } from '@angular/core';",
			"import { provideRouter } from '@angular/router';",
			"import { hosted, provideC15t } from '@c15t/angular';",
			"import { routes } from './app.routes';",
			'',
			"const c15t = provideC15t({ mode: hosted({ backendURL: '/api/c15t' }) });",
			'',
		].join('\n');
		const known: readonly (readonly [string, string])[] = [
			[
				'a plain property',
				'export const appConfig: ApplicationConfig = { providers: [provideRouter(routes), c15t] };',
			],
			[
				'shorthand',
				'const providers = [provideRouter(routes), c15t];\nexport const appConfig: ApplicationConfig = { providers };',
			],
			[
				'a string-literal key',
				"export const appConfig: ApplicationConfig = { 'providers': [c15t] };",
			],
			[
				'a spread',
				'const base = { providers: [c15t] };\nexport const appConfig: ApplicationConfig = { ...base };',
			],
			[
				'nested spreads',
				'const inner = { providers: [c15t] };\nconst outer = { ...inner };\nexport const appConfig: ApplicationConfig = { ...outer };',
			],
			[
				'a const alias chain',
				'const first = { providers: [c15t] };\nconst second = first;\nexport const appConfig: ApplicationConfig = second;',
			],
			[
				'concat',
				'const extra = [c15t];\nexport const appConfig: ApplicationConfig = { providers: [provideRouter(routes)].concat(extra) };',
			],
			[
				'an array spread',
				'const extra = [c15t];\nexport const appConfig: ApplicationConfig = { providers: [provideRouter(routes), ...extra] };',
			],
			[
				'importProvidersFrom',
				'export const appConfig: ApplicationConfig = { providers: [importProvidersFrom(c15t)] };',
			],
			[
				'makeEnvironmentProviders',
				'export const appConfig: ApplicationConfig = { providers: [makeEnvironmentProviders([c15t])] };',
			],
			[
				'an override then a spread',
				'const withC15t = { providers: [c15t] };\nexport const appConfig: ApplicationConfig = { providers: [provideRouter(routes)], ...withC15t };',
			],
			[
				'two spreads, the later with c15t',
				'const routing = { providers: [provideRouter(routes)] };\nconst withC15t = { providers: [c15t] };\nexport const appConfig: ApplicationConfig = { ...routing, ...withC15t };',
			],
			[
				'mergeApplicationConfig',
				'const extra = { providers: [c15t] };\nexport const appConfig: ApplicationConfig = mergeApplicationConfig({ providers: [provideRouter(routes)] }, extra);',
			],
		];
		const overridden: readonly (readonly [string, string])[] = [
			[
				'a spread then an override',
				'const withC15t = { providers: [c15t] };\nexport const appConfig: ApplicationConfig = { ...withC15t, providers: [provideRouter(routes)] };',
			],
			[
				'two spreads, the earlier with c15t',
				'const routing = { providers: [provideRouter(routes)] };\nconst withC15t = { providers: [c15t] };\nexport const appConfig: ApplicationConfig = { ...withC15t, ...routing };',
			],
		];
		const unknown: readonly (readonly [string, string])[] = [
			[
				'a function returning the config',
				'function makeConfig(): ApplicationConfig {\n\treturn { providers: [c15t] };\n}\nexport const appConfig: ApplicationConfig = makeConfig();',
			],
			[
				'a conditional',
				'declare const ssr: boolean;\nexport const appConfig: ApplicationConfig = { providers: ssr ? [c15t] : [] };',
			],
			[
				'a local provider factory',
				'function consentProviders() {\n\treturn [c15t];\n}\nexport const appConfig: ApplicationConfig = { providers: [consentProviders()] };',
			],
		];
		const config = `${root}/app/app.config.ts`;
		const withConfig = async (body: string) => {
			const app = await createApp();
			app.overwrite(config, `${header}${body}\n`);
			const before = app.readText(config);
			const result = await run(app, {
				backendUrl: 'https://acme.inth.app',
				components: false,
			});
			return { before, ...result };
		};

		it.each(known)('finds provideC15t through %s', async (_form, body) => {
			const { before, tree, warnings } = await withConfig(body);

			expect(warnings).toEqual([]);
			expect(tree.readText(config)).toBe(before);
		});

		it.each(overridden)(
			"adds a provider when %s replaces c15t's providers",
			async (_form, body) => {
				const { before, tree, warnings } = await withConfig(body);
				const calls = (text: string) =>
					text.match(/provideC15t\(/gu)?.length ?? 0;

				// The overridden call is not in the root providers.
				expect(warnings).toEqual([
					expect.stringContaining("outside the application's root providers"),
				]);
				expect(calls(tree.readText(config))).toBe(calls(before) + 1);
			}
		);

		it.each(unknown)(
			'warns instead of adding a second provider through %s',
			async (_form, body) => {
				const { before, tree, warnings } = await withConfig(body);

				expect(tree.readText(config)).toBe(before);
				expect(warnings).toEqual([
					expect.stringContaining(
						"provideC15t({ mode: hosted({ backendURL: 'https://acme.inth.app' }) })"
					),
				]);
			}
		);

		it('adds no components when it cannot tell whether a provider exists', async () => {
			const app = await createApp();
			app.overwrite(config, `${header}${unknown[0]?.[1]}\n`);
			const component = app.readText(`${root}/app/app.ts`);
			const { tree, warnings } = await run(app, {
				backendUrl: 'https://acme.inth.app',
			});

			// Without a provider the components throw at startup, so the user
			// adds them once they have checked the providers.
			expect(warnings).toEqual([
				expect.stringContaining('Could not tell whether the root providers'),
				expect.stringContaining('Add ConsentBanner from @c15t/angular'),
			]);
			expect(tree.readText(`${root}/app/app.ts`)).toBe(component);
		});
	});

	it('completes a partial setup without duplicating it', async () => {
		const app = await createApp();
		const component = `${root}/app/app.ts`;
		app.overwrite(
			component,
			app
				.readText(component)
				.replace(
					"import { RouterOutlet } from '@angular/router';",
					"import { RouterOutlet } from '@angular/router';\nimport { ConsentBanner } from '@c15t/angular';"
				)
				.replace('[RouterOutlet]', '[RouterOutlet, ConsentBanner]')
		);
		app.overwrite(
			`${root}/app/app.html`,
			'<c15t-consent-banner />\n<router-outlet />\n'
		);
		const { tree } = await run(app);

		expect(tree.readText(component)).toContain(
			"import { ConsentBanner } from '@c15t/angular';\nimport { ConsentDialog } from '@c15t/angular/consent-dialog';"
		);
		expect(tree.readText(component)).toContain(
			'[RouterOutlet, ConsentBanner, ConsentDialog]'
		);
		expect(tree.readText(`${root}/app/app.html`)).toBe(
			'<c15t-consent-banner />\n<router-outlet />\n<c15t-consent-dialog />\n'
		);
	});

	it('generates local mode', async () => {
		const { tree, warnings } = await run(await createApp(), {
			backendUrl: 'https://ignored.example',
			mode: 'local',
		});

		const config = tree.readText(`${root}/app/app.config.ts`);
		expect(config).toContain(
			"import { local, provideC15t } from '@c15t/angular';"
		);
		expect(config).toContain('provideC15t({\n      mode: local(),\n    })');
		expect(config).not.toContain('hosted');
		expect(warnings).toEqual([expect.stringContaining('local mode')]);
	});

	it('leaves the root component alone without components', async () => {
		const app = await createApp();
		const component = app.readText(`${root}/app/app.ts`);
		const template = app.readText(`${root}/app/app.html`);
		const { tree } = await run(app, { components: false });

		expect(tree.readText(`${root}/app/app.config.ts`)).toContain(
			'provideC15t('
		);
		expect(tree.readText(`${root}/app/app.ts`)).toBe(component);
		expect(tree.readText(`${root}/app/app.html`)).toBe(template);
	});

	it('tells the user what to add when it cannot find the root component', async () => {
		const { tree, warnings } = await run(
			await createApp({ standalone: false })
		);

		expect(tree.readText(`${root}/app/app-module.ts`)).toContain(
			'provideC15t('
		);
		expect(warnings).toEqual([
			expect.stringContaining('Replace https://your-project.inth.app'),
			expect.stringContaining('Add ConsentBanner from @c15t/angular'),
		]);
	});
});

describe('ng-add package', () => {
	it('declares every package the factory loads at run time', () => {
		// Under pnpm or Yarn PnP a package resolves only what it declares;
		// the CLI then reports no `ng add` actions and changes nothing.
		const manifest = JSON.parse(
			readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')
		) as {
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		const declared = new Set([
			...Object.keys(manifest.dependencies ?? {}),
			...Object.keys(manifest.peerDependencies ?? {}),
		]);
		const file = join(__dirname, 'index.ts');
		const source = ts.createSourceFile(
			file,
			readFileSync(file, 'utf8'),
			ts.ScriptTarget.Latest
		);
		const loaded = source.statements
			.filter(ts.isImportDeclaration)
			.filter((statement) => !statement.importClause?.isTypeOnly)
			.map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text)
			.filter(
				(specifier) =>
					!specifier.startsWith('.') && !specifier.startsWith('node:')
			)
			.map((specifier) =>
				specifier
					.split('/')
					.slice(0, specifier.startsWith('@') ? 2 : 1)
					.join('/')
			);
		expect(loaded.length).toBeGreaterThan(0);
		expect(loaded.filter((name) => !declared.has(name))).toEqual([]);
	});
});

describe('lastValue', () => {
	// An Observable as RxJS 6 and 7 both shape it, without `lastValueFrom`.
	const observableOf = (
		emit: (observer: {
			complete: () => void;
			error: (error: unknown) => void;
			next: (value: number) => void;
		}) => void
	) => ({
		subscribe: (observer: {
			complete: () => void;
			error: (error: unknown) => void;
			next: (value: number) => void;
		}) => {
			emit(observer);
			return { unsubscribe: () => undefined };
		},
	});

	it('resolves with the last value once it completes', async () => {
		await expect(
			lastValue(
				observableOf((observer) => {
					observer.next(1);
					observer.next(2);
					observer.complete();
				})
			)
		).resolves.toBe(2);
	});

	it('rejects with the error', async () => {
		const failure = new Error('rule failed');
		await expect(
			lastValue(
				observableOf((observer) => {
					observer.error(failure);
				})
			)
		).rejects.toBe(failure);
	});
});
