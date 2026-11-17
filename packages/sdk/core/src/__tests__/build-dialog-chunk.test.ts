import { describe, expect, test } from 'vitest';

import {
	createDialogChunkGroup,
	createDialogChunkPlugin,
} from '../build-dialog-chunk';

const C15T = '/app/node_modules/@inth/';
/** Where `@inth/sdk` installs its parts. */
const SDK = `${C15T}sdk/lib/`;
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
			`${C15T}react/dist/index.js`,
			`${SDK}core/dist/index.js`,
			`${C15T}react/dist/components/prompt.js`,
		],
	},
	// An app route: loads with the page it renders.
	[ROUTE]: {
		code: `import { storageKeys } from '@inth/sdk/engine';`,
		imports: [`${SDK}core/dist/index.js`],
	},
	[`${C15T}react/dist/index.js`]: {
		code: `export { useConsent } from './hooks.js'; export { importDialog, importEngine, importLoader } from './shell.js';`,
		imports: [`${C15T}react/dist/hooks.js`, `${C15T}react/dist/shell.js`],
	},
	[`${C15T}react/dist/hooks.js`]: {
		code: 'export const useConsent = () => 1;',
	},
	[`${C15T}react/dist/shell.js`]: {
		code: `export const importDialog = () => import('./deferred/dialog.js'); export const importEngine = () => import('./deferred/client-engine.js'); export const importLoader = () => import('@inth/sdk/modules/script-loader');`,
		dynamic: [
			`${C15T}react/dist/deferred/dialog.js`,
			`${C15T}react/dist/deferred/client-engine.js`,
			`${SDK}core/dist/modules/script-loader/index.js`,
		],
	},
	[`${C15T}react/dist/components/prompt.js`]: {
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
	[`${C15T}react/dist/deferred/dialog.js`]: {
		code: `export * as panel from '../components/panel/index.js';`,
		imports: [`${C15T}react/dist/components/panel/index.js`],
	},
	[`${C15T}react/dist/components/panel/index.js`]: {
		code: `import { has, policyActions, vendors, evaluate, consentTypes, storageKeys } from '@inth/sdk/engine'; import { dom } from '@inth/sdk/ui/utils/dom'; import '@inth/sdk/ui/styles/components/panel.module.css'; import '@inth/sdk/ui/styles/components/button.module.css'; export const Panel = () => import('../panel-trigger/index.js');`,
		dynamic: [`${C15T}react/dist/components/panel-trigger/index.js`],
		imports: [
			`${SDK}core/dist/index.js`,
			`${SDK}ui/dist/utils/dom.js`,
			`${SDK}ui/dist/styles/components/panel.module.css`,
			`${SDK}ui/dist/styles/components/button.module.css`,
		],
	},
	// A lazy part of the dialog: loads after it.
	[`${C15T}react/dist/components/panel-trigger/index.js`]: {
		code: `import { dom } from '@inth/sdk/ui/utils/dom'; import { drag } from './drag.js';`,
		imports: [
			`${SDK}ui/dist/utils/dom.js`,
			`${C15T}react/dist/components/panel-trigger/drag.js`,
		],
	},
	[`${C15T}react/dist/components/panel-trigger/drag.js`]: {
		code: 'export const drag = 1;',
	},
	[`${SDK}ui/dist/utils/dom.js`]: { code: 'export const dom = 1;' },
	[`${SDK}ui/dist/styles/components/panel.module.css`]: { code: '' },
	[`${SDK}ui/dist/styles/components/button.module.css`]: { code: '' },
	[`${C15T}react/dist/deferred/client-engine.js`]: {
		code: `import { evaluate, vendors } from '@inth/sdk/engine';`,
		imports: [`${SDK}core/dist/index.js`],
	},
	[`${SDK}core/dist/modules/script-loader/index.js`]: {
		code: `import { vendors, consentTypes } from '../../index.js';`,
		imports: [`${SDK}core/dist/index.js`],
	},
};

const importers = new Map<string, string[]>();
const dynamicImporters = new Map<string, string[]>();
for (const [id, { imports = [], dynamic = [] }] of Object.entries(graph)) {
	for (const target of imports) {
		importers.set(target, [...(importers.get(target) ?? []), id]);
	}
	for (const target of dynamic) {
		dynamicImporters.set(target, [...(dynamicImporters.get(target) ?? []), id]);
	}
}
const context = {
	getModuleInfo: (id: string) => {
		const module = graph[id];
		return module
			? {
					code: module.code,
					dynamicImporters: dynamicImporters.get(id) ?? [],
					importedIds: module.imports ?? [],
					importers: importers.get(id) ?? [],
					isEntry: id === ENTRY,
				}
			: null;
	},
};

describe('createDialogChunkGroup', () => {
	const group = createDialogChunkGroup();
	const named = Object.fromEntries(
		Object.keys(graph)
			.map(
				(id) =>
					[
						id.replace(SDK, '').replace(C15T, ''),
						group.name(id, context),
					] as const
			)
			.filter(([, name]) => name !== null)
	);

	test('files the dialog code by the loaders that need it', () => {
		const { 'core/dist/libs/storage-keys.js': routeShared, ...rest } = named;
		// The route and the dialog both need it: a file of its own, which
		// the route loads in full.
		expect(routeShared).toMatch(/^c15t-dialog-[0-9a-z]+$/u);
		// `policy-actions`: a barrel the page imports re-exports it, but
		// nothing the page loads asks for it. `dom`: the trigger loads after
		// the dialog, so it does not hold this back. `consent-types`: the
		// script loader an accept starts needs it too.
		expect(rest).toEqual({
			'core/dist/libs/consent-types.js': 'c15t-dialog-tap',
			'core/dist/libs/evaluate.js': 'c15t-dialog-engine',
			'core/dist/libs/policy-actions.js': 'c15t-dialog',
			'core/dist/libs/vendors.js': 'c15t-dialog-shared',
			'react/dist/components/panel/index.js': 'c15t-dialog',
			'react/dist/deferred/dialog.js': 'c15t-dialog',
			'ui/dist/styles/components/panel.module.css': 'c15t-dialog-styles',
			'ui/dist/utils/dom.js': 'c15t-dialog',
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
