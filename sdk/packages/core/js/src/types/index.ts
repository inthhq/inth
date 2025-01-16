// Import and export all types from compliance.ts
import type {
	ComplianceRegion,
	ComplianceSettings,
	ConsentState,
	HasConsentedProps,
	NamespaceProps,
	PrivacySettings,
} from "./compliance";

export type {
	ConsentState,
	ComplianceRegion,
	ComplianceSettings,
	PrivacySettings,
	HasConsentedProps,
	NamespaceProps,
};

// Import and export all types from gdpr.ts
import { type AllConsentNames, type ConsentType, consentTypes } from "./gdpr";

export { consentTypes };
export type { AllConsentNames, ConsentType };

// Import and export all types from callbacks.ts
import type { CallbackFunction, Callbacks } from "./callbacks";

export type { CallbackFunction, Callbacks };
