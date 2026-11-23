/**
 * The offline rules the Privacy Choices stories resolve, one per regime,
 * the same rules React's Privacy Choices stories use. Built from the
 * shared story policy, which the caller passes in: the prerender plugin
 * loads it through Vite, the stories import it directly.
 */

import type { PolicyRule } from '../../../packages/sdk/schema/src/types';
import type { PrivacyChoicesRegion } from './story-variants';

const US_GPC = { gpc: { denyCategories: ['marketing', 'measurement'] } };
const US_RIGHTS: PolicyRule['rights'] = [
	'disclosure',
	'preferences',
	'opt-out',
];

/**
 * The rule for one regime.
 *
 * @param base - The shared story policy (`storybookPolicy`).
 * @param region - The regime the story shows.
 * @param dialog - The dialog stories' rules, whose US opt-in rule also
 * carries the US rights, as React's dialog stories set it.
 */
export const privacyChoicesPolicy = function privacyChoicesPolicy(
	base: PolicyRule,
	region: PrivacyChoicesRegion,
	dialog = false
): PolicyRule {
	const prefix = dialog
		? 'storybook-privacy-choices-dialog'
		: 'storybook-privacy-choices';
	switch (region) {
		case 'us-notice':
			return {
				...base,
				id: `${prefix}-us-notice`,
				model: 'opt-out',
				privacySignals: US_GPC,
				prompt: 'notice',
				rights: US_RIGHTS,
			};
		case 'us-opt-in': {
			const rule: PolicyRule = {
				...base,
				id: `${prefix}-us-opt-in`,
				privacySignals: US_GPC,
			};
			if (dialog) {
				rule.rights = US_RIGHTS;
			}
			return rule;
		}
		case 'us-opt-out':
			return {
				...base,
				id: `${prefix}-us-opt-out`,
				model: 'opt-out',
				privacySignals: US_GPC,
				prompt: 'none',
				rights: US_RIGHTS,
			};
		default:
			return { ...base, id: `${prefix}-eu` };
	}
};
