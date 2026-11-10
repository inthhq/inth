import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AndroidConfig } from '@expo/config-plugins';
import { describe, expect, it } from 'vitest';

import { applyAndroidManifest } from '../android';
import { ANDROID_META, IOS_PLIST_KEY } from '../constants';
import { applyInfoPlist } from '../ios';
import { resolveParams } from '../params';
import type { C15tPolicyRule } from '../params';
import {
	androidPolicyRulesDestination,
	POLICY_RULES_NAME,
	writePolicyRules,
} from '../policy-resource';
import { FIXTURE_DIR, OFFLINE, OFFLINE_POLICY } from './helpers';

const fallback: C15tPolicyRule = {
	id: 'everywhere',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
};

describe('the in-code policy for no-backend mode', () => {
	it('is required in offline mode and refused in backend modes', () => {
		expect(() => resolveParams({ mode: 'offline' })).toThrow(
			/mode 'offline' needs policy/u
		);
		expect(() =>
			resolveParams({
				backendURL: 'https://consent.example.com',
				policy: OFFLINE_POLICY,
			})
		).toThrow(/policy is for mode 'offline'/u);
		expect(resolveParams(OFFLINE).policyRules).toEqual(OFFLINE_POLICY.rules);
	});

	it('refuses rules the cores would refuse at launch', () => {
		const refused = (rules: unknown[], message: RegExp) =>
			expect(() =>
				resolveParams({ mode: 'offline', policy: { rules } as never })
			).toThrow(message);
		refused([], /non-empty rules array/u);
		refused([fallback, fallback], /unique/u);
		refused([{ ...fallback, model: 'iab' }], /needs a backend to serve/u);
		refused([{ ...fallback, prompt: 'notice' }], /cannot use a "notice"/u);
		refused(
			[{ ...fallback, rights: ['opt-out'] }],
			/unsupported fields: rights/u
		);
		refused(
			[{ ...fallback, match: { countries: ['DE'] } }],
			/match.fallback or match.isDefault/u
		);
	});

	it('names the rules file on both platforms and removes the keys when the mode changes', async () => {
		const offline = resolveParams(OFFLINE);
		const backend = resolveParams({
			backendURL: 'https://consent.example.com',
		});
		const plist = applyInfoPlist(offline, {});
		expect(plist[IOS_PLIST_KEY.policyRules]).toBe(POLICY_RULES_NAME);
		expect(applyInfoPlist(backend, plist)[IOS_PLIST_KEY.policyRules]).toBe(
			undefined
		);

		const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
			join(FIXTURE_DIR, 'AndroidManifest.xml')
		);
		const value = () =>
			AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)[
				'meta-data'
			]?.find((item) => item.$['android:name'] === ANDROID_META.policyRules)?.$[
				'android:value'
			];
		applyAndroidManifest(offline, manifest);
		expect(value()).toBe(POLICY_RULES_NAME);
		applyAndroidManifest(backend, manifest);
		expect(value()).toBeUndefined();
	});

	it('writes the rules in the shape both cores read', async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-policy-rules-'));
		try {
			const destination = androidPolicyRulesDestination(root);
			await writePolicyRules(destination, OFFLINE_POLICY.rules);
			expect(JSON.parse(await readFile(destination, 'utf8'))).toEqual({
				rules: OFFLINE_POLICY.rules,
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
