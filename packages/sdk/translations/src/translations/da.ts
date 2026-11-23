import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Accepter alle',
		acknowledge: 'OK',
		close: 'Luk',
		customize: 'Tilpas',
		dismiss: 'Luk',
		rejectAll: 'Afvis alle',
		save: 'Gem indstillinger',
		securedBy: 'Samtykke fra',
	},
	consentGate: {
		actionButton: 'Aktivér {category}-samtykke',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Accepter {category}-samtykke for at se dette indhold.',
	},
	consentManagerDialog: {
		description:
			'Tilpas dine privatlivsindstillinger her. Du kan vælge, hvilke typer cookies og sporingsteknologier du vil tillade.',
		title: 'Privatlivsindstillinger',
		vendors: {
			disabledByCategory: 'Slå denne kategori til for at vælge leverandører.',
			privacyPolicy: 'Privatlivspolitik',
			switchLabel: 'Tillad {vendor}',
			title: 'Leverandører ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Disse cookies hjælper os med at levere en bedre brugeroplevelse og teste nye funktioner.',
			title: 'Oplevelse',
		},
		functionality: {
			description:
				'Disse cookies muliggør forbedret funktionalitet og personalisering af hjemmesiden.',
			title: 'Funktionalitet',
		},
		marketing: {
			description:
				'Disse cookies bruges til at levere relevante annoncer og spore deres effektivitet.',
			title: 'Markedsføring',
		},
		measurement: {
			description:
				'Disse cookies hjælper os med at forstå, hvordan besøgende interagerer med hjemmesiden og forbedre dens ydeevne.',
			title: 'Analyse',
		},
		necessary: {
			description:
				'Disse cookies er essentielle for, at hjemmesiden fungerer korrekt, og de kan ikke deaktiveres.',
			title: 'Strengt nødvendige',
		},
	},
	cookieBanner: {
		description:
			'Denne side bruger cookies til at forbedre din browsingoplevelse, analysere trafikken på siden og vise personligt tilpasset indhold.',
		noticeDescription:
			'Vi bruger cookies og lignende teknologier til at drive dette websted, måle trafik og tilpasse indhold og annoncer. Du kan til enhver tid fravælge eller administrere dine præferencer.',
		noticeTitle: 'Privatlivsmeddelelse',
		title: 'Vi værdsætter dit privatliv',
	},
	iab: {
		app: {
			consentStorage:
				'Dine valg gemmes på denne enhed, i appens standardlager til indstillinger under IABTCF-nøgler, i op til {days} dage. Opbevaringsperioden fornyes, når du opdaterer dine valg.',
			description:
				"Vi og vores {partnerCount} partnere gemmer og/eller får adgang til oplysninger på din enhed og behandler personoplysninger, såsom unikke id'er og browserdata, for denne app, for at:",
			legitimateInterestExplanation:
				"Nogle partnere behandler personoplysninger, såsom unikke id'er og browserdata, på grundlag af deres legitime interesse i stedet for at bede om samtykke. Dette gælder kun for denne app. Du har ret til at gøre indsigelse mod denne behandling for hvert formål og hver partner.",
			scopeServiceSpecific:
				'Dit samtykke gælder kun for denne app og vil ikke påvirke andre tjenester.',
			withdraw:
				'Du kan til enhver tid ændre dine valg eller trække dit samtykke tilbage under Privatlivsindstillinger i denne app.',
		},
		banner: {
			andMore: 'Og {count} mere...',
			description:
				"Vi og vores {partnerCount} partnere gemmer og/eller får adgang til oplysninger på din enhed og behandler personoplysninger, såsom unikke id'er og browserdata, for dette website, for at:",
			legitimateInterestNotice:
				'Nogle partnere påberåber sig legitim interesse for at behandle dine data. Du har ret til at gøre indsigelse mod denne behandling, tilpasse dine valg og trække dit samtykke tilbage til enhver tid.',
			partnersLink: '{count} partnere',
			scopeGroup: 'Dit valg gælder på tværs af vores websteder i denne gruppe.',
			scopeServiceSpecific:
				'Dit samtykke gælder kun for dette websted og vil ikke påvirke andre tjenester.',
			title: 'Privatlivsindstillinger',
		},
		common: {
			acceptAll: 'Accepter alle',
			clearSelection: 'Ryd',
			customPartner: 'Tilpasset partner, ikke registreret hos IAB',
			customize: 'Tilpas',
			loading: 'Indlæser...',
			rejectAll: 'Afvis alle',
			saveSettings: 'Gem indstillinger',
			showingSelectedVendor: 'Viser valgt leverandør',
		},
		preferenceCenter: {
			description:
				'Tilpas dine privatlivsindstillinger her. Du kan vælge, hvilke typer cookies og sporingsteknologier du vil tillade.',
			features: {
				description:
					'Disse behandlingsmetoder kan udelukkende anvendes til ét eller flere formål, som du får mulighed for at vælge mellem i denne meddelelse.',
				title: 'Funktioner',
			},
			footer: {
				consentStorage:
					'Samtykkepræferencer gemmes i en cookie med navnet "euconsent-v2" i 13 måneder. Opbevaringsperioden kan blive fornyet, når du opdaterer dine præferencer.',
			},
			purposeItem: {
				examples: 'Eksempler',
				legitimateInterest: 'Legitim interesse',
				objectButton: 'Gør indsigelse',
				objected: 'Indsigelse gjort',
				partners: '{count} partnere',
				partnersUsingPurpose: 'Partnere, der bruger dette formål',
				rightToObject:
					'Du har ret til at gøre indsigelse mod behandling baseret på legitim interesse.',
				vendorsUseLegitimateInterest:
					'{count} leverandører påberåber sig legitim interesse',
				withYourPermission: 'Med dit samtykke',
			},
			specialPurposes: {
				title: 'Nødvendige funktioner (påkrævet)',
				tooltip:
					'Disse er nødvendige for sidens funktionalitet og sikkerhed. Ifølge IAB TCF kan du ikke gøre indsigelse mod disse særlige formål.',
			},
			tabs: {
				purposes: 'Formål',
				vendors: 'Leverandører',
			},
			title: 'Privatlivsindstillinger',
			vendorList: {
				adTechProvidersHeading: 'Googles udbydere af annonceteknologi',
				adTechProvidersNotice:
					'Google samarbejder med disse udbydere af annonceteknologi uden for IAB-rammeværket. Dit samtykke når kun frem til en udbyder, hvis du slår den til og også tillader lagring af oplysninger på din enhed og personligt tilpassede annoncer.',
				customVendorsHeading: 'Brugerdefinerede partnere',
				customVendorsNotice:
					'Disse er tilpassede partnere, som ikke er registreret hos IAB Transparency & Consent Framework (TCF). De behandler data baseret på dit samtykke og kan have andre privatlivspraksisser end IAB-registrerede leverandører.',
				dataCategories: 'Datakategorier',
				features: 'Funktioner',
				iabVendorsHeading: 'IAB-registrerede leverandører',
				iabVendorsNotice:
					'Disse partnere er registreret hos IAB Transparency & Consent Framework (TCF), en branchestandard for håndtering af samtykke',
				legitimateInterest: 'Legitim interesse',
				maxAge: 'Maks. alder: {days}d',
				nonCookieAccess: 'Adgang uden cookies',
				privacyPolicy: 'Privatlivspolitik',
				purposes: 'Formål',
				requiredNotice:
					'Påkrævet for sidens funktionalitet, kan ikke deaktiveres',
				retention: 'Opbevaring: {days}d',
				search: 'Søg leverandører...',
				showingCount: 'Viser {filtered} af {total} leverandører',
				specialFeatures: 'Særlige funktioner',
				specialPurposes: 'Særlige formål',
				storageDisclosure: 'Oplysning om lagring',
				usesCookies: 'Bruger cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Cookiepolitik',
		privacyPolicy: 'Privatlivspolitik',
		termsOfService: 'Servicevilkår',
	},
	optOut: {
		action: 'Frameld',
		description:
			'Dette websted sælger eller deler ikke dine personoplysninger, og dit valg er gemt i denne browser.',
		done: 'Færdig',
		headingAll:
			'Salg og deling af dine personoplysninger samt målrettet annoncering',
		headingSaleAndShare: 'Salg og deling af dine personoplysninger',
		headingSaleAndTargetedAds:
			'Salg af dine personoplysninger og målrettet annoncering',
		lockedByAccount:
			'Din konto har fravalgt dette, og du kan ændre det efter login.',
		lockedByGpc:
			'Din browsers Global Privacy Control-signal er slået til, så dette forbliver slået fra.',
		notOptedOut: 'Du har ikke frameldt dig i denne browser.',
		optInCancel: 'Forbliv frameldt',
		optInConfirm: 'Tilmeld igen',
		optInDescription: 'Bekræftelse afslutter din framelding i denne browser.',
		optInDescriptionWithRights:
			'Bekræftelse afslutter din framelding af {rights} i denne browser.',
		optInLink: 'Tilmeld igen…',
		optInTitle: 'Vil du tilmelde dig igen?',
		receiptAccount: 'Du er frameldt i denne browser og på din konto.',
		receiptAccountWithRights:
			'Du er frameldt {rights} i denne browser og på din konto.',
		receiptBrowser: 'Du er frameldt i denne browser.',
		receiptBrowserWithRights: 'Du er frameldt {rights} i denne browser.',
		recordedLabel: 'Registreret',
		referenceLabel: 'Reference',
		rightsAll: 'salg, deling og målrettet annoncering',
		rightsSaleAndShare: 'salg og deling',
		rightsSaleAndTargetedAds: 'salg og målrettet annoncering',
		statusRequest: 'Anmodning om fravalg er imødekommet',
		statusSignal: 'Signal om fravalgspræference er imødekommet',
	},
	privacyChoices: {
		acceptAll: 'Accepter alle',
		advertisingFollowsSale: 'Annoncering følger dit valg ovenfor.',
		advertisingTitle: 'Annoncering',
		allow: 'Tillad',
		alwaysOn: 'Altid slået til',
		announceSaved: '{message} Gemt.',
		askAll:
			'sælge eller dele dine personoplysninger, også til målrettet annoncering',
		askSaleAndShare: 'sælge eller dele dine personoplysninger',
		askSaleAndTargetedAds:
			'sælge dine personoplysninger eller bruge dem til målrettet annoncering',
		bannerAllowedRightsOff:
			'Valgfrie cookies er tilladt. {rights} forbliver slået fra. Du kan ændre det under Dine privatlivsvalg.',
		bannerAllowedRightsOffGpc:
			'Valgfrie cookies er tilladt. {rights} forbliver slået fra på grund af dit Global Privacy Control-signal. Du kan ændre det under Dine privatlivsvalg.',
		bannerRejected:
			'Valgfrie cookies er afvist. Du kan ændre det under Dine privatlivsvalg.',
		barDescription:
			'Vi bruger cookies til at forbedre din oplevelse og analysere trafikken.',
		businessFallback: 'dette websted',
		choiceRecorded: 'Valget er registreret.',
		choicesSaved:
			'Dine valg er gemt. Du kan ændre dem under Dine privatlivsvalg.',
		choose: 'Vælg',
		chooseWhatToAllow: 'Vælg, hvad du vil tillade',
		close: 'Luk',
		confirmDescriptionOptIn:
			'{business} må {rights}. Du kan til enhver tid ændre det.',
		confirmDescriptionOptOut:
			'{business} må {rights}. Du kan til enhver tid framelde dig igen.',
		confirmKeepOptedOut: 'Forbliv frameldt',
		confirmTitleOptIn: 'Vil du tillade {rights}?',
		confirmTitleOptOut: 'Vil du tillade {rights} igen?',
		copyFailed: 'Kunne ikke kopiere. Markér og kopiér din reference:',
		copyFailedAnnouncement:
			'Kunne ikke kopiere. Hele din reference står i kvitteringen.',
		copyReference: 'Kopiér reference',
		dialogIntro: 'Dine valg gælder med det samme.',
		dialogTitle: 'Dine privatlivsvalg',
		done: 'Færdig',
		dontAllow: 'Tillad ikke',
		euDialogIntro:
			'Vælg, hvilke valgfrie cookies {business} må bruge. Valgfrie cookies forbliver slået fra, medmindre du slår dem til.',
		euDialogTitle: 'Privatlivsindstillinger',
		gpcNote:
			'Din browser har sendt et Global Privacy Control-signal, så {business} {rights} {scope}. Du kan ikke vælge Tillad, mens signalet er slået til.',
		justNow: 'lige nu',
		nestedSheetNote:
			'Ændringer gælder, når du gemmer i Privatlivsindstillinger.',
		noticeBarDescription:
			'Vi bruger cookies til at drive dette websted, måle trafik og tilpasse annoncer. Du kan til enhver tid framelde dig.',
		noticeBarDescriptionGpc:
			'Vi bruger cookies til at drive dette websted og måle trafik. Dit Global Privacy Control-signal bliver respekteret.',
		noticeGpcHonored:
			'Din browsers Global Privacy Control-signal bliver respekteret.',
		noticeRightsAction: 'Sælg eller del ikke mine data',
		nudge: 'Vælg først en af de to knapper.',
		optInBarDescription:
			'{business} spørger først om lov til valgfrie cookies og {rights}.',
		optInDescription:
			'Med din tilladelse vil {business} bruge valgfrie cookies til webstedsfunktioner og analyse samt {rights}. Intet bliver slået til, medmindre du tillader det.',
		optInTitle: 'Dine privatlivsvalg',
		optOutOption: 'Frameld',
		panelExpanded: 'Flere muligheder vises.',
		policyColumn: 'Privatlivspolitik',
		preferencesClose: 'Luk præferencer',
		preferencesOnCount: '{count} slået til',
		preferencesSheetIntro: 'Ændringer gælder med det samme.',
		preferencesSummary: 'Webstedsfunktioner og analyse',
		preferencesTitle: 'Præferencer',
		purposeColumn: 'Formål',
		receiptAllowed: 'Tilladt: {rights}',
		receiptDetails: 'Detaljer',
		receiptFromGpc: 'fra dit Global Privacy Control-signal',
		receiptLive: 'Respekterer Global Privacy Control fra denne browser',
		receiptLiveDetail: 'Læses fra din browser ved hvert besøg.',
		receiptOptedOut: 'Fravalgt: {rights}',
		receiptRecorded: 'Registreret {date}',
		receiptReference: 'Reference',
		receiptSavedAccount: 'Gemt på din konto · {date}',
		receiptSavedBrowser: 'Gemt for denne browser · {date}',
		receiptScopeAccount:
			'Gælder for denne browser og din konto hos {business}.',
		receiptScopeAccountUnnamed: 'Gælder for denne browser og din konto.',
		receiptScopeBrowser:
			'Gælder for denne browser. Log ind for også at lade det gælde for din konto.',
		receiptViaGpc: 'Global Privacy Control-signal',
		referenceCopied: 'Referencen er kopieret.',
		refuseAll:
			'sælger eller deler ikke dine personoplysninger og bruger dem ikke til målrettet annoncering',
		refuseSaleAndShare: 'sælger eller deler ikke dine personoplysninger',
		refuseSaleAndTargetedAds:
			'sælger ikke dine personoplysninger og bruger dem ikke til målrettet annoncering',
		rejectAll: 'Afvis alle',
		rightsAllowed: '{rights} er tilladt.',
		rightsNotAllowed: '{rights} er ikke tilladt.',
		rightsOptedOut: 'Du har fravalgt {rights}.',
		saleAllowed: '{business} må {rights}.',
		saleGroupOptIn: 'Tillad {rights}',
		saleGroupSaleAndTargetedAds:
			'Fravælg salg af mine personoplysninger og målrettet annoncering',
		saleOffByDefault:
			'Slået fra som standard. {business} {rights}, medmindre du tillader det.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Gem valg',
		saveInSettings: 'Gem dine valg i Privatlivsindstillinger',
		savedAutomatically: 'Gemmes automatisk',
		savedCue: 'Gemt',
		scopeAccount: 'i denne browser eller på din konto hos {business}',
		scopeAccountUnnamed: 'i denne browser eller på din konto',
		scopeBrowser: 'i denne browser',
		shortAll: 'salg eller deling af dine data til annoncer',
		shortSaleAndShare: 'salg eller deling af dine data',
		shortSaleAndTargetedAds: 'salg af dine data eller brug af dem til annoncer',
		stateOff: 'Fra',
		stateOn: 'Til',
		switchColumn: 'Til',
		switchedOff: '{name} slået fra.',
		switchedOn: '{name} slået til.',
		titleAll: 'Salg, deling og målrettet annoncering',
		titleSaleAndShare: 'Salg og deling',
		titleSaleAndTargetedAds: 'Salg og målrettet annoncering',
		vendorColumn: 'Leverandør',
		vendorPolicy: 'Privatlivspolitik for {vendor}',
		vendorsClose: 'Luk leverandører for {category}',
		vendorsFor: 'for {category}',
		vendorsHide: 'Skjul {count} leverandører',
		vendorsHideOne: 'Skjul 1 leverandør',
		vendorsOnCount: '{count} slået til',
		vendorsTable: 'Leverandører for {category}',
		vendorsView: 'Vis {count} leverandører',
		vendorsViewOne: 'Vis 1 leverandør',
	},
	rights: {
		californiaPrivacyChoices: 'Dine privatlivsvalg i Californien',
		optOut: 'Sælg eller del ikke mine data',
		preferences: 'Administrer præferencer',
		privacyChoices: 'Dine privatlivsvalg',
	},
};
export default translations;
