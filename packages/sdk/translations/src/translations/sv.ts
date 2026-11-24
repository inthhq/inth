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
		securedBy: 'Samtycke via',
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
	privacyChoices: {
		acceptAll: 'Acceptera alla',
		advertisingFollowsSale: 'Annonsering följer ditt val ovan.',
		advertisingTitle: 'Annonsering',
		allow: 'Tillåt',
		alwaysOn: 'Alltid på',
		announceSaved: '{message} Sparat.',
		askAll: 'sälja eller dela dina personuppgifter, även för riktad reklam',
		askSaleAndShare: 'sälja eller dela dina personuppgifter',
		askSaleAndTargetedAds:
			'sälja dina personuppgifter eller använda dem för riktad reklam',
		bannerAllowedRightsOff:
			'Valfria cookies tillåts. {rights} förblir av. Du kan ändra detta under Dina integritetsval.',
		bannerAllowedRightsOffGpc:
			'Valfria cookies tillåts. {rights} förblir av på grund av din Global Privacy Control-signal. Du kan ändra detta under Dina integritetsval.',
		bannerRejected:
			'Valfria cookies avvisades. Du kan ändra detta under Dina integritetsval.',
		barDescription:
			'Vi använder cookies för att förbättra din upplevelse och analysera trafik.',
		businessFallback: 'den här webbplatsen',
		choiceRecorded: 'Valet har registrerats.',
		choicesSaved:
			'Valen har sparats. Du kan ändra dem under Dina integritetsval.',
		choose: 'Välj',
		chooseWhatToAllow: 'Välj vad du tillåter',
		close: 'Stäng',
		confirmDescriptionOptIn:
			'{business} får {rights}. Du kan ändra detta när som helst.',
		confirmDescriptionOptOut:
			'{business} får {rights}. Du kan välja bort detta igen när som helst.',
		confirmKeepOptedOut: 'Behåll bortvalet',
		confirmTitleOptIn: 'Tillåt {rights}?',
		confirmTitleOptOut: 'Tillåt {rights} igen?',
		copyFailed: 'Det gick inte att kopiera. Markera och kopiera din referens:',
		copyFailedAnnouncement:
			'Det gick inte att kopiera. Hela referensen visas i kvittot.',
		copyReference: 'Kopiera referens',
		dialogIntro: 'Dina val gäller direkt.',
		dialogTitle: 'Dina integritetsval',
		done: 'Klar',
		dontAllow: 'Tillåt inte',
		euDialogIntro:
			'Välj vilka valfria cookies {business} får använda. Valfria cookies förblir av om du inte slår på dem.',
		euDialogTitle: 'Integritetsinställningar',
		gpcNote:
			'Din webbläsare skickade en Global Privacy Control-signal, så {business} {rights} {scope}. Tillåt är inte tillgängligt medan signalen är på.',
		justNow: 'nyss',
		nestedSheetNote:
			'Ändringarna gäller när du sparar i Integritetsinställningar.',
		noticeBarDescription:
			'Vi använder cookies för att driva den här webbplatsen, mäta trafik och anpassa annonser. Du kan välja bort detta när som helst.',
		noticeBarDescriptionGpc:
			'Vi använder cookies för att driva den här webbplatsen och mäta trafik. Din Global Privacy Control-signal respekteras.',
		noticeGpcHonored: 'Webbläsarens Global Privacy Control-signal respekteras.',
		noticeRightsAction: 'Sälj eller dela inte mina uppgifter',
		nudge: 'Välj en av de två knapparna först.',
		optInBarDescription:
			'{business} frågar dig före användning av valfria cookies eller {rights}.',
		optInDescription:
			'Med ditt tillstånd skulle {business} använda valfria cookies för webbplatsfunktioner och analys, samt {rights}. Inget slås på om du inte tillåter det.',
		optInTitle: 'Dina integritetsval',
		optOutOption: 'Välj bort',
		panelExpanded: 'Fler alternativ visas.',
		policyColumn: 'Integritetspolicy',
		preferencesClose: 'Stäng inställningar',
		preferencesOnCount: '{count} på',
		preferencesSheetIntro: 'Ändringarna gäller direkt.',
		preferencesSummary: 'Webbplatsfunktioner och analys',
		preferencesTitle: 'Inställningar',
		purposeColumn: 'Syfte',
		receiptAllowed: 'Har tillåtit {rights}',
		receiptDetails: 'Detaljer',
		receiptFromGpc: 'från din Global Privacy Control-signal',
		receiptLive: 'Följer Global Privacy Control från den här webbläsaren',
		receiptLiveDetail: 'Läses från din webbläsare vid varje besök.',
		receiptOptedOut: 'Har valt bort {rights}',
		receiptRecorded: 'Registrerat {date}',
		receiptReference: 'Referens',
		receiptSavedAccount: 'Sparat på ditt konto · {date}',
		receiptSavedBrowser: 'Sparat för den här webbläsaren · {date}',
		receiptScopeAccount:
			'Gäller den här webbläsaren och ditt konto hos {business}.',
		receiptScopeAccountUnnamed: 'Gäller den här webbläsaren och ditt konto.',
		receiptScopeBrowser:
			'Gäller den här webbläsaren. Logga in för att det också ska gälla ditt konto.',
		receiptViaGpc: 'Global Privacy Control-signal',
		referenceCopied: 'Referensen har kopierats.',
		refuseAll:
			'säljer eller delar inte dina personuppgifter och använder dem inte för riktad reklam',
		refuseSaleAndShare: 'säljer eller delar inte dina personuppgifter',
		refuseSaleAndTargetedAds:
			'säljer inte dina personuppgifter och använder dem inte för riktad reklam',
		rejectAll: 'Avvisa alla',
		rightsAllowed: '{rights} tillåts.',
		rightsNotAllowed: '{rights} tillåts inte.',
		rightsOptedOut: 'Du har valt bort {rights}.',
		saleAllowed: '{business} får {rights}.',
		saleGroupOptIn: 'Tillåt {rights}',
		saleGroupSaleAndTargetedAds:
			'Välj bort försäljning av mina personuppgifter och riktad reklam',
		saleOffByDefault:
			'Av som standard. {business} {rights} om du inte tillåter det.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Spara val',
		saveInSettings: 'Spara dina val i Integritetsinställningar',
		savedAutomatically: 'Sparas automatiskt',
		savedCue: 'Sparat',
		scopeAccount: 'i den här webbläsaren eller för ditt konto hos {business}',
		scopeAccountUnnamed: 'i den här webbläsaren eller för ditt konto',
		scopeBrowser: 'i den här webbläsaren',
		shortAll: 'försäljning eller delning av dina uppgifter för annonser',
		shortSaleAndShare: 'försäljning eller delning av dina uppgifter',
		shortSaleAndTargetedAds:
			'försäljning av dina uppgifter eller användning av dem för annonser',
		stateOff: 'Av',
		stateOn: 'På',
		switchColumn: 'På',
		switchedOff: '{name} av.',
		switchedOn: '{name} på.',
		titleAll: 'Försäljning, delning och riktad reklam',
		titleSaleAndShare: 'Försäljning och delning',
		titleSaleAndTargetedAds: 'Försäljning och riktad reklam',
		vendorColumn: 'Leverantör',
		vendorPolicy: 'Integritetspolicy för {vendor}',
		vendorsClose: 'Stäng leverantörer för {category}',
		vendorsFor: 'för {category}',
		vendorsHide: 'Dölj {count} leverantörer',
		vendorsHideOne: 'Dölj 1 leverantör',
		vendorsOnCount: '{count} på',
		vendorsTable: 'Leverantörer för {category}',
		vendorsView: 'Visa {count} leverantörer',
		vendorsViewOne: 'Visa 1 leverantör',
	},
	rights: {
		californiaPrivacyChoices: 'Dina integritetsval i Kalifornien',
		optOut: 'Sälj eller dela inte mina uppgifter',
		preferences: 'Hantera inställningar',
		privacyChoices: 'Dina integritetsval',
	},
};
export default translations;
