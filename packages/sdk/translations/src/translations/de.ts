import type { CompleteTranslations } from '../types';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Alle akzeptieren',
		acknowledge: 'OK',
		close: 'Schließen',
		customize: 'Anpassen',
		dismiss: 'Ausblenden',
		rejectAll: 'Alle ablehnen',
		save: 'Einstellungen speichern',
		securedBy: 'Gesichert durch',
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
	rights: {
		californiaPrivacyChoices: 'Ihre kalifornischen Datenschutzeinstellungen',
		optOut: 'Meine Daten nicht verkaufen oder weitergeben',
		preferences: 'Einstellungen verwalten',
		privacyChoices: 'Ihre Datenschutzeinstellungen',
	},
};
export default translations;
