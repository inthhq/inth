/* oxlint-disable unicorn/no-thenable -- `if` and `callGlobal` steps have a `then` field. */
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { CONDITION_LEVELS, manifestFeatureLevel } from '../features';
import { manifestRoots } from '../globals';
import { MANIFEST_RUNTIME_LEVEL } from '../level';
import { levelThreePart } from '../level-three';
import { parseResolvedManifest } from '../parse';
import { installLevelThree } from '../part';
import type { ResolvedManifest } from '../types';

beforeAll(() => {
	installLevelThree(levelThreePart);
});

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

	const ifStep = (when: unknown, then: unknown[] = []) => ({
		then,
		type: 'if',
		when,
	});

	it.each<[string, ResolvedManifest]>([
		['an if step', withSetup(ifStep({ documentReady: true }))],
		[
			'a setFlag step',
			withSetup({ name: 'started', type: 'setFlag', value: true }),
		],
		[
			'a listen step',
			withSetup({
				event: 'vendor:ready',
				steps: [],
				target: 'window',
				type: 'listen',
			}),
		],
		[
			'callGlobal.then',
			withSetup({ global: 'vendor', then: [], type: 'callGlobal' }),
		],
		['a defer step', withSetup({ steps: [], type: 'defer' })],
		[
			'a level 3 step nested in a level 1 list',
			{
				...levelOne(),
				onLoadGrantedSteps: [
					ifStep({ flag: 'a' }, [
						{ id: 'addon', type: 'removeScript' },
					]) as never,
				],
			},
		],
		...[
			{ all: [{ consent: 'measurement' }] },
			{ consent: 'measurement' },
			{ documentReady: true },
			{ flag: 'started' },
			{ global: ['vendor', 'start'], is: 'function' },
			{ loaded: true },
			{ lost: ['marketing'] },
			{ not: { loaded: true } },
		].map((condition): [string, ResolvedManifest] => [
			`the condition ${JSON.stringify(condition)}`,
			withSetup(ifStep(condition)),
		]),
	])('reads %s as level 3, which this SDK parses', (_label, manifest) => {
		expect(manifestFeatureLevel(manifest)).toBe(3);
	});

	it('parses a condition with each key the table lists', () => {
		const conditions = [
			{ all: [{ consent: 'measurement' }] },
			{ consent: 'measurement' },
			{ documentReady: true },
			{ flag: 'started' },
			{ global: ['vendor', 'start'], is: 'function' },
			{ loaded: true },
			{ lost: ['marketing'] },
			{ not: { loaded: true } },
		];
		expect(
			[
				...new Set(conditions.flatMap((condition) => Object.keys(condition))),
			].toSorted()
		).toEqual(Object.keys(CONDITION_LEVELS).toSorted());
		for (const condition of conditions) {
			expect(
				parseResolvedManifest({
					...withSetup(ifStep(condition)),
					globals: manifestRoots(withSetup(ifStep(condition))) as string[],
					requires: 3,
				}),
				JSON.stringify(condition)
			).toMatchObject({ ok: true });
		}
	});

	it.each<[string, ResolvedManifest]>([
		['a manifest field', { ...levelOne(), adapter: {} } as never],
		[
			'a step type nested in an if step',
			withSetup(ifStep({ loaded: true }, [{ type: 'runInlineCode' }])),
		],
		['a condition', withSetup(ifStep({ visible: true }))],
		[
			'a condition nested in not',
			withSetup(ifStep({ not: { visible: true } })),
		],
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
