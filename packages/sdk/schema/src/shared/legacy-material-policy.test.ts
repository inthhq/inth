import { assert, describe, expect, test } from 'vitest';

import { createConsentManifestPolicyPack } from './consent-manifest';
import { createMaterialPolicyFingerprintSync } from './policy-fingerprint';
import { resolvePolicyRules } from './policy-resolution';
import { policyRulePresets } from './policy-rule-presets';

// The California presets are not here: narrowing their GPC mapping to
// marketing (DEF-09) changed their behavior, so their v2 receipts now report
// `policy-changed` (see `policy-rule-presets.test.ts`).
const originalHashes = {
	europeIab: 'e86078b4e8a0972035eda14a9b1b3afa592ddb12e8a40a42bb1b332091c6dff5',
	europeOptIn:
		'7d6f3c71d9c6c6dae0730bd6cfec93f79dbdee423f854ae0efd43e974b657230',
	quebecOptIn:
		'7d6f3c71d9c6c6dae0730bd6cfec93f79dbdee423f854ae0efd43e974b657230',
	worldOptOutNoPrompt:
		'3962d294c9537de285a4af031cc3123c463f6e97b4cb97ac60ac97930b025a94',
} as const;
describe('lifetime v2 material receipt compatibility', () => {
	test.each(Object.keys(originalHashes) as (keyof typeof originalHashes)[])(
		'%s matches original producer bytes in manifest and offline paths',
		(name) => {
			const rule = policyRulePresets[name]();
			expect(
				createConsentManifestPolicyPack(rule).fingerprints.legacyMaterial
			).toBe(originalHashes[name]);
			const resolved = resolvePolicyRules({
				countryCode: null,
				regionCode: null,
				rules: [{ ...rule, match: { isDefault: true } }],
			});
			expect(resolved).toMatchObject({
				fingerprints: { legacyMaterial: originalHashes[name] },
				status: 'matched',
			});
		}
	);
	test('keeps original array order and presentation hash fields', () => {
		const original = policyRulePresets.europeOptIn().legacyMaterial?.input;
		assert(original);
		const changed = structuredClone(original);
		assert(changed.ui?.banner);
		changed.ui.banner.direction = 'column';
		expect(createMaterialPolicyFingerprintSync(changed)).not.toBe(
			createMaterialPolicyFingerprintSync(original)
		);
	});
	test('a material change invalidates legacy compatibility even when a preset is spread', () => {
		const original = policyRulePresets.europeOptIn();
		const changed = { ...original, validity: { choiceDays: 30 } };
		expect(
			createConsentManifestPolicyPack(changed).fingerprints.legacyMaterial
		).not.toBe(originalHashes.europeOptIn);
	});
	test.each([
		{ input: {}, policyFingerprint: 'test' },
		{
			input: { consent: { gpc: 'yes' }, model: 'opt-in' },
			policyFingerprint: 'test',
		},
		{
			input: { model: 'opt-in', ui: { banner: { layout: [123] } } },
			policyFingerprint: 'test',
		},
		{
			input: { model: 'opt-in', proof: { storeIp: 'yes' } },
			policyFingerprint: 'test',
		},
		{ input: { model: 'opt-in' }, policyFingerprint: 12 },
	])('rejects malformed frozen metadata %#', (legacyMaterial) => {
		expect(
			resolvePolicyRules({
				countryCode: 'DE',
				regionCode: null,
				rules: [{ ...policyRulePresets.europeOptIn(), legacyMaterial }],
			})
		).toMatchObject({ reason: 'invalid-configuration', status: 'failed' });
	});
});
