/** @vitest-environment jsdom */
/**
 * `globals`, the window roots a manifest declares, and the checks behind
 * it: the parser refuses an undeclared or platform root, and the runtime
 * refuses native calls and paths through browser objects for a manifest
 * that never met the parser.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { choiceRecords, NOW } from '../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../kernel';
import { createScriptLoader } from '../../modules/script-loader';
import { isDeclarableGlobal, manifestRoots } from '../globals';
import { parseResolvedManifest } from '../parse';
import { resolvedManifestToScript } from '../runtime';
import type { ResolvedManifest } from '../types';
import chromiumGlobals from './fixtures/chromium-globals.json';

const win = window as unknown as Record<string, unknown>;
const disposers: (() => void)[] = [];
// Built so the linter does not take it for a script URL in this file.
const scriptUrl = ['javascript', 'alert(1)'].join(':');
const markup = '<img src="x" id="injected">';

afterEach(() => {
	for (const dispose of disposers.splice(0).reverse()) {
		dispose();
	}
	vi.restoreAllMocks();
	document.head.replaceChildren();
	document.body.replaceChildren();
	for (const name of ['inthTag', 'inthFrame', 'vendor', '__pwned']) {
		Reflect.deleteProperty(win, name);
	}
});

const base = (fields: Record<string, unknown>) => ({
	afterLoadSteps: [],
	bootstrapSteps: [],
	category: 'measurement',
	kind: 'inth.vendor-manifest',
	loadScript: { src: 'https://cdn.example/vendor.js', type: 'loadScript' },
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
	vendor: 'vendor',
	...fields,
});

/** A manifest whose `globals` holds every root its steps use, as `compileManifest` builds it. */
const withRoots = (fields: Record<string, unknown>) => {
	const manifest = base(fields);
	return {
		...manifest,
		globals: manifestRoots(manifest as unknown as ResolvedManifest),
	};
};

const parse = (value: unknown) =>
	parseResolvedManifest(JSON.parse(JSON.stringify(value)));

const scriptElement = { kind: 'inth.runtime-value', value: 'scriptElement' };

describe('roots a manifest may never declare', () => {
	it.each([
		'window',
		'self',
		'globalThis',
		'document',
		'location',
		'history',
		'navigation',
		'navigator',
		'Object',
		'Reflect',
		'Function',
		'eval',
		'Proxy',
		'JSON',
		'Array',
		'Promise',
		'fetch',
		'XMLHttpRequest',
		'setTimeout',
		'setInterval',
		'open',
		'parent',
		'top',
		'frames',
		'opener',
		'localStorage',
		'sessionStorage',
		'indexedDB',
		'customElements',
		'trustedTypes',
		'constructor',
		'__proto__',
		'onload',
	])('refuses %s', (name) => {
		expect(isDeclarableGlobal(name)).toBe(false);
	});

	// Interface objects such as `HTMLDivElement` are left out of the static
	// list; a browser refuses them by reading window, below.
	it("refuses every name on Chromium's window that is not an interface object", () => {
		const declarable = Object.entries(chromiumGlobals)
			.filter(([, isInterface]) => !isInterface)
			.map(([name]) => name)
			.filter(isDeclarableGlobal);

		expect(declarable).toEqual([]);
	});

	it('refuses an interface object the browser put on window, by reading it', () => {
		Object.defineProperty(window, 'InthInterface', {
			configurable: true,
			value: Map,
			writable: true,
		});
		try {
			expect(isDeclarableGlobal('InthInterface')).toBe(false);
		} finally {
			Reflect.deleteProperty(win, 'InthInterface');
		}
	});

	it.each([
		'dataLayer',
		'_hsq',
		'_paq',
		'gtag',
		'fbq',
		'Munchkin',
		'UET',
		'DY',
	])('accepts the vendor global %s', (name) => {
		expect(isDeclarableGlobal(name)).toBe(true);
	});

	it('accepts a vendor global the page already set, even to a bound function', () => {
		win.vendor = Math.max.bind(Math);

		expect(isDeclarableGlobal('vendor')).toBe(true);
	});

	it.each(['', '1x', '0', '.a', 'a b', 'a[0]'])(
		'refuses %j, which is no property name a vendor uses',
		(name) => {
			expect(isDeclarableGlobal(name)).toBe(false);
		}
	);

	// GTM's `dataLayer` option names an exact window property.
	it('accepts a dotted name such as app.layer', () => {
		expect(isDeclarableGlobal('app.layer')).toBe(true);
	});
});

describe('the parser', () => {
	const call = {
		args: [1],
		global: 'vendor',
		method: 'track',
		type: 'callGlobal',
	};

	it('accepts a manifest whose globals declares every root', () => {
		expect(parse(withRoots({ setupSteps: [call] })).ok).toBe(true);
	});

	it('refuses a manifest without globals', () => {
		expect(parse(base({ setupSteps: [call] }))).toEqual({
			ok: false,
			reason: expect.stringContaining('globals'),
		});
	});

	it.each<[string, unknown]>([
		['a call', call],
		['a call path', { path: ['vendor', 'api', 'track'], type: 'callGlobal' }],
		['a global it sets', { name: 'vendor', type: 'setGlobal', value: 1 }],
		[
			'a path it sets',
			{ path: ['vendor', 'x'], type: 'setGlobalPath', value: 1 },
		],
		[
			'a queue it pushes to',
			{ queue: 'vendor', type: 'pushToQueue', value: 1 },
		],
		[
			'a stub queue',
			{ name: 'stub', queue: { global: 'vendor' }, type: 'defineStubFunction' },
		],
		[
			'a stub alias',
			{
				aliases: ['vendor'],
				name: 'stub',
				queue: { property: 'q' },
				type: 'defineStubFunction',
			},
		],
		[
			'a method target',
			{ methods: ['a'], target: 'vendor', type: 'defineQueueMethods' },
		],
		[
			'a constructor',
			{ assignTo: 'stub', constructor: 'vendor', type: 'constructGlobal' },
		],
		[
			'an assignTo',
			{ assignTo: 'vendor', constructor: 'stub', type: 'constructGlobal' },
		],
		[
			'an unlessGlobal',
			{
				id: 'addon',
				src: 'https://cdn.example/a.js',
				type: 'loadScriptStep',
				unlessGlobal: ['vendor', 'x'],
			},
		],
	])('refuses %s whose root globals does not declare', (_label, step) => {
		const manifest = withRoots({ setupSteps: [step] });

		expect(
			parse({
				...manifest,
				globals: manifest.globals.filter((name) => name !== 'vendor'),
			})
		).toEqual({
			ok: false,
			reason: expect.stringContaining('uses the global vendor'),
		});
	});

	it('refuses a consent signal to a global globals does not declare', () => {
		const manifest = withRoots({
			consentMapping: { measurement: ['analytics_storage'] },
			consentSignal: 'gtag',
		});

		expect(manifest.globals).toEqual(['gtag']);
		expect(parse({ ...manifest, globals: [] })).toEqual({
			ok: false,
			reason: expect.stringContaining('gtag'),
		});
	});

	it.each(['document', 'Object', 'history', 'XMLHttpRequest', 'onclick'])(
		'refuses a manifest that declares %s, even with no step using it',
		(name) => {
			expect(parse({ ...withRoots({}), globals: [name] })).toEqual({
				ok: false,
				reason: expect.stringContaining(`names ${name}`),
			});
		}
	);

	it('refuses declaring the id of a tag it inserts, which window holds as the element', () => {
		const manifest = withRoots({
			loadScript: {
				attributes: { id: 'inthTag' },
				src: 'https://cdn.example/vendor.js',
				type: 'loadScript',
			},
			setupSteps: [
				{ path: ['inthTag', 'dataset', 'x'], type: 'setGlobalPath', value: 1 },
			],
		});

		expect(parse(manifest)).toEqual({
			ok: false,
			reason: expect.stringContaining('the id of a tag'),
		});
	});
});

/**
 * Ways past the earlier name-based block lists. Each runs once through the
 * parser and once through a manifest built in code, which never meets the
 * parser, with `globals` declaring every root the step uses.
 *
 * jsdom puts no element on window by id and has no `setHTMLUnsafe`; the
 * runtime cases put the element there and add the method themselves.
 */
const bypasses: {
	name: string;
	/** Part of the parser's reason. */
	reason: string;
	steps: Record<string, unknown>[];
	/** Puts the page in place; returns whether the step got through. */
	page: () => () => boolean;
}[] = [
	{
		name: 'Object.assign on the script element',
		page: () => () => document.getElementById('injected') !== null,
		reason: 'names Object',
		steps: [
			{
				args: [scriptElement, { outerHTML: markup }],
				global: 'Object',
				method: 'assign',
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'Reflect.set on the script element',
		page: () => () => document.getElementById('injected') !== null,
		reason: 'names Reflect',
		steps: [
			{
				args: [scriptElement, 'outerHTML', markup],
				global: 'Reflect',
				method: 'set',
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'setHTMLUnsafe on an element window holds',
		page: () => {
			const element = document.createElement('div');
			document.body.append(element);
			Object.defineProperty(element, 'setHTMLUnsafe', {
				value(this: Element, html: string) {
					this.innerHTML = html;
				},
			});
			win.inthTag = element;
			return () => document.getElementById('injected') !== null;
		},
		reason: 'calls inthTag.setHTMLUnsafe',
		steps: [
			{
				args: [markup],
				path: ['inthTag', 'setHTMLUnsafe'],
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'parentElement.setAttribute',
		page: () => {
			const element = document.createElement('div');
			document.body.append(element);
			win.inthTag = element;
			return () => document.body.hasAttribute('onclick');
		},
		reason: 'calls inthTag.parentElement.setAttribute',
		steps: [
			{
				args: ['onclick', 'alert(1)'],
				path: ['inthTag', 'parentElement', 'setAttribute'],
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'history.back',
		page: () => {
			const back = vi.spyOn(history, 'back');
			return () => back.mock.calls.length > 0;
		},
		reason: 'names history',
		steps: [{ global: 'history', method: 'back', type: 'callGlobal' }],
	},
	{
		name: 'a write to attributes[1].value',
		page: () => {
			const link = document.createElement('a');
			link.className = 'x';
			link.href = '/';
			document.body.append(link);
			win.inthTag = link;
			return () => link.getAttribute('href') === scriptUrl;
		},
		reason: 'writes inthTag, attributes',
		steps: [
			{
				path: ['inthTag', 'attributes', '1', 'value'],
				type: 'setGlobalPath',
				value: scriptUrl,
			},
		],
	},
	{
		name: "an iframe's contentDocument",
		page: () => {
			const frame = document.createElement('iframe');
			document.body.append(frame);
			win.inthFrame = frame;
			return () => frame.contentDocument?.body.textContent === 'injected';
		},
		reason: 'calls inthFrame.contentDocument',
		steps: [
			{
				args: ['injected'],
				path: ['inthFrame', 'contentDocument', 'body', 'append'],
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'document.defaultView.eval',
		page: () => () => win.__pwned === 1,
		reason: 'calls document.defaultView.eval',
		steps: [
			{
				args: ['window.__pwned = 1'],
				path: ['document', 'defaultView', 'eval'],
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'document.location.assign',
		page: () => () => {
			// jsdom navigates within the page only, by fragment.
			const moved = location.hash === '#injected';
			location.hash = '';
			return moved;
		},
		reason: 'calls document.location.assign',
		steps: [
			{
				args: ['#injected'],
				path: ['document', 'location', 'assign'],
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'insertAdjacentHTML on an element window holds',
		page: () => {
			const element = document.createElement('div');
			document.body.append(element);
			win.inthTag = element;
			return () => document.getElementById('injected') !== null;
		},
		reason: 'calls inthTag.insertAdjacentHTML',
		steps: [
			{
				args: ['beforeend', markup],
				path: ['inthTag', 'insertAdjacentHTML'],
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'navigation.navigate',
		page: () => {
			const navigate = vi.fn();
			win.navigation = { navigate };
			return () => {
				Reflect.deleteProperty(win, 'navigation');
				return navigate.mock.calls.length > 0;
			};
		},
		reason: 'calls navigation.navigate',
		steps: [
			{
				args: [scriptUrl],
				path: ['navigation', 'navigate'],
				type: 'callGlobal',
			},
		],
	},
	{
		name: 'the constructor chain to Object.assign',
		page: () => {
			win.vendor = {};
			return () => document.getElementById('injected') !== null;
		},
		reason: 'names constructor',
		steps: [
			{
				args: [scriptElement, { outerHTML: markup }],
				path: ['vendor', 'constructor', 'assign'],
				type: 'callGlobal',
			},
		],
	},
];

describe('bypasses of the block lists', () => {
	it.each(bypasses.map((bypass) => [bypass.name, bypass] as const))(
		'the parser refuses %s',
		(_name, { reason, steps }) => {
			expect(parse(withRoots({ onLoadGrantedSteps: steps }))).toEqual({
				ok: false,
				reason: expect.stringContaining(reason),
			});
		}
	);

	it.each(bypasses.map((bypass) => [bypass.name, bypass] as const))(
		'a manifest built in code does not run %s',
		(_name, { page, steps }) => {
			const gotThrough = page();
			const manifest = withRoots({ onLoadGrantedSteps: steps });
			const kernel = createConsentKernel({
				initialRecords: choiceRecords({ measurement: true }),
				now: NOW,
			});
			const loader = createScriptLoader({
				kernel,
				scripts: [
					resolvedManifestToScript(manifest as unknown as ResolvedManifest),
				],
			});
			disposers.push(kernel.dispose, loader.dispose);
			document
				.querySelector('script[src="https://cdn.example/vendor.js"]')
				?.dispatchEvent(new Event('load'));

			expect(gotThrough()).toBe(false);
		}
	);
});

describe('native calls', () => {
	const mountSteps = (steps: Record<string, unknown>[]) => {
		const manifest = withRoots({ setupSteps: steps });
		const kernel = createConsentKernel({
			initialRecords: choiceRecords({ measurement: true }),
			now: NOW,
		});
		const loader = createScriptLoader({
			kernel,
			scripts: [
				resolvedManifestToScript({
					...(manifest as unknown as ResolvedManifest),
					alwaysLoad: true,
				}),
			],
		});
		disposers.push(kernel.dispose, loader.dispose);
	};

	it("calls push on a vendor's array, as GTM's dataLayer needs", () => {
		win.vendor = [];
		mountSteps([
			{
				args: [{ event: 'gtm.js' }],
				global: 'vendor',
				method: 'push',
				type: 'callGlobal',
			},
			{ args: ['first'], path: ['vendor', 'unshift'], type: 'callGlobal' },
		]);

		expect(win.vendor).toEqual(['first', { event: 'gtm.js' }]);
	});

	it('pushes no browser object, and calls no other native method', () => {
		win.vendor = [];
		mountSteps([
			{
				args: [scriptElement],
				global: 'vendor',
				method: 'push',
				type: 'callGlobal',
			},
			{
				args: [{ el: scriptElement }],
				path: ['vendor', 'push'],
				type: 'callGlobal',
			},
			{ args: ['a'], global: 'vendor', method: 'fill', type: 'callGlobal' },
		]);

		expect(win.vendor).toEqual([]);
	});

	it("passes the script element to a vendor's own function", () => {
		const track = vi.fn();
		win.vendor = { track };
		mountSteps([
			{
				args: [scriptElement],
				global: 'vendor',
				method: 'track',
				type: 'callGlobal',
			},
		]);

		expect(track).toHaveBeenCalledOnce();
	});

	it('calls no native function a vendor global holds', () => {
		const element = document.createElement('div');
		document.body.append(element);
		win.vendor = { remove: element.remove.bind(element) };
		mountSteps([{ global: 'vendor', method: 'remove', type: 'callGlobal' }]);

		expect(element.isConnected).toBe(true);
	});
});
