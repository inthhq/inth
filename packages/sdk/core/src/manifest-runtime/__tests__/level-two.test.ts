/** @vitest-environment jsdom */
/**
 * Level 2 manifest features, each run from JSON through the parser and the
 * script loader against a real consent kernel.
 */
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import { choiceRecords, NOW } from '../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../kernel';
import { createScriptLoader } from '../../modules/script-loader';
import type { Script } from '../../modules/script-loader';
import type { HydrationRecords } from '../../types';
import { parseResolvedManifest } from '../parse';
import { resolvedManifestToScript } from '../runtime';
import type { ResolvedManifest } from '../types';

const granted = { marketing: true, measurement: true };
const win = window as unknown as Record<string, unknown>;
const disposers: (() => void)[] = [];
let record: ReturnType<typeof vi.fn>;

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
	for (const name of ['__record', '__api', '__queue', '__present']) {
		Reflect.deleteProperty(win, name);
	}
});

const value = (name: string, fields: Record<string, unknown> = {}) => ({
	kind: 'inth.runtime-value',
	value: name,
	...fields,
});

/** A step that passes `args` to `window.__record`. */
const recordStep = (...args: unknown[]) => ({
	args,
	global: '__record',
	type: 'callGlobal',
});

/**
 * A manifest built from JSON and checked by the parser, so each feature
 * runs as one the Inth server sent would.
 */
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
				requires: 2,
				schemaVersion: 1,
				setupSteps: [],
				vendor: 'level-two',
				...fields,
			})
		)
	);
	if (!parsed.ok) {
		throw new Error(parsed.reason);
	}
	return parsed.manifest;
};

const mount = (
	scripts: Script[],
	records: HydrationRecords = choiceRecords(granted),
	nonce?: string
) => {
	const kernel = createConsentKernel({ initialRecords: records, now: NOW });
	const loader = createScriptLoader({ kernel, nonce, scripts });
	disposers.push(kernel.dispose, loader.dispose);
	return { kernel, loader };
};

const vendorOff = {
	...choiceRecords(granted),
	vendorChoice: {
		confirmedAt: NOW - 1,
		denied: ['level-two'],
		version: 1 as const,
	},
};

describe('hasConsent and consents', () => {
	const consents = (format: string) =>
		value('consents', {
			format,
			mapping: { marketing: ['ads'], measurement: ['analytics'] },
		});

	test.each([
		['granted', choiceRecords(granted), true],
		['the category denied', choiceRecords({ marketing: true }), false],
		['the vendor turned off', vendorOff, false],
	])('read %s', (_label, records, allowed) => {
		mount(
			[
				resolvedManifestToScript(
					fromJSON({
						alwaysLoad: true,
						setupSteps: [
							recordStep(
								value('hasConsent'),
								consents('boolean'),
								consents('grantedDenied')
							),
						],
					})
				),
			],
			records
		);

		// Marketing is granted in every case, but not while the vendor may not run.
		const state = allowed ? 'granted' : 'denied';
		expect(record).toHaveBeenCalledWith(
			allowed,
			{ ads: allowed, analytics: allowed },
			{ ads: state, analytics: state }
		);
	});

	test('deny every purpose when the condition fails, whatever the categories say', () => {
		// Measurement is granted, but the manifest needs both categories.
		mount(
			[
				resolvedManifestToScript(
					fromJSON({
						alwaysLoad: true,
						category: { and: ['marketing', 'measurement'] },
						setupSteps: [recordStep(consents('boolean'))],
					})
				),
			],
			choiceRecords({ measurement: true })
		);

		expect(record).toHaveBeenCalledWith({ ads: false, analytics: false });
	});

	test('follow a category withdrawal while the vendor stays on', () => {
		const { kernel } = mount([
			resolvedManifestToScript(
				fromJSON({
					alwaysLoad: true,
					category: 'marketing',
					onConsentChangeSteps: [
						recordStep(value('hasConsent'), consents('boolean')),
					],
				})
			),
		]);
		void kernel.commands.save({ ...granted, measurement: false });

		expect(record).toHaveBeenLastCalledWith(true, {
			ads: true,
			analytics: false,
		});
	});
});

test('passes a runtime value it does not know through as data', () => {
	// The npm path builds scripts without the parser.
	const unknown = value('callback');
	mount([
		resolvedManifestToScript({
			...fromJSON({ alwaysLoad: true }),
			setupSteps: [recordStep(unknown) as never],
		}),
	]);

	expect(record).toHaveBeenCalledWith(unknown);
});

describe('scriptElement and scriptNonce', () => {
	const manifest = fromJSON({
		loadScript: { src: 'https://cdn.example/vendor.js', type: 'loadScript' },
		setupSteps: [
			recordStep(value('scriptElement'), {
				keep: 1,
				nonce: value('scriptNonce'),
			}),
		],
	});

	test('pass the element and its nonce', () => {
		mount([resolvedManifestToScript(manifest)], undefined, 'abc123');

		const [element, options] = record.mock.calls[0] ?? [];
		expect(element).toBeInstanceOf(HTMLScriptElement);
		expect((element as HTMLScriptElement).src).toBe(
			'https://cdn.example/vendor.js'
		);
		expect(options).toEqual({ keep: 1, nonce: 'abc123' });
	});

	test('leave out a property whose nonce is missing', () => {
		mount([resolvedManifestToScript(manifest)]);

		expect(record.mock.calls[0]?.[1]).toEqual({ keep: 1 });
	});
});

describe('an explicit script id', () => {
	test('keeps the id and still runs the after-load steps', () => {
		mount([
			resolvedManifestToScript(
				fromJSON({
					afterLoadSteps: [recordStep('loaded')],
					loadScript: {
						attributes: { id: 'vendor-main' },
						src: 'https://cdn.example/vendor.js',
						type: 'loadScript',
					},
				})
			),
		]);
		const element = document.getElementById('vendor-main');

		expect(element).toBeInstanceOf(HTMLScriptElement);
		element?.dispatchEvent(new Event('load'));
		expect(record).toHaveBeenCalledExactlyOnceWith('loaded');
	});
});

describe('consentGate', () => {
	test('passes values while consent holds, and never after dispose', () => {
		const { kernel, loader } = mount([
			resolvedManifestToScript(
				fromJSON({
					alwaysLoad: true,
					setupSteps: [recordStep('beforeSend', value('consentGate'))],
				})
			),
		]);
		const gate = record.mock.calls[0]?.[1] as (event: unknown) => unknown;

		expect(gate('event')).toBe('event');
		void kernel.commands.save({ ...granted, measurement: false });
		expect(gate('event')).toBeNull();
		void kernel.commands.save(granted);
		expect(gate('event')).toBe('event');
		loader.dispose();
		expect(gate('event')).toBeNull();
		void kernel.commands.save({ ...granted, marketing: false });
		void kernel.commands.save(granted);
		expect(gate('event')).toBeNull();
	});
});

describe('onDisposeSteps', () => {
	const disposing = () =>
		fromJSON({
			onDisposeSteps: [recordStep('disposed', value('hasConsent'))],
		});

	test('run when the loader is disposed, even for a script that never ran', () => {
		const { loader } = mount(
			[resolvedManifestToScript(disposing())],
			choiceRecords({ marketing: true })
		);
		expect(record).not.toHaveBeenCalled();

		loader.dispose();

		expect(record).toHaveBeenCalledExactlyOnceWith('disposed', false);
	});

	test('run when the script is removed', () => {
		const { loader } = mount([resolvedManifestToScript(disposing())]);

		loader.updateScripts([]);

		expect(record).toHaveBeenCalledExactlyOnceWith('disposed', true);
	});

	test('run after a replacement starts, with the withdrawal it saved', () => {
		const { kernel, loader } = mount([resolvedManifestToScript(disposing())]);
		const order: string[] = [];
		record.mockImplementation(() => order.push('outgoing steps'));

		loader.updateScripts([
			{
				callbackOnly: true,
				category: 'measurement',
				id: 'level-two',
				onBeforeLoad: () => {
					order.push('incoming onBeforeLoad');
					void kernel.commands.save({ ...granted, measurement: false });
				},
				vendor: 'level-two',
			},
		]);

		expect(order).toEqual(['incoming onBeforeLoad', 'outgoing steps']);
		expect(record).toHaveBeenCalledExactlyOnceWith('disposed', false);
	});
});

describe('callGlobal.path', () => {
	test('calls the function on the object that holds it', () => {
		win.__api = {
			inner: {
				add(this: { total: number }, amount: number) {
					this.total += amount;
				},
				total: 1,
			},
		};
		mount([
			resolvedManifestToScript(
				fromJSON({
					alwaysLoad: true,
					setupSteps: [
						{ args: [2], path: ['__api', 'inner', 'add'], type: 'callGlobal' },
						{
							args: [3],
							path: ['__api', 'missing', 'add'],
							type: 'callGlobal',
						},
					],
				})
			),
		]);

		expect((win.__api as { inner: { total: number } }).inner.total).toBe(3);
	});

	test('refuses a path through browser objects that the parser would refuse', () => {
		// Built without the parser, as a manifest that slipped past it would be.
		mount([
			resolvedManifestToScript({
				...fromJSON({ alwaysLoad: true }),
				setupSteps: [
					{
						args: ['beforeend', '<i id="injected"></i>'],
						path: ['document', 'body', 'insertAdjacentHTML'],
						type: 'callGlobal',
					},
					{
						args: ['via-view'],
						path: ['document', 'defaultView', '__record'],
						type: 'callGlobal',
					},
					{
						args: ['via-window'],
						path: ['window', '__record'],
						type: 'callGlobal',
					},
					{
						args: ['via-self'],
						global: 'self',
						method: '__record',
						type: 'callGlobal',
					},
					{
						assignTo: '__api',
						constructor: 'Function',
						type: 'constructGlobal',
					},
					recordStep('after') as never,
				],
			}),
		]);

		expect(document.getElementById('injected')).toBeNull();
		expect(win.__api).toBeUndefined();
		expect(record).toHaveBeenCalledExactlyOnceWith('after');
	});
});

test('skips a write to the page that the parser would refuse', () => {
	win.__api = {};
	// Built without the parser, as a manifest that slipped past it would be.
	mount([
		resolvedManifestToScript({
			...fromJSON({ alwaysLoad: true }),
			setupSteps: [
				{
					path: ['document', 'body', 'innerHTML'],
					type: 'setGlobalPath',
					value: '<i id="injected"></i>',
				},
				{ path: ['__api', 'href'], type: 'setGlobalPath', value: 'x' },
				{ name: ['__api'], type: 'setGlobal', value: 'x' } as never,
				{
					aliases: ['onload'],
					name: '__queue',
					queue: { global: 'q' },
					type: 'defineStubFunction',
				},
				{ methods: ['innerHTML'], target: '__api', type: 'defineQueueMethods' },
				{
					methods: [{ behavior: 'noop', name: 'src' }],
					target: '__api',
					type: 'defineGlobalMethods',
				},
				{
					methods: ['track'],
					name: 'outerHTML',
					target: '__api',
					type: 'defineQueueClass',
				},
				{ name: '__present', queue: 'location', type: 'defineQueueProxy' },
				{ assignTo: 'parent', constructor: 'Object', type: 'constructGlobal' },
				recordStep('after') as never,
			],
		}),
	]);

	expect(document.getElementById('injected')).toBeNull();
	expect(win.__api).toEqual({});
	expect(win.__queue).toBeUndefined();
	expect(win.__present).toBeUndefined();
	expect(win.parent).toBe(window);
	expect(record).toHaveBeenCalledExactlyOnceWith('after');
});

test('reads call arguments only when there is something to call', () => {
	// A payload JSON cannot carry would throw and stop the later steps.
	mount([
		resolvedManifestToScript({
			...fromJSON({ alwaysLoad: true }),
			setupSteps: [
				{
					args: [10n],
					global: '__missing',
					literalArgs: true,
					type: 'callGlobal',
				},
				{
					args: [10n],
					literalArgs: true,
					path: ['__missing', 'call'],
					type: 'callGlobal',
				},
				recordStep('after') as never,
			],
		}),
	]);

	expect(record).toHaveBeenCalledWith('after');
});

describe('loadScriptStep and removeScript', () => {
	const addon = (fields: Record<string, unknown> = {}) => ({
		id: 'vendor-addon',
		src: 'https://cdn.example/addon.js',
		type: 'loadScriptStep',
		...fields,
	});

	test('inserts a tag with the main element nonce, and dispose removes it', () => {
		const { loader } = mount(
			[
				resolvedManifestToScript(
					fromJSON({
						loadScript: {
							src: 'https://cdn.example/vendor.js',
							type: 'loadScript',
						},
						setupSteps: [
							addon({ async: false, attributes: { 'data-site': 'abc' } }),
						],
					})
				),
			],
			undefined,
			'abc123'
		);
		const tag = document.getElementById('vendor-addon') as HTMLScriptElement;

		expect(tag.src).toBe('https://cdn.example/addon.js');
		expect(tag.nonce).toBe('abc123');
		expect(tag.async).toBe(false);
		expect(tag.dataset.site).toBe('abc');
		loader.dispose();
		expect(tag.isConnected).toBe(false);
	});

	test('skips a tag whose id is taken or whose global exists, and leaves that tag', () => {
		const existing = document.createElement('script');
		existing.id = 'vendor-addon';
		document.body.append(existing);
		win.__present = { recorder: {} };
		const { loader } = mount([
			resolvedManifestToScript(
				fromJSON({
					alwaysLoad: true,
					onDisposeSteps: [{ id: 'vendor-addon', type: 'removeScript' }],
					setupSteps: [
						addon(),
						addon({
							id: 'vendor-recorder',
							unlessGlobal: ['__present', 'recorder'],
						}),
					],
				})
			),
		]);

		expect(document.querySelectorAll('script[id^="vendor-"]')).toHaveLength(1);
		loader.dispose();
		expect(existing.isConnected).toBe(true);
	});

	test('removes its tag when consent is withdrawn, and inserts it again on a grant', () => {
		const { kernel } = mount([
			resolvedManifestToScript(
				fromJSON({
					alwaysLoad: true,
					onConsentDeniedSteps: [{ id: 'vendor-addon', type: 'removeScript' }],
					onConsentGrantedSteps: [addon()],
					setupSteps: [addon()],
				})
			),
		]);
		expect(document.getElementById('vendor-addon')).not.toBeNull();

		void kernel.commands.save({ ...granted, measurement: false });
		expect(document.getElementById('vendor-addon')).toBeNull();
		void kernel.commands.save(granted);
		expect(document.getElementById('vendor-addon')).not.toBeNull();
	});

	test("a replaced script's late removeScript leaves the incoming script's tag", () => {
		const { loader } = mount([
			resolvedManifestToScript(
				fromJSON({
					alwaysLoad: true,
					onDisposeSteps: [{ id: 'vendor-addon', type: 'removeScript' }],
					setupSteps: [addon()],
				})
			),
		]);
		const outgoing = document.getElementById('vendor-addon');

		loader.updateScripts([
			resolvedManifestToScript(
				fromJSON({
					alwaysLoad: true,
					onDisposeSteps: [{ id: 'vendor-addon', type: 'removeScript' }],
					setupSteps: [addon({ attributes: { 'data-next': '1' } })],
				})
			),
		]);
		const incoming = document.getElementById('vendor-addon');

		expect(outgoing?.isConnected).toBe(false);
		expect(incoming).not.toBe(outgoing);
		expect(incoming?.isConnected).toBe(true);
	});
});

describe('copied fields and queue formats', () => {
	test('target, observeConsentBeforeLoad, persistAfterDispose and resourceKey reach the script', () => {
		const script = resolvedManifestToScript(
			fromJSON({
				loadScript: {
					src: 'https://cdn.example/vendor.js',
					type: 'loadScript',
				},
				observeConsentBeforeLoad: true,
				persistAfterDispose: true,
				resourceKey: 'level-two-main',
				target: 'body',
			})
		);
		expect(script).toMatchObject({
			observeConsentBeforeLoad: true,
			persistAfterDispose: true,
			resourceKey: 'level-two-main',
			target: 'body',
		});

		const { loader } = mount([script]);
		const element = document.body.querySelector(
			'script[src="https://cdn.example/vendor.js"]'
		);
		expect(element).not.toBeNull();
		loader.dispose();
		expect(element?.isConnected).toBe(true);
	});

	test('nameAndArguments queues the call with its Arguments object', () => {
		mount([
			resolvedManifestToScript(
				fromJSON({
					alwaysLoad: true,
					setupSteps: [
						{ name: '__queue', type: 'setGlobal', value: [] },
						{
							methods: ['record'],
							queueFormat: 'nameAndArguments',
							target: '__queue',
							type: 'defineQueueMethods',
						},
					],
				})
			),
		]);
		(win.__queue as { record: (...args: unknown[]) => void }).record(1, 'two');

		const [entry] = win.__queue as [string, IArguments][];
		expect(entry?.[0]).toBe('record');
		expect(Object.prototype.toString.call(entry?.[1])).toBe(
			'[object Arguments]'
		);
		expect([...(entry?.[1] ?? [])]).toEqual([1, 'two']);
	});
});
