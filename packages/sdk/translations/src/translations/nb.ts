import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Godta alle',
		acknowledge: 'OK',
		close: 'Lukk',
		customize: 'Tilpass',
		dismiss: 'Lukk',
		rejectAll: 'Avslå alle',
		save: 'Lagre innstillinger',
		securedBy: 'Samtykke via',
	},
	consentGate: {
		actionButton: 'Aktiver {category}-samtykke',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Godta {category}-samtykke for å se dette innholdet.',
	},
	consentManagerDialog: {
		description:
			'Tilpass personverninnstillingene dine her. Du kan velge hvilke typer informasjonskapsler og sporingsteknologier du vil tillate.',
		title: 'Personverninnstillinger',
		vendors: {
			disabledByCategory: 'Slå på denne kategorien for å velge leverandører.',
			privacyPolicy: 'Personvernerklæring',
			switchLabel: 'Tillat {vendor}',
			title: 'Leverandører ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Disse informasjonskapslene hjelper oss med å gi en bedre brukeropplevelse og teste nye funksjoner.',
			title: 'Opplevelse',
		},
		functionality: {
			description:
				'Disse informasjonskapslene muliggjør forbedret funksjonalitet og personalisering av nettstedet.',
			title: 'Funksjonalitet',
		},
		marketing: {
			description:
				'Disse informasjonskapslene brukes til å levere relevante annonser og spore deres effektivitet.',
			title: 'Markedsføring',
		},
		measurement: {
			description:
				'Disse informasjonskapslene hjelper oss med å forstå hvordan besøkende samhandler med nettstedet og forbedre ytelsen.',
			title: 'Analyse',
		},
		necessary: {
			description:
				'Disse informasjonskapslene er essensielle for at nettstedet skal fungere riktig og kan ikke deaktiveres.',
			title: 'Strengt nødvendige',
		},
	},
	cookieBanner: {
		description:
			'Dette nettstedet bruker informasjonskapsler for å forbedre din nettopplevelse, analysere trafikk og vise personlig tilpasset innhold.',
		noticeDescription:
			'Vi bruker informasjonskapsler og lignende teknologi for å drive dette nettstedet, måle trafikk og tilpasse innhold og annonser. Du kan reservere deg eller administrere innstillingene dine når som helst.',
		noticeTitle: 'Personvernmelding',
		title: 'Vi verdsetter ditt personvern',
	},
	iab: {
		app: {
			consentStorage:
				'Valgene dine lagres på denne enheten, i appens standard lagring for innstillinger under IABTCF-nøkler, i opptil {days} dager. Lagringsperioden fornyes når du oppdaterer valgene dine.',
			description:
				'Vi og våre {partnerCount} partnere lagrer og/eller har tilgang til informasjon på enheten din og behandler personopplysninger, som unike identifikatorer og nettleserdata, for denne appen, for å:',
			legitimateInterestExplanation:
				'Noen partnere behandler personopplysninger, som unike identifikatorer og nettleserdata, på grunnlag av sin legitime interesse i stedet for å be om samtykke. Dette gjelder bare for denne appen. Du har rett til å protestere mot denne behandlingen for hvert formål og hver partner.',
			scopeServiceSpecific:
				'Samtykket ditt gjelder bare for denne appen og påvirker ikke andre tjenester.',
			withdraw:
				'Du kan når som helst endre valgene dine eller trekke tilbake samtykket ditt under Personverninnstillinger i denne appen.',
		},
		banner: {
			andMore: 'Og {count} til...',
			description:
				'Vi og våre {partnerCount} partnere lagrer og/eller har tilgang til informasjon på enheten din og behandler personopplysninger, som unike identifikatorer og nettleserdata, for dette nettstedet, for å:',
			legitimateInterestNotice:
				'Noen partnere krever legitim interesse for å behandle dataene dine. Du har rett til å protestere mot denne behandlingen, tilpasse valgene dine og trekke tilbake samtykket ditt når som helst.',
			partnersLink: '{count} partnere',
			scopeGroup:
				'Valget ditt gjelder på tvers av våre nettsider i denne gruppen.',
			scopeServiceSpecific:
				'Samtykket ditt gjelder bare for dette nettstedet og påvirker ikke andre tjenester.',
			title: 'Personverninnstillinger',
		},
		common: {
			acceptAll: 'Godta alle',
			clearSelection: 'Tøm',
			customPartner: 'Egendefinert partner ikke registrert i IAB',
			customize: 'Tilpass',
			loading: 'Laster...',
			rejectAll: 'Avslå alle',
			saveSettings: 'Lagre innstillinger',
			showingSelectedVendor: 'Viser valgt leverandør',
		},
		preferenceCenter: {
			description:
				'Tilpass personverninnstillingene dine her. Du kan velge hvilke typer informasjonskapsler og sporingsteknologier du vil tillate.',
			features: {
				description:
					'Disse behandlingsmåtene kan kun brukes for ett eller flere formål som du kan velge mellom i denne erklæringen.',
				title: 'Funksjoner',
			},
			footer: {
				consentStorage:
					'Samtykkepreferanser lagres i en informasjonskapsel kalt "euconsent-v2" i 13 måneder. Lagringsperioden kan fornyes når du oppdaterer preferansene dine.',
			},
			purposeItem: {
				examples: 'Eksempler',
				legitimateInterest: 'Legitim interesse',
				objectButton: 'Protester',
				objected: 'Protestert',
				partners: '{count} partnere',
				partnersUsingPurpose: 'Partnere som bruker dette formålet',
				rightToObject:
					'Du har rett til å protestere mot behandling basert på legitim interesse.',
				vendorsUseLegitimateInterest:
					'{count} leverandører krever legitim interesse',
				withYourPermission: 'Med din tillatelse',
			},
			specialPurposes: {
				title: 'Viktige funksjoner (påkrevd)',
				tooltip:
					'Disse er nødvendige for nettstedets funksjonalitet og sikkerhet. I henhold til IAB TCF kan du ikke protestere mot disse spesielle formålene.',
			},
			tabs: {
				purposes: 'Formål',
				vendors: 'Leverandører',
			},
			title: 'Personverninnstillinger',
			vendorList: {
				adTechProvidersHeading: 'Googles leverandører av annonseteknologi',
				adTechProvidersNotice:
					'Google samarbeider med disse leverandørene av annonseteknologi utenfor IAB-rammeverket. Samtykket ditt når bare frem til en leverandør hvis du slår den på og også tillater lagring av informasjon på enheten din og personlig tilpassede annonser.',
				customVendorsHeading: 'Egendefinerte partnere',
				customVendorsNotice:
					'Dette er egendefinerte partnere som ikke er registrert i IAB Transparency & Consent Framework (TCF). De behandler data basert på ditt samtykke og kan ha annen personvernpraksis enn IAB-registrerte leverandører.',
				dataCategories: 'Datakategorier',
				features: 'Funksjoner',
				iabVendorsHeading: 'IAB-registrerte leverandører',
				iabVendorsNotice:
					'Disse partnerne er registrert i IAB Transparency & Consent Framework (TCF), en bransjestandard for administrasjon av samtykke',
				legitimateInterest: 'Leg. interesse',
				maxAge: 'Maks alder: {days}d',
				nonCookieAccess: 'Ikke-informasjonskapsel-tilgang',
				privacyPolicy: 'Personvernerklæring',
				purposes: 'Formål',
				requiredNotice:
					'Påkrevd for nettstedets funksjonalitet, kan ikke deaktiveres',
				retention: 'Oppbevaring: {days}d',
				search: 'Søk etter leverandører...',
				showingCount: '{filtered} av {total} leverandører',
				specialFeatures: 'Spesielle funksjoner',
				specialPurposes: 'Spesielle formål',
				storageDisclosure: 'Lagringsinformasjon',
				usesCookies: 'Bruker informasjonskapsler',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Retningslinjer for informasjonskapsler',
		privacyPolicy: 'Personvernerklæring',
		termsOfService: 'Vilkår for bruk',
	},
	optOut: {
		action: 'Reservere meg',
		description:
			'Dette nettstedet vil ikke selge eller dele personopplysningene dine, og valget ditt er lagret i denne nettleseren.',
		done: 'Ferdig',
		headingAll:
			'Salg og deling av personopplysningene dine samt målrettet annonsering',
		headingSaleAndShare: 'Salg og deling av personopplysningene dine',
		headingSaleAndTargetedAds:
			'Salg av personopplysningene dine og målrettet annonsering',
		lockedByAccount:
			'Kontoen din har reservert seg, og du kan endre dette etter at du logger inn.',
		lockedByGpc:
			'Nettleserens Global Privacy Control-signal er på, så dette forblir av.',
		notOptedOut: 'Du har ikke reservert deg i denne nettleseren.',
		optInCancel: 'Forbli avmeldt',
		optInConfirm: 'Meld deg inn igjen',
		optInDescription:
			'Bekreftelse avslutter avmeldingen din i denne nettleseren.',
		optInDescriptionWithRights:
			'Bekreftelse avslutter avmeldingen din fra {rights} i denne nettleseren.',
		optInLink: 'Meld deg inn igjen…',
		optInTitle: 'Melde deg inn igjen?',
		receiptAccount:
			'Du har reservert deg i denne nettleseren og på kontoen din.',
		receiptAccountWithRights:
			'Du har reservert deg mot {rights} i denne nettleseren og på kontoen din.',
		receiptBrowser: 'Du har reservert deg i denne nettleseren.',
		receiptBrowserWithRights:
			'Du har reservert deg mot {rights} i denne nettleseren.',
		recordedLabel: 'Registrert',
		referenceLabel: 'Referanse',
		rightsAll: 'salg, deling og målrettet annonsering',
		rightsSaleAndShare: 'salg og deling',
		rightsSaleAndTargetedAds: 'salg og målrettet annonsering',
		statusRequest: 'Reservasjonsforespørsel etterkommet',
		statusSignal: 'Reservasjonssignal etterkommet',
	},
	privacyChoices: {
		acceptAll: 'Godta alle',
		advertisingFollowsSale: 'Annonsering følger valget ditt ovenfor.',
		advertisingTitle: 'Annonsering',
		allow: 'Tillat',
		alwaysOn: 'Alltid på',
		announceSaved: '{message} Lagret.',
		askAll:
			'selge eller dele personopplysningene dine, også til målrettet annonsering',
		askSaleAndShare: 'selge eller dele personopplysningene dine',
		askSaleAndTargetedAds:
			'selge personopplysningene dine eller bruke dem til målrettet annonsering',
		bannerAllowedRightsOff:
			'Valgfrie informasjonskapsler er tillatt. {rights} er fortsatt av. Du kan endre dette i Dine personvernvalg.',
		bannerAllowedRightsOffGpc:
			'Valgfrie informasjonskapsler er tillatt. {rights} er fortsatt av på grunn av Global Privacy Control-signalet ditt. Du kan endre dette i Dine personvernvalg.',
		bannerRejected:
			'Valgfrie informasjonskapsler er avslått. Du kan endre dette i Dine personvernvalg.',
		barDescription:
			'Vi bruker informasjonskapsler for å forbedre opplevelsen din og analysere trafikk.',
		businessFallback: 'dette nettstedet',
		choiceRecorded: 'Valget er registrert.',
		choicesSaved: 'Valgene er lagret. Du kan endre dem i Dine personvernvalg.',
		choose: 'Velg',
		chooseWhatToAllow: 'Velg hva du vil tillate',
		close: 'Lukk',
		confirmDescriptionOptIn:
			'{business} kan {rights}. Du kan endre dette når som helst.',
		confirmDescriptionOptOut:
			'{business} kan {rights}. Du kan reservere deg igjen når som helst.',
		confirmKeepOptedOut: 'Forbli reservert',
		confirmTitleOptIn: 'Tillate {rights}?',
		confirmTitleOptOut: 'Tillate {rights} igjen?',
		copyFailed: 'Kunne ikke kopiere. Marker og kopier referansen din:',
		copyFailedAnnouncement:
			'Kunne ikke kopiere. Hele referansen din vises i kvitteringen.',
		copyReference: 'Kopier referanse',
		dialogIntro: 'Valgene dine gjelder med en gang.',
		dialogTitle: 'Dine personvernvalg',
		done: 'Ferdig',
		dontAllow: 'Ikke tillat',
		euDialogIntro:
			'Velg hvilke valgfrie informasjonskapsler {business} kan bruke. Valgfrie informasjonskapsler er av med mindre du slår dem på.',
		euDialogTitle: 'Personverninnstillinger',
		gpcNote:
			'Nettleseren din sendte et Global Privacy Control-signal. {business} {rights} {scope}. Tillat er ikke tilgjengelig mens signalet er på.',
		justNow: 'akkurat nå',
		nestedSheetNote:
			'Endringene gjelder når du lagrer i Personverninnstillinger.',
		noticeBarDescription:
			'Vi bruker informasjonskapsler for å drive dette nettstedet, måle trafikk og tilpasse annonser. Du kan reservere deg når som helst.',
		noticeBarDescriptionGpc:
			'Vi bruker informasjonskapsler for å drive dette nettstedet og måle trafikk. Global Privacy Control-signalet ditt blir respektert.',
		noticeGpcHonored:
			'Global Privacy Control-signalet fra nettleseren din blir respektert.',
		noticeRightsAction: 'Ikke selg eller del dataene mine',
		nudge: 'Velg en av de to knappene først.',
		optInBarDescription:
			'{business} ber om samtykke til valgfrie informasjonskapsler og til {rights}.',
		optInDescription:
			'Med din tillatelse vil {business} bruke valgfrie informasjonskapsler til nettstedsfunksjoner og analyse, og {rights}. Ingenting slås på med mindre du tillater det.',
		optInTitle: 'Dine personvernvalg',
		optOutOption: 'Reservere meg',
		panelExpanded: 'Flere valg vises.',
		policyColumn: 'Personvernerklæring',
		preferencesClose: 'Lukk innstillinger',
		preferencesOnCount: '{count} på',
		preferencesSheetIntro: 'Endringer gjelder med en gang.',
		preferencesSummary: 'Nettstedsfunksjoner og analyse',
		preferencesTitle: 'Innstillinger',
		purposeColumn: 'Formål',
		receiptAllowed: 'Tillatt: {rights}',
		receiptDetails: 'Detaljer',
		receiptFromGpc: 'fra Global Privacy Control-signalet ditt',
		receiptLive: 'Respekterer Global Privacy Control fra denne nettleseren',
		receiptLiveDetail: 'Leses fra nettleseren din ved hvert besøk.',
		receiptOptedOut: 'Reservert mot {rights}',
		receiptRecorded: 'Registrert {date}',
		receiptReference: 'Referanse',
		receiptSavedAccount: 'Lagret på kontoen din · {date}',
		receiptSavedBrowser: 'Lagret for denne nettleseren · {date}',
		receiptScopeAccount:
			'Gjelder denne nettleseren og kontoen din hos {business}.',
		receiptScopeAccountUnnamed: 'Gjelder denne nettleseren og kontoen din.',
		receiptScopeBrowser:
			'Gjelder denne nettleseren. Logg inn for å bruke valget på kontoen din også.',
		receiptViaGpc: 'Global Privacy Control-signal',
		referenceCopied: 'Referansen er kopiert.',
		refuseAll:
			'selger eller deler ikke personopplysningene dine og bruker dem ikke til målrettet annonsering',
		refuseSaleAndShare: 'selger eller deler ikke personopplysningene dine',
		refuseSaleAndTargetedAds:
			'selger ikke personopplysningene dine og bruker dem ikke til målrettet annonsering',
		rejectAll: 'Avslå alle',
		rightsAllowed: '{rights} er tillatt.',
		rightsNotAllowed: '{rights} er ikke tillatt.',
		rightsOptedOut: 'Reservert mot {rights}.',
		saleAllowed: '{business} kan {rights}.',
		saleGroupOptIn: 'Tillat {rights}',
		saleGroupSaleAndTargetedAds:
			'Reserver meg mot salg av personopplysningene mine og målrettet annonsering',
		saleOffByDefault:
			'Av som standard. {business} {rights} med mindre du tillater det.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Lagre valg',
		saveInSettings: 'Lagre valgene dine i Personverninnstillinger',
		savedAutomatically: 'Lagres automatisk',
		savedCue: 'Lagret',
		scopeAccount: 'i denne nettleseren eller for kontoen din hos {business}',
		scopeAccountUnnamed: 'i denne nettleseren eller for kontoen din',
		scopeBrowser: 'i denne nettleseren',
		shortAll: 'salg eller deling av dataene dine til annonsering',
		shortSaleAndShare: 'salg eller deling av dataene dine',
		shortSaleAndTargetedAds:
			'salg av dataene dine eller bruk av dem til annonsering',
		stateOff: 'Av',
		stateOn: 'På',
		switchColumn: 'På',
		switchedOff: '{name} av.',
		switchedOn: '{name} på.',
		titleAll: 'Salg, deling og målrettet annonsering',
		titleSaleAndShare: 'Salg og deling',
		titleSaleAndTargetedAds: 'Salg og målrettet annonsering',
		vendorColumn: 'Leverandør',
		vendorPolicy: 'Personvernerklæringen til {vendor}',
		vendorsClose: 'Lukk leverandører for {category}',
		vendorsFor: 'i kategorien {category}',
		vendorsHide: 'Skjul {count} leverandører',
		vendorsHideOne: 'Skjul 1 leverandør',
		vendorsOnCount: '{count} på',
		vendorsTable: 'Leverandører for {category}',
		vendorsView: 'Vis {count} leverandører',
		vendorsViewOne: 'Vis 1 leverandør',
	},
	rights: {
		californiaPrivacyChoices: 'Dine personvernvalg i California',
		optOut: 'Ikke selg eller del dataene mine',
		preferences: 'Administrer innstillinger',
		privacyChoices: 'Dine personvernvalg',
	},
};
export default translations;
