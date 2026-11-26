import { describe, expect, it } from 'vite-plus/test';

import { manifestFeatureLevel } from '../features';
import { manifestRoots } from '../globals';
import { MANIFEST_RUNTIME_LEVEL } from '../level';
import { parseResolvedManifest } from '../parse';
import type { ResolvedManifest } from '../types';

/**
 * A manifest of level 1 features only. It carries no `globals`, which is
 * level 2, so no manifest the SDK runs is level 1 any more; the table
 * still reads the other fields' levels.
 */
const levelOne = (): ResolvedManifest =>
	({
		afterLoadSteps: [],
		bootstrapSteps: [
			{ name: 'dataLayer', type: 'setGlobal', value: [] },
			{
				args: [{ at: { kind: 'inth.runtime-value', value: 'timestamp' } }],
				global: 'gtag',
				method: 'push',
				type: 'callGlobal',
			},
		],
		category: 'measurement',
		kind: 'inth.vendor-manifest',
		loadScript: {
			attributes: { 'data-layer': 'dataLayer' },
			src: 'https://cdn.example/vendor.js',
			type: 'loadScript',
		},
		onBeforeLoadDeniedSteps: [],
		onBeforeLoadGrantedSteps: [],
		onConsentChangeSteps: [],
		onConsentDeniedSteps: [],
		onConsentGrantedSteps: [],
		onLoadDeniedSteps: [],
		onLoadGrantedSteps: [],
		persistAfterConsentRevoked: undefined,
		schemaVersion: 1,
		setupSteps: [
			{
				methods: ['track'],
				queueFormat: 'nameAndArgs',
				target: 'vendor',
				type: 'defineQueueMethods',
			},
		],
		vendor: 'vendor',
	}) as Omit<ResolvedManifest, 'globals'> as ResolvedManifest;

const value = (name: string, fields = {}) => ({
	kind: 'inth.runtime-value' as const,
	value: name,
	...fields,
});
const withSetup = (step: unknown): ResolvedManifest => ({
	...levelOne(),
	setupSteps: [step as never],
});

describe('manifestFeatureLevel', () => {
	it('reads a level 1 manifest as level 1', () => {
		expect(manifestFeatureLevel(levelOne())).toBe(1);
	});

	it('reads a manifest carrying globals as level 2', () => {
		expect(manifestFeatureLevel({ ...levelOne(), globals: [] })).toBe(2);
	});

	it('ignores requires and fields set to undefined', () => {
		expect(
			manifestFeatureLevel({ ...levelOne(), requires: 2, target: undefined })
		).toBe(1);
	});

	it.each<[string, ResolvedManifest]>([
		['onDisposeSteps', { ...levelOne(), onDisposeSteps: [] }],
		['target', { ...levelOne(), target: 'body' }],
		[
			'observeConsentBeforeLoad',
			{ ...levelOne(), observeConsentBeforeLoad: false },
		],
		['persistAfterDispose', { ...levelOne(), persistAfterDispose: true }],
		['resourceKey', { ...levelOne(), resourceKey: 'main' }],
		[
			'a script id attribute',
			{
				...levelOne(),
				loadScript: {
					...(levelOne().loadScript as NonNullable<
						ResolvedManifest['loadScript']
					>),
					attributes: { id: 'main' },
				},
			},
		],
		['callGlobal.path', withSetup({ path: ['a', 'b'], type: 'callGlobal' })],
		[
			'loadScriptStep',
			withSetup({
				id: 'addon',
				src: 'https://cdn.example/addon.js',
				type: 'loadScriptStep',
			}),
		],
		['removeScript', withSetup({ id: 'addon', type: 'removeScript' })],
		[
			'the nameAndArguments queue format',
			withSetup({
				methods: ['track'],
				queueFormat: 'nameAndArguments',
				target: 'vendor',
				type: 'defineQueueMethods',
			}),
		],
		...['hasConsent', 'scriptElement', 'scriptNonce', 'consentGate'].map(
			(name): [string, ResolvedManifest] => [
				`the ${name} runtime value`,
				withSetup({
					name: 'x',
					type: 'setGlobal',
					value: { nested: [value(name)] },
				}),
			]
		),
		[
			'the consents runtime value',
			withSetup({
				args: [
					value('consents', {
						format: 'boolean',
						mapping: { measurement: ['analytics'] },
					}),
				],
				global: 'vendor',
				type: 'callGlobal',
			}),
		],
		[
			'a level 2 step in onDisposeSteps',
			{
				...levelOne(),
				onDisposeSteps: [{ id: 'addon', type: 'removeScript' }],
			},
		],
	])('reads %s as level 2, which this SDK parses', (_label, manifest) => {
		expect(manifestFeatureLevel(manifest)).toBe(2);
		expect(
			parseResolvedManifest({
				...manifest,
				globals: manifestRoots(manifest) as string[],
				requires: 2,
			})
		).toMatchObject({ ok: true });
	});

	it.each<[string, ResolvedManifest]>([
		['a manifest field', { ...levelOne(), adapter: {} } as never],
		['a step type', withSetup({ code: 'x', type: 'runInlineCode' })],
		[
			'a runtime value',
			withSetup({ name: 'x', type: 'setGlobal', value: value('callback') }),
		],
		[
			'a step field',
			withSetup({ constructor: 'x', global: 'a', type: 'callGlobal' }),
		],
	])('reads %s it does not list as above every level', (_label, manifest) => {
		expect(manifestFeatureLevel(manifest)).toBeGreaterThan(
			MANIFEST_RUNTIME_LEVEL
		);
	});
});
