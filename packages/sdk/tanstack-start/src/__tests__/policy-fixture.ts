import type { KernelConfig, ConsentState } from '@c15t/core';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
} from '@c15t/schema/types';
import type { PolicyRule } from '@c15t/schema/types';

/**
 * Prepared public policy and receipts for adapter tests, with the backend
 * URL `createConsentStateHandler()` puts on the state.
 */
export const policyFixture = (
	values: Partial<ConsentState> = {},
	rule: Partial<PolicyRule> = {},
	at: number = Date.now()
): KernelConfig & { projectUrl: string } => {
	const policy = normalizePolicyRule({
		id: 'react-test',
		match: { fallback: true },
		model: 'opt-in',
		prompt: 'choice',
		...rule,
	});
	const fingerprints = createPolicyRuleFingerprints(policy);
	const now = at;
	const entries = Object.entries(values).filter(
		([category]) => category !== 'necessary'
	);
	return {
		initialPolicyResolution: {
			fingerprints,
			matchedBy: 'fallback',
			policy,
			policyId: policy.id,
			status: 'matched',
		},
		initialRecords: entries.length
			? {
					choice: {
						categories: Object.fromEntries(
							entries.map(([category, value]) => [
								category,
								{
									basis: {
										fingerprint: fingerprints.choice,
										kind: 'choice-v1',
									},
									confirmedAt: now,
									value,
								},
							])
						),
						version: 3,
					},
				}
			: undefined,
		now,
		projectUrl: '/api/c15t',
	};
};
