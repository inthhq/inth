/* oxlint-disable unicorn/no-thenable -- `if` and `callGlobal` steps have a `then` field. */
import { describe, expect, it } from 'vite-plus/test';

import { manifestRoots } from '../globals';
import { MANIFEST_RUNTIME_LEVEL } from '../level';
import { parseResolvedManifest } from '../parse';
import { resolvedManifestToScript } from '../runtime';

const manifest = () => ({
	afterLoadSteps: [],
	alwaysLoad: true,
	bootstrapSteps: [
		{ ifUndefined: true, name: 'dataLayer', type: 'setGlobal', value: [] },
	],
	category: { or: ['measurement', 'marketing'] },
	consentMapping: { measurement: ['analytics_storage'] },
	consentSignal: 'gtag',
	globals: ['dataLayer', 'gtag'],
	kind: 'inth.vendor-manifest',
	loadScript: {
		async: true,
		attributes: { 'data-inth-layer': 'dataLayer' },
		src: 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC',
		type: 'loadScript',
	},
	onBeforeLoadDeniedSteps: [],
	onBeforeLoadGrantedSteps: [],
	onConsentChangeSteps: [],
	onConsentDeniedSteps: [],
	onConsentGrantedSteps: [],
	onLoadDeniedSteps: [],
	onLoadGrantedSteps: [],
	schemaVersion: 1,
	setupSteps: [],
	vendor: 'google-tag-manager',
	vendorDetails: {
		name: 'Google Tag Manager',
		privacyPolicyUrl: 'https://policies.google.com/privacy',
	},
});

describe('parseResolvedManifest', () => {
	it('accepts a manifest that arrived as JSON and runs it', () => {
		const result = parseResolvedManifest(
			JSON.parse(JSON.stringify(manifest()))
		);

		expect(result.ok).toBe(true);
		const script = resolvedManifestToScript(
			result.ok ? result.manifest : (undefined as never)
		);
		expect(script).toMatchObject({
			alwaysLoad: true,
			id: 'google-tag-manager',
			src: 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC',
		});
		expect(script.serverStart).toBeUndefined();
	});

	it.each([
		'bootstrapSteps',
		'setupSteps',
		'afterLoadSteps',
		'onConsentGrantedSteps',
	])('rejects a step type it does not know in %s', (list) => {
		const input = {
			...manifest(),
			[list]: [{ code: 'alert(1)', type: 'runInlineCode' }],
		};

		expect(parseResolvedManifest(input)).toEqual({
			ok: false,
			reason: expect.stringContaining('runInlineCode'),
		});
	});

	it('rejects a loadScript step in a step list, which would never run', () => {
		const input = {
			...manifest(),
			setupSteps: [{ src: 'https://cdn.example/x.js', type: 'loadScript' }],
		};

		expect(parseResolvedManifest(input)).toEqual({
			ok: false,
			reason: expect.stringContaining('loadScript'),
		});
	});

	it.each<[string, unknown]>([
		['a non-object', 'manifest'],
		['another kind', { ...manifest(), kind: 'other' }],
		['a newer schema', { ...manifest(), schemaVersion: 2 }],
		['no vendor', { ...manifest(), vendor: '' }],
		['a bad category', { ...manifest(), category: { maybe: ['marketing'] } }],
		['a missing step list', { ...manifest(), setupSteps: undefined }],
		['a step that is not an object', { ...manifest(), setupSteps: ['x'] }],
		[
			'an http script',
			{
				...manifest(),
				loadScript: {
					src: 'http://www.googletagmanager.com/gtm.js',
					type: 'loadScript',
				},
			},
		],
		[
			'a protocol-relative script',
			{
				...manifest(),
				loadScript: { src: '//bat.bing.com/bat.js', type: 'loadScript' },
			},
		],
		...['src', 'onload', 'onerror', 'nonce', 'type'].map(
			(name): [string, unknown] => [
				`a ${name} attribute`,
				{
					...manifest(),
					loadScript: {
						...manifest().loadScript,
						attributes: { [name]: 'https://evil.example/x.js' },
					},
				},
			]
		),
		['a string alwaysLoad', { ...manifest(), alwaysLoad: 'yes' }],
		['an unknown consent signal', { ...manifest(), consentSignal: 'other' }],
		[
			'a consent mapping for a name that is not a category',
			{ ...manifest(), consentMapping: { toString: ['analytics_storage'] } },
		],
		[
			'a non-string attribute',
			{
				...manifest(),
				loadScript: {
					...manifest().loadScript,
					attributes: { 'data-inth-layer': 1 },
				},
			},
		],
	])('rejects %s', (_label, input) => {
		expect(parseResolvedManifest(input).ok).toBe(false);
	});

	// An older SDK must refuse what a newer manifest adds, never run part of it.
	it.each<[string, unknown]>([
		['an unknown manifest field', { ...manifest(), onUnloadSteps: [] }],
		[
			'an unknown step field',
			{
				...manifest(),
				setupSteps: [
					{ global: 'a', method: 'b', path: ['c'], type: 'callGlobal' },
				],
			},
		],
		[
			'an unknown loadScript field',
			{
				...manifest(),
				loadScript: { ...manifest().loadScript, target: 'body' },
			},
		],
		[
			'an unknown runtime value',
			{
				...manifest(),
				setupSteps: [
					{
						args: [{ kind: 'inth.runtime-value', value: 'consent' }],
						global: 'a',
						type: 'callGlobal',
					},
				],
			},
		],
		[
			'a runtime value with an extra field',
			{
				...manifest(),
				setupSteps: [
					{
						name: 'started',
						type: 'setGlobal',
						value: { kind: 'inth.runtime-value', mapping: {}, value: 'date' },
					},
				],
			},
		],
	])('refuses %s', (_label, input) => {
		expect(parseResolvedManifest(input).ok).toBe(false);
	});

	it.each(['__proto__', 'prototype', 'constructor'])(
		'refuses %s as a name a step writes to',
		(name) => {
			for (const step of [
				{ path: [name, 'polluted'], type: 'setGlobalPath', value: 1 },
				{ name, type: 'setGlobal', value: 1 },
				{ global: 'a', method: name, type: 'callGlobal' },
			]) {
				expect(
					parseResolvedManifest({ ...manifest(), setupSteps: [step] }).ok,
					JSON.stringify(step)
				).toBe(false);
			}
		}
	);

	it('accepts runtime values it knows, and those names inside plain data', () => {
		const input = {
			...manifest(),
			globals: ['dataLayer', 'gtag', 'started'],
			setupSteps: [
				{
					name: 'started',
					type: 'setGlobal',
					value: {
						at: { kind: 'inth.runtime-value', value: 'timestamp' },
						label: 'constructor',
					},
				},
			],
		};

		expect(parseResolvedManifest(input).ok).toBe(true);
	});

	it('accepts a manifest with no script to load', () => {
		const { loadScript: _loadScript, ...callbackOnly } = manifest();

		expect(parseResolvedManifest(callbackOnly).ok).toBe(true);
	});

	it.each([undefined, 1, MANIFEST_RUNTIME_LEVEL])(
		'accepts requires %j, a level this runtime runs',
		(requires) => {
			expect(parseResolvedManifest({ ...manifest(), requires }).ok).toBe(true);
		}
	);

	it('refuses a manifest that needs a level above this runtime', () => {
		expect(
			parseResolvedManifest({
				...manifest(),
				requires: MANIFEST_RUNTIME_LEVEL + 1,
			})
		).toEqual({
			ok: false,
			reason: `it needs manifest runtime level ${MANIFEST_RUNTIME_LEVEL + 1}, and this SDK runs level ${MANIFEST_RUNTIME_LEVEL}`,
		});
	});

	it.each([0, -1, 1.5, '1', null])('refuses requires %j', (requires) => {
		expect(parseResolvedManifest({ ...manifest(), requires })).toEqual({
			ok: false,
			reason: 'its requires is not a whole number from 1',
		});
	});
	it.each<[string, unknown, string]>([
		[
			'an if step',
			{ then: [], type: 'if', when: { loaded: true } },
			'setupSteps has a step of unknown type "if"',
		],
		[
			'callGlobal.then',
			{ global: 'vendor', then: [], type: 'callGlobal' },
			'setupSteps has a callGlobal step with the unknown field then',
		],
		[
			'a defer step',
			{ steps: [], type: 'defer' },
			'setupSteps has a step of unknown type "defer"',
		],
	])(
		'refuses %s while the level 3 part is not installed',
		(_label, step, reason) => {
			expect(
				parseResolvedManifest({
					...manifest(),
					requires: 3,
					setupSteps: [step],
				})
			).toEqual({ ok: false, reason });
		}
	);

	it('refuses a manifest of more than 200 steps', () => {
		const [step] = manifest().bootstrapSteps;
		const input = {
			...manifest(),
			bootstrapSteps: Array.from({ length: 100 }, () => step),
			loadScript: undefined,
			setupSteps: Array.from({ length: 101 }, () => step),
		};

		expect(parseResolvedManifest(input)).toEqual({
			ok: false,
			reason: 'it has more than 200 steps',
		});
		expect(
			parseResolvedManifest({ ...input, setupSteps: input.bootstrapSteps }).ok
		).toBe(true);
	});

	describe('level 2', () => {
		const runtimeValue = (value: string, fields = {}) => ({
			kind: 'inth.runtime-value',
			value,
			...fields,
		});
		const withSetup = (...steps: unknown[]) => {
			const input = { ...manifest(), requires: 2, setupSteps: steps };
			return { ...input, globals: manifestRoots(input as never) };
		};
		const addon = (fields: Record<string, unknown> = {}) => ({
			id: 'vendor-addon',
			src: 'https://cdn.example/addon.js',
			type: 'loadScriptStep',
			...fields,
		});

		it('accepts every level 2 step, field and runtime value', () => {
			const input = {
				...withSetup(
					{
						args: [
							runtimeValue('hasConsent'),
							runtimeValue('consents', {
								format: 'grantedDenied',
								mapping: { measurement: ['analytics'] },
							}),
							runtimeValue('scriptElement'),
							{ nonce: runtimeValue('scriptNonce') },
							runtimeValue('consentGate'),
						],
						path: ['vendor', 'api', 'start'],
						type: 'callGlobal',
					},
					addon({
						async: false,
						attributes: { 'data-site': 'abc' },
						unlessGlobal: ['vendor', 'recorder'],
					}),
					{ id: 'vendor-addon', type: 'removeScript' },
					{
						methods: ['track'],
						queueFormat: 'nameAndArguments',
						target: 'vendor',
						type: 'defineQueueMethods',
					}
				),
				loadScript: {
					...manifest().loadScript,
					attributes: { id: 'vendor-main' },
				},
				observeConsentBeforeLoad: true,
				onDisposeSteps: [{ id: 'vendor-addon', type: 'removeScript' }],
				persistAfterDispose: false,
				resourceKey: 'vendor-main',
				target: 'body',
			};

			expect(parseResolvedManifest(JSON.parse(JSON.stringify(input)))).toEqual({
				manifest: input,
				ok: true,
			});
		});

		it.each<[string, unknown]>([
			[
				'a call with both a path and a global',
				withSetup({ global: 'a', path: ['a', 'b'], type: 'callGlobal' }),
			],
			[
				'a call with a path and a method',
				withSetup({ method: 'b', path: ['a'], type: 'callGlobal' }),
			],
			[
				'a call with an empty path',
				withSetup({ path: [], type: 'callGlobal' }),
			],
			['a call with neither', withSetup({ type: 'callGlobal' })],
			[
				'a call with a non-string path',
				withSetup({ path: ['a', 1], type: 'callGlobal' }),
			],
			[
				'an http second script',
				withSetup(addon({ src: 'http://cdn.example/a.js' })),
			],
			['a second script without an id', withSetup(addon({ id: undefined }))],
			['a second script with a bad id', withSetup(addon({ id: '1addon' }))],
			[
				'a second script with an id attribute',
				withSetup(addon({ attributes: { id: 'other' } })),
			],
			[
				'a second script with an event handler',
				withSetup(addon({ attributes: { onload: 'x()' } })),
			],
			[
				'a second script with a string async',
				withSetup(addon({ async: 'no' })),
			],
			['an empty unlessGlobal', withSetup(addon({ unlessGlobal: [] }))],
			['a removeScript without an id', withSetup({ type: 'removeScript' })],
			[
				'an unknown queueFormat',
				withSetup({
					methods: ['a'],
					queueFormat: 'spread',
					target: 'q',
					type: 'defineQueueMethods',
				}),
			],
			[
				'consents with an unknown format',
				withSetup({
					args: [runtimeValue('consents', { format: 'yes', mapping: {} })],
					global: 'a',
					type: 'callGlobal',
				}),
			],
			[
				'consents mapping a name that is not a category',
				withSetup({
					args: [
						runtimeValue('consents', {
							format: 'boolean',
							mapping: { toString: ['a'] },
						}),
					],
					global: 'a',
					type: 'callGlobal',
				}),
			],
			[
				'hasConsent with a mapping',
				withSetup({
					args: [runtimeValue('hasConsent', { mapping: {} })],
					global: 'a',
					type: 'callGlobal',
				}),
			],
			['a target of footer', { ...withSetup(), target: 'footer' }],
			[
				'a string observeConsentBeforeLoad',
				{ ...withSetup(), observeConsentBeforeLoad: 'yes' },
			],
			[
				'a numeric persistAfterDispose',
				{ ...withSetup(), persistAfterDispose: 1 },
			],
			['an empty resourceKey', { ...withSetup(), resourceKey: '' }],
			[
				'onDisposeSteps that is not a list',
				{ ...withSetup(), onDisposeSteps: {} },
			],
			[
				'a second script inserted on dispose',
				{ ...withSetup(), onDisposeSteps: [addon()] },
			],
			[
				'a script id attribute that is not an id',
				{
					...withSetup(),
					loadScript: {
						...manifest().loadScript,
						attributes: { id: 'a b' },
					},
				},
			],
		])('refuses %s', (_label, input) => {
			expect(parseResolvedManifest(input).ok).toBe(false);
		});

		it.each(['eval', 'Function', 'setTimeout', 'setInterval', 'location'])(
			'refuses calling or constructing %s',
			(root) => {
				for (const step of [
					{ args: ['x'], global: root, type: 'callGlobal' },
					{ global: root, method: 'call', type: 'callGlobal' },
					{ global: 'window', method: root, type: 'callGlobal' },
					{ path: [root], type: 'callGlobal' },
					{ path: ['globalThis', 'self', root, 'assign'], type: 'callGlobal' },
					{ assignTo: 'x', constructor: root, type: 'constructGlobal' },
				]) {
					expect(
						parseResolvedManifest(withSetup(step)),
						JSON.stringify(step)
					).toEqual({ ok: false, reason: expect.stringContaining('calls') });
				}
			}
		);

		it.each([
			{ global: 'document', method: 'write', type: 'callGlobal' },
			{ path: ['document', 'writeln'], type: 'callGlobal' },
			{ path: ['window', 'document', 'write'], type: 'callGlobal' },
		])('refuses writing to the document with %j', (step) => {
			expect(parseResolvedManifest(withSetup(step)).ok).toBe(false);
		});

		it.each(
			[
				['document', 'location', 'assign'],
				['document', 'defaultView', 'eval'],
				['document', 'defaultView', 'setTimeout'],
				['document', 'body', 'insertAdjacentHTML'],
				['navigation', 'navigate'],
				['open'],
				['window', 'vendor', 'track'],
				['vendor', 'frame', 'opener', 'focus'],
				['vendor', 'ownerDocument', 'createElement'],
			].map((path) => [path])
		)('refuses a call path through browser objects: %j', (path) => {
			expect(
				parseResolvedManifest(withSetup({ path, type: 'callGlobal' }))
			).toEqual({ ok: false, reason: expect.stringContaining('calls') });
		});

		// A global a vendor names can be a window: an iframe's name puts its
		// window on this one. So a code name is refused at any depth.
		it.each([
			{ path: ['vendor', 'eval'], type: 'callGlobal' },
			{ global: 'vendor', method: 'setTimeout', type: 'callGlobal' },
			{ global: 'vendor', method: 'write', type: 'callGlobal' },
		])('refuses a code name under a vendor global: %j', (step) => {
			expect(parseResolvedManifest(withSetup(step)).ok).toBe(false);
		});

		it.each<Record<string, unknown>>([
			{ ifUndefined: false, name: 'location', type: 'setGlobal', value: '/' },
			{ path: ['location'], type: 'setGlobalPath', value: '/' },
			{ path: ['window', 'location'], type: 'setGlobalPath', value: '/' },
			{ path: ['top', 'location', 'href'], type: 'setGlobalPath', value: '/' },
			{ path: ['document', 'location'], type: 'setGlobalPath', value: '/' },
			{ assignTo: 'location', constructor: 'URL', type: 'constructGlobal' },
			{
				ifUndefined: false,
				name: 'location',
				queue: 'q',
				type: 'defineQueueFunction',
			},
			{
				aliases: ['location'],
				name: 'vendor',
				queue: { property: 'q' },
				type: 'defineStubFunction',
			},
			{
				methods: ['location'],
				queue: { global: 'q' },
				target: 'window',
				type: 'defineQueueMethods',
			},
			{
				methods: [{ behavior: 'noop', name: 'location' }],
				target: 'document',
				type: 'defineGlobalMethods',
			},
			{
				methods: [],
				name: 'location',
				target: 'window',
				type: 'defineQueueClass',
			},
			{ path: ['document', 'location', 'assign'], type: 'callGlobal' },
		])(
			'refuses a step that calls or writes location, at level 1: %j',
			(step) => {
				expect(
					parseResolvedManifest({ ...manifest(), setupSteps: [step] })
				).toEqual({
					ok: false,
					reason: expect.stringMatching(/calls|writes/u),
				});
			}
		);

		it('accepts calls on vendor objects', () => {
			expect(
				parseResolvedManifest(
					withSetup(
						{ path: ['vendor', 'queue', 'push'], type: 'callGlobal' },
						{ global: 'vendor', method: 'track', type: 'callGlobal' }
					)
				).ok
			).toBe(true);
		});

		// `document` is a platform global, which no manifest may declare.
		it.each([
			{ global: 'document', method: 'dispatchEvent', type: 'callGlobal' },
			{ path: ['document', 'dispatchEvent'], type: 'callGlobal' },
		])('refuses a document method: %j', (step) => {
			expect(parseResolvedManifest(withSetup(step))).toEqual({
				ok: false,
				reason: expect.stringContaining('names document'),
			});
		});
	});

	describe('writes', () => {
		const withBootstrap = (...steps: unknown[]) => {
			const input = { ...manifest(), bootstrapSteps: steps };
			return { ...input, globals: manifestRoots(input as never) };
		};
		const parse = (step: unknown) =>
			parseResolvedManifest(JSON.parse(JSON.stringify(withBootstrap(step))));
		const refusal = {
			ok: false,
			reason: expect.stringMatching(/writes|names/u),
		};
		// Built so the linter does not take it for a script URL in this file.
		const scriptUrl = ['javascript', 'alert(1)'].join(':');

		it.each([
			{
				ifUndefined: false,
				name: 'location',
				type: 'setGlobal',
				value: scriptUrl,
			},
			{
				path: ['document', 'body', 'innerHTML'],
				type: 'setGlobalPath',
				value: '<img src=x onerror=alert(1)>',
			},
			{
				path: ['location', 'href'],
				type: 'setGlobalPath',
				value: scriptUrl,
			},
		])('refuses a write to the page: %j', (step) => {
			expect(parse(step)).toEqual(refusal);
		});

		it.each([
			'location',
			'defaultView',
			'ownerDocument',
			'opener',
			'parent',
			'top',
			'frames',
			'self',
			'window',
			'globalThis',
			'navigation',
			'document',
			'innerHTML',
			'outerHTML',
			'srcdoc',
			'href',
			'src',
			'action',
			'formAction',
			'textContent',
			'onload',
			'onerror',
			'__proto__',
			'prototype',
			'constructor',
		])('refuses %s in any name a step writes', (name) => {
			const steps: unknown[] = [
				{ name, type: 'setGlobal', value: 'x' },
				{ path: ['vendor', name], type: 'setGlobalPath', value: 'x' },
				{ assignTo: name, constructor: 'Vendor', type: 'constructGlobal' },
				{
					assignTo: 'vendor',
					constructor: 'Vendor',
					copyAssignedValueToArgProperty: name,
					type: 'constructGlobal',
				},
				{ name, queue: 'q', type: 'defineQueueFunction' },
				{ name, queue: { global: 'q' }, type: 'defineStubFunction' },
				{
					aliases: [name],
					name: 'vendor',
					queue: { global: 'q' },
					type: 'defineStubFunction',
				},
				{
					name: 'vendor',
					queue: { property: name },
					type: 'defineStubFunction',
				},
				{
					name: 'vendor',
					queue: { global: 'q' },
					selfReferences: [name],
					type: 'defineStubFunction',
				},
				{
					name: 'vendor',
					properties: { [name]: 'x' },
					queue: { global: 'q' },
					type: 'defineStubFunction',
				},
				{ name, queue: 'q', type: 'defineQueueProxy' },
				{ name: 'vendor', queue: name, type: 'defineQueueProxy' },
				{ methods: ['track'], target: name, type: 'defineQueueMethods' },
				{ methods: [name], target: 'vendor', type: 'defineQueueMethods' },
				{
					methods: ['track'],
					name: 'Q',
					target: name,
					type: 'defineQueueClass',
				},
				{
					methods: ['track'],
					name,
					target: 'vendor',
					type: 'defineQueueClass',
				},
				{
					methods: [name],
					name: 'Q',
					target: 'vendor',
					type: 'defineQueueClass',
				},
				{
					methods: ['track'],
					name: 'Q',
					queueProperty: name,
					target: 'vendor',
					type: 'defineQueueClass',
				},
				{
					methods: [{ behavior: 'noop', name: 'track' }],
					target: name,
					type: 'defineGlobalMethods',
				},
				{
					methods: [{ behavior: 'noop', name }],
					target: 'vendor',
					type: 'defineGlobalMethods',
				},
			];

			expect(steps.map(parse)).toEqual(steps.map(() => refusal));
		});

		// A runtime looks a name up as a property key, so a list of one name
		// reaches the same property as the name.
		it('refuses a name wrapped in a list', () => {
			expect(
				parse({ name: ['location'], type: 'setGlobal', value: 'x' })
			).toEqual(refusal);
			expect(
				parse({
					path: [['location'], 'href'],
					type: 'setGlobalPath',
					value: 'x',
				})
			).toEqual(refusal);
			expect(
				parseResolvedManifest(
					withBootstrap({
						global: ['location'],
						method: 'assign',
						type: 'callGlobal',
					})
				).ok
			).toBe(false);
			expect(
				parseResolvedManifest(
					withBootstrap({
						path: [['document'], 'body', 'setHTMLUnsafe'],
						type: 'callGlobal',
					})
				).ok
			).toBe(false);
		});

		it('accepts the emitter methods vendors queue, which are not handlers', () => {
			expect(
				parseResolvedManifest(
					withBootstrap(
						{
							methods: ['on', 'once', 'off', 'onReady'],
							target: 'vendor',
							type: 'defineQueueMethods',
						},
						{
							path: ['vendor', 'config', 'debug'],
							type: 'setGlobalPath',
							value: true,
						}
					)
				).ok
			).toBe(true);
		});
	});
});
