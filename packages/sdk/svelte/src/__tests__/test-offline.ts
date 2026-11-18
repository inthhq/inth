import type { PolicyRule } from '@inth/sdk/schema/types';

import { offlineMode } from './fixtures/transport-mode';

/**
 * Opt-in choice rule matching every visitor. Component tests mount it so a
 * policy is resolved; without one, no c15t consent surface renders.
 */
export const TEST_OPT_IN_RULE: PolicyRule = {
	id: 'test-opt-in',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
};

/** A transport with the shared opt-in rule, for tests that render surfaces. */
export const testOffline = () => offlineMode([TEST_OPT_IN_RULE]);
