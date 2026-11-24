import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Godta alle',
		acknowledge: 'OK',
		close: 'Lukk',
		customize: 'Tilpass',
		dismiss: 'Lukk',
		rejectAll: 'Avvis alle',
		save: 'Lagre innstillingar',
		securedBy: 'Samtykke via',
	},
	consentGate: {
		actionButton: 'Aktiver {category}-samtykke',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Godta {category}-samtykke for å sjå dette innhaldet.',
	},
	consentManagerDialog: {
		description:
			'Tilpass personverninnstillingane dine her. Du kan velje kva typar informasjonskapslar og sporingsteknologiar du tillèt.',
		title: 'Personverninnstillingar',
		vendors: {
			disabledByCategory: 'Slå på denne kategorien for å velje leverandørar.',
			privacyPolicy: 'Personvernerklæring',
			switchLabel: 'Tillat {vendor}',
			title: 'Leverandørar ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Desse informasjonskapslane hjelper oss å gi ei betre brukaroppleving og teste nye funksjonar.',
			title: 'Oppleving',
		},
		functionality: {
			description:
				'Desse informasjonskapslane gjer det mogleg med forbetra funksjonalitet og personleggjering av nettstaden.',
			title: 'Funksjonalitet',
		},
		marketing: {
			description:
				'Desse informasjonskapslane blir brukte til å levere relevante annonsar og spore effektiviteten deira.',
			title: 'Marknadsføring',
		},
		measurement: {
			description:
				'Desse informasjonskapslane hjelper oss å forstå korleis besøkande samhandlar med nettstaden og forbetre ytinga.',
			title: 'Analyse',
		},
		necessary: {
			description:
				'Desse informasjonskapslane er nødvendige for at nettstaden skal fungere riktig og kan ikkje deaktiverast.',
			title: 'Strengt nødvendige',
		},
	},
	cookieBanner: {
		description:
			'Denne nettstaden brukar informasjonskapslar for å forbetre nettopplevinga di, analysere nettstadtrafikk og vise personleg tilpassa innhald.',
		noticeDescription:
			'Vi brukar informasjonskapslar og liknande teknologi for å drive denne nettstaden, måle trafikk og tilpasse innhald og annonsar. Du kan reservere deg eller administrere innstillingane dine når som helst.',
		noticeTitle: 'Personvernmelding',
		title: 'Vi verdset personvernet ditt',
	},
	iab: {
		app: {
			consentStorage:
				'Vala dine blir lagra på denne eininga, i standardlagringa for innstillingar i appen under IABTCF-nøklar, i opptil {days} dagar. Lagringstida blir fornya når du oppdaterer vala dine.',
			description:
				'Vi og våre {partnerCount} partnarar lagrar og/eller har tilgang til informasjon på eininga di og behandlar personopplysningar, som unike identifikatorar og nettlesardata, for denne appen, for å:',
			legitimateInterestExplanation:
				'Nokre partnarar behandlar personopplysningar, som unike identifikatorar og nettlesardata, på grunnlag av den legitime interessa si i staden for å be om samtykke. Dette gjeld berre for denne appen. Du har rett til å protestere mot denne behandlinga for kvart formål og kvar partnar.',
			scopeServiceSpecific:
				'Samtykket ditt gjeld berre for denne appen og påverkar ikkje andre tenester.',
			withdraw:
				'Du kan når som helst endre vala dine eller trekkje tilbake samtykket ditt under Personverninnstillingar i denne appen.',
		},
		banner: {
			andMore: 'Og {count} til...',
			description:
				'Vi og våre {partnerCount} partnarar lagrar og/eller har tilgang til informasjon på eininga di og behandlar personopplysningar, som unike identifikatorar og nettlesardata, for denne nettstaden, for å:',
			legitimateInterestNotice:
				'Nokre partnarar krev legitim interesse for å behandle dataa dine. Du har rett til å protestere mot denne behandlinga, tilpasse vala dine og trekkje tilbake samtykket ditt når som helst.',
			partnersLink: '{count} partnarar',
			scopeGroup:
				'Valet ditt gjeld på tvers av nettsidene våre i denne gruppa.',
			scopeServiceSpecific:
				'Samtykket ditt gjeld berre for denne nettstaden og påverkar ikkje andre tenester.',
			title: 'Personverninnstillingar',
		},
		common: {
			acceptAll: 'Godta alle',
			clearSelection: 'Tøm',
			customPartner: 'Eigendefinert partnar ikkje registrert i IAB',
			customize: 'Tilpass',
			loading: 'Lastar...',
			rejectAll: 'Avvis alle',
			saveSettings: 'Lagre innstillingar',
			showingSelectedVendor: 'Viser vald leverandør',
		},
		preferenceCenter: {
			description:
				'Tilpass personverninnstillingane dine her. Du kan velje kva typar informasjonskapslar og sporingsteknologiar du tillèt.',
			features: {
				description:
					'Disse behandlingsmåtene kan kun brukes for ett eller flere formål som du kan velge mellom i denne erklæringen.',
				title: 'Funksjonar',
			},
			footer: {
				consentStorage:
					'Samtykkepreferansar blir lagra i ein informasjonskapsel kalla "euconsent-v2" i 13 månader. Lagringstida kan fornyast når du oppdaterer preferansane dine.',
			},
			purposeItem: {
				examples: 'Døme',
				legitimateInterest: 'Legitim interesse',
				objectButton: 'Protester',
				objected: 'Protestert',
				partners: '{count} partnarar',
				partnersUsingPurpose: 'Partnarar som brukar dette føremålet',
				rightToObject:
					'Du har rett til å protestere mot behandling basert på legitim interesse.',
				vendorsUseLegitimateInterest:
					'{count} leverandørar krev legitim interesse',
				withYourPermission: 'Med di tillating',
			},
			specialPurposes: {
				title: 'Viktige funksjonar (påkravd)',
				tooltip:
					'Desse er nødvendige for funksjonaliteten og tryggleiken til nettstaden. I følgje IAB TCF kan du ikkje protestere mot desse spesielle føremåla.',
			},
			tabs: {
				purposes: 'Føremål',
				vendors: 'Leverandørar',
			},
			title: 'Personverninnstillingar',
			vendorList: {
				adTechProvidersHeading: 'Googles leverandørar av annonseteknologi',
				adTechProvidersNotice:
					'Google samarbeider med desse leverandørane av annonseteknologi utanfor IAB-rammeverket. Samtykket ditt når berre fram til ein leverandør viss du slår han på og også tillèt lagring av informasjon på eininga di og personleg tilpassa annonsar.',
				customVendorsHeading: 'Eigendefinerte partnarar',
				customVendorsNotice:
					'Dette er eigendefinerte partnarar som ikkje er registrerte i IAB Transparency & Consent Framework (TCF). Dei behandlar data basert på ditt samtykke og kan ha annan personvernpraksis enn IAB-registrerte leverandørar.',
				dataCategories: 'Datakategoriar',
				features: 'Funksjonar',
				iabVendorsHeading: 'IAB-registrerte leverandørar',
				iabVendorsNotice:
					'Disse partnarane er registrerte i IAB Transparency & Consent Framework (TCF), ein bransjestandard for administrasjon av samtykke',
				legitimateInterest: 'Leg. interesse',
				maxAge: 'Maks alder: {days}d',
				nonCookieAccess: 'Ikkje-informasjonskapsel-tilgang',
				privacyPolicy: 'Personvernerklæring',
				purposes: 'Føremål',
				requiredNotice:
					'Påkravd for funksjonaliteten til nettstaden, kan ikkje deaktiverast',
				retention: 'Lagring: {days}d',
				search: 'Søk etter leverandørar...',
				showingCount: '{filtered} av {total} leverandørar',
				specialFeatures: 'Spesielle funksjonar',
				specialPurposes: 'Spesielle føremål',
				storageDisclosure: 'Lagringsinformasjon',
				usesCookies: 'Brukar informasjonskapslar',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Retningslinjer for informasjonskapslar',
		privacyPolicy: 'Personvernerklæring',
		termsOfService: 'Brukarvilkår',
	},
	optOut: {
		action: 'Reservere meg',
		description:
			'Denne nettstaden vil ikkje selje eller dele personopplysningane dine, og valet ditt er lagra i denne nettlesaren.',
		done: 'Ferdig',
		headingAll:
			'Sal og deling av personopplysningane dine samt målretta annonsering',
		headingSaleAndShare: 'Sal og deling av personopplysningane dine',
		headingSaleAndTargetedAds:
			'Sal av personopplysningane dine og målretta annonsering',
		lockedByAccount:
			'Kontoen din har reservert seg, og du kan endre dette etter innlogging.',
		lockedByGpc:
			'Nettlesaren sitt Global Privacy Control-signal er på, så dette vert verande av.',
		notOptedOut: 'Du har ikkje reservert deg i denne nettlesaren.',
		optInCancel: 'Ver framleis avmeld',
		optInConfirm: 'Meld deg inn att',
		optInDescription:
			'Stadfesting avsluttar avmeldinga di i denne nettlesaren.',
		optInDescriptionWithRights:
			'Stadfesting avsluttar avmeldinga di frå {rights} i denne nettlesaren.',
		optInLink: 'Meld deg inn att…',
		optInTitle: 'Melde deg inn att?',
		receiptAccount:
			'Du har reservert deg i denne nettlesaren og på kontoen din.',
		receiptAccountWithRights:
			'Du har reservert deg mot {rights} i denne nettlesaren og på kontoen din.',
		receiptBrowser: 'Du har reservert deg i denne nettlesaren.',
		receiptBrowserWithRights:
			'Du har reservert deg mot {rights} i denne nettlesaren.',
		recordedLabel: 'Registrert',
		referenceLabel: 'Referanse',
		rightsAll: 'sal, deling og målretta annonsering',
		rightsSaleAndShare: 'sal og deling',
		rightsSaleAndTargetedAds: 'sal og målretta annonsering',
		statusRequest: 'Reservasjonsførespurnad følgd',
		statusSignal: 'Reservasjonssignal følgd',
	},
	privacyChoices: {
		acceptAll: 'Godta alle',
		advertisingFollowsSale: 'Annonsering følgjer valet ditt ovanfor.',
		advertisingTitle: 'Annonsering',
		allow: 'Tillat',
		alwaysOn: 'Alltid på',
		announceSaved: '{message} Lagra.',
		askAll:
			'selje eller dele personopplysningane dine, også til målretta annonsering',
		askSaleAndShare: 'selje eller dele personopplysningane dine',
		askSaleAndTargetedAds:
			'selje personopplysningane dine eller bruke dei til målretta annonsering',
		bannerAllowedRightsOff:
			'Valfrie informasjonskapslar er tillatne. {rights} er framleis av. Du kan endre dette i Personvernvala dine.',
		bannerAllowedRightsOffGpc:
			'Valfrie informasjonskapslar er tillatne. {rights} er framleis av på grunn av Global Privacy Control-signalet ditt. Du kan endre dette i Personvernvala dine.',
		bannerRejected:
			'Valfrie informasjonskapslar er avviste. Du kan endre dette i Personvernvala dine.',
		barDescription:
			'Vi brukar informasjonskapslar for å forbetre opplevinga di og analysere trafikk.',
		businessFallback: 'denne nettstaden',
		choiceRecorded: 'Valet er registrert.',
		choicesSaved: 'Vala er lagra. Du kan endre dei i Personvernvala dine.',
		choose: 'Vel',
		chooseWhatToAllow: 'Vel kva du vil tillate',
		close: 'Lukk',
		confirmDescriptionOptIn:
			'{business} kan {rights}. Du kan endre dette når som helst.',
		confirmDescriptionOptOut:
			'{business} kan {rights}. Du kan reservere deg att når som helst.',
		confirmKeepOptedOut: 'Ver framleis reservert',
		confirmTitleOptIn: 'Tillate {rights}?',
		confirmTitleOptOut: 'Tillate {rights} att?',
		copyFailed: 'Kunne ikkje kopiere. Marker og kopier referansen din:',
		copyFailedAnnouncement:
			'Kunne ikkje kopiere. Heile referansen din står i kvitteringa.',
		copyReference: 'Kopier referanse',
		dialogIntro: 'Vala dine gjeld med ein gong.',
		dialogTitle: 'Personvernvala dine',
		done: 'Ferdig',
		dontAllow: 'Ikkje tillat',
		euDialogIntro:
			'Vel kva for valfrie informasjonskapslar {business} kan bruke. Valfrie informasjonskapslar er av med mindre du slår dei på.',
		euDialogTitle: 'Personverninnstillingar',
		gpcNote:
			'Nettlesaren din sende eit Global Privacy Control-signal. {business} {rights} {scope}. Tillat er ikkje tilgjengeleg medan signalet er på.',
		justNow: 'akkurat no',
		nestedSheetNote:
			'Endringane gjeld når du lagrar i Personverninnstillingar.',
		noticeBarDescription:
			'Vi brukar informasjonskapslar for å drive denne nettstaden, måle trafikk og tilpasse annonsar. Du kan reservere deg når som helst.',
		noticeBarDescriptionGpc:
			'Vi brukar informasjonskapslar for å drive denne nettstaden og måle trafikk. Global Privacy Control-signalet ditt vert respektert.',
		noticeGpcHonored:
			'Global Privacy Control-signalet frå nettlesaren din vert respektert.',
		noticeRightsAction: 'Ikkje sel eller del dataa mine',
		nudge: 'Vel ein av dei to knappane først.',
		optInBarDescription:
			'{business} ber om samtykke til valfrie informasjonskapslar og til {rights}.',
		optInDescription:
			'Med løyve frå deg vil {business} bruke valfrie informasjonskapslar til nettstadfunksjonar og analyse, og {rights}. Ingenting vert slått på med mindre du tillèt det.',
		optInTitle: 'Personvernvala dine',
		optOutOption: 'Reservere meg',
		panelExpanded: 'Fleire val vert viste.',
		policyColumn: 'Personvernerklæring',
		preferencesClose: 'Lukk innstillingar',
		preferencesOnCount: '{count} på',
		preferencesSheetIntro: 'Endringar gjeld med ein gong.',
		preferencesSummary: 'Nettstadfunksjonar og analyse',
		preferencesTitle: 'Innstillingar',
		purposeColumn: 'Føremål',
		receiptAllowed: 'Tillate: {rights}',
		receiptDetails: 'Detaljar',
		receiptFromGpc: 'frå Global Privacy Control-signalet ditt',
		receiptLive: 'Respekterer Global Privacy Control frå denne nettlesaren',
		receiptLiveDetail: 'Vert lese frå nettlesaren din ved kvart besøk.',
		receiptOptedOut: 'Reservert mot {rights}',
		receiptRecorded: 'Registrert {date}',
		receiptReference: 'Referanse',
		receiptSavedAccount: 'Lagra på kontoen din · {date}',
		receiptSavedBrowser: 'Lagra for denne nettlesaren · {date}',
		receiptScopeAccount:
			'Gjeld denne nettlesaren og kontoen din hos {business}.',
		receiptScopeAccountUnnamed: 'Gjeld denne nettlesaren og kontoen din.',
		receiptScopeBrowser:
			'Gjeld denne nettlesaren. Logg inn for å bruke valet på kontoen din òg.',
		receiptViaGpc: 'Global Privacy Control-signal',
		referenceCopied: 'Referansen er kopiert.',
		refuseAll:
			'sel eller deler ikkje personopplysningane dine og brukar dei ikkje til målretta annonsering',
		refuseSaleAndShare: 'sel eller deler ikkje personopplysningane dine',
		refuseSaleAndTargetedAds:
			'sel ikkje personopplysningane dine og brukar dei ikkje til målretta annonsering',
		rejectAll: 'Avvis alle',
		rightsAllowed: '{rights} er tillate.',
		rightsNotAllowed: '{rights} er ikkje tillate.',
		rightsOptedOut: 'Reservert mot {rights}.',
		saleAllowed: '{business} kan {rights}.',
		saleGroupOptIn: 'Tillat {rights}',
		saleGroupSaleAndTargetedAds:
			'Reserver meg mot sal av personopplysningane mine og målretta annonsering',
		saleOffByDefault:
			'Av som standard. {business} {rights} med mindre du tillèt det.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Lagre val',
		saveInSettings: 'Lagre vala dine i Personverninnstillingar',
		savedAutomatically: 'Vert lagra automatisk',
		savedCue: 'Lagra',
		scopeAccount: 'i denne nettlesaren eller for kontoen din hos {business}',
		scopeAccountUnnamed: 'i denne nettlesaren eller for kontoen din',
		scopeBrowser: 'i denne nettlesaren',
		shortAll: 'sal eller deling av dataa dine til annonsering',
		shortSaleAndShare: 'sal eller deling av dataa dine',
		shortSaleAndTargetedAds:
			'sal av dataa dine eller bruk av dei til annonsering',
		stateOff: 'Av',
		stateOn: 'På',
		switchColumn: 'På',
		switchedOff: '{name} av.',
		switchedOn: '{name} på.',
		titleAll: 'Sal, deling og målretta annonsering',
		titleSaleAndShare: 'Sal og deling',
		titleSaleAndTargetedAds: 'Sal og målretta annonsering',
		vendorColumn: 'Leverandør',
		vendorPolicy: 'Personvernerklæringa til {vendor}',
		vendorsClose: 'Lukk leverandørar for {category}',
		vendorsFor: 'i kategorien {category}',
		vendorsHide: 'Skjul {count} leverandørar',
		vendorsHideOne: 'Skjul 1 leverandør',
		vendorsOnCount: '{count} på',
		vendorsTable: 'Leverandørar for {category}',
		vendorsView: 'Vis {count} leverandørar',
		vendorsViewOne: 'Vis 1 leverandør',
	},
	rights: {
		californiaPrivacyChoices: 'Personvernvala dine i California',
		optOut: 'Ikkje sel eller del dataa mine',
		preferences: 'Administrer innstillingar',
		privacyChoices: 'Personvernvala dine',
	},
};
export default translations;
