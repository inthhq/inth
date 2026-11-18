import type {
	ActiveUI,
	AllConsentNames,
	ConsentState,
	KernelBranding,
	Model,
	PolicyScopeMode,
	PreferencesPresentation,
	PromptPresentation,
	TranslationConfig,
} from '@inth/sdk/engine';

/**
 * State a component test turns into provider options: the policy, the
 * seeded choices, branding, translations and presentation.
 */
export interface ConsentStateFixture {
	activeUI: ActiveUI;
	branding: KernelBranding;
	consentCategories: AllConsentNames[];
	consents: ConsentState;
	model: Model;
	policyBanner: PromptPresentation;
	policyDialog: PreferencesPresentation;
	policyScopeMode: PolicyScopeMode | null;
	translationConfig: TranslationConfig;
	[field: string]: unknown;
}
