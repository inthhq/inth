import { describe, expect, it } from 'vite-plus/test';

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
			'a non-string attribute',
			{
				...manifest(),
				loadScript: { ...manifest().loadScript, attributes: { a: 1 } },
			},
		],
	])('rejects %s', (_label, input) => {
		expect(parseResolvedManifest(input).ok).toBe(false);
	});

	it('accepts a manifest with no script to load', () => {
		const { loadScript: _loadScript, ...callbackOnly } = manifest();

		expect(parseResolvedManifest(callbackOnly).ok).toBe(true);
	});
});
