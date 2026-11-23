import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Acceptera alla',
		acknowledge: 'OK',
		close: 'Stäng',
		customize: 'Anpassa',
		dismiss: 'Stäng',
		rejectAll: 'Avvisa alla',
		save: 'Spara inställningar',
		securedBy: 'Skyddad av',
	},
	consentGate: {
		actionButton: 'Aktivera {category}-samtycke',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Acceptera {category}-samtycke för att visa detta innehåll.',
	},
	consentManagerDialog: {
		description:
			'Anpassa dina integritetsinställningar här. Du kan välja vilka typer av cookies och spårningstekniker du tillåter.',
		title: 'Integritetsinställningar',
		vendors: {
			disabledByCategory:
				'Slå på den här kategorin för att välja leverantörer.',
			privacyPolicy: 'Integritetspolicy',
			switchLabel: 'Tillåt {vendor}',
			title: 'Leverantörer ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Dessa cookies hjälper oss att ge en bättre användarupplevelse och testa nya funktioner.',
			title: 'Upplevelse',
		},
		functionality: {
			description:
				'Dessa cookies möjliggör förbättrad funktionalitet och personalisering av webbplatsen.',
			title: 'Funktionalitet',
		},
		marketing: {
			description:
				'Dessa cookies används för att leverera relevanta annonser och spåra deras effektivitet.',
			title: 'Marknadsföring',
		},
		measurement: {
			description:
				'Dessa cookies hjälper oss att förstå hur besökare interagerar med webbplatsen och förbättra dess prestanda.',
			title: 'Analys',
		},
		necessary: {
			description:
				'Dessa cookies är nödvändiga för att webbplatsen ska fungera korrekt och kan inte inaktiveras.',
			title: 'Absolut nödvändiga',
		},
	},
	cookieBanner: {
		description:
			'Den här webbplatsen använder cookies för att förbättra din surfupplevelse, analysera webbplatstrafik och visa personligt anpassat innehåll.',
		noticeDescription:
			'Vi använder cookies och liknande tekniker för att driva den här webbplatsen, mäta trafik och anpassa innehåll och annonser. Du kan när som helst avstå eller hantera dina inställningar.',
		noticeTitle: 'Integritetsmeddelande',
		title: 'Vi värdesätter din integritet',
	},
	iab: {
		app: {
			consentStorage:
				'Dina val lagras på den här enheten, i appens standardlagring för inställningar under IABTCF-nycklar, i upp till {days} dagar. Lagringstiden förnyas när du uppdaterar dina val.',
			description:
				'Vi och våra {partnerCount} partner lagrar och/eller får tillgång till information på din enhet och behandlar personuppgifter, såsom unika identifierare och webbläsardata, för den här appen, för att:',
			legitimateInterestExplanation:
				'Vissa partner behandlar personuppgifter, såsom unika identifierare och webbläsardata, med stöd av sitt berättigade intresse i stället för att be om samtycke. Detta gäller endast den här appen. Du har rätt att invända mot denna behandling för varje ändamål och varje partner.',
			scopeServiceSpecific:
				'Ditt samtycke gäller endast för den här appen och påverkar inte andra tjänster.',
			withdraw:
				'Du kan när som helst ändra dina val eller återkalla ditt samtycke under Integritetsinställningar i den här appen.',
		},
		banner: {
			andMore: 'Och {count} till...',
			description:
				'Vi och våra {partnerCount} partner lagrar och/eller får tillgång till information på din enhet och behandlar personuppgifter, såsom unika identifierare och webbläsardata, för denna webbplats, för att:',
			legitimateInterestNotice:
				'Vissa partner hävdar ett berättigat intresse för att behandla dina uppgifter. Du har rätt att invända mot denna behandling, anpassa dina val och när som helst återkalla ditt samtycke.',
			partnersLink: '{count} partner',
			scopeGroup: 'Ditt val gäller för alla våra webbplatser i denna grupp.',
			scopeServiceSpecific:
				'Ditt samtycke gäller endast för den här webbplatsen och påverkar inte andra tjänster.',
			title: 'Integritetsinställningar',
		},
		common: {
			acceptAll: 'Acceptera alla',
			clearSelection: 'Rensa',
			customPartner: 'Anpassad partner som inte är registrerad i IAB',
			customize: 'Anpassa',
			loading: 'Laddar...',
			rejectAll: 'Avvisa alla',
			saveSettings: 'Spara inställningar',
			showingSelectedVendor: 'Visar vald leverantör',
		},
		preferenceCenter: {
			description:
				'Anpassa dina integritetsinställningar här. Du kan välja vilka typer av cookies och spårningstekniker du tillåter.',
			features: {
				description:
					'Dessa behandlingsmetoder får endast användas i syfte att uppnå ett eller flera av de ändamål som du ges möjlighet att välja i detta meddelande.',
				title: 'Funktioner',
			},
			footer: {
				consentStorage:
					'Samtyckesinställningar lagras i en cookie med namnet "euconsent-v2" i 13 månader. Lagringstiden kan förnyas när du uppdaterar dina inställningar.',
			},
			purposeItem: {
				examples: 'Exempel',
				legitimateInterest: 'Berättigat intresse',
				objectButton: 'Invänd',
				objected: 'Invänt',
				partners: '{count} partner',
				partnersUsingPurpose: 'Partner som använder detta ändamål',
				rightToObject:
					'Du har rätt att invända mot behandling baserad på berättigat intresse.',
				vendorsUseLegitimateInterest:
					'{count} leverantörer hävdar berättigat intresse',
				withYourPermission: 'Med ditt tillstånd',
			},
			specialPurposes: {
				title: 'Viktiga funktioner (krävs)',
				tooltip:
					'Dessa krävs för webbplatsens funktionalitet och säkerhet. Enligt IAB TCF kan du inte invända mot dessa speciella ändamål.',
			},
			tabs: {
				purposes: 'Ändamål',
				vendors: 'Leverantörer',
			},
			title: 'Integritetsinställningar',
			vendorList: {
				adTechProvidersHeading: 'Googles annonsteknikleverantörer',
				adTechProvidersNotice:
					'Google samarbetar med dessa annonsteknikleverantörer utanför IAB-ramverket. Ditt samtycke når bara en leverantör om du slår på den och även tillåter lagring av information på din enhet och personligt anpassade annonser.',
				customVendorsHeading: 'Anpassade partner',
				customVendorsNotice:
					'Dessa är anpassade partner som inte är registrerade i IAB Transparency & Consent Framework (TCF). De behandlar data baserat på ditt samtycke och kan ha andra integritetspraxis än IAB-registrerade leverantörer.',
				dataCategories: 'Datakategorier',
				features: 'Funktioner',
				iabVendorsHeading: 'IAB-registrerade leverantörer',
				iabVendorsNotice:
					'Dessa partner är registrerade i IAB Transparency & Consent Framework (TCF), en branschstandard för hantering av samtycke',
				legitimateInterest: 'Berätt. intresse',
				maxAge: 'Max ålder: {days}d',
				nonCookieAccess: 'Icke-cookie-åtkomst',
				privacyPolicy: 'Integritetspolicy',
				purposes: 'Ändamål',
				requiredNotice:
					'Krävs för webbplatsens funktionalitet, kan inte inaktiveras',
				retention: 'Lagring: {days}d',
				search: 'Sök leverantörer...',
				showingCount: '{filtered} av {total} leverantörer',
				specialFeatures: 'Speciella funktioner',
				specialPurposes: 'Speciella ändamål',
				storageDisclosure: 'Lagringsinformation',
				usesCookies: 'Använder cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Cookiepolicy',
		privacyPolicy: 'Integritetspolicy',
		termsOfService: 'Användarvillkor',
	},
	optOut: {
		action: 'Avsäg dig',
		description:
			'Den här webbplatsen säljer eller delar inte dina personuppgifter, och ditt val är sparat i den här webbläsaren.',
		done: 'Klar',
		headingAll:
			'Försäljning och delning av dina personuppgifter samt riktad reklam',
		headingSaleAndShare: 'Försäljning och delning av dina personuppgifter',
		headingSaleAndTargetedAds:
			'Försäljning av dina personuppgifter och riktad reklam',
		lockedByAccount:
			'Ditt konto har valt bort detta, och du kan ändra det efter att du loggat in.',
		lockedByGpc:
			'Webbläsarens Global Privacy Control-signal är på, så detta förblir avstängt.',
		notOptedOut: 'Du har inte avsagt dig i den här webbläsaren.',
		optInCancel: 'Förbli avanmäld',
		optInConfirm: 'Gå med igen',
		optInDescription:
			'Bekräftelse avslutar din avanmälan i den här webbläsaren.',
		optInDescriptionWithRights:
			'Bekräftelse avslutar din avanmälan från {rights} i den här webbläsaren.',
		optInLink: 'Gå med igen…',
		optInTitle: 'Gå med igen?',
		receiptAccount: 'Du har valt bort i den här webbläsaren och på ditt konto.',
		receiptAccountWithRights:
			'Du har valt bort {rights} i den här webbläsaren och på ditt konto.',
		receiptBrowser: 'Du har valt bort i den här webbläsaren.',
		receiptBrowserWithRights:
			'Du har valt bort {rights} i den här webbläsaren.',
		recordedLabel: 'Registrerat',
		referenceLabel: 'Referens',
		rightsAll: 'försäljning, delning och riktad annonsering',
		rightsSaleAndShare: 'försäljning och delning',
		rightsSaleAndTargetedAds: 'försäljning och riktad annonsering',
		statusRequest: 'Begäran om att välja bort har följts',
		statusSignal: 'Signal om bortvalspreferens har följts',
	},
	rights: {
		californiaPrivacyChoices: 'Dina integritetsval i Kalifornien',
		optOut: 'Sälj eller dela inte mina uppgifter',
		preferences: 'Hantera inställningar',
		privacyChoices: 'Dina integritetsval',
	},
};
export default translations;
