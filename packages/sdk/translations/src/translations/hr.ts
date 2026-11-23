import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Prihvati sve',
		acknowledge: 'U redu',
		close: 'Zatvori',
		customize: 'Prilagodi',
		dismiss: 'Zatvori',
		rejectAll: 'Odbij sve',
		save: 'Spremi postavke',
		securedBy: 'Privolama upravlja',
	},
	consentGate: {
		actionButton: 'Omogući {category} privolu',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Prihvatite {category} privolu za prikaz ovog sadržaja.',
	},
	consentManagerDialog: {
		description:
			'Ovdje možete prilagoditi svoje postavke privatnosti. Možete odabrati koje vrste kolačića i tehnologija praćenja dopuštate.',
		title: 'Postavke privatnosti',
		vendors: {
			disabledByCategory:
				'Uključite ovu kategoriju da biste odabrali prodavače.',
			privacyPolicy: 'Pravila o privatnosti',
			switchLabel: 'Dopusti {vendor}',
			title: 'Prodavači ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Ovi kolačići nam pomažu pružiti bolje korisničko iskustvo i testirati nove značajke.',
			title: 'Iskustvo',
		},
		functionality: {
			description:
				'Ovi kolačići omogućuju poboljšanu funkcionalnost i personalizaciju web stranice.',
			title: 'Funkcionalnost',
		},
		marketing: {
			description:
				'Ovi kolačići se koriste za prikaz relevantnih oglasa i praćenje njihove učinkovitosti.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Ovi kolačići nam pomažu razumjeti kako posjetitelji koriste web stranicu i poboljšati njezine performanse.',
			title: 'Analitika',
		},
		necessary: {
			description:
				'Ovi kolačići su ključni za ispravno funkcioniranje web stranice i ne mogu se onemogućiti.',
			title: 'Strogo nužno',
		},
	},
	cookieBanner: {
		description:
			'Ova stranica koristi kolačiće za poboljšanje vašeg iskustva pregledavanja, analizu prometa na stranici i prikaz personaliziranog sadržaja.',
		noticeDescription:
			'Koristimo kolačiće i slične tehnologije za rad ove stranice, mjerenje prometa te personalizaciju sadržaja i oglasa. U bilo kojem trenutku možete se odjaviti ili upravljati svojim postavkama.',
		noticeTitle: 'Obavijest o privatnosti',
		title: 'Cijenimo vašu privatnost',
	},
	iab: {
		app: {
			consentStorage:
				'Vaši izbori pohranjuju se na ovom uređaju, u standardnoj pohrani postavki aplikacije pod ključevima IABTCF, najdulje {days} dana. Trajanje pohrane obnavlja se kada ažurirate svoje izbore.',
			description:
				'Mi i naših {partnerCount} partnera pohranjujemo i/ili pristupamo informacijama na vašem uređaju i obrađujemo osobne podatke, kao što su jedinstveni identifikatori i podaci o pregledavanju, za ovu aplikaciju, kako bismo:',
			legitimateInterestExplanation:
				'Neki partneri obrađuju osobne podatke, kao što su jedinstveni identifikatori i podaci o pregledavanju, na temelju svog legitimnog interesa umjesto da traže privolu. To se odnosi samo na ovu aplikaciju. Imate pravo prigovora na ovu obradu za svaku svrhu i svakog partnera.',
			scopeServiceSpecific:
				'Vaš pristanak odnosi se samo na ovu aplikaciju i neće utjecati na druge usluge.',
			withdraw:
				'Svoje izbore možete promijeniti ili povući privolu u bilo kojem trenutku u Postavkama privatnosti u ovoj aplikaciji.',
		},
		banner: {
			andMore: 'I još {count}...',
			description:
				'Mi i naših {partnerCount} partnera pohranjujemo i/ili pristupamo informacijama na vašem uređaju i obrađujemo osobne podatke, kao što su jedinstveni identifikatori i podaci o pregledavanju, za ovu web stranicu, kako bismo:',
			legitimateInterestNotice:
				'Neki partneri polažu pravo na legitimni interes za obradu vaših podataka. Imate pravo prigovora na ovu obradu, prilagodbe svojih izbora i povlačenja privole u bilo kojem trenutku.',
			partnersLink: '{count} partnera',
			scopeGroup: 'Vaš izbor vrijedi za sve naše web stranice u ovoj grupi.',
			scopeServiceSpecific:
				'Vaš pristanak odnosi se samo na ovu web stranicu i neće utjecati na druge usluge.',
			title: 'Postavke privatnosti',
		},
		common: {
			acceptAll: 'Prihvati sve',
			clearSelection: 'Očisti',
			customPartner: 'Prilagođeni partner koji nije registriran u IAB-u',
			customize: 'Prilagodi',
			loading: 'Učitavanje...',
			rejectAll: 'Odbij sve',
			saveSettings: 'Spremi postavke',
			showingSelectedVendor: 'Prikaz odabranog prodavača',
		},
		preferenceCenter: {
			description:
				'Ovdje možete prilagoditi svoje postavke privatnosti. Možete odabrati koje vrste kolačića i tehnologija praćenja dopuštate.',
			features: {
				description:
					'Ova sredstva obrade mogu se koristiti isključivo za ostvarivanje jedne ili više svrha za koje vam je u ovoj obavijesti dan izbor.',
				title: 'Značajke',
			},
			footer: {
				consentStorage:
					'Postavke privole pohranjuju se u kolačiću pod nazivom "euconsent-v2" tijekom 13 mjeseci. Trajanje pohrane može se obnoviti kada ažurirate svoje postavke.',
			},
			purposeItem: {
				examples: 'Primjeri',
				legitimateInterest: 'Legitimni interes',
				objectButton: 'Prigovori',
				objected: 'Prigovoreno',
				partners: '{count} partnera',
				partnersUsingPurpose: 'Partneri koji koriste ovu svrhu',
				rightToObject:
					'Imate pravo prigovora na obradu temeljenu na legitimnom interesu.',
				vendorsUseLegitimateInterest:
					'{count} prodavača polaže pravo na legitimni interes',
				withYourPermission: 'Uz vaše dopuštenje',
			},
			specialPurposes: {
				title: 'Osnovne funkcije (obavezno)',
				tooltip:
					'Ove su funkcije potrebne za funkcionalnost i sigurnost stranice. Prema IAB TCF-u, ne možete uložiti prigovor na ove posebne svrhe.',
			},
			tabs: {
				purposes: 'Svrhe',
				vendors: 'Prodavači',
			},
			title: 'Postavke privatnosti',
			vendorList: {
				adTechProvidersHeading: 'Googleovi pružatelji oglasne tehnologije',
				adTechProvidersNotice:
					'Google surađuje s ovim pružateljima oglasne tehnologije izvan okvira IAB-a. Vaša privola dolazi do pružatelja samo ako ga uključite te ujedno dopustite pohranu informacija na vašem uređaju i personalizirane oglase.',
				customVendorsHeading: 'Prilagođeni partneri',
				customVendorsNotice:
					'Ovo su prilagođeni partneri koji nisu registrirani u IAB Transparency & Consent Framework (TCF). Oni obrađuju podatke na temelju vaše privole i mogu imati drugačije prakse privatnosti od IAB registriranih prodavača.',
				dataCategories: 'Kategorije podataka',
				features: 'Značajke',
				iabVendorsHeading: 'IAB registrirani prodavači',
				iabVendorsNotice:
					'Ovi partneri su registrirani u IAB Transparency & Consent Framework (TCF), industrijskom standardu za upravljanje privolama',
				legitimateInterest: 'Leg. interes',
				maxAge: 'Maks. starost: {days}d',
				nonCookieAccess: 'Pristup bez kolačića',
				privacyPolicy: 'Pravila o privatnosti',
				purposes: 'Svrhe',
				requiredNotice:
					'Potrebno za funkcionalnost stranice, ne može se onemogućiti',
				retention: 'Zadržavanje: {days}d',
				search: 'Pretraži prodavače...',
				showingCount: '{filtered} od {total} prodavača',
				specialFeatures: 'Posebne značajke',
				specialPurposes: 'Posebne svrhe',
				storageDisclosure: 'Objavljivanje pohrane',
				usesCookies: 'Koristi kolačiće',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Pravila o kolačićima',
		privacyPolicy: 'Pravila o privatnosti',
		termsOfService: 'Uvjeti pružanja usluge',
	},
	optOut: {
		action: 'Odustani',
		description:
			'Ova web-lokacija neće prodavati ni dijeliti vaše osobne podatke, a vaš je izbor spremljen u ovom pregledniku.',
		done: 'Gotovo',
		headingAll:
			'Prodaja i dijeljenje vaših osobnih podataka te ciljano oglašavanje',
		headingSaleAndShare: 'Prodaja i dijeljenje vaših osobnih podataka',
		headingSaleAndTargetedAds:
			'Prodaja vaših osobnih podataka i ciljano oglašavanje',
		lockedByAccount:
			'Vaš je račun zatražio isključivanje, a to možete promijeniti nakon prijave.',
		lockedByGpc:
			'Signal Global Privacy Control u vašem pregledniku je uključen, pa ova postavka ostaje isključena.',
		notOptedOut: 'Niste odustali u ovom pregledniku.',
		optInCancel: 'Ostani odjavljen',
		optInConfirm: 'Ponovno se uključi',
		optInDescription: 'Potvrda završava vaše isključenje u ovom pregledniku.',
		optInDescriptionWithRights:
			'Potvrda završava vaše isključenje iz {rights} u ovom pregledniku.',
		optInLink: 'Ponovno se uključi…',
		optInTitle: 'Ponovno se uključiti?',
		receiptAccount: 'Isključeni ste u ovom pregledniku i na svom računu.',
		receiptAccountWithRights:
			'Isključeni ste iz {rights} u ovom pregledniku i na svom računu.',
		receiptBrowser: 'Isključeni ste u ovom pregledniku.',
		receiptBrowserWithRights: 'Isključeni ste iz {rights} u ovom pregledniku.',
		recordedLabel: 'Zabilježeno',
		referenceLabel: 'Referenca',
		rightsAll: 'prodaje, dijeljenja i ciljanog oglašavanja',
		rightsSaleAndShare: 'prodaje i dijeljenja',
		rightsSaleAndTargetedAds: 'prodaje i ciljanog oglašavanja',
		statusRequest: 'Zahtjev za isključivanje je uvažen',
		statusSignal: 'Signal postavke isključivanja je uvažen',
	},
	privacyChoices: {
		acceptAll: 'Prihvati sve',
		advertisingFollowsSale: 'Oglašavanje slijedi vaš izbor iznad.',
		advertisingTitle: 'Oglašavanje',
		allow: 'Dopusti',
		alwaysOn: 'Uvijek uključeno',
		announceSaved: '{message} Spremljeno.',
		askAll:
			'prodavati ili dijeliti vaše osobne podatke, među ostalim i za ciljano oglašavanje',
		askSaleAndShare: 'prodavati ili dijeliti vaše osobne podatke',
		askSaleAndTargetedAds:
			'prodavati vaše osobne podatke ili ih koristiti za ciljano oglašavanje',
		bannerAllowedRightsOff:
			'Neobavezni kolačići su dopušteni. {rights}: i dalje isključeno. To možete promijeniti u odjeljku „Vaši izbori privatnosti”.',
		bannerAllowedRightsOffGpc:
			'Neobavezni kolačići su dopušteni. {rights}: i dalje isključeno zbog vašeg signala Global Privacy Control. To možete promijeniti u odjeljku „Vaši izbori privatnosti”.',
		bannerRejected:
			'Neobavezni kolačići su odbijeni. To možete promijeniti u odjeljku „Vaši izbori privatnosti”.',
		barDescription:
			'Koristimo kolačiće za poboljšanje vašeg iskustva i analizu prometa.',
		businessFallback: 'ova stranica',
		choiceRecorded: 'Izbor je zabilježen.',
		choicesSaved:
			'Izbori su spremljeni. Možete ih promijeniti u odjeljku „Vaši izbori privatnosti”.',
		choose: 'Odaberi',
		chooseWhatToAllow: 'Odaberite što želite dopustiti',
		close: 'Zatvori',
		confirmDescriptionOptIn:
			'{business} će smjeti {rights}. To možete promijeniti u bilo kojem trenutku.',
		confirmDescriptionOptOut:
			'{business} će smjeti {rights}. U bilo kojem trenutku možete se ponovno odjaviti.',
		confirmKeepOptedOut: 'Ostani odjavljen',
		confirmTitleOptIn: 'Dopustiti sljedeće: {rights}?',
		confirmTitleOptOut: 'Ponovno dopustiti sljedeće: {rights}?',
		copyFailed: 'Kopiranje nije uspjelo. Označite i kopirajte svoju referencu:',
		copyFailedAnnouncement:
			'Kopiranje nije uspjelo. Cijela referenca prikazana je u potvrdi.',
		copyReference: 'Kopiraj referencu',
		dialogIntro: 'Vaši se izbori primjenjuju odmah.',
		dialogTitle: 'Vaši izbori privatnosti',
		done: 'Gotovo',
		dontAllow: 'Ne dopusti',
		euDialogIntro:
			'Odaberite koje neobavezne kolačiće {business} smije koristiti. Neobavezni kolačići ostaju isključeni dok ih ne uključite.',
		euDialogTitle: 'Postavke privatnosti',
		gpcNote:
			'Vaš je preglednik poslao signal Global Privacy Control, pa {business} {rights} {scope}. Opcija „Dopusti” nije dostupna dok je signal uključen.',
		justNow: 'upravo sada',
		nestedSheetNote:
			'Promjene se primjenjuju kada ih spremite u Postavkama privatnosti.',
		noticeBarDescription:
			'Koristimo kolačiće za rad ove stranice, mjerenje prometa i personalizaciju oglasa. U bilo kojem trenutku možete se odjaviti.',
		noticeBarDescriptionGpc:
			'Koristimo kolačiće za rad ove stranice i mjerenje prometa. Vaš signal Global Privacy Control se poštuje.',
		noticeGpcHonored:
			'Signal Global Privacy Control vašeg preglednika se poštuje.',
		noticeRightsAction: 'Ne prodajte i ne dijelite moje podatke',
		nudge: 'Najprije odaberite jedan od dva gumba.',
		optInBarDescription:
			'{business} traži vaše dopuštenje prije korištenja neobaveznih kolačića te prije {rights}.',
		optInDescription:
			'Uz vaše dopuštenje {business} će koristiti neobavezne kolačiće za značajke stranice i analitiku te će smjeti {rights}. Ništa se ne uključuje ako to ne dopustite.',
		optInTitle: 'Vaši izbori privatnosti',
		optOutOption: 'Odustani',
		panelExpanded: 'Prikazano je više opcija.',
		policyColumn: 'Pravila o privatnosti',
		preferencesClose: 'Zatvori postavke',
		preferencesOnCount: 'Uključeno: {count}',
		preferencesSheetIntro: 'Promjene se primjenjuju odmah.',
		preferencesSummary: 'Značajke stranice i analitika',
		preferencesTitle: 'Postavke',
		purposeColumn: 'Svrha',
		receiptAllowed: 'Dopušteno: {rights}',
		receiptDetails: 'Pojedinosti',
		receiptFromGpc: 'na temelju vašeg signala Global Privacy Control',
		receiptLive: 'Poštuje se signal Global Privacy Control iz ovog preglednika',
		receiptLiveDetail: 'Očitava se iz vašeg preglednika pri svakom posjetu.',
		receiptOptedOut: 'Odjava: {rights}',
		receiptRecorded: 'Zabilježeno: {date}',
		receiptReference: 'Referenca',
		receiptSavedAccount: 'Spremljeno na vašem računu · {date}',
		receiptSavedBrowser: 'Spremljeno za ovaj preglednik · {date}',
		receiptScopeAccount:
			'Vrijedi za ovaj preglednik i vaš korisnički račun {business}.',
		receiptScopeAccountUnnamed: 'Vrijedi za ovaj preglednik i vaš račun.',
		receiptScopeBrowser:
			'Vrijedi za ovaj preglednik. Prijavite se da bi vrijedilo i za vaš račun.',
		receiptViaGpc: 'Signal Global Privacy Control',
		referenceCopied: 'Referenca je kopirana.',
		refuseAll:
			'neće prodavati ni dijeliti vaše osobne podatke niti ih koristiti za ciljano oglašavanje',
		refuseSaleAndShare: 'neće prodavati ni dijeliti vaše osobne podatke',
		refuseSaleAndTargetedAds:
			'neće prodavati vaše osobne podatke niti ih koristiti za ciljano oglašavanje',
		rejectAll: 'Odbij sve',
		rightsAllowed: '{rights}: dopušteno.',
		rightsNotAllowed: '{rights}: nije dopušteno.',
		rightsOptedOut: 'Odjava: {rights}.',
		saleAllowed: '{business} smije {rights}.',
		saleGroupOptIn: 'Dopusti: {rights}',
		saleGroupSaleAndTargetedAds:
			'Odjava od prodaje mojih osobnih podataka i ciljanog oglašavanja',
		saleOffByDefault:
			'Isključeno prema zadanim postavkama. {business} {rights} ako to ne dopustite.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Spremi izbore',
		saveInSettings: 'Spremite svoje izbore u Postavkama privatnosti',
		savedAutomatically: 'Automatski spremljeno',
		savedCue: 'Spremljeno',
		scopeAccount: 'u ovom pregledniku ni za vaš korisnički račun {business}',
		scopeAccountUnnamed: 'u ovom pregledniku ni za vaš račun',
		scopeBrowser: 'u ovom pregledniku',
		shortAll: 'prodaje ili dijeljenja vaših podataka za oglase',
		shortSaleAndShare: 'prodaje ili dijeljenja vaših podataka',
		shortSaleAndTargetedAds:
			'prodaje vaših podataka ili njihova korištenja za oglase',
		stateOff: 'Isključeno',
		stateOn: 'Uključeno',
		switchColumn: 'Uključeno',
		switchedOff: '{name}: isključeno.',
		switchedOn: '{name}: uključeno.',
		titleAll: 'Prodaja, dijeljenje i ciljano oglašavanje',
		titleSaleAndShare: 'Prodaja i dijeljenje',
		titleSaleAndTargetedAds: 'Prodaja i ciljano oglašavanje',
		vendorColumn: 'Prodavač',
		vendorPolicy: 'Pravila o privatnosti: {vendor}',
		vendorsClose: 'Zatvori prodavače: {category}',
		vendorsFor: 'za kategoriju {category}',
		vendorsHide: 'Sakrij prodavače ({count})',
		vendorsHideOne: 'Sakrij 1 prodavača',
		vendorsOnCount: 'Uključeno: {count}',
		vendorsTable: 'Prodavači: {category}',
		vendorsView: 'Prikaži prodavače ({count})',
		vendorsViewOne: 'Prikaži 1 prodavača',
	},
	rights: {
		californiaPrivacyChoices: 'Vaši izbori privatnosti u Kaliforniji',
		optOut: 'Ne prodajte i ne dijelite moje podatke',
		preferences: 'Upravljanje postavkama',
		privacyChoices: 'Vaši izbori privatnosti',
	},
};
export default translations;
