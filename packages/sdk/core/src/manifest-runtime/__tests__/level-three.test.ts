/** @vitest-environment jsdom */
/* oxlint-disable unicorn/no-thenable -- `if` and `callGlobal` steps have a `then` field. */
/**
 * Level 3 manifest features, each run from JSON through the parser and the
 * script loader against a real consent kernel, with the level 3 part
 * installed as the runtime loaders install it.
 */
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import { choiceRecords, NOW } from '../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../kernel';
import { subscribeToScriptDebugEvents } from '../../libs/script-loader/debug';
import { createScriptLoader } from '../../modules/script-loader';
import type { Script } from '../../modules/script-loader';
import type { HydrationRecords } from '../../types';
import { levelThreePart } from '../level-three';
import { parseResolvedManifest } from '../parse';
import { installLevelThree } from '../part';
import { resolvedManifestToScript } from '../runtime';
import type { ResolvedManifest } from '../types';

const granted = { marketing: true, measurement: true };
const win = window as unknown as Record<string, unknown>;
const disposers: (() => void)[] = [];
let record: ReturnType<typeof vi.fn>;

beforeAll(() => {
	installLevelThree(levelThreePart);
});

beforeEach(() => {
	record = vi.fn();
	win.__record = record;
});

afterEach(() => {
	for (const dispose of disposers.splice(0).reverse()) {
		dispose();
	}
	document.head.replaceChildren();
	document.body.replaceChildren();
	for (const name of ['__record', '__api', '__list']) {
		Reflect.deleteProperty(win, name);
	}
});

const hasConsent = { kind: 'inth.runtime-value', value: 'hasConsent' };

/** A step that passes `args` to `window.__record`. */
const recordStep = (...args: unknown[]) => ({
	args,
	global: '__record',
	type: 'callGlobal',
});

const ifStep = (
	when: unknown,
	then: unknown[],
	otherwise?: unknown[]
): Record<string, unknown> => ({
	else: otherwise,
	then,
	type: 'if',
	when,
});

/** A manifest built from JSON and checked by the parser. */
const fromJSON = (fields: Record<string, unknown>): ResolvedManifest => {
	const parsed = parseResolvedManifest(
		JSON.parse(
			JSON.stringify({
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
				vendor: 'level-three',
				...fields,
			})
		)
	);
	if (!parsed.ok) {
		throw new Error(parsed.reason);
	}
	return parsed.manifest;
};

const build = (fields: Record<string, unknown>): Script =>
	resolvedManifestToScript(fromJSON(fields));

const mount = (
	scripts: Script[],
	records: HydrationRecords = choiceRecords(granted)
) => {
	const kernel = createConsentKernel({ initialRecords: records, now: NOW });
	const loader = createScriptLoader({ kernel, scripts });
	disposers.push(kernel.dispose, loader.dispose);
	return { kernel, loader };
};

const loadScript = {
	src: 'https://cdn.example/vendor.js',
	type: 'loadScript',
};

const element = () =>
	document.querySelector<HTMLScriptElement>(
		'script[src="https://cdn.example/vendor.js"]'
	);

/** A promise and the functions that settle it. */
const deferred = () => Promise.withResolvers<undefined>();

/** Waits for the reactions settled promises queued. */
const settle = () =>
	// oxlint-disable-next-line promise/avoid-new -- A timer has no promise form here.
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

describe('if', () => {
	test.each<[string, unknown, HydrationRecords | undefined, boolean]>([
		['a granted category', { consent: 'marketing' }, undefined, true],
		[
			'a denied category',
			{ consent: 'marketing' },
			choiceRecords({ measurement: true }),
			false,
		],
		[
			'a category of a vendor the visitor turned off',
			{ consent: 'measurement' },
			{
				...choiceRecords(granted),
				vendorChoice: {
					confirmedAt: NOW - 1,
					denied: ['level-three'],
					version: 1 as const,
				},
			},
			false,
		],
		[
			'a condition over categories',
			{ consent: { and: ['measurement', { not: 'marketing' }] } },
			undefined,
			false,
		],
		['an unset flag', { flag: 'started' }, undefined, false],
		['a ready document', { documentReady: true }, undefined, true],
		['not', { not: { consent: 'marketing' } }, undefined, false],
		[
			'all of two that hold',
			{ all: [{ consent: 'marketing' }, { documentReady: true }] },
			undefined,
			true,
		],
		[
			'all with one that fails',
			{ all: [{ consent: 'marketing' }, { flag: 'started' }] },
			undefined,
			false,
		],
	])('tests %s', (_label, when, records, holds) => {
		mount(
			[
				build({
					alwaysLoad: true,
					setupSteps: [
						ifStep(when, [recordStep('then')], [recordStep('else')]),
					],
				}),
			],
			records ?? choiceRecords(granted)
		);

		expect(record).toHaveBeenCalledExactlyOnceWith(holds ? 'then' : 'else');
	});

	test('runs nothing for a failed condition with no else', () => {
		mount([
			build({
				alwaysLoad: true,
				setupSteps: [ifStep({ flag: 'started' }, [recordStep('then')])],
			}),
		]);

		expect(record).not.toHaveBeenCalled();
	});

	test('reads the document as loading', () => {
		const readyState = vi
			.spyOn(document, 'readyState', 'get')
			.mockReturnValue('loading');
		try {
			mount([
				build({
					alwaysLoad: true,
					setupSteps: [
						ifStep(
							{ documentReady: true },
							[recordStep('ready')],
							[recordStep('loading')]
						),
					],
				}),
			]);
		} finally {
			readyState.mockRestore();
		}

		expect(record).toHaveBeenCalledExactlyOnceWith('loading');
	});

	test.each([
		['function', { __api: { start() {} } }, ['__api', 'start'], true],
		['function', { __api: {} }, ['__api', 'start'], false],
		['array', { __list: [] }, ['__list'], true],
		['array', { __list: {} }, ['__list'], false],
		['defined', { __api: { ready: false } }, ['__api', 'ready'], true],
		['defined', {}, ['__api', 'ready'], false],
	])('tests a global is %s', (is, globals, path, holds) => {
		Object.assign(win, globals);
		mount([
			build({
				alwaysLoad: true,
				setupSteps: [
					ifStep(
						{ global: path, is },
						[recordStep('then')],
						[recordStep('else')]
					),
				],
			}),
		]);

		expect(record).toHaveBeenCalledExactlyOnceWith(holds ? 'then' : 'else');
	});

	test('nests steps of every kind, runtime values included', () => {
		mount([
			build({
				alwaysLoad: true,
				setupSteps: [
					ifStep({ consent: 'measurement' }, [
						ifStep({ not: { flag: 'once' } }, [
							{ name: 'once', type: 'setFlag', value: true },
							recordStep('inner', hasConsent),
						]),
					]),
					ifStep({ flag: 'once' }, [recordStep('flag set')]),
				],
			}),
		]);

		expect(record.mock.calls).toEqual([['inner', true], ['flag set']]);
	});
});

test('skips a nested call or write the parser would refuse', async () => {
	win.__api = { init: () => Promise.resolve() };
	const write = {
		path: ['document', 'body', 'innerHTML'],
		type: 'setGlobalPath',
		value: '<i id="injected"></i>',
	};
	// Built without the parser, as a manifest that slipped past it would be.
	mount([
		resolvedManifestToScript({
			...fromJSON({ alwaysLoad: true }),
			setupSteps: [
				ifStep({ flag: 'x' }, [], [write]),
				ifStep({ not: { flag: 'x' } }, [
					write,
					{ name: ['__api'], type: 'setGlobal', value: 'x' },
					recordStep('if'),
				]),
				{
					event: 'vendor:ready',
					steps: [write, recordStep('listen')],
					target: 'window',
					type: 'listen',
				},
				{
					global: '__api',
					method: 'init',
					then: [write, recordStep('then')],
					type: 'callGlobal',
				},
			] as never,
		}),
	]);
	window.dispatchEvent(new Event('vendor:ready'));
	await settle();

	expect(document.getElementById('injected')).toBeNull();
	expect(typeof (win.__api as { init?: unknown }).init).toBe('function');
	expect(record.mock.calls).toEqual([['if'], ['listen'], ['then']]);
});

test('removes a tag a nested step inserted when the script is disposed', () => {
	const { loader } = mount([
		build({
			alwaysLoad: true,
			setupSteps: [
				ifStep({ documentReady: true }, [
					{
						id: 'vendor-addon',
						src: 'https://cdn.example/addon.js',
						type: 'loadScriptStep',
					},
				]),
			],
		}),
	]);
	expect(document.getElementById('vendor-addon')).not.toBeNull();

	loader.updateScripts([]);

	expect(document.getElementById('vendor-addon')).toBeNull();
});

describe('lost', () => {
	test("holds for a category the script's previous callback had and this one has not", () => {
		const { kernel } = mount([
			build({
				alwaysLoad: true,
				onConsentChangeSteps: [
					ifStep(
						{ lost: ['marketing'] },
						[recordStep('lost marketing')],
						[recordStep('kept')]
					),
				],
			}),
		]);

		void kernel.commands.save({ marketing: false, measurement: true });
		void kernel.commands.save({
			experience: true,
			marketing: false,
			measurement: true,
		});
		void kernel.commands.save(granted);

		expect(record.mock.calls).toEqual([['lost marketing'], ['kept'], ['kept']]);
	});

	test('holds for every category once the visitor turns the vendor off', () => {
		const { kernel } = mount([
			build({
				alwaysLoad: true,
				observeConsentBeforeLoad: true,
				onConsentChangeSteps: [
					ifStep({ lost: ['measurement'] }, [recordStep('lost')]),
				],
			}),
		]);

		void kernel.commands.save({}, { vendors: { 'level-three': false } });

		expect(record).toHaveBeenCalledWith('lost');
	});
});

describe('setFlag', () => {
	test('keeps a flag for the script, and clears it on dispose', () => {
		const script = build({
			alwaysLoad: true,
			onDisposeSteps: [ifStep({ flag: 'started' }, [recordStep('disposing')])],
			setupSteps: [
				ifStep(
					{ flag: 'started' },
					[recordStep('still set')],
					[recordStep('unset')]
				),
				{ name: 'started', type: 'setFlag', value: true },
			],
		});
		const { loader } = mount([script]);

		loader.updateScripts([]);
		loader.updateScripts([script]);

		expect(record.mock.calls).toEqual([['unset'], ['disposing'], ['unset']]);
	});

	test.each([
		[
			'deferred dispose steps, which still read it',
			{
				onDisposeSteps: [
					ifStep({ flag: 'started' }, [recordStep('disposing')]),
				],
			},
			[['unset'], ['disposing'], ['unset']],
		],
		[
			'no dispose steps',
			{
				setupSteps: [
					{
						id: 'vendor-addon',
						src: 'https://cdn.example/addon.js',
						type: 'loadScriptStep',
					},
				],
			},
			[['unset'], ['unset']],
		],
	])(
		'clears a flag when a replacement disposes the script, with %s',
		(_label, fields, calls) => {
			const flagged = (extra: Record<string, unknown>) =>
				build({
					alwaysLoad: true,
					...extra,
					setupSteps: [
						ifStep(
							{ flag: 'started' },
							[recordStep('still set')],
							[recordStep('unset')]
						),
						{ name: 'started', type: 'setFlag', value: true },
						...((extra.setupSteps as unknown[] | undefined) ?? []),
					],
				});
			const script = flagged(fields);
			const { loader } = mount([script]);

			loader.updateScripts([
				{ callbackOnly: true, category: 'measurement', id: 'level-three' },
			]);
			loader.updateScripts([script]);

			expect(record.mock.calls).toEqual(calls);
		}
	);

	test('sets a flag back to false', () => {
		mount([
			build({
				alwaysLoad: true,
				setupSteps: [
					{ name: 'started', type: 'setFlag', value: true },
					{ name: 'started', type: 'setFlag', value: false },
					ifStep(
						{ flag: 'started' },
						[recordStep('set')],
						[recordStep('unset')]
					),
				],
			}),
		]);

		expect(record).toHaveBeenCalledExactlyOnceWith('unset');
	});
});

describe('loaded', () => {
	test("holds once the script's file loaded, while its element is in the document", () => {
		const loadedStep = ifStep(
			{ loaded: true },
			[recordStep('loaded')],
			[recordStep('not loaded')]
		);
		const { kernel } = mount([
			build({
				afterLoadSteps: [loadedStep],
				loadScript,
				onConsentChangeSteps: [loadedStep],
				persistAfterConsentRevoked: true,
				setupSteps: [loadedStep],
			}),
		]);
		element()?.dispatchEvent(new Event('load'));
		void kernel.commands.save({ ...granted, marketing: false });
		element()?.remove();
		void kernel.commands.save(granted);

		expect(record.mock.calls).toEqual([
			['not loaded'],
			['loaded'],
			['loaded'],
			['not loaded'],
		]);
	});

	test('fails once the element fails to load', () => {
		const { kernel } = mount([
			build({
				loadScript,
				onConsentChangeSteps: [
					ifStep({ loaded: true }, [recordStep('loaded')]),
				],
			}),
		]);
		element()?.dispatchEvent(new Event('error'));
		void kernel.commands.save({ ...granted, marketing: false });

		expect(record).not.toHaveBeenCalled();
	});
});

describe('listen', () => {
	const listening = (fields: Record<string, unknown> = {}) =>
		build({
			alwaysLoad: true,
			setupSteps: [
				{
					event: 'vendor:ready',
					steps: [recordStep('ready', hasConsent)],
					target: 'window',
					type: 'listen',
					...fields,
				},
			],
		});

	test('runs its steps on each event, with consent as it is then', () => {
		const { kernel } = mount([listening()]);

		window.dispatchEvent(new Event('vendor:ready'));
		void kernel.commands.save({ ...granted, measurement: false });
		window.dispatchEvent(new Event('vendor:ready'));

		expect(record.mock.calls).toEqual([
			['ready', true],
			['ready', false],
		]);
	});

	test('runs once with once, and listens on the document', () => {
		mount([listening({ once: true, target: 'document' })]);

		document.dispatchEvent(new Event('vendor:ready'));
		document.dispatchEvent(new Event('vendor:ready'));
		window.dispatchEvent(new Event('vendor:ready'));

		expect(record).toHaveBeenCalledOnce();
	});

	test('stops, and removes its listener, when the script is disposed', () => {
		const remove = vi.spyOn(window, 'removeEventListener');
		const { loader } = mount([listening()]);

		loader.updateScripts([]);
		window.dispatchEvent(new Event('vendor:ready'));

		expect(record).not.toHaveBeenCalled();
		expect(remove).toHaveBeenCalledWith('vendor:ready', expect.any(Function));
	});

	test('listens again when the script is registered again after disposal', () => {
		// Dispose steps give each registration its own state.
		const script = build({
			alwaysLoad: true,
			onDisposeSteps: [recordStep('disposed')],
			setupSteps: [
				{
					event: 'vendor:ready',
					steps: [recordStep('ready')],
					target: 'window',
					type: 'listen',
				},
			],
		});
		const { loader } = mount([script]);

		loader.updateScripts([]);
		loader.updateScripts([script]);
		window.dispatchEvent(new Event('vendor:ready'));

		expect(record.mock.calls).toEqual([['disposed'], ['ready']]);
	});

	test('stops when a later load starts, which listens again', () => {
		const { kernel } = mount([
			build({
				loadScript,
				setupSteps: [
					{
						event: 'vendor:ready',
						steps: [recordStep('ready')],
						target: 'window',
						type: 'listen',
					},
				],
			}),
		]);

		void kernel.commands.save({ ...granted, measurement: false });
		void kernel.commands.save(granted);
		window.dispatchEvent(new Event('vendor:ready'));

		expect(record).toHaveBeenCalledOnce();
	});
});

describe('callGlobal.then', () => {
	/** A script whose loaded file calls `window.__api.init()` and waits for it. */
	const initOnLoad = () =>
		build({
			loadScript,
			onLoadGrantedSteps: [
				{
					global: '__api',
					method: 'init',
					then: [recordStep('initialized', hasConsent)],
					type: 'callGlobal',
				},
			],
		});

	test('runs once the result settles, with consent as it is then', async () => {
		const init = deferred();
		win.__api = { init: () => init.promise };
		const { kernel } = mount([initOnLoad()]);
		element()?.dispatchEvent(new Event('load'));

		expect(record).not.toHaveBeenCalled();
		void kernel.commands.save({ ...granted, marketing: false });
		init.resolve(undefined);
		await settle();

		expect(record).toHaveBeenCalledExactlyOnceWith('initialized', true);
	});

	test('reads consent withdrawn before the result settles', async () => {
		const init = deferred();
		win.__api = { init: () => init.promise };
		const script = build({
			alwaysLoad: true,
			persistAfterConsentRevoked: true,
			setupSteps: [
				{
					global: '__api',
					method: 'init',
					then: [recordStep('initialized', hasConsent)],
					type: 'callGlobal',
				},
			],
		});
		const { kernel } = mount([script]);

		void kernel.commands.save({ ...granted, measurement: false });
		init.resolve(undefined);
		await settle();

		expect(record).toHaveBeenCalledExactlyOnceWith('initialized', false);
	});

	test('runs after a value that is not a promise, too', async () => {
		win.__api = { init: () => 'ready' };
		mount([initOnLoad()]);
		element()?.dispatchEvent(new Event('load'));

		expect(record).not.toHaveBeenCalled();
		await settle();
		expect(record).toHaveBeenCalledExactlyOnceWith('initialized', true);
	});

	test('reports a rejection as a debug event and runs nothing', async () => {
		const events: unknown[] = [];
		disposers.push(
			subscribeToScriptDebugEvents((event) => {
				if (event.action === 'step_error') {
					events.push(event);
				}
			})
		);
		win.__api = { init: () => Promise.reject(new Error('blocked')) };
		mount([initOnLoad()]);
		element()?.dispatchEvent(new Event('load'));
		await settle();

		expect(record).not.toHaveBeenCalled();
		expect(events).toEqual([
			expect.objectContaining({
				data: { error: 'blocked' },
				phase: 'then',
				scriptId: 'level-three',
				stepType: 'callGlobal',
			}),
		]);
	});

	test('runs nothing once the script is disposed', async () => {
		const init = deferred();
		win.__api = { init: () => init.promise };
		const { loader } = mount([initOnLoad()]);
		element()?.dispatchEvent(new Event('load'));

		loader.updateScripts([]);
		init.resolve(undefined);
		await settle();

		expect(record).not.toHaveBeenCalled();
	});

	test('runs nothing once its element fails', async () => {
		const init = deferred();
		win.__api = { init: () => init.promise };
		mount([
			build({
				loadScript,
				setupSteps: [
					{
						global: '__api',
						method: 'init',
						then: [recordStep('initialized')],
						type: 'callGlobal',
					},
				],
			}),
		]);

		element()?.dispatchEvent(new Event('error'));
		init.resolve(undefined);
		await settle();

		expect(record).not.toHaveBeenCalled();
	});

	test("an old load's promise does not act on the load after a revoke and grant", async () => {
		const calls = [deferred(), deferred()];
		const pending = [...calls];
		win.__api = { init: () => pending.shift()?.promise };
		const script = initOnLoad();
		const { kernel } = mount([script]);
		const first = element();
		first?.dispatchEvent(new Event('load'));

		void kernel.commands.save({ ...granted, measurement: false });
		void kernel.commands.save(granted);
		const second = element();
		second?.dispatchEvent(new Event('load'));
		calls[0]?.resolve(undefined);
		await settle();

		expect(second).not.toBe(first);
		expect(record).not.toHaveBeenCalled();
		calls[1]?.resolve(undefined);
		await settle();
		expect(record).toHaveBeenCalledExactlyOnceWith('initialized', true);
	});
});
