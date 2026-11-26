/**
 * @vitest-environment jsdom
 *
 * The Default adapter as a manifest from the Inth server names it.
 */
import { describe, expect, it } from 'vite-plus/test';

import { importAdapter } from '../adapters/index';
import * as runtime from '../index';

const pixel = (overrides: Record<string, unknown> = {}) => ({
	loadMode: 'after-consent',
	product: 'pixel',
	publicKey: 'public-key',
	...overrides,
});

const manifest = (adapterOptions: unknown = pixel()) => ({
	adapter: { id: 'default-com', options: adapterOptions },
	afterLoadSteps: [],
	bootstrapSteps: [],
	category: 'measurement',
	globals: [],
	kind: 'inth.vendor-manifest',
	loadScript: {
		async: true,
		src: 'https://handshake.default.com/index.js',
		type: 'loadScript',
	},
	onBeforeLoadDeniedSteps: [],
	onBeforeLoadGrantedSteps: [],
	onConsentChangeSteps: [],
	onConsentDeniedSteps: [],
	onConsentGrantedSteps: [],
	onLoadDeniedSteps: [],
	onLoadGrantedSteps: [],
	persistAfterConsentRevoked: true,
	requires: 4,
	schemaVersion: 1,
	setupSteps: [],
	vendor: 'default-com',
});

const adapted = async () => {
	const sdk = runtime.withAdapters(
		{
			parseResolvedManifest: runtime.parseResolvedManifest,
			resolvedManifestToScript: runtime.resolvedManifestToScript,
		},
		importAdapter
	);
	await sdk.prepare?.([manifest()]);
	return sdk;
};

const build = async (options: unknown) => {
	const sdk = await adapted();
	const parsed = sdk.parseResolvedManifest(manifest(options));
	if (!parsed.ok) {
		throw new Error(parsed.reason);
	}
	return sdk.resolvedManifestToScript(parsed.manifest);
};

describe('the Default adapter', () => {
	it.each([
		[pixel({ product: 'chat' }), 'its product is not pixel or forms'],
		[
			pixel({ endpoint: 'https://evil.example' }),
			'it has the unknown pixel option endpoint',
		],
		[
			{ loadMode: 'always', product: 'forms', publicKey: 'public-key' },
			'it has the unknown forms option loadMode',
		],
		[pixel({ publicKey: 'a/b' }), 'its publicKey is not a public key'],
		[
			pixel({ loadMode: 'never' }),
			'its loadMode is not after-consent or always',
		],
		[
			pixel({ schedulerOrigins: ['http://example.com'] }),
			'its schedulerOrigins is not a list of https origins',
		],
		[
			pixel({ schedulerOrigins: ['https://example.com/path'] }),
			'its schedulerOrigins is not a list of https origins',
		],
		[
			pixel({ autoDisplayScheduler: { target: '#x' } }),
			'its autoDisplayScheduler is not a boolean',
		],
	])('refuses %j', async (value, reason) => {
		const sdk = await adapted();

		expect(sdk.parseResolvedManifest(manifest(value))).toEqual({
			ok: false,
			reason: `its default-com adapter options are wrong: ${reason}`,
		});
	});

	it('builds the Pixel or the Forms SDK by product', async () => {
		const forms = await build({ product: 'forms', publicKey: 'public-key' });
		const pixelScript = await build(pixel({ loadMode: 'always' }));

		expect(forms.id).toBe('default-com-forms-sdk');
		expect(forms.validate).toBeUndefined();
		expect(pixelScript.id).toBe('default-com');
		expect(pixelScript.alwaysLoad).toBe(true);
		expect(pixelScript.validate).toBeTypeOf('function');
		expect(pixelScript.serverStart).toBeUndefined();
	});
});
