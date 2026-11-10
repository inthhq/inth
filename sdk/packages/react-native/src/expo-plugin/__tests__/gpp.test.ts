import { join } from 'node:path';

import { AndroidConfig } from '@expo/config-plugins';
import { describe, expect, it } from 'vitest';

import { applyAndroidManifest } from '../android';
import {
	ANDROID_GPP_META_KEYS,
	ANDROID_META,
	IOS_GPP_PLIST_KEYS,
	IOS_PLIST_KEY,
} from '../constants';
import { C15tPluginError } from '../errors';
import { applyInfoPlist } from '../ios';
import { resolveParams } from '../params';
import { FIXTURE_DIR } from './helpers';

const backendURL = 'https://demo.example.test';

const metaData = async function metaData(
	params: ReturnType<typeof resolveParams>[]
): Promise<Record<string, string>> {
	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	for (const each of params) {
		applyAndroidManifest(each, manifest);
	}
	const application =
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
	return Object.fromEntries(
		(application['meta-data'] ?? []).map((item) => [
			item.$['android:name'],
			item.$['android:value'] ?? '',
		])
	);
};

describe('the gpp option', () => {
	it('writes nothing while GPP is off', async () => {
		const params = resolveParams({ backendURL });
		expect(params.gpp).toBeNull();
		const plist = applyInfoPlist(params, {});
		for (const key of IOS_GPP_PLIST_KEYS) {
			expect(plist).not.toHaveProperty(key);
		}
		const meta = await metaData([params]);
		for (const key of ANDROID_GPP_META_KEYS) {
			expect(meta).not.toHaveProperty(key);
		}
	});

	it('true writes only the switch, so both cores keep their defaults', async () => {
		const params = resolveParams({ backendURL, gpp: true });
		const plist = applyInfoPlist(params, {});
		expect(plist[IOS_PLIST_KEY.gpp]).toBe(true);
		expect(plist).not.toHaveProperty(IOS_PLIST_KEY.gppMspaMode);
		expect(plist).not.toHaveProperty(IOS_PLIST_KEY.gppOptOutCategories);
		expect(plist).not.toHaveProperty(IOS_PLIST_KEY.gppTCF);
		const meta = await metaData([params]);
		expect(meta[ANDROID_META.gpp]).toBe('true');
		expect(meta).not.toHaveProperty(ANDROID_META.gppMspaMode);
	});

	it('writes every option in the shape each reader parses', async () => {
		const params = resolveParams({
			backendURL,
			gpp: {
				mspaMode: 'service-provider',
				optOutCategories: ['marketing', 'measurement'],
				tcf: false,
			},
		});
		const plist = applyInfoPlist(params, {});
		expect(plist[IOS_PLIST_KEY.gppMspaMode]).toBe('service-provider');
		expect(plist[IOS_PLIST_KEY.gppOptOutCategories]).toEqual([
			'marketing',
			'measurement',
		]);
		expect(plist[IOS_PLIST_KEY.gppTCF]).toBe(false);
		const meta = await metaData([params]);
		expect(meta[ANDROID_META.gppMspaMode]).toBe('service-provider');
		expect(meta[ANDROID_META.gppOptOutCategories]).toBe(
			'marketing,measurement'
		);
		expect(meta[ANDROID_META.gppTcf]).toBe('false');
	});

	it('removing gpp on incremental prebuild clears every GPP key', async () => {
		const on = resolveParams({
			backendURL,
			gpp: { mspaMode: 'opt-out-option', tcf: false },
		});
		const off = resolveParams({ backendURL });
		const plist = applyInfoPlist(off, applyInfoPlist(on, {}));
		for (const key of IOS_GPP_PLIST_KEYS) {
			expect(plist).not.toHaveProperty(key);
		}
		const meta = await metaData([on, off]);
		for (const key of ANDROID_GPP_META_KEYS) {
			expect(meta).not.toHaveProperty(key);
		}
	});

	it('refuses an MSPA mode neither core names', () => {
		expect(() =>
			resolveParams({
				backendURL,
				// @ts-expect-error -- the value app.json would carry
				gpp: { mspaMode: 'signatory' },
			})
		).toThrow(C15tPluginError);
	});
});
