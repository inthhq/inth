import type { CompleteTranslations } from '../types';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Accepter alle',
		acknowledge: 'OK',
		close: 'Luk',
		customize: 'Tilpas',
		dismiss: 'Luk',
		rejectAll: 'Afvis alle',
		save: 'Gem indstillinger',
		securedBy: 'Sikret af',
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
	rights: {
		californiaPrivacyChoices: 'Dine privatlivsvalg i Californien',
		optOut: 'Sælg eller del ikke mine data',
		preferences: 'Administrer præferencer',
		privacyChoices: 'Dine privatlivsvalg',
	},
};
export default translations;
