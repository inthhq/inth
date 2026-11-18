// The provider's category, cleanup and policy options are typed from the
// same entry point that exports the provider, so `c15t/react` and
// `c15t/next` users never import from `c15t` for them.
import type {
	AllConsentNames,
	ClearOnRevocationConfig,
	ConsentProviderOptions,
	PolicyRule,
} from '../index';
import { policyRulePresets } from '../index';

const consentCategories: AllConsentNames[] = ['measurement', 'marketing'];
const clearOnRevocation: ClearOnRevocationConfig = {
	measurement: { cookies: ['_ga'] },
};
const policyRules: PolicyRule[] = [
	policyRulePresets.europeOptIn(),
	policyRulePresets.worldNone(),
];

void policyRules;

({
	backendURL: '/api/c15t',
	clearOnRevocation,
	consentCategories,
}) satisfies ConsentProviderOptions;

// @ts-expect-error Only c15t's categories are category names.
const unknownCategory: AllConsentNames = 'advertising';
void unknownCategory;
