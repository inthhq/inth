import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { AndroidConfig } from 'expo/config-plugins';
import { describe, expect, it } from 'vite-plus/test';

import { applyAndroidManifest } from '../apply-android-manifest';
import { applyInfoPlist } from '../apply-info-plist';
import { ANDROID_META, IOS_PLIST_KEY } from '../constants';
import {
	androidPolicyRulesDestination,
	POLICY_RULES_NAME,
	writePolicyRules,
} from '../embed-policy-resource';
import { InthPluginError } from '../inth-plugin-error';
import { resolveParams } from '../params';
import type { InCodePolicyRule } from '../params';
import { FIXTURE_DIR, WITH_POLICY, IN_CODE_POLICY } from './helpers';

const BACKEND = 'https://acme.inth.app';

const fallback: InCodePolicyRule = {
	id: 'everywhere',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
};

const parity = JSON.parse(
	readFileSync(
		resolve(
			import.meta.dirname,
			'../../../../native-protocol/local-policy/parity.json'
		),
		'utf8'
	)
) as {
	rules: InCodePolicyRule[];
	invalid: { name: string; rules: unknown }[];
	accepted: { name: string; rules: unknown[] }[];
};

describe('prebuild refuses what the native cores refuse', () => {
	it('accepts the shared rules, including fractional validity days', () => {
		expect(
			resolveParams({ policy: { rules: parity.rules }, projectUrl: BACKEND })
				.policyRules
		).toEqual(parity.rules);
	});

	it('refuses every policy the backend or the device refuses', () => {
		const accepted = parity.invalid.filter(({ rules }) => {
			try {
				resolveParams({ policy: { rules } as never, projectUrl: BACKEND });
				return true;
			} catch (error) {
				return !(error instanceof InthPluginError);
			}
		});
		expect(accepted.map(({ name }) => name)).toEqual([]);
	});

	it('accepts every policy the backend accepts', () => {
		const refused = parity.accepted.filter(({ rules }) => {
			try {
				resolveParams({ policy: { rules } as never, projectUrl: BACKEND });
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
					policy: { rules: [{ ...fallback, ...extra }] as never },
					projectUrl: BACKEND,
				})
			).toThrow(/unknown category "\*"/u);
		}
		expect(
			resolveParams({
				policy: { rules: [{ ...fallback, categories: ['*'] }] },
				projectUrl: BACKEND,
			}).policyRules
		).toHaveLength(1);
	});

	it('names the missing scopeMode for a partial scope', () => {
		expect(() =>
			resolveParams({
				policy: { rules: [{ ...fallback, categories: ['measurement'] }] },
				projectUrl: BACKEND,
			})
		).toThrow(/needs scopeMode/u);
	});
});

describe('the in-code policy', () => {
	it('works with projectUrl, and with dryRun', () => {
		expect(resolveParams(WITH_POLICY)).toMatchObject({
			policyRules: IN_CODE_POLICY.rules,
			projectUrl: BACKEND,
		});
		expect(resolveParams({ ...WITH_POLICY, dryRun: true }).policyRules).toEqual(
			IN_CODE_POLICY.rules
		);
		expect(resolveParams({ projectUrl: BACKEND }).policyRules).toBeNull();
	});

	it('still needs projectUrl, because records are sent there', () => {
		expect(() => resolveParams({ policy: IN_CODE_POLICY } as never)).toThrow(
			/projectUrl is required/u
		);
	});

	it('refuses a bundled manifest and IAB, which come from /init', () => {
		for (const [name, props] of [
			['policyResource', { policyResource: 'inth-policy.json' }],
			['bundleManifest', { bundleManifest: true }],
			[
				'iab',
				{ iab: { cmpId: 1234, cmpVersion: 7, publisherCountryCode: 'DE' } },
			],
		] as const) {
			expect(() => resolveParams({ ...WITH_POLICY, ...props })).toThrow(
				new RegExp(`policy cannot be combined with ${name}`, 'u')
			);
		}
	});

	it('refuses rules the cores would refuse at launch', () => {
		const refused = (rules: unknown[], message: RegExp) =>
			expect(() =>
				resolveParams({ policy: { rules } as never, projectUrl: BACKEND })
			).toThrow(message);
		refused([], /non-empty rules array/u);
		refused([fallback, fallback], /unique/u);
		refused([{ ...fallback, model: 'iab' }], /needs the vendor list/u);
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

	it('names the rules file on both platforms and removes the keys when policy is removed', async () => {
		const inCode = resolveParams(WITH_POLICY);
		const fetched = resolveParams({ projectUrl: BACKEND });
		const plist = applyInfoPlist(inCode, {});
		expect(plist[IOS_PLIST_KEY.policyRules]).toBe(POLICY_RULES_NAME);
		// The rules sit beside the project URL: records still go to Inth.
		expect(plist[IOS_PLIST_KEY.projectUrl]).toBe(BACKEND);
		expect(applyInfoPlist(fetched, plist)[IOS_PLIST_KEY.policyRules]).toBe(
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
		applyAndroidManifest(inCode, manifest);
		expect(value()).toBe(POLICY_RULES_NAME);
		applyAndroidManifest(fetched, manifest);
		expect(value()).toBeUndefined();
	});

	it('writes the rules in the shape both cores read', async () => {
		const root = await mkdtemp(join(tmpdir(), 'inth-policy-rules-'));
		try {
			const destination = androidPolicyRulesDestination(root);
			await writePolicyRules(destination, IN_CODE_POLICY.rules);
			expect(JSON.parse(await readFile(destination, 'utf8'))).toEqual({
				rules: IN_CODE_POLICY.rules,
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
