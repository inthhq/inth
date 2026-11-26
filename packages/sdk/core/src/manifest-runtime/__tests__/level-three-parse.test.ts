/* oxlint-disable unicorn/no-thenable -- `if` and `callGlobal` steps have a `then` field. */
/**
 * The parser's rules for level 3 steps and conditions, with the level 3
 * part installed. `parse.test.ts` covers the parser without the part.
 */
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { manifestRoots } from '../globals';
import { levelThreePart } from '../level-three';
import { parseResolvedManifest } from '../parse';
import { installLevelThree } from '../part';

beforeAll(() => {
	installLevelThree(levelThreePart);
});

/** A manifest whose `globals` holds every root its steps use, as `compileManifest` builds it. */
const manifest = (fields: Record<string, unknown> = {}) => {
	const input = {
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
	};
	return { globals: manifestRoots(input as never), ...input };
};

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
			{ ...call, then: [ifStep({ documentReady: true }, [call])] },
			{ steps: [ifStep({ loaded: true }, [call])], type: 'defer' }
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
			'a defer step whose steps are not a list',
			withSetup({ steps: call, type: 'defer' }),
		],
		['a defer step without steps', withSetup({ type: 'defer' })],
		[
			'a defer step with another field',
			withSetup({ delay: 10, steps: [], type: 'defer' }),
		],
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
			'a defer step in onDisposeSteps',
			manifest({ onDisposeSteps: [{ steps: [call], type: 'defer' }] }),
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

	it('refuses a nested call or write the level 1 checks refuse, at any depth', () => {
		const write = {
			path: ['document', 'body', 'innerHTML'],
			type: 'setGlobalPath',
			value: '<i>',
		};
		const navigate = {
			global: 'location',
			method: 'assign',
			type: 'callGlobal',
		};
		const inputs = [
			ifStep({ loaded: true }, [write]),
			ifStep({ loaded: true }, [call], { else: [navigate] }),
			listen({ steps: [write] }),
			{ ...call, then: [navigate] },
			ifStep({ loaded: true }, [
				listen({ steps: [{ ...call, then: [write] }] }),
			]),
			{ ...navigate, then: [call] },
			{ steps: [write], type: 'defer' },
			{ steps: [navigate], type: 'defer' },
		];

		expect(
			inputs.map((step) => parseResolvedManifest(withSetup(step)))
		).toEqual(
			inputs.map(() => ({
				ok: false,
				reason: expect.stringMatching(/ (?:calls|writes) /u),
			}))
		);
	});

	it('accepts an if step in onDisposeSteps', () => {
		expect(
			parseResolvedManifest(
				manifest({ onDisposeSteps: [ifStep({ flag: 'started' }, [call])] })
			).ok
		).toBe(true);
	});

	it.each([undefined, 1, 2])(
		'refuses level 3 steps in a manifest that requires %s, as a runtime without the part does',
		(requires) => {
			expect(
				parseResolvedManifest({
					...withSetup(ifStep({ flag: 'started' }, [call])),
					requires,
				})
			).toEqual({
				ok: false,
				reason: `setupSteps has a if step that needs manifest runtime level 3, and the manifest requires level ${String(requires ?? 1)}`,
			});
		}
	);

	it.each(['src', 'onload', 'href'])(
		'accepts %s as a flag name, which never touches the page',
		(name) => {
			expect(
				parseResolvedManifest(
					withSetup(
						{ name, type: 'setFlag', value: true },
						ifStep({ flag: name }, [call])
					)
				).ok
			).toBe(true);
		}
	);

	it('says how deep steps may nest', () => {
		expect(parseResolvedManifest(withSetup(nested(5, call)))).toEqual({
			ok: false,
			reason: 'setupSteps nests steps more than 4 deep',
		});
	});

	describe('globals', () => {
		it('lists the roots of conditions and nested steps', () => {
			expect(
				manifest({
					setupSteps: [
						ifStep(
							{
								all: [
									{ global: ['condition', 'ready'], is: 'defined' },
									{ not: { global: ['negated'], is: 'function' } },
								],
							},
							[{ ...call, global: 'inIf' }],
							{ else: [{ name: 'inElse', type: 'setGlobal', value: 1 }] }
						),
						listen({
							steps: [{ queue: 'inListen', type: 'pushToQueue', value: 1 }],
						}),
						{
							...call,
							then: [
								{ path: ['inThen', 'x'], type: 'setGlobalPath', value: 1 },
							],
						},
						{
							steps: [{ ...call, global: 'inDefer' }],
							type: 'defer',
						},
					],
				}).globals
			).toEqual([
				'condition',
				'negated',
				'inIf',
				'inElse',
				'inListen',
				'vendor',
				'inThen',
				'inDefer',
			]);
		});

		it.each<[string, unknown]>([
			['a condition', ifStep({ global: ['hidden', 'x'], is: 'defined' })],
			[
				'a condition inside not',
				ifStep({ not: { global: ['hidden'], is: 'array' } }),
			],
			[
				'a step in then',
				ifStep({ loaded: true }, [{ ...call, global: 'hidden' }]),
			],
			[
				'a step in else',
				ifStep({ loaded: true }, [], { else: [{ ...call, global: 'hidden' }] }),
			],
			[
				'a step a listener runs',
				listen({ steps: [{ ...call, global: 'hidden' }] }),
			],
			[
				'a step after a call settles',
				{ ...call, then: [{ ...call, global: 'hidden' }] },
			],
			[
				'a deferred step',
				{ steps: [{ ...call, global: 'hidden' }], type: 'defer' },
			],
			['a step nested 3 deep', nested(3, { ...call, global: 'hidden' })],
		])(
			'refuses %s that uses a global globals does not declare',
			(_label, step) => {
				const input = withSetup(step);

				expect(
					parseResolvedManifest({
						...input,
						globals: input.globals.filter((name) => name !== 'hidden'),
					})
				).toEqual({
					ok: false,
					reason: expect.stringContaining('uses the global hidden'),
				});
			}
		);

		it('refuses declaring the id of a tag a nested step inserts', () => {
			const input = withSetup(
				ifStep({ loaded: true }, [
					{
						id: 'inthTag',
						src: 'https://cdn.example/a.js',
						type: 'loadScriptStep',
					},
				])
			);

			expect(parseResolvedManifest({ ...input, globals: ['inthTag'] })).toEqual(
				{
					ok: false,
					reason: expect.stringContaining('the id of a tag'),
				}
			);
		});
	});
});
