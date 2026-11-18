import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import type { PolicyRule } from '@inth/sdk/schema/types';

export const testRule: PolicyRule = {
	categories: ['marketing', 'measurement'],
	id: 'test',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
};
export const testResolution = (overrides: Partial<PolicyRule> = {}) =>
	resolvePolicyRules({
		countryCode: null,
		regionCode: null,
		rules: [{ ...testRule, ...overrides }],
	});
export const testWire = (overrides: Partial<PolicyRule> = {}) =>
	writePolicyResolutionWire(testResolution(overrides));
