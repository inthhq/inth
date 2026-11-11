import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { AndroidConfig } from '@expo/config-plugins';
import { describe, expect, it } from 'vitest';

import { applyAndroidManifest } from '../android';
import { ANDROID_META, IOS_PLIST_KEY } from '../constants';
import { C15tPluginError } from '../errors';
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

const parity = JSON.parse(
	readFileSync(
		resolve(
			import.meta.dirname,
			'../../../../../native/protocol/local-policy/parity.json'
		),
		'utf8'
	)
) as {
	rules: C15tPolicyRule[];
	invalid: { name: string; rules: unknown }[];
	accepted: { name: string; rules: unknown[] }[];
};

describe('prebuild refuses what the native cores refuse', () => {
	it('accepts the shared rules, including fractional validity days', () => {
		expect(
			resolveParams({ mode: 'offline', policy: { rules: parity.rules } })
				.policyRules
		).toEqual(parity.rules);
	});

	it('refuses every policy the backend or no-backend mode refuses', () => {
		const accepted = parity.invalid.filter(({ rules }) => {
			try {
				resolveParams({ mode: 'offline', policy: { rules } as never });
				return true;
			} catch (error) {
				return !(error instanceof C15tPluginError);
			}
		});
		expect(accepted.map(({ name }) => name)).toEqual([]);
	});

	it('accepts every policy the backend accepts', () => {
		const refused = parity.accepted.filter(({ rules }) => {
			try {
				resolveParams({ mode: 'offline', policy: { rules } as never });
				return false;
			} catch {
				return true;
			}
		});
		expect(refused.map(({ name }) => name)).toEqual([]);
	});

	it('takes the wildcard only in categories', () => {
		for (const extra of [
			{ preselectedCategories: ['*'] },
			{ privacySignals: { gpc: { denyCategories: ['*'] } } },
		]) {
			expect(() =>
				resolveParams({
					mode: 'offline',
					policy: { rules: [{ ...fallback, ...extra }] as never },
				})
			).toThrow(/unknown category "\*"/u);
		}
		expect(
			resolveParams({
				mode: 'offline',
				policy: { rules: [{ ...fallback, categories: ['*'] }] },
			}).policyRules
		).toHaveLength(1);
	});

	it('names the missing scopeMode for a partial scope', () => {
		expect(() =>
			resolveParams({
				mode: 'offline',
				policy: { rules: [{ ...fallback, categories: ['measurement'] }] },
			})
		).toThrow(/needs scopeMode/u);
	});
});

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
