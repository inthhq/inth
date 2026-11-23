import type { CompleteTranslations } from '../types';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Accept All',
		acknowledge: 'OK',
		close: 'Close',
		customize: 'Customize',
		dismiss: 'Dismiss',
		rejectAll: 'Reject All',
		save: 'Save Settings',
		securedBy: 'Consent by',
	},
	consentGate: {
		actionButton: 'Enable {category} consent',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Accept {category} consent to view this content.',
	},
	consentManagerDialog: {
		description:
			'Customize your privacy settings here. You can choose which types of cookies and tracking technologies you allow.',
		title: 'Privacy Settings',
		vendors: {
			disabledByCategory: 'Turn on this category to choose vendors.',
			privacyPolicy: 'Privacy policy',
			switchLabel: 'Allow {vendor}',
			title: 'Vendors ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'These cookies help us provide a better user experience and test new features.',
			title: 'Experience',
		},
		functionality: {
			description:
				'These cookies enable enhanced functionality and personalization of the website.',
			title: 'Functionality',
		},
		marketing: {
			description:
				'These cookies are used to deliver relevant advertisements and track their effectiveness.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'These cookies help us understand how visitors interact with the website and improve its performance.',
			title: 'Analytics',
		},
		necessary: {
			description:
				'These cookies are essential for the website to function properly and cannot be disabled.',
			title: 'Strictly Necessary',
		},
	},
	cookieBanner: {
		description:
			'This site uses cookies to improve your browsing experience, analyze site traffic, and show personalized content.',
		noticeDescription:
			'We use cookies and similar technologies to run this site, measure traffic, and personalize content and ads. You can opt out or manage your preferences at any time.',
		noticeTitle: 'Privacy notice',
		title: 'We value your privacy',
	},
	iab: {
		app: {
			consentStorage:
				"Your choices are stored on this device, in the app's standard settings storage under IABTCF keys, for up to {days} days. The storage duration is refreshed when you update your choices.",
			description:
				'We and our {partnerCount} partners store and/or access information on your device and process personal data, such as unique identifiers and browsing data, for this app, to:',
			legitimateInterestExplanation:
				'Some partners process personal data, such as unique identifiers and browsing data, on the basis of their legitimate interest instead of asking for consent. This applies only to this app. You have the right to object to this processing for each purpose and each partner.',
			scopeServiceSpecific:
				'Your consent applies only to this app and will not affect other services.',
			withdraw:
				'You can change your choices or withdraw your consent at any time from Privacy settings in this app.',
		},
		banner: {
			andMore: 'And {count} more...',
			description:
				'We and our {partnerCount} partners store and/or access information on your device and process personal data, such as unique identifiers and browsing data, for this website, to:',
			legitimateInterestNotice:
				'Some partners claim a legitimate interest to process your data. You have the right to object to this processing, customize your choices, and withdraw your consent at any time.',
			partnersLink: '{count} partners',
			scopeGroup: 'Your choice applies across our websites in this group.',
			scopeServiceSpecific:
				'Your consent applies only to this website and will not affect other services.',
			title: 'Privacy Settings',
		},
		common: {
			acceptAll: 'Accept All',
			clearSelection: 'Clear',
			customPartner: 'Custom partner not registered with IAB',
			customize: 'Customize',
			loading: 'Loading...',
			rejectAll: 'Reject All',
			saveSettings: 'Save Settings',
			showingSelectedVendor: 'Showing selected vendor',
		},
		preferenceCenter: {
			description:
				'Customize your privacy settings here. You can choose which types of cookies and tracking technologies you allow.',
			features: {
				description:
					'These means of processing can be used solely in pursuit of one or several purposes for which you are given a choice in this notice.',
				title: 'Features',
			},
			footer: {
				consentStorage:
					'Consent preferences are stored in a cookie named "euconsent-v2" for 13 months. The storage duration may be refreshed when you update your preferences.',
			},
			purposeItem: {
				examples: 'Examples',
				legitimateInterest: 'Legitimate Interest',
				objectButton: 'Object',
				objected: 'Objected',
				partners: '{count} partners',
				partnersUsingPurpose: 'Partners Using This Purpose',
				rightToObject:
					'You have the right to object to processing based on legitimate interest.',
				vendorsUseLegitimateInterest:
					'{count} vendors claim legitimate interest',
				withYourPermission: 'With Your Permission',
			},
			specialPurposes: {
				title: 'Essential Functions (Required)',
				tooltip:
					'These are required for site functionality and security. Per IAB TCF, you cannot object to these special purposes.',
			},
			tabs: {
				purposes: 'Purposes',
				vendors: 'Vendors',
			},
			title: 'Privacy Settings',
			vendorList: {
				adTechProvidersHeading: 'Google Ad Tech Providers',
				adTechProvidersNotice:
					'Google works with these ad tech providers outside the IAB framework. Your consent reaches a provider only if you switch it on and also allow device storage and personalised advertising.',
				customVendorsHeading: 'Custom Partners',
				customVendorsNotice:
					'These are custom partners not registered with IAB Transparency & Consent Framework (TCF). They process data based on your consent and may have different privacy practices than IAB-registered vendors.',
				dataCategories: 'Data Categories',
				features: 'Features',
				iabVendorsHeading: 'IAB Registered Vendors',
				iabVendorsNotice:
					'These partners are registered with the IAB Transparency & Consent Framework (TCF), an industry standard for managing consent',
				legitimateInterest: 'Leg. Interest',
				maxAge: 'Max Age: {days}d',
				maxAgeRefreshes: '(refreshes)',
				noVendorsFound: 'No vendors found matching "{searchTerm}"',
				nonCookieAccess: 'Non-Cookie Access',
				partnerCount: '{count} partners',
				partnerPlural: 'partners',
				partnerSingular: 'partner',
				privacyPolicy: 'Privacy Policy',
				purposes: 'Purposes',
				requiredNotice: 'Required for site functionality, cannot be disabled',
				retainedDays: 'Retained: {days}d',
				retention: 'Retention: {days}d',
				search: 'Search vendors...',
				showingCount: '{filtered} of {total} vendors',
				specialFeatures: 'Special Features',
				specialPurposes: 'Special Purposes',
				storageDisclosure: 'Storage Disclosure',
				usesCookies: 'Uses Cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Cookie Policy',
		privacyPolicy: 'Privacy Policy',
		termsOfService: 'Terms of Service',
	},
	optOut: {
		action: 'Opt out',
		description:
			'This site will not sell or share your personal information, and your choice is saved on this browser.',
		done: 'Done',
		headingAll:
			'Sale and sharing of your personal information and targeted advertising',
		headingSaleAndShare: 'Sale and sharing of your personal information',
		headingSaleAndTargetedAds:
			'Sale of your personal information and targeted advertising',
		lockedByAccount:
			'Your account has opted out, and you can change this after signing in.',
		lockedByGpc:
			"Your browser's Global Privacy Control signal is on, so this stays off.",
		notOptedOut: "You haven't opted out on this browser.",
		optInCancel: 'Stay opted out',
		optInConfirm: 'Opt back in',
		optInDescription: 'Confirming ends your opt-out on this browser.',
		optInDescriptionWithRights:
			'Confirming ends your opt-out of {rights} on this browser.',
		optInLink: 'Opt back in…',
		optInTitle: 'Opt back in?',
		receiptAccount: "You're opted out on this browser and your account.",
		receiptAccountWithRights:
			"You're opted out of {rights} on this browser and your account.",
		receiptBrowser: "You're opted out on this browser.",
		receiptBrowserWithRights: "You're opted out of {rights} on this browser.",
		recordedLabel: 'Recorded',
		referenceLabel: 'Reference',
		rightsAll: 'sale, sharing and targeted advertising',
		rightsSaleAndShare: 'sale and sharing',
		rightsSaleAndTargetedAds: 'sale and targeted advertising',
		statusRequest: 'Opt-out request honored',
		statusSignal: 'Opt-out preference signal honored',
	},
	privacyChoices: {
		acceptAll: 'Accept all',
		advertisingFollowsSale: 'Advertising follows your choice above.',
		allow: 'Allow',
		askAll:
			'sell or share your personal information, including for targeted ads',
		askSaleAndShare: 'sell or share your personal information',
		askSaleAndTargetedAds:
			'sell your personal information or use it for targeted ads',
		bannerAllowedRightsOff:
			'Optional cookies allowed. {rights} stay off. You can change this in Your Privacy Choices.',
		bannerAllowedRightsOffGpc:
			'Optional cookies allowed. {rights} stay off because of your Global Privacy Control signal. You can change this in Your Privacy Choices.',
		bannerRejected:
			'Optional cookies rejected. You can change this in Your Privacy Choices.',
		barDescription:
			'We use cookies to improve your experience and analyze traffic.',
		businessFallback: 'this site',
		choicesSaved: 'Choices saved. You can change them in Your Privacy Choices.',
		choose: 'Choose',
		chooseWhatToAllow: 'Choose what to allow',
		confirmDescriptionOptIn:
			'{business} may {rights}. You can change this at any time.',
		confirmDescriptionOptOut:
			'{business} may {rights}. You can opt out again at any time.',
		confirmKeepOptedOut: 'Keep opted out',
		confirmTitleOptIn: 'Allow {rights}?',
		confirmTitleOptOut: 'Allow {rights} again?',
		copyFailed: "Couldn't copy. Select and copy your reference:",
		dialogIntro: 'Your choices apply right away.',
		dontAllow: "Don't allow",
		gpcNote:
			"Your browser sent a Global Privacy Control signal, so {business} {rights} {scope}. Allow isn't available while the signal is on.",
		nestedSheetNote: 'Changes apply when you save in Privacy settings.',
		noticeBarDescription:
			'We use cookies to run this site, measure traffic and personalize ads. You can opt out at any time.',
		noticeBarDescriptionGpc:
			'We use cookies to run this site and measure traffic. Your Global Privacy Control signal is honored.',
		noticeGpcHonored:
			"Your browser's Global Privacy Control signal is being honored.",
		noticeRightsAction: 'Do not sell or share my data',
		nudge: 'Choose one of the two buttons first.',
		optInBarDescription:
			'{business} asks before using optional cookies or {rights}.',
		optInDescription:
			'With your permission, {business} would use optional cookies for site features and analytics, and {rights}. Nothing is turned on unless you allow it.',
		optInTitle: 'Your privacy choices',
		optOutOption: 'Opt out',
		panelExpanded: 'More options shown.',
		preferencesClose: 'Close preferences',
		preferencesOnCount: '{count} on',
		preferencesSummary: 'Site features and analytics',
		preferencesTitle: 'Preferences',
		receiptScopeAccount: 'Applies to this browser and your {business} account.',
		receiptScopeAccountUnnamed: 'Applies to this browser and your account.',
		receiptScopeBrowser:
			'Applies to this browser. Sign in to apply it to your account too.',
		refuseAll:
			"won't sell or share your personal information or use it for targeted ads",
		refuseSaleAndShare: "won't sell or share your personal information",
		refuseSaleAndTargetedAds:
			"won't sell your personal information or use it for targeted ads",
		rejectAll: 'Reject all',
		saleAllowed: '{business} may {rights}.',
		saleGroupOptIn: 'Allow {rights}',
		saleGroupSaleAndTargetedAds:
			'Opt out of the sale of my personal data and targeted advertising',
		saleOffByDefault:
			'Off by default. {business} {rights} unless you allow it.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Save choices',
		scopeAccount: 'on this browser or for your {business} account',
		scopeAccountUnnamed: 'on this browser or for your account',
		scopeBrowser: 'on this browser',
		shortAll: 'selling or sharing your data for ads',
		shortSaleAndShare: 'selling or sharing your data',
		shortSaleAndTargetedAds: 'selling your data or using it for ads',
		titleAll: 'Selling, sharing and targeted ads',
		titleSaleAndShare: 'Selling and sharing',
		titleSaleAndTargetedAds: 'Selling and targeted ads',
	},
	rights: {
		californiaPrivacyChoices: 'Your California Privacy Choices',
		optOut: 'Do Not Sell or Share My Personal Information',
		preferences: 'Manage preferences',
		privacyChoices: 'Your Privacy Choices',
	},
	trigger: {
		devToolsLabel: 'Inth DevTools',
		label: 'Open privacy settings',
		toolbarLabel: 'Privacy controls',
	},
};

export default translations;
