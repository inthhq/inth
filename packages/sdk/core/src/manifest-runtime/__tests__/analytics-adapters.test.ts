/**
 * @vitest-environment jsdom
 *
 * The analytics adapters' option checks, as a runtime from `withAdapters`
 * runs them. Their consent behaviour is held to the npm helpers' golden
 * traces in `@inth/integrations`.
 */
import { describe, expect, it } from 'vite-plus/test';

import type { RemoteManifestRuntime } from '../../modules/script-loader/types';
import * as gainsightPx from '../adapters/gainsight-px';
import { importAdapter } from '../adapters/index';
import * as luckyOrange from '../adapters/lucky-orange';
import * as runtime from '../index';

/** A manifest as the Inth server sends one that names `adapter`. */
const manifestNaming = (adapter: unknown, vendor: string) => ({
	adapter,
	afterLoadSteps: [],
	bootstrapSteps: [],
	category: 'measurement',
	globals: [],
	kind: 'inth.vendor-manifest',
	loadScript: {
		async: true,
		src: `https://${vendor}.example/file.js`,
		type: 'loadScript',
	},
	onBeforeLoadDeniedSteps: [],
	onBeforeLoadGrantedSteps: [],
	onConsentChangeSteps: [],
	onConsentDeniedSteps: [],
	onConsentGrantedSteps: [],
	onLoadDeniedSteps: [],
	onLoadGrantedSteps: [],
	requires: 4,
	schemaVersion: 1,
	setupSteps: [],
	vendor,
});

const adapterRuntime = async (
	manifests: readonly unknown[]
): Promise<RemoteManifestRuntime> => {
	const adapted = runtime.withAdapters(
		{
			parseResolvedManifest: runtime.parseResolvedManifest,
			resolvedManifestToScript: runtime.resolvedManifestToScript,
		},
		importAdapter
	);
	await adapted.prepare?.(manifests);
	return adapted;
};

const reasonFor = async (id: string, options: unknown, vendor: string) => {
	const manifest = manifestNaming({ id, options }, vendor);
	const parsed = (await adapterRuntime([manifest])).parseResolvedManifest(
		manifest
	);
	return parsed.ok ? undefined : parsed.reason;
};

describe('the Lucky Orange adapter', () => {
	it('takes no options', async () => {
		expect(await reasonFor('lucky-orange', {}, 'lucky-orange')).toBeUndefined();
		expect(
			await reasonFor('lucky-orange', { siteId: 'abc' }, 'lucky-orange')
		).toBe(
			'its lucky-orange adapter options are wrong: it has the unknown option siteId'
		);
	});

	it('leaves the script to the browser', () => {
		const script = luckyOrange.luckyOrangeScript({
			category: 'measurement',
			id: 'lucky-orange',
			serverStart: () => undefined,
			src: 'https://tools.luckyorange.com/core/lo.js?site-id=a',
		});

		expect(script.serverStart).toBeUndefined();
		expect(script.src).toBe(
			'https://tools.luckyorange.com/core/lo.js?site-id=a'
		);
	});
});

describe('the Gainsight PX adapter', () => {
	it('takes a product key and nothing else', async () => {
		expect(
			await reasonFor(
				'gainsight-px',
				{ productKey: 'AP-KEY-2' },
				'gainsight-px'
			)
		).toBeUndefined();
		expect(
			await reasonFor(
				'gainsight-px',
				{ config: {}, productKey: 'AP-KEY-2' },
				'gainsight-px'
			)
		).toBe(
			'its gainsight-px adapter options are wrong: it has the unknown option config'
		);
		expect(
			await reasonFor('gainsight-px', { productKey: 'AP/../x' }, 'gainsight-px')
		).toBe(
			'its gainsight-px adapter options are wrong: its productKey is not a product key'
		);
	});

	it('refuses to start once another PX installation has started', () => {
		const script = gainsightPx.gainsightPxScript(
			{ category: 'measurement', id: 'gainsight-px' },
			{ productKey: 'AP-KEY-2' }
		);
		Reflect.set(
			window,
			'aptrinsic',
			Object.assign(() => undefined, { __sdkBundleStarted: true })
		);
		try {
			expect(() => script.validate?.(script)).toThrow(
				/another Gainsight PX installation/u
			);
			expect(script.callbackOnly).toBeTypeOf('function');
			expect(script.serverStart).toBeUndefined();
		} finally {
			Reflect.deleteProperty(window, 'aptrinsic');
		}
	});
});
