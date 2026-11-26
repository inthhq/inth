/* oxlint-disable unicorn/no-thenable -- `if` and `callGlobal` steps have a `then` field. */
/**
 * The parser's rules for level 3 steps and conditions, with the level 3
 * part installed. `parse.test.ts` covers the parser without the part.
 */
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { levelThreePart } from '../level-three';
import { parseResolvedManifest } from '../parse';
import { installLevelThree } from '../part';

beforeAll(() => {
	installLevelThree(levelThreePart);
});

const manifest = (fields: Record<string, unknown> = {}) => ({
	afterLoadSteps: [],
	bootstrapSteps: [],
	category: 'measurement',
	kind: 'inth.vendor-manifest',
	onBeforeLoadDeniedSteps: [],
	onBeforeLoadGrantedSteps: [],
	onConsentChangeSteps: [],
	onConsentDeniedSteps: [],
	onConsentGrantedSteps: [],
	onLoadDeniedSteps: [],
	onLoadGrantedSteps: [],
	requires: 3,
	schemaVersion: 1,
	setupSteps: [],
	vendor: 'vendor',
	...fields,
});

const withSetup = (...steps: unknown[]) => manifest({ setupSteps: steps });

const ifStep = (when: unknown, then: unknown[] = [], fields = {}) => ({
	then,
	type: 'if',
	when,
	...fields,
});

const call = { global: 'vendor', type: 'callGlobal' };

const listen = (fields: Record<string, unknown> = {}) => ({
	event: 'vendor:ready',
	steps: [],
	target: 'window',
	type: 'listen',
	...fields,
});

/** `step` inside `depth` levels of `if` steps. */
const nested = (depth: number, step: unknown): unknown =>
	depth === 0 ? step : ifStep({ loaded: true }, [nested(depth - 1, step)]);

describe('level 3', () => {
	it('accepts every level 3 step', () => {
		const input = withSetup(
			ifStep(
				{
					all: [
						{ consent: { or: ['measurement', 'marketing'] } },
						{ not: { lost: ['marketing', 'experience'] } },
						{ global: ['vendor', 'api', '$start'], is: 'function' },
					],
				},
				[{ name: 'started_1', type: 'setFlag', value: true }],
				{ else: [call] }
			),
			listen({ event: 'gorgias-widget-loaded', once: true }),
			listen({ event: 'vendor.ready:v2', target: 'document' }),
			{ ...call, then: [ifStep({ documentReady: true }, [call])] }
		);

		expect(parseResolvedManifest(JSON.parse(JSON.stringify(input)))).toEqual({
			manifest: input,
			ok: true,
		});
	});

	it('accepts steps nested 4 deep, and 200 steps nested ones included', () => {
		expect(parseResolvedManifest(withSetup(nested(4, call))).ok).toBe(true);
		expect(
			parseResolvedManifest(
				withSetup(
					ifStep(
						{ loaded: true },
						Array.from({ length: 198 }, () => call)
					),
					call
				)
			).ok
		).toBe(true);
	});

	it.each<[string, unknown]>([
		['steps nested 5 deep', withSetup(nested(5, call))],
		[
			'201 steps, nested ones included',
			withSetup(
				ifStep(
					{ loaded: true },
					Array.from({ length: 199 }, () => call)
				),
				call
			),
		],
		['an if step without a condition', withSetup({ then: [], type: 'if' })],
		[
			'an if step without then',
			withSetup({ type: 'if', when: { loaded: true } }),
		],
		[
			'an if step whose then is not a list',
			withSetup(ifStep({ loaded: true }, {} as never)),
		],
		[
			'an if step whose else is not a list',
			withSetup(ifStep({ loaded: true }, [], { else: call })),
		],
		[
			'an if step with another field',
			withSetup(ifStep({ loaded: true }, [], { otherwise: [] })),
		],
		[
			'a condition this SDK does not know',
			withSetup(ifStep({ visible: true })),
		],
		[
			'a condition with two keys',
			withSetup(ifStep({ flag: 'a', loaded: true })),
		],
		['an empty condition', withSetup(ifStep({}))],
		[
			'a consent condition over an unknown category',
			withSetup(ifStep({ consent: 'ads' })),
		],
		[
			'a lost condition with an unknown category',
			withSetup(ifStep({ lost: ['ads'] })),
		],
		['an empty lost condition', withSetup(ifStep({ lost: [] }))],
		['a loaded condition of false', withSetup(ifStep({ loaded: false }))],
		['a documentReady condition of 1', withSetup(ifStep({ documentReady: 1 }))],
		['an empty all', withSetup(ifStep({ all: [] }))],
		[
			'an all with a bad condition',
			withSetup(ifStep({ all: [{ loaded: true }, { up: 1 }] })),
		],
		['a not with a bad condition', withSetup(ifStep({ not: 'loaded' }))],
		[
			'conditions nested past the limit',
			withSetup(
				ifStep({ not: { not: { not: { not: { not: { loaded: true } } } } } })
			),
		],
		['a global test without is', withSetup(ifStep({ global: ['vendor'] }))],
		[
			'a global test with an unknown is',
			withSetup(ifStep({ global: ['vendor'], is: 'object' })),
		],
		[
			'a global test with an empty path',
			withSetup(ifStep({ global: [], is: 'defined' })),
		],
		[
			'a global path segment that is not a name',
			withSetup(ifStep({ global: ['vendor', 'a-b'], is: 'defined' })),
		],
		[
			'a global path segment that starts with a digit',
			withSetup(ifStep({ global: ['1st'], is: 'defined' })),
		],
		[
			'a global path through a prototype',
			withSetup(ifStep({ global: ['vendor', '__proto__'], is: 'defined' })),
		],
		['a flag condition that is not a name', withSetup(ifStep({ flag: 'a b' }))],
		[
			'a setFlag step without a value',
			withSetup({ name: 'a', type: 'setFlag' }),
		],
		[
			'a setFlag step with a string value',
			withSetup({ name: 'a', type: 'setFlag', value: 'yes' }),
		],
		[
			'a setFlag step whose name is not a name',
			withSetup({ name: 'a.b', type: 'setFlag', value: true }),
		],
		['a listen step on the body', withSetup(listen({ target: 'body' }))],
		['a listen step without an event', withSetup(listen({ event: undefined }))],
		['an event name with a capital', withSetup(listen({ event: 'Ready' }))],
		[
			'an event name with a space',
			withSetup(listen({ event: 'vendor ready' })),
		],
		['a listen step with a string once', withSetup(listen({ once: 'yes' }))],
		[
			'a listen step whose steps are not a list',
			withSetup(listen({ steps: call })),
		],
		['a then that is not a list', withSetup({ ...call, then: call })],
		[
			'a nested step of an unknown type',
			withSetup(ifStep({ loaded: true }, [{ type: 'runInlineCode' }])),
		],
		[
			'a nested loadScript step',
			withSetup(
				ifStep({ loaded: true }, [
					{ src: 'https://cdn.example/a.js', type: 'loadScript' },
				])
			),
		],
		[
			'a nested step with an unknown field',
			withSetup(listen({ steps: [{ ...call, extra: 1 }] })),
		],
		[
			'a nested call to eval',
			withSetup({ ...call, then: [{ global: 'eval', type: 'callGlobal' }] }),
		],
		[
			'a nested assignment to location',
			withSetup(
				ifStep({ loaded: true }, [
					{ name: 'location', type: 'setGlobal', value: '/' },
				])
			),
		],
		[
			'a listen step in onDisposeSteps',
			manifest({ onDisposeSteps: [listen()] }),
		],
		[
			'a then in onDisposeSteps',
			manifest({ onDisposeSteps: [{ ...call, then: [] }] }),
		],
		[
			'a second script nested in onDisposeSteps',
			manifest({
				onDisposeSteps: [
					ifStep({ loaded: true }, [
						{
							id: 'addon',
							src: 'https://cdn.example/a.js',
							type: 'loadScriptStep',
						},
					]),
				],
			}),
		],
	])('refuses %s', (_label, input) => {
		expect(parseResolvedManifest(input).ok).toBe(false);
	});

	it('accepts an if step in onDisposeSteps', () => {
		expect(
			parseResolvedManifest(
				manifest({ onDisposeSteps: [ifStep({ flag: 'started' }, [call])] })
			).ok
		).toBe(true);
	});

	it('says how deep steps may nest', () => {
		expect(parseResolvedManifest(withSetup(nested(5, call)))).toEqual({
			ok: false,
			reason: 'setupSteps nests steps more than 4 deep',
		});
	});
});
