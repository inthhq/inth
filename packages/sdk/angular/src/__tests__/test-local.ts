import type { PolicyRule } from '@inth/sdk/schema/types';

import { offlineMode } from './fixtures/transport-mode';

/**
 * Opt-in choice rule matching every visitor. Tests use it so a policy is
 * resolved; without one, no Inth consent surface renders.
 */
export const TEST_OPT_IN_RULE: PolicyRule = {
	id: 'test-opt-in',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
};

/** Local mode with the shared opt-in rule. */
export const testLocal = () => offlineMode([TEST_OPT_IN_RULE]);

/** Wait for the runtime's init and the scheduler to settle. */
export const settle = async (ms = 0) => {
	// oxlint-disable-next-line promise/avoid-new -- A timer is the settle point.
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
};

/** Every category, as the stock surfaces offer them. */
export const ALL_CATEGORIES = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const;

/** Provider options for tests: the opt-in rule, every category, no storage. */
export const testOptions = () => ({
	consentCategories: [...ALL_CATEGORIES],
	mode: testLocal(),
	persistence: false as const,
});
