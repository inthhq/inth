import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Acceptă toate',
		acknowledge: 'OK',
		close: 'Închide',
		customize: 'Personalizează',
		dismiss: 'Închide',
		rejectAll: 'Respinge toate',
		save: 'Salvează setările',
		securedBy: 'Consimțământ prin',
	},
	consentGate: {
		actionButton: 'Activează consimțământul pentru {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title:
			'Acceptă consimțământul pentru {category} pentru a vizualiza acest conținut.',
	},
	consentManagerDialog: {
		description:
			'Personalizează setările de confidențialitate aici. Poți alege ce tipuri de cookie-uri și tehnologii de urmărire permiți.',
		title: 'Setări de confidențialitate',
		vendors: {
			disabledByCategory:
				'Activați această categorie pentru a alege furnizori.',
			privacyPolicy: 'Politică de confidențialitate',
			switchLabel: 'Permite {vendor}',
			title: 'Furnizori ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Aceste cookie-uri ne ajută să oferim o experiență mai bună utilizatorilor și să testăm funcționalități noi.',
			title: 'Experiență',
		},
		functionality: {
			description:
				'Aceste cookie-uri permit funcționalități avansate și personalizarea site-ului.',
			title: 'Funcționalitate',
		},
		marketing: {
			description:
				'Aceste cookie-uri sunt utilizate pentru a livra reclame relevante și pentru a urmări eficiența acestora.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Aceste cookie-uri ne ajută să înțelegem cum interacționează vizitatorii cu site-ul și să îi îmbunătățim performanța.',
			title: 'Analitice',
		},
		necessary: {
			description:
				'Aceste cookie-uri sunt esențiale pentru funcționarea corectă a site-ului și nu pot fi dezactivate.',
			title: 'Strict necesare',
		},
	},
	cookieBanner: {
		description:
			'Acest site folosește cookie-uri pentru a îmbunătăți experiența de navigare, a analiza traficul site-ului și a afișa conținut personalizat.',
		noticeDescription:
			'Folosim cookie-uri și tehnologii similare pentru a opera acest site, a măsura traficul și a personaliza conținutul și reclamele. Poți renunța sau gestiona preferințele oricând.',
		noticeTitle: 'Notificare privind confidențialitatea',
		title: 'Prețuim confidențialitatea ta',
	},
	iab: {
		app: {
			consentStorage:
				'Alegerile tale sunt stocate pe acest dispozitiv, în spațiul standard de stocare a setărilor aplicației, sub chei IABTCF, timp de cel mult {days} zile. Durata de stocare se reînnoiește atunci când îți actualizezi alegerile.',
			description:
				'Noi și cei {partnerCount} parteneri ai noștri stocăm și/sau accesăm informații pe dispozitivul tău și procesăm date personale, cum ar fi identificatori unici și date de navigare, pentru această aplicație, pentru:',
			legitimateInterestExplanation:
				'Unii parteneri procesează date personale, cum ar fi identificatori unici și date de navigare, pe baza interesului lor legitim, în loc să îți ceară consimțământul. Acest lucru se aplică doar acestei aplicații. Ai dreptul de a te opune acestei procesări pentru fiecare scop și fiecare partener.',
			scopeServiceSpecific:
				'Consimțământul tău se aplică doar acestei aplicații și nu va afecta alte servicii.',
			withdraw:
				'Îți poți modifica alegerile sau îți poți retrage consimțământul în orice moment din Setări de confidențialitate în această aplicație.',
		},
		banner: {
			andMore: 'Și încă {count}...',
			description:
				'Noi și cei {partnerCount} parteneri ai noștri stocăm și/sau accesăm informații pe dispozitivul tău și procesăm date personale, cum ar fi identificatori unici și date de navigare, pentru acest site web, pentru:',
			legitimateInterestNotice:
				'Unii parteneri invocă un interes legitim pentru a procesa datele tale. Ai dreptul de a te opune acestei procesări, de a-ți personaliza alegerile și de a-ți retrage consimțământul în orice moment.',
			partnersLink: '{count} parteneri',
			scopeGroup:
				'Alegerea dvs. se aplică tuturor site-urilor noastre din acest grup.',
			scopeServiceSpecific:
				'Consimțământul tău se aplică doar acestui site web și nu va afecta alte servicii.',
			title: 'Setări de confidențialitate',
		},
		common: {
			acceptAll: 'Acceptă toate',
			clearSelection: 'Șterge',
			customPartner: 'Partener personalizat neînregistrat în IAB',
			customize: 'Personalizează',
			loading: 'Se încarcă...',
			rejectAll: 'Respinge toate',
			saveSettings: 'Salvează setările',
			showingSelectedVendor: 'Se afișează furnizorul selectat',
		},
		preferenceCenter: {
			description:
				'Personalizează setările de confidențialitate aici. Poți alege ce tipuri de cookie-uri și tehnologii de urmărire permiți.',
			features: {
				description:
					'Aceste mijloace de prelucrare pot fi utilizate exclusiv pentru unul sau mai multe scopuri cu privire la care vi se oferă posibilitatea de a alege în această notificare.',
				title: 'Funcționalități',
			},
			footer: {
				consentStorage:
					'Preferințele de consimțământ sunt stocate într-un cookie numit „euconsent-v2” timp de 13 luni. Durata de stocare poate fi reînnoită atunci când îți actualizezi preferințele.',
			},
			purposeItem: {
				examples: 'Exemple',
				legitimateInterest: 'Interes legitim',
				objectButton: 'Opunere',
				objected: 'Opoziție exprimată',
				partners: '{count} parteneri',
				partnersUsingPurpose: 'Parteneri care utilizează acest scop',
				rightToObject:
					'Ai dreptul de a te opune procesării bazate pe interesul legitim.',
				vendorsUseLegitimateInterest:
					'{count} furnizori invocă interes legitim',
				withYourPermission: 'Cu permisiunea ta',
			},
			specialPurposes: {
				title: 'Funcții esențiale (obligatorii)',
				tooltip:
					'Acestea sunt necesare pentru funcționalitatea și securitatea site-ului. Conform IAB TCF, nu te poți opune acestor scopuri speciale.',
			},
			tabs: {
				purposes: 'Scopuri',
				vendors: 'Furnizori',
			},
			title: 'Setări de confidențialitate',
			vendorList: {
				adTechProvidersHeading: 'Furnizori de tehnologie publicitară Google',
				adTechProvidersNotice:
					'Google colaborează cu acești furnizori de tehnologie publicitară în afara cadrului IAB. Consimțământul tău ajunge la un furnizor doar dacă îl activezi și permiți, de asemenea, stocarea informațiilor pe dispozitivul tău și publicitatea personalizată.',
				customVendorsHeading: 'Parteneri personalizați',
				customVendorsNotice:
					'Aceștia sunt parteneri personalizați care nu sunt înregistrați în IAB Transparency & Consent Framework (TCF). Ei procesează datele pe baza consimțământului tău și pot avea practici de confidențialitate diferite de cele ale furnizorilor înregistrați IAB.',
				dataCategories: 'Categorii de date',
				features: 'Funcționalități',
				iabVendorsHeading: 'Furnizori înregistrați IAB',
				iabVendorsNotice:
					'Acești parteneri sunt înregistrați în cadrul IAB Transparency & Consent Framework (TCF), un standard industrial pentru gestionarea consimțământului',
				legitimateInterest: 'Int. legitim',
				maxAge: 'Vârstă max.: {days}z',
				nonCookieAccess: 'Acces non-cookie',
				privacyPolicy: 'Politică de confidențialitate',
				purposes: 'Scopuri',
				requiredNotice:
					'Necesar pentru funcționalitatea site-ului, nu poate fi dezactivat',
				retention: 'Retenție: {days}z',
				search: 'Caută furnizori...',
				showingCount: 'Se afișează {filtered} din {total} furnizori',
				specialFeatures: 'Funcționalități speciale',
				specialPurposes: 'Scopuri speciale',
				storageDisclosure: 'Prezentarea stocării',
				usesCookies: 'Utilizează cookie-uri',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Politica privind cookie-urile',
		privacyPolicy: 'Politica de confidențialitate',
		termsOfService: 'Termeni și condiții',
	},
	optOut: {
		action: 'Renunță',
		description:
			'Acest site nu va vinde și nu va partaja informațiile tale personale, iar alegerea ta este salvată în acest browser.',
		done: 'Gata',
		headingAll:
			'Vânzarea și partajarea datelor dvs. personale și publicitatea direcționată',
		headingSaleAndShare: 'Vânzarea și partajarea datelor dvs. personale',
		headingSaleAndTargetedAds:
			'Vânzarea datelor dvs. personale și publicitatea direcționată',
		lockedByAccount:
			'Contul tău a renunțat și poți schimba aceasta după autentificare.',
		lockedByGpc:
			'Semnalul Global Privacy Control al browserului tău este activ, așa că această opțiune rămâne dezactivată.',
		notOptedOut: 'Nu ați renunțat în acest browser.',
		optInCancel: 'Rămâi dezabonat',
		optInConfirm: 'Reînscrie-te',
		optInDescription: 'Confirmarea încheie renunțarea ta în acest browser.',
		optInDescriptionWithRights:
			'Confirmarea încheie renunțarea ta la {rights} în acest browser.',
		optInLink: 'Reînscrie-te…',
		optInTitle: 'Te reînscrii?',
		receiptAccount: 'Ai renunțat în acest browser și pe contul tău.',
		receiptAccountWithRights:
			'Ai renunțat la {rights} în acest browser și pe contul tău.',
		receiptBrowser: 'Ai renunțat în acest browser.',
		receiptBrowserWithRights: 'Ai renunțat la {rights} în acest browser.',
		recordedLabel: 'Înregistrat',
		referenceLabel: 'Referință',
		rightsAll: 'vânzare, partajare și publicitate direcționată',
		rightsSaleAndShare: 'vânzare și partajare',
		rightsSaleAndTargetedAds: 'vânzare și publicitate direcționată',
		statusRequest: 'Solicitarea de renunțare a fost respectată',
		statusSignal: 'Semnalul de preferință pentru renunțare a fost respectat',
	},
	privacyChoices: {
		acceptAll: 'Acceptă toate',
		advertisingFollowsSale: 'Publicitatea urmează alegerea ta de mai sus.',
		advertisingTitle: 'Publicitate',
		allow: 'Permite',
		alwaysOn: 'Mereu active',
		announceSaved: '{message} Salvat.',
		askAll:
			'vinde sau partaja informațiile tale personale, inclusiv pentru publicitate direcționată',
		askSaleAndShare: 'vinde sau partaja informațiile tale personale',
		askSaleAndTargetedAds:
			'vinde sau folosi pentru publicitate direcționată informațiile tale personale',
		bannerAllowedRightsOff:
			'Cookie-urile opționale au fost permise. {rights} rămân dezactivate. Poți schimba asta în „Opțiunile dumneavoastră de confidențialitate”.',
		bannerAllowedRightsOffGpc:
			'Cookie-urile opționale au fost permise. {rights} rămân dezactivate din cauza semnalului tău Global Privacy Control. Poți schimba asta în „Opțiunile dumneavoastră de confidențialitate”.',
		bannerRejected:
			'Cookie-urile opționale au fost respinse. Poți schimba asta în „Opțiunile dumneavoastră de confidențialitate”.',
		barDescription:
			'Folosim cookie-uri pentru a-ți îmbunătăți experiența și a analiza traficul.',
		businessFallback: 'acest site',
		choiceRecorded: 'Alegere înregistrată.',
		choicesSaved:
			'Alegeri salvate. Le poți schimba în „Opțiunile dumneavoastră de confidențialitate”.',
		choose: 'Alege',
		chooseWhatToAllow: 'Alege ce permiți',
		close: 'Închide',
		confirmDescriptionOptIn:
			'{business} va putea {rights}. Poți schimba asta oricând.',
		confirmDescriptionOptOut:
			'{business} va putea {rights}. Poți renunța din nou oricând.',
		confirmKeepOptedOut: 'Păstrează renunțarea',
		confirmTitleOptIn: 'Permiți {rights}?',
		confirmTitleOptOut: 'Permiți din nou {rights}?',
		copyFailed: 'Copierea nu a reușit. Selectează și copiază referința:',
		copyFailedAnnouncement:
			'Copierea nu a reușit. Referința completă este afișată în confirmare.',
		copyReference: 'Copiază referința',
		dialogIntro: 'Alegerile tale se aplică imediat.',
		dialogTitle: 'Opțiunile dumneavoastră de confidențialitate',
		done: 'Gata',
		dontAllow: 'Nu permite',
		euDialogIntro:
			'Alege ce cookie-uri opționale poate folosi {business}. Cookie-urile opționale rămân dezactivate dacă nu le activezi.',
		euDialogTitle: 'Setări de confidențialitate',
		gpcNote:
			'Browserul tău a trimis un semnal Global Privacy Control, așa că {business} {rights} {scope}. Opțiunea „Permite” nu este disponibilă cât timp semnalul este activ.',
		justNow: 'chiar acum',
		nestedSheetNote:
			'Modificările se aplică atunci când salvezi în „Setări de confidențialitate”.',
		noticeBarDescription:
			'Folosim cookie-uri pentru a opera acest site, a măsura traficul și a personaliza reclamele. Poți renunța oricând.',
		noticeBarDescriptionGpc:
			'Folosim cookie-uri pentru a opera acest site și a măsura traficul. Semnalul tău Global Privacy Control este respectat.',
		noticeGpcHonored:
			'Semnalul Global Privacy Control al browserului tău este respectat.',
		noticeRightsAction: 'Nu vindeți și nu partajați datele mele',
		nudge: 'Alege mai întâi unul dintre cele două butoane.',
		optInBarDescription:
			'{business} îți cere acordul înainte de a folosi cookie-uri opționale sau de a {rights}.',
		optInDescription:
			'Cu permisiunea ta, {business} ar folosi cookie-uri opționale pentru funcțiile site-ului și analiză și ar {rights}. Nimic nu este activat dacă nu permiți.',
		optInTitle: 'Opțiunile tale de confidențialitate',
		optOutOption: 'Renunță',
		panelExpanded: 'Sunt afișate mai multe opțiuni.',
		policyColumn: 'Politica de confidențialitate',
		preferencesClose: 'Închide preferințele',
		preferencesOnCount: '{count} active',
		preferencesSheetIntro: 'Modificările se aplică imediat.',
		preferencesSummary: 'Funcții ale site-ului și analiză',
		preferencesTitle: 'Preferințe',
		purposeColumn: 'Scop',
		receiptAllowed: 'Ai permis {rights}',
		receiptDetails: 'Detalii',
		receiptFromGpc: 'din semnalul tău Global Privacy Control',
		receiptLive: 'Respectăm semnalul Global Privacy Control din acest browser',
		receiptLiveDetail: 'Citit din browserul tău la fiecare vizită.',
		receiptOptedOut: 'Ai renunțat la {rights}',
		receiptRecorded: 'Înregistrat: {date}',
		receiptReference: 'Referință',
		receiptSavedAccount: 'Salvat în contul tău · {date}',
		receiptSavedBrowser: 'Salvat pentru acest browser · {date}',
		receiptScopeAccount:
			'Se aplică acestui browser și contului tău {business}.',
		receiptScopeAccountUnnamed: 'Se aplică acestui browser și contului tău.',
		receiptScopeBrowser:
			'Se aplică acestui browser. Autentifică-te pentru a aplica alegerea și contului tău.',
		receiptViaGpc: 'Semnal Global Privacy Control',
		referenceCopied: 'Referință copiată.',
		refuseAll:
			'nu va vinde, nu va partaja și nu va folosi pentru publicitate direcționată informațiile tale personale',
		refuseSaleAndShare:
			'nu va vinde și nu va partaja informațiile tale personale',
		refuseSaleAndTargetedAds:
			'nu va vinde și nu va folosi pentru publicitate direcționată informațiile tale personale',
		rejectAll: 'Respinge toate',
		rightsAllowed: '{rights} sunt permise.',
		rightsNotAllowed: '{rights} nu sunt permise.',
		rightsOptedOut: 'Ai renunțat la {rights}.',
		saleAllowed: '{business} poate {rights}.',
		saleGroupOptIn: 'Permite {rights}',
		saleGroupSaleAndTargetedAds:
			'Renunț la vânzarea datelor mele personale și la publicitatea direcționată',
		saleOffByDefault:
			'Dezactivat implicit. {business} {rights} decât dacă permiți.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Salvează alegerile',
		saveInSettings: 'Salvează alegerile în „Setări de confidențialitate”',
		savedAutomatically: 'Salvat automat',
		savedCue: 'Salvat',
		scopeAccount: 'în acest browser sau pentru contul tău {business}',
		scopeAccountUnnamed: 'în acest browser sau pentru contul tău',
		scopeBrowser: 'în acest browser',
		shortAll: 'vinde sau partaja datele tale pentru publicitate',
		shortSaleAndShare: 'vinde sau partaja datele tale',
		shortSaleAndTargetedAds:
			'vinde datele tale sau a le folosi pentru publicitate',
		stateOff: 'Dezactivat',
		stateOn: 'Activat',
		switchColumn: 'Activ',
		switchedOff: '{name}: dezactivat.',
		switchedOn: '{name}: activat.',
		titleAll: 'Vânzarea, partajarea și publicitatea direcționată',
		titleSaleAndShare: 'Vânzarea și partajarea',
		titleSaleAndTargetedAds: 'Vânzarea și publicitatea direcționată',
		vendorColumn: 'Furnizor',
		vendorPolicy: 'Politica de confidențialitate {vendor}',
		vendorsClose: 'Închide furnizorii pentru {category}',
		vendorsFor: 'pentru {category}',
		vendorsHide: 'Ascunde furnizorii ({count})',
		vendorsHideOne: 'Ascunde 1 furnizor',
		vendorsOnCount: '{count} activi',
		vendorsTable: 'Furnizori pentru {category}',
		vendorsView: 'Afișează furnizorii ({count})',
		vendorsViewOne: 'Afișează 1 furnizor',
	},
	rights: {
		californiaPrivacyChoices:
			'Opțiunile dumneavoastră de confidențialitate din California',
		optOut: 'Nu vindeți și nu partajați datele mele',
		preferences: 'Gestionează preferințele',
		privacyChoices: 'Opțiunile dumneavoastră de confidențialitate',
	},
};
export default translations;
