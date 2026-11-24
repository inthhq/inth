import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Alle akzeptieren',
		acknowledge: 'OK',
		close: 'Schließen',
		customize: 'Anpassen',
		dismiss: 'Ausblenden',
		rejectAll: 'Alle ablehnen',
		save: 'Einstellungen speichern',
		securedBy: 'Einwilligung durch',
	},
	consentGate: {
		actionButton: 'Zustimmung für {category} aktivieren',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Akzeptieren Sie {category}, um diesen Inhalt anzuzeigen.',
	},
	consentManagerDialog: {
		description:
			'Passe deine Datenschutz-Einstellungen hier an. Wähle aus, welche Arten von Cookies und Tracking-Technologien zugelassen werden.',
		title: 'Einstellungen',
		vendors: {
			disabledByCategory: 'Aktiviere diese Kategorie, um Anbieter auszuwählen.',
			privacyPolicy: 'Datenschutzerklärung',
			switchLabel: '{vendor} zulassen',
			title: 'Anbieter ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Diese Cookies helfen uns dabei, ein besseres Nutzerlebnis zu bieten und neue Funktionen zu testen.',
			title: 'Erfahrung',
		},
		functionality: {
			description:
				'Diese Cookies ermöglichen erweiterte Funktionalitäten und eine Personalisierung der Website.',
			title: 'Funktionalität',
		},
		marketing: {
			description:
				'Diese Cookies werden verwendet, um relevante Werbung anzuzeigen und ihre Wirksamkeit zu messen.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Diese Cookies helfen uns zu verstehen, wie Besucher mit der Website interagieren um die Surf-Erfahrung zu verbessern.',
			title: 'Analyse',
		},
		necessary: {
			description:
				'Diese Cookies sind für das reibungslose Funktionieren der Website unerlässlich und können nicht deaktiviert werden.',
			title: 'Unbedingt erforderliche Cookies',
		},
	},
	cookieBanner: {
		description:
			'Diese Website verwendet Cookies, um deine Surf-Erfahrung zu verbessern, den Seitenverkehr zu analysieren und persönliche Inhalte anzuzeigen.',
		noticeDescription:
			'Wir verwenden Cookies und ähnliche Technologien, um diese Website zu betreiben, den Traffic zu messen und Inhalte sowie Werbung zu personalisieren. Du kannst jederzeit widersprechen oder deine Einstellungen verwalten.',
		noticeTitle: 'Datenschutzhinweis',
		title: 'Wir respektieren deine Privatsphäre.',
	},
	iab: {
		app: {
			consentStorage:
				'Deine Auswahl wird auf diesem Gerät im Standard-Einstellungsspeicher der App unter IABTCF-Schlüsseln für bis zu {days} Tage gespeichert. Die Speicherdauer beginnt neu, wenn du deine Auswahl aktualisierst.',
			description:
				'Wir und unsere {partnerCount} Partner speichern und/oder greifen auf Informationen auf deinem Gerät zu und verarbeiten personenbezogene Daten, wie eindeutige Kennungen und Browsing-Daten, für diese App, um:',
			legitimateInterestExplanation:
				'Einige Partner verarbeiten personenbezogene Daten, wie eindeutige Kennungen und Browsing-Daten, auf Grundlage ihres berechtigten Interesses, statt um deine Einwilligung zu bitten. Das gilt nur für diese App. Du hast das Recht, dieser Verarbeitung für jeden Zweck und jeden Partner zu widersprechen.',
			scopeServiceSpecific:
				'Deine Einwilligung gilt nur für diese App und hat keinen Einfluss auf andere Dienste.',
			withdraw:
				'Du kannst deine Auswahl jederzeit in den Datenschutz-Einstellungen dieser App ändern oder deine Einwilligung widerrufen.',
		},
		banner: {
			andMore: 'Und {count} weitere...',
			description:
				'Wir und unsere {partnerCount} Partner speichern und/oder greifen auf Informationen auf deinem Gerät zu und verarbeiten personenbezogene Daten, wie eindeutige Kennungen und Browsing-Daten, für diese Website, um:',
			legitimateInterestNotice:
				'Einige Partner beanspruchen ein berechtigtes Interesse zur Verarbeitung deiner Daten. Du hast das Recht, dieser Verarbeitung zu widersprechen, deine Auswahl anzupassen und deine Einwilligung jederzeit zu widerrufen.',
			partnersLink: '{count} Partner',
			scopeGroup:
				'Deine Auswahl gilt für alle unsere Websites in dieser Gruppe.',
			scopeServiceSpecific:
				'Deine Einwilligung gilt nur für diese Website und hat keinen Einfluss auf andere Dienste.',
			title: 'Datenschutz-Einstellungen',
		},
		common: {
			acceptAll: 'Alle akzeptieren',
			clearSelection: 'Löschen',
			customPartner: 'Benutzerdefinierter Partner, nicht beim IAB registriert',
			customize: 'Anpassen',
			loading: 'Wird geladen...',
			rejectAll: 'Alle ablehnen',
			saveSettings: 'Einstellungen speichern',
			showingSelectedVendor: 'Ausgewählter Anbieter wird angezeigt',
		},
		preferenceCenter: {
			description:
				'Passe deine Datenschutz-Einstellungen hier an. Wähle aus, welche Arten von Cookies und Tracking-Technologien zugelassen werden.',
			features: {
				description:
					'Diese Verarbeitungen können ausschließlich zur Verfolgung eines oder mehrerer Zwecke verwendet werden, für die Ihnen in diesem Hinweis eine Auswahlmöglichkeit gegeben wird.',
				title: 'Merkmale',
			},
			footer: {
				consentStorage:
					'Einwilligungspräferenzen werden in einem Cookie namens "euconsent-v2" für 13 Monate gespeichert. Die Speicherdauer kann erneut beginnen, wenn du deine Präferenzen aktualisierst.',
			},
			purposeItem: {
				examples: 'Beispiele',
				legitimateInterest: 'Berechtigtes Interesse',
				objectButton: 'Widersprechen',
				objected: 'Widersprochen',
				partners: '{count} Partner',
				partnersUsingPurpose: 'Partner, die diesen Zweck nutzen',
				rightToObject:
					'Du hast das Recht, der Verarbeitung auf Grundlage berechtigten Interesses zu widersprechen.',
				vendorsUseLegitimateInterest:
					'{count} Anbieter beanspruchen berechtigtes Interesse',
				withYourPermission: 'Mit deiner Erlaubnis',
			},
			specialPurposes: {
				title: 'Wesentliche Funktionen (erforderlich)',
				tooltip:
					'Diese sind für die Funktionalität und Sicherheit der Website erforderlich. Gemäß IAB TCF kannst du diesen besonderen Zwecken nicht widersprechen.',
			},
			tabs: {
				purposes: 'Zwecke',
				vendors: 'Anbieter',
			},
			title: 'Datenschutz-Einstellungen',
			vendorList: {
				adTechProvidersHeading: 'Google-Anbieter für Werbetechnologie',
				adTechProvidersNotice:
					'Google arbeitet mit diesen Anbietern für Werbetechnologie außerhalb des IAB-Frameworks zusammen. Deine Einwilligung erreicht einen Anbieter nur, wenn du ihn aktivierst und außerdem das Speichern von Informationen auf deinem Gerät sowie personalisierte Werbung erlaubst.',
				customVendorsHeading: 'Benutzerdefinierte Partner',
				customVendorsNotice:
					'Dies sind benutzerdefinierte Partner, die nicht beim IAB Transparency & Consent Framework (TCF) registriert sind. Sie verarbeiten Daten auf Grundlage deiner Einwilligung und können andere Datenschutzpraktiken haben als IAB-registrierte Anbieter.',
				dataCategories: 'Datenkategorien',
				features: 'Merkmale',
				iabVendorsHeading: 'IAB-registrierte Anbieter',
				iabVendorsNotice:
					'Diese Partner sind beim IAB Transparency & Consent Framework (TCF) registriert, einem Industriestandard für die Verwaltung von Einwilligungen',
				legitimateInterest: 'Berecht. Interesse',
				maxAge: 'Max. Alter: {days} Tage',
				nonCookieAccess: 'Zugriff ohne Cookies',
				privacyPolicy: 'Datenschutzerklärung',
				purposes: 'Zwecke',
				requiredNotice:
					'Erforderlich für die Funktionalität der Website, kann nicht deaktiviert werden',
				retention: 'Aufbewahrung: {days} Tage',
				search: 'Anbieter suchen...',
				showingCount: '{filtered} von {total} Anbietern',
				specialFeatures: 'Besondere Merkmale',
				specialPurposes: 'Besondere Zwecke',
				storageDisclosure: 'Speicheroffenlegung',
				usesCookies: 'Verwendet Cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Cookie-Richtlinie',
		privacyPolicy: 'Datenschutzerklärung',
		termsOfService: 'Nutzungsbedingungen',
	},
	optOut: {
		action: 'Widersprechen',
		description:
			'Diese Website verkauft oder teilt deine personenbezogenen Daten nicht, und deine Auswahl ist in diesem Browser gespeichert.',
		done: 'Fertig',
		headingAll:
			'Verkauf und Weitergabe deiner personenbezogenen Daten sowie zielgerichtete Werbung',
		headingSaleAndShare:
			'Verkauf und Weitergabe deiner personenbezogenen Daten',
		headingSaleAndTargetedAds:
			'Verkauf deiner personenbezogenen Daten und zielgerichtete Werbung',
		lockedByAccount:
			'Dein Konto hat widersprochen, und du kannst dies nach der Anmeldung ändern.',
		lockedByGpc:
			'Das Global-Privacy-Control-Signal deines Browsers ist aktiv, daher bleibt dies deaktiviert.',
		notOptedOut: 'Du bist in diesem Browser nicht abgemeldet.',
		optInCancel: 'Abgemeldet bleiben',
		optInConfirm: 'Wieder einwilligen',
		optInDescription:
			'Mit der Bestätigung endet dein Widerspruch in diesem Browser.',
		optInDescriptionWithRights:
			'Mit der Bestätigung endet dein Widerspruch gegen {rights} in diesem Browser.',
		optInLink: 'Wieder einwilligen…',
		optInTitle: 'Wieder einwilligen?',
		receiptAccount: 'Du bist in diesem Browser und in deinem Konto abgemeldet.',
		receiptAccountWithRights:
			'Du bist in diesem Browser und in deinem Konto von {rights} abgemeldet.',
		receiptBrowser: 'Du bist in diesem Browser abgemeldet.',
		receiptBrowserWithRights:
			'Du bist in diesem Browser von {rights} abgemeldet.',
		recordedLabel: 'Aufgezeichnet',
		referenceLabel: 'Referenz',
		rightsAll: 'Verkauf, Weitergabe und zielgerichteter Werbung',
		rightsSaleAndShare: 'Verkauf und Weitergabe',
		rightsSaleAndTargetedAds: 'Verkauf und zielgerichteter Werbung',
		statusRequest: 'Widerspruchsanfrage berücksichtigt',
		statusSignal: 'Widerspruchssignal berücksichtigt',
	},
	privacyChoices: {
		acceptAll: 'Alle akzeptieren',
		advertisingFollowsSale: 'Werbung richtet sich nach deiner Auswahl oben.',
		advertisingTitle: 'Werbung',
		allow: 'Erlauben',
		alwaysOn: 'Immer aktiv',
		announceSaved: '{message} Gespeichert.',
		askAll:
			'deine personenbezogenen Daten verkaufen oder weitergeben, auch für zielgerichtete Werbung',
		askSaleAndShare: 'deine personenbezogenen Daten verkaufen oder weitergeben',
		askSaleAndTargetedAds:
			'deine personenbezogenen Daten verkaufen oder für zielgerichtete Werbung nutzen',
		bannerAllowedRightsOff:
			'Optionale Cookies erlaubt. {rights} bleiben deaktiviert. Du kannst das unter „Ihre Datenschutzeinstellungen“ ändern.',
		bannerAllowedRightsOffGpc:
			'Optionale Cookies erlaubt. {rights} bleiben wegen deines Global-Privacy-Control-Signals deaktiviert. Du kannst das unter „Ihre Datenschutzeinstellungen“ ändern.',
		bannerRejected:
			'Optionale Cookies abgelehnt. Du kannst das unter „Ihre Datenschutzeinstellungen“ ändern.',
		barDescription:
			'Wir verwenden Cookies, um dein Nutzungserlebnis zu verbessern und den Traffic zu analysieren.',
		businessFallback: 'diese Website',
		choiceRecorded: 'Auswahl erfasst.',
		choicesSaved:
			'Auswahl gespeichert. Du kannst sie unter „Ihre Datenschutzeinstellungen“ ändern.',
		choose: 'Auswählen',
		chooseWhatToAllow: 'Auswählen, was erlaubt ist',
		close: 'Schließen',
		confirmDescriptionOptIn:
			'{business} darf {rights}. Du kannst das jederzeit ändern.',
		confirmDescriptionOptOut:
			'{business} darf {rights}. Du kannst jederzeit wieder widersprechen.',
		confirmKeepOptedOut: 'Abgemeldet bleiben',
		confirmTitleOptIn: 'Möchtest du {rights} erlauben?',
		confirmTitleOptOut: 'Möchtest du {rights} wieder erlauben?',
		copyFailed: 'Kopieren fehlgeschlagen. Markiere und kopiere deine Referenz:',
		copyFailedAnnouncement:
			'Kopieren fehlgeschlagen. Deine vollständige Referenz steht im Beleg.',
		copyReference: 'Referenz kopieren',
		dialogIntro: 'Deine Auswahl gilt sofort.',
		dialogTitle: 'Ihre Datenschutzeinstellungen',
		done: 'Fertig',
		dontAllow: 'Nicht erlauben',
		euDialogIntro:
			'Wähle aus, welche optionalen Cookies {business} verwenden darf. Optionale Cookies bleiben deaktiviert, bis du sie einschaltest.',
		euDialogTitle: 'Datenschutz-Einstellungen',
		gpcNote:
			'Dein Browser hat ein Global-Privacy-Control-Signal gesendet. {business} {rights}. Das gilt {scope}. „Erlauben“ ist nicht verfügbar, solange das Signal aktiv ist.',
		inlineAll: 'Verkauf, Weitergabe und zielgerichtete Werbung',
		inlineSaleAndShare: 'Verkauf und Weitergabe',
		inlineSaleAndTargetedAds: 'Verkauf und zielgerichtete Werbung',
		justNow: 'gerade eben',
		nestedSheetNote:
			'Änderungen gelten, sobald du in den Datenschutz-Einstellungen speicherst.',
		noticeBarDescription:
			'Wir verwenden Cookies, um diese Website zu betreiben, den Traffic zu messen und Werbung zu personalisieren. Du kannst jederzeit widersprechen.',
		noticeBarDescriptionGpc:
			'Wir verwenden Cookies, um diese Website zu betreiben und den Traffic zu messen. Dein Global-Privacy-Control-Signal wird berücksichtigt.',
		noticeGpcHonored:
			'Das Global-Privacy-Control-Signal deines Browsers wird berücksichtigt.',
		noticeRightsAction: 'Meine Daten nicht verkaufen oder weitergeben',
		nudge: 'Wähle zuerst eine der beiden Schaltflächen.',
		optInBarDescription:
			'{business} fragt dich vor der Verwendung optionaler Cookies sowie vor {rights}.',
		optInDescription:
			'Mit deiner Erlaubnis würde {business} optionale Cookies für Website-Funktionen und Analysen verwenden und {rights}. Nichts wird aktiviert, solange du es nicht erlaubst.',
		optInTitle: 'Ihre Datenschutzeinstellungen',
		optOutOption: 'Widersprechen',
		panelExpanded: 'Weitere Optionen werden angezeigt.',
		policyColumn: 'Datenschutzerklärung',
		preferencesClose: 'Einstellungen schließen',
		preferencesOnCount: '{count} aktiv',
		preferencesSheetIntro: 'Änderungen gelten sofort.',
		preferencesSummary: 'Website-Funktionen und Analysen',
		preferencesTitle: 'Einstellungen',
		purposeColumn: 'Zweck',
		receiptAllowed: 'Erlaubt: {rights}',
		receiptDetails: 'Details',
		receiptFromGpc: 'durch dein Global-Privacy-Control-Signal',
		receiptLive: 'Global Privacy Control dieses Browsers wird berücksichtigt',
		receiptLiveDetail: 'Wird bei jedem Besuch aus deinem Browser gelesen.',
		receiptOptedOut: 'Widersprochen: {rights}',
		receiptRecorded: 'Erfasst: {date}',
		receiptReference: 'Referenz',
		receiptSavedAccount: 'In deinem Konto gespeichert · {date}',
		receiptSavedBrowser: 'Für diesen Browser gespeichert · {date}',
		receiptScopeAccount:
			'Gilt für diesen Browser und dein Konto bei {business}.',
		receiptScopeAccountUnnamed: 'Gilt für diesen Browser und dein Konto.',
		receiptScopeBrowser:
			'Gilt für diesen Browser. Melde dich an, damit es auch für dein Konto gilt.',
		receiptViaGpc: 'Global-Privacy-Control-Signal',
		referenceCopied: 'Referenz kopiert.',
		refuseAll:
			'verkauft deine personenbezogenen Daten nicht, gibt sie nicht weiter und nutzt sie nicht für zielgerichtete Werbung',
		refuseSaleAndShare:
			'verkauft deine personenbezogenen Daten nicht und gibt sie nicht weiter',
		refuseSaleAndTargetedAds:
			'verkauft deine personenbezogenen Daten nicht und nutzt sie nicht für zielgerichtete Werbung',
		rejectAll: 'Alle ablehnen',
		rightsAllowed: '{rights} erlaubt.',
		rightsNotAllowed: '{rights} nicht erlaubt.',
		rightsOptedOut: 'Widerspruch gegen {rights} eingelegt.',
		saleAllowed: '{business} darf {rights}.',
		saleGroupOptIn: 'Erlauben: {rights}',
		saleGroupSaleAndTargetedAds:
			'Dem Verkauf meiner personenbezogenen Daten und zielgerichteter Werbung widersprechen',
		saleOffByDefault:
			'Standardmäßig deaktiviert. {business} {rights}, solange du es nicht erlaubst.',
		saleRefused: '{business} {rights}. Das gilt {scope}.',
		saveChoices: 'Auswahl speichern',
		saveInSettings: 'Speichere deine Auswahl in den Datenschutz-Einstellungen',
		savedAutomatically: 'Automatisch gespeichert',
		savedCue: 'Gespeichert',
		scopeAccount: 'in diesem Browser und für dein Konto bei {business}',
		scopeAccountUnnamed: 'in diesem Browser und für dein Konto',
		scopeBrowser: 'in diesem Browser',
		shortAll: 'dem Verkauf oder der Weitergabe deiner Daten für Werbung',
		shortSaleAndShare: 'dem Verkauf oder der Weitergabe deiner Daten',
		shortSaleAndTargetedAds:
			'dem Verkauf deiner Daten oder ihrer Nutzung für Werbung',
		stateOff: 'Aus',
		stateOn: 'Ein',
		switchColumn: 'Ein',
		switchedOff: '{name} aus.',
		switchedOn: '{name} ein.',
		titleAll: 'Verkauf, Weitergabe und zielgerichtete Werbung',
		titleSaleAndShare: 'Verkauf und Weitergabe',
		titleSaleAndTargetedAds: 'Verkauf und zielgerichtete Werbung',
		vendorColumn: 'Anbieter',
		vendorPolicy: 'Datenschutzerklärung von {vendor}',
		vendorsClose: 'Anbieter für {category} schließen',
		vendorsFor: 'für {category}',
		vendorsHide: '{count} Anbieter ausblenden',
		vendorsHideOne: '1 Anbieter ausblenden',
		vendorsOnCount: '{count} aktiv',
		vendorsTable: 'Anbieter für {category}',
		vendorsView: '{count} Anbieter anzeigen',
		vendorsViewOne: '1 Anbieter anzeigen',
	},
	rights: {
		californiaPrivacyChoices: 'Ihre kalifornischen Datenschutzeinstellungen',
		optOut: 'Meine Daten nicht verkaufen oder weitergeben',
		preferences: 'Einstellungen verwalten',
		privacyChoices: 'Ihre Datenschutzeinstellungen',
	},
};
export default translations;
