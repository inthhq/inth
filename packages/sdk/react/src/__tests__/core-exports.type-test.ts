// The provider's category, cleanup and policy options are typed from the
// same entry point that exports the provider, so `@inth/react` and
// `@inth/nextjs` users never import from `@inth/sdk/engine` for them.
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
	clearOnRevocation,
	consentCategories,
	projectUrl: '/api/inth',
}) satisfies ConsentProviderOptions;

// @ts-expect-error Only inth's categories are category names.
const unknownCategory: AllConsentNames = 'advertising';
void unknownCategory;
