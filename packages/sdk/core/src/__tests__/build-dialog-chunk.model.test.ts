import { describe, expect, test } from 'vite-plus/test';

import {
	createDialogChunkGroup,
	createDialogChunkPlugin,
} from '../build-dialog-chunk.model';

const INTH = '/app/node_modules/@inth/';
/** Where `@inth/sdk` installs its parts. */
const SDK = `${INTH}sdk/lib/`;
const ENTRY = '/app/src/entry.js';
const ROUTE = '/app/src/routes/gate.js';

/**
 * A page that renders the banner, loads a route on demand, and opens the
 * dialog, the engine and the accept path's script loader with `import()`.
 * Each module lists its code (imports are read from it), the modules its
 * imports resolve to, and what it imports with `import()`.
 */
const graph: Record<
	string,
	{ code: string; imports?: string[]; dynamic?: string[] }
> = {
	[ENTRY]: {
		code: `import { useConsent } from '@inth/react'; import { has } from '@inth/sdk/engine'; import '@inth/react/components/prompt'; useConsent(has);`,
		dynamic: [ROUTE],
		imports: [
			`${INTH}react/dist/index.js`,
			`${SDK}core/dist/index.js`,
			`${INTH}react/dist/components/prompt.js`,
		],
	},
	// An app route: loads with the page it renders.
	[ROUTE]: {
		code: `import { storageKeys } from '@inth/sdk/engine';`,
		imports: [`${SDK}core/dist/index.js`],
	},
	[`${INTH}react/dist/index.js`]: {
		code: `export { useConsent } from './hooks.js'; export { importDialog, importEngine, importLoader } from './shell.js';`,
		imports: [`${INTH}react/dist/hooks.js`, `${INTH}react/dist/shell.js`],
	},
	[`${INTH}react/dist/hooks.js`]: {
		code: 'export const useConsent = () => 1;',
	},
	[`${INTH}react/dist/shell.js`]: {
		code: `export const importDialog = () => import('./deferred/dialog.js'); export const importEngine = () => import('./deferred/client-engine.js'); export const importLoader = () => import('@inth/sdk/modules/script-loader');`,
		dynamic: [
			`${INTH}react/dist/deferred/dialog.js`,
			`${INTH}react/dist/deferred/client-engine.js`,
			`${SDK}core/dist/modules/script-loader/index.js`,
		],
	},
	[`${INTH}react/dist/components/prompt.js`]: {
		code: `import '@inth/sdk/ui/styles/components/button.module.css';`,
		imports: [`${SDK}ui/dist/styles/components/button.module.css`],
	},
	// Re-exports only: a module counts when something asks for its names.
	[`${SDK}core/dist/index.js`]: {
		code: `export{has}from"./libs/has.js";export{evaluate}from"./libs/evaluate.js";export{policyActions}from"./libs/policy-actions.js";export{vendors}from"./libs/vendors.js";export{consentTypes}from"./libs/consent-types.js";export{storageKeys}from"./libs/storage-keys.js";`,
		imports: [
			`${SDK}core/dist/libs/has.js`,
			`${SDK}core/dist/libs/evaluate.js`,
			`${SDK}core/dist/libs/policy-actions.js`,
			`${SDK}core/dist/libs/vendors.js`,
			`${SDK}core/dist/libs/consent-types.js`,
			`${SDK}core/dist/libs/storage-keys.js`,
		],
	},
	[`${SDK}core/dist/libs/has.js`]: { code: 'export const has = 1;' },
	[`${SDK}core/dist/libs/evaluate.js`]: { code: 'export const evaluate = 1;' },
	[`${SDK}core/dist/libs/policy-actions.js`]: {
		code: 'export const policyActions = 1;',
	},
	[`${SDK}core/dist/libs/vendors.js`]: { code: 'export const vendors = 1;' },
	[`${SDK}core/dist/libs/consent-types.js`]: {
		code: 'export const consentTypes = 1;',
	},
	[`${SDK}core/dist/libs/storage-keys.js`]: {
		code: 'export const storageKeys = 1;',
	},
	[`${INTH}react/dist/deferred/dialog.js`]: {
		code: `export * as panel from '../components/panel/index.js';`,
		imports: [`${INTH}react/dist/components/panel/index.js`],
	},
	[`${INTH}react/dist/components/panel/index.js`]: {
		code: `import { has, policyActions, vendors, evaluate, consentTypes, storageKeys } from '@inth/sdk/engine'; import { dom } from '@inth/sdk/ui/utils/dom'; import '@inth/sdk/ui/styles/components/panel.module.css'; import '@inth/sdk/ui/styles/components/button.module.css'; export const Panel = () => import('../panel-trigger/index.js');`,
		dynamic: [`${INTH}react/dist/components/panel-trigger/index.js`],
		imports: [
			`${SDK}core/dist/index.js`,
			`${SDK}ui/dist/utils/dom.js`,
			`${SDK}ui/dist/styles/components/panel.module.css`,
			`${SDK}ui/dist/styles/components/button.module.css`,
		],
	},
	// A lazy part of the dialog: loads after it.
	[`${INTH}react/dist/components/panel-trigger/index.js`]: {
		code: `import { dom } from '@inth/sdk/ui/utils/dom'; import { drag } from './drag.js';`,
		imports: [
			`${SDK}ui/dist/utils/dom.js`,
			`${INTH}react/dist/components/panel-trigger/drag.js`,
		],
	},
	[`${INTH}react/dist/components/panel-trigger/drag.js`]: {
		code: 'export const drag = 1;',
	},
	[`${SDK}ui/dist/utils/dom.js`]: { code: 'export const dom = 1;' },
	[`${SDK}ui/dist/styles/components/panel.module.css`]: { code: '' },
	[`${SDK}ui/dist/styles/components/button.module.css`]: { code: '' },
	[`${INTH}react/dist/deferred/client-engine.js`]: {
		code: `import { evaluate, vendors } from '@inth/sdk/engine';`,
		imports: [`${SDK}core/dist/index.js`],
	},
	[`${SDK}core/dist/modules/script-loader/index.js`]: {
		code: `import { vendors, consentTypes } from '../../index.js';`,
		imports: [`${SDK}core/dist/index.js`],
	},
};

/** The Rolldown chunking context for a module graph with one entry. */
const contextOf = function contextOf(
	modules: typeof graph,
	entry: string
): Parameters<ReturnType<typeof createDialogChunkGroup>['name']>[1] {
	const importers = new Map<string, string[]>();
	const dynamicImporters = new Map<string, string[]>();
	for (const [id, { imports = [], dynamic = [] }] of Object.entries(modules)) {
		for (const target of imports) {
			importers.set(target, [...(importers.get(target) ?? []), id]);
		}
		for (const target of dynamic) {
			dynamicImporters.set(target, [
				...(dynamicImporters.get(target) ?? []),
				id,
			]);
		}
	}
	return {
		getModuleInfo: (id: string) => {
			const module = modules[id];
			return module
				? {
						code: module.code,
						dynamicImporters: dynamicImporters.get(id) ?? [],
						importedIds: module.imports ?? [],
						importers: importers.get(id) ?? [],
						isEntry: id === entry,
					}
				: null;
		},
	};
};
const context = contextOf(graph, ENTRY);

describe('createDialogChunkGroup', () => {
	const group = createDialogChunkGroup();
	const named = Object.fromEntries(
		Object.keys(graph)
			.map(
				(id) =>
					[
						id.replace(SDK, '').replace(INTH, ''),
						group.name(id, context),
					] as const
			)
			.filter(([, name]) => name !== null)
	);

	test('files the dialog code by the loaders that need it', () => {
		const { 'core/dist/libs/storage-keys.js': routeShared, ...rest } = named;
		// The route and the dialog both need it: a file of its own, which
		// the route loads in full.
		expect(routeShared).toMatch(/^inth-dialog-[0-9a-z]+$/u);
		// `policy-actions`: a barrel the page imports re-exports it, but
		// nothing the page loads asks for it. `dom`: the trigger loads after
		// the dialog, so it does not hold this back. `consent-types`: the
		// script loader an accept starts needs it too.
		expect(rest).toEqual({
			'core/dist/libs/consent-types.js': 'inth-dialog-tap',
			'core/dist/libs/evaluate.js': 'inth-dialog-engine',
			'core/dist/libs/policy-actions.js': 'inth-dialog',
			'core/dist/libs/vendors.js': 'inth-dialog-shared',
			'react/dist/components/panel/index.js': 'inth-dialog',
			'react/dist/deferred/dialog.js': 'inth-dialog',
			'ui/dist/styles/components/panel.module.css': 'inth-dialog-styles',
			'ui/dist/utils/dom.js': 'inth-dialog',
		});
	});

	test('leaves what every page loads, and what the dialog does not, where they are', () => {
		for (const id of [
			// The entry asks the barrel for it.
			'core/dist/libs/has.js',
			// The banner's sheet.
			'ui/dist/styles/components/button.module.css',
			// Only the trigger loads it.
			'react/dist/components/panel-trigger/drag.js',
		]) {
			expect(named[id]).toBeUndefined();
		}
	});

	test('does not pull in dependencies, which would move first-load code', () => {
		expect(group.includeDependenciesRecursively).toBe(false);
	});
});

/**
 * A Vue page whose root mounts the dialog's manager when it first opens.
 * The manager loads the dialog, which the banner also warms on intent.
 * The same graph from an installed package and from a workspace.
 */
const vueGraph = function vueGraph(packages: string): typeof graph {
	const vue = `${packages}vue/dist/runtime/`;
	const core = `${packages}sdk/lib/core/dist/`;
	return {
		[ENTRY]: {
			code: `import { LazyConsentManager, loadConsentBanner } from '@inth/vue';`,
			imports: [`${vue}components/lazy-surfaces.js`],
		},
		[`${vue}components/lazy-surfaces.js`]: {
			code: `export const LazyConsentManager = () => import('./dialog/manager.vue'); export const loadConsentBanner = () => import('./prompt/prompt.vue');`,
			dynamic: [
				`${vue}components/dialog/manager.vue`,
				`${vue}components/prompt/prompt.vue`,
			],
		},
		[`${vue}components/dialog/manager.vue`]: {
			code: `import { useKernel } from '../../composables/kernel.js'; import { loadConsentDialog } from './load-panel.js';`,
			imports: [
				`${vue}composables/kernel.js`,
				`${vue}components/dialog/load-panel.js`,
			],
		},
		[`${vue}components/dialog/load-panel.js`]: {
			code: `export const loadConsentDialog = () => import('./dialog.vue');`,
			dynamic: [`${vue}components/dialog/dialog.vue`],
		},
		[`${vue}components/dialog/dialog.vue`]: {
			code: `import { useKernel } from '../../composables/kernel.js'; import { evaluate, vendors } from '@inth/sdk/engine'; import '@inth/sdk/ui/styles/components/panel.module.css';`,
			imports: [
				`${vue}composables/kernel.js`,
				`${core}index.js`,
				`${packages}sdk/lib/ui/dist/styles/components/panel.module.css`,
			],
		},
		// The banner: loads with the engine.
		[`${vue}components/prompt/prompt.vue`]: {
			code: `import { loadConsentDialog } from '../dialog/load-panel.js'; import { vendors } from '@inth/sdk/engine';`,
			imports: [`${vue}components/dialog/load-panel.js`, `${core}index.js`],
		},
		[`${vue}composables/kernel.js`]: { code: 'export const useKernel = 1;' },
		[`${core}index.js`]: {
			code: `export{evaluate}from"./libs/evaluate.js";export{vendors}from"./libs/vendors.js";`,
			imports: [`${core}libs/evaluate.js`, `${core}libs/vendors.js`],
		},
		[`${core}libs/evaluate.js`]: { code: 'export const evaluate = 1;' },
		[`${core}libs/vendors.js`]: { code: 'export const vendors = 1;' },
		[`${packages}sdk/lib/ui/dist/styles/components/panel.module.css`]: {
			code: '',
		},
	};
};

describe.each([
	['an installed package', INTH],
	['a workspace', '/repo/packages/sdk/'],
])("createDialogChunkGroup with Vue's dialog from %s", (_label, packages) => {
	const modules = vueGraph(packages);
	const vueContext = contextOf(modules, ENTRY);
	const group = createDialogChunkGroup();
	const named = Object.fromEntries(
		Object.keys(modules)
			.map((id) => [id.replace(packages, ''), group.name(id, vueContext)])
			.filter(([, name]) => name !== null)
	);

	test("files the manager's and the dialog's code, and what the banner shares, as the dialog's", () => {
		expect(named).toEqual({
			'sdk/lib/core/dist/libs/evaluate.js': 'inth-dialog',
			// The banner counts as the engine's.
			'sdk/lib/core/dist/libs/vendors.js': 'inth-dialog-engine',
			'sdk/lib/ui/dist/styles/components/panel.module.css':
				'inth-dialog-styles',
			'vue/dist/runtime/components/dialog/dialog.vue': 'inth-dialog',
			'vue/dist/runtime/components/dialog/load-panel.js': 'inth-dialog-engine',
			'vue/dist/runtime/components/dialog/manager.vue': 'inth-dialog',
			'vue/dist/runtime/composables/kernel.js': 'inth-dialog',
		});
	});
});

describe('createDialogChunkPlugin', () => {
	const rolldown = { rolldownVersion: '1.1.5', watchMode: false };
	const client = { environment: { name: 'client' }, meta: rolldown };
	/** A plugin whose build has these entry signatures. */
	const withDialog = (signatures?: unknown) => {
		const plugin = createDialogChunkPlugin();
		plugin.options.call(client, { preserveEntrySignatures: signatures });
		return plugin;
	};

	test("adds the group after the app's own in a Rolldown browser build", () => {
		const own = { name: 'vendor', test: /node_modules/u };
		const output = withDialog(false).outputOptions.call(client, {
			codeSplitting: { groups: [own] },
		});
		expect(output?.codeSplitting.groups).toHaveLength(2);
		expect(output?.codeSplitting.groups[0]).toBe(own);
	});

	test('leaves strict entry signatures alone (SvelteKit), which the group cannot keep', () => {
		expect(withDialog('strict').outputOptions.call(client, {})).toBeUndefined();
	});

	test.each([
		['a server build', { name: 'ssr' }, rolldown, {}],
		['Rollup', { name: 'client' }, { watchMode: false }, {}],
		[
			'manualChunks',
			{ name: 'client' },
			rolldown,
			{ manualChunks: () => null },
		],
		['no splitting', { name: 'client' }, rolldown, { codeSplitting: false }],
	])('leaves %s alone', (_label, environment, meta, options) => {
		expect(
			withDialog(false).outputOptions.call({ environment, meta }, options)
		).toBeUndefined();
	});
});
