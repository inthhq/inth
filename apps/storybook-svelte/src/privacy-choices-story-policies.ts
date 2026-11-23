/**
 * The offline rules the Privacy Choices stories resolve, one per first
 * layer (§2), with the same ids as React's stories.
 */
import type { PolicyRule } from '../../../packages/sdk/schema/src/types';
import { storybookPolicy } from '../../storybook-consent-policy';

export type PrivacyChoicesRegion =
	| 'eu'
	| 'us-opt-in'
	| 'us-notice'
	| 'us-opt-out';

const US_GPC = { gpc: { denyCategories: ['marketing', 'measurement'] } };
const US_RIGHTS: PolicyRule['rights'] = [
	'disclosure',
	'preferences',
	'opt-out',
];

/** The banner stories' rules. */
export const BANNER_POLICIES: Record<
	Exclude<PrivacyChoicesRegion, 'us-opt-out'>,
	PolicyRule
> = {
	eu: { ...storybookPolicy, id: 'storybook-privacy-choices-eu' },
	'us-notice': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-us-notice',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'notice',
		rights: US_RIGHTS,
	},
	'us-opt-in': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-us-opt-in',
		privacySignals: US_GPC,
	},
};

/** The dialog stories' rules. */
export const DIALOG_POLICIES: Record<PrivacyChoicesRegion, PolicyRule> = {
	eu: { ...storybookPolicy, id: 'storybook-privacy-choices-dialog-eu' },
	'us-notice': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-notice',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'notice',
		rights: US_RIGHTS,
	},
	'us-opt-in': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-opt-in',
		privacySignals: US_GPC,
		rights: US_RIGHTS,
	},
	'us-opt-out': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-opt-out',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'none',
		rights: US_RIGHTS,
	},
};
