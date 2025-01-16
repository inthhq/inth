import type { PrivacyConsentState } from "./store.type";
import { type ConsentState, consentTypes } from "./types";

export const initialState: Omit<
	PrivacyConsentState,
	"getEffectiveConsents" | "hasConsentFor"
> = {
	consents: consentTypes.reduce((acc, consent) => {
		acc[consent.name] = consent.defaultValue;
		return acc;
	}, {} as ConsentState),
	consentInfo: null,
	showPopup: true,
	gdprTypes: ["necessary", "marketing"],
	isPrivacyDialogOpen: false,
	complianceSettings: {
		gdpr: { enabled: true, appliesGlobally: true, applies: true },
		ccpa: { enabled: true, appliesGlobally: false, applies: undefined },
		lgpd: { enabled: false, appliesGlobally: false, applies: undefined },
		usStatePrivacy: {
			enabled: true,
			appliesGlobally: false,
			applies: undefined,
		},
	},
	callbacks: {},
	detectedCountry: "US",
	privacySettings: {
		honorDoNotTrack: true,
	},
	includeNonDisplayedConsents: false,
	consentTypes: consentTypes,
	setConsent: () => {},
	setShowPopup: () => {},
	setIsPrivacyDialogOpen: () => {},
	saveConsents: () => {},
	resetConsents: () => {},
	setGdprTypes: () => {},
	setComplianceSetting: () => {},
	resetComplianceSettings: () => {},
	setCallback: () => {},
	setDetectedCountry: () => {},
	getDisplayedConsents: () => [],
	hasConsented: () => false,
	clearAllData: () => {},
	updateConsentMode: () => {},
	setPrivacySettings: () => {},
	setIncludeNonDisplayedConsents: () => {},
};
