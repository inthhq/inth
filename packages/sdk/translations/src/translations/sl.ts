import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Sprejmi vse',
		acknowledge: 'V redu',
		close: 'Zapri',
		customize: 'Prilagodi',
		dismiss: 'Zapri',
		rejectAll: 'Zavrni vse',
		save: 'Shrani nastavitve',
		securedBy: 'Soglasje upravlja',
	},
	consentGate: {
		actionButton: 'Omogoči soglasje za {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Za ogled te vsebine sprejmite soglasje za kategorijo {category}.',
	},
	consentManagerDialog: {
		description:
			'Tukaj prilagodite svoje nastavitve zasebnosti. Izberete lahko, katere vrste piškotkov in tehnologij sledenja dovolite.',
		title: 'Nastavitve zasebnosti',
		vendors: {
			disabledByCategory: 'Vklopite to kategorijo, da izberete ponudnike.',
			privacyPolicy: 'Pravilnik o zasebnosti',
			switchLabel: 'Dovoli {vendor}',
			title: 'Ponudniki ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Ti piškotki nam pomagajo zagotoviti boljšo uporabniško izkušnjo in testirati nove funkcije.',
			title: 'Izkušnja',
		},
		functionality: {
			description:
				'Ti piškotki omogočajo izboljšano funkcionalnost in personalizacijo spletne strani.',
			title: 'Funkcionalnost',
		},
		marketing: {
			description:
				'Ti piškotki se uporabljajo za prikazovanje relevantnih oglasov in spremljanje njihove učinkovitosti.',
			title: 'Trženje',
		},
		measurement: {
			description:
				'Ti piškotki nam pomagajo razumeti, kako obiskovalci uporabljajo spletno stran, in izboljšati njeno delovanje.',
			title: 'Analitika',
		},
		necessary: {
			description:
				'Ti piškotki so bistveni za pravilno delovanje spletne strani in jih ni mogoče onemogočiti.',
			title: 'Nujno potrebni',
		},
	},
	cookieBanner: {
		description:
			'Ta spletna stran uporablja piškotke za izboljšanje vaše uporabniške izkušnje, analizo prometa na strani in prikaz personaliziranih vsebin.',
		noticeDescription:
			'Uporabljamo piškotke in podobne tehnologije za delovanje te strani, merjenje prometa ter prilagajanje vsebin in oglasov. Kadar koli se lahko odjavite ali upravljate svoje nastavitve.',
		noticeTitle: 'Obvestilo o zasebnosti',
		title: 'Cenimo vašo zasebnost',
	},
	iab: {
		app: {
			consentStorage:
				'Vaše izbire so shranjene v tej napravi, v standardni shrambi nastavitev aplikacije pod ključi IABTCF, največ {days} dni. Obdobje hrambe se obnovi, ko posodobite svoje izbire.',
			description:
				'Mi in naših {partnerCount} partnerjev shranjujemo in/ali dostopamo do informacij na vaši napravi ter obdelujemo osebne podatke, kot so edinstveni identifikatorji in podatki o brskanju, za to aplikacijo, da bi:',
			legitimateInterestExplanation:
				'Nekateri partnerji obdelujejo osebne podatke, kot so edinstveni identifikatorji in podatki o brskanju, na podlagi svojega zakonitega interesa, namesto da bi prosili za soglasje. To velja samo za to aplikacijo. Imate pravico do ugovora tej obdelavi za vsak namen in vsakega partnerja.',
			scopeServiceSpecific:
				'Vaše soglasje velja samo za to aplikacijo in ne bo vplivalo na druge storitve.',
			withdraw:
				'Svoje izbire lahko kadar koli spremenite ali prekličete soglasje v Nastavitvah zasebnosti v tej aplikaciji.',
		},
		banner: {
			andMore: 'In še {count}...',
			description:
				'Mi in naših {partnerCount} partnerjev shranjujemo in/ali dostopamo do informacij na vaši napravi ter obdelujemo osebne podatke, kot so edinstveni identifikatorji in podatki o brskanju, za to spletno mesto, da bi:',
			legitimateInterestNotice:
				'Nekateri partnerji uveljavljajo zakoniti interes za obdelavo vaših podatkov. Imate pravico do ugovora tej obdelavi, prilagoditve svojih izbir in preklica soglasja kadar koli.',
			partnersLink: '{count} partnerjev',
			scopeGroup: 'Vaša izbira velja za vse naše spletne strani v tej skupini.',
			scopeServiceSpecific:
				'Vaše soglasje velja samo za to spletno mesto in ne bo vplivalo na druge storitve.',
			title: 'Nastavitve zasebnosti',
		},
		common: {
			acceptAll: 'Sprejmi vse',
			clearSelection: 'Počisti',
			customPartner: 'Partner po meri, ki ni registriran v IAB',
			customize: 'Prilagodi',
			loading: 'Nalaganje...',
			rejectAll: 'Zavrni vse',
			saveSettings: 'Shrani nastavitve',
			showingSelectedVendor: 'Prikaz izbranega ponudnika',
		},
		preferenceCenter: {
			description:
				'Tukaj prilagodite svoje nastavitve zasebnosti. Izberete lahko, katere vrste piškotkov in tehnologij sledenja dovolite.',
			features: {
				description:
					'Ta sredstva obdelave se lahko uporabljajo izključno za doseganje enega ali več namenov, za katere vam je v tem obvestilu dana izbira.',
				title: 'Funkcije',
			},
			footer: {
				consentStorage:
					'Preference glede soglasja so shranjene v piškotku z imenom "euconsent-v2" 13 mesecev. Obdobje hrambe se lahko obnovi, ko posodobite svoje preference.',
			},
			purposeItem: {
				examples: 'Primeri',
				legitimateInterest: 'Zakoniti interes',
				objectButton: 'Ugovarjaj',
				objected: 'Ugovarjano',
				partners: '{count} partnerjev',
				partnersUsingPurpose: 'Partnerji, ki uporabljajo ta namen',
				rightToObject:
					'Imate pravico do ugovora obdelavi, ki temelji na zakonitem interesu.',
				vendorsUseLegitimateInterest:
					'{count} ponudnikov uveljavlja zakoniti interes',
				withYourPermission: 'Z vašim dovoljenjem',
			},
			specialPurposes: {
				title: 'Bistvene funkcije (obvezno)',
				tooltip:
					'Te so potrebne for funkcionalnost in varnost spletnega mesta. V skladu z IAB TCF ne morete ugovarjati tem posebnim namenom.',
			},
			tabs: {
				purposes: 'Nameni',
				vendors: 'Ponudniki',
			},
			title: 'Nastavitve zasebnosti',
			vendorList: {
				adTechProvidersHeading: 'Googlovi ponudniki oglaševalske tehnologije',
				adTechProvidersNotice:
					'Google s temi ponudniki oglaševalske tehnologije sodeluje zunaj okvira IAB. Vaše soglasje doseže ponudnika le, če ga vklopite in hkrati dovolite shranjevanje informacij na vaši napravi ter prilagojene oglase.',
				customVendorsHeading: 'Partnerji po meri',
				customVendorsNotice:
					'To so partnerji po meri, ki niso registrirani v okviru IAB Transparency & Consent Framework (TCF). Podatke obdelujejo na podlagi vašega soglasja in imajo lahko drugačne prakse zasebnosti kot ponudniki, registrirani v IAB.',
				dataCategories: 'Kategorije podatkov',
				features: 'Funkcije',
				iabVendorsHeading: 'Ponudniki, registrirani v IAB',
				iabVendorsNotice:
					'Ti partnerji so registrirani v okviru IAB Transparency & Consent Framework (TCF), industrijskega standarda za upravljanje soglasij',
				legitimateInterest: 'Zakoniti int.',
				maxAge: 'Najv. starost: {days}d',
				nonCookieAccess: 'Dostop brez piškotkov',
				privacyPolicy: 'Pravilnik o zasebnosti',
				purposes: 'Nameni',
				requiredNotice:
					'Zahtevano za delovanje spletnega mesta, ni mogoče onemogočiti',
				retention: 'Hramba: {days}d',
				search: 'Išči ponudnike...',
				showingCount: 'Prikazano {filtered} od {total} ponudnikov',
				specialFeatures: 'Posebne funkcije',
				specialPurposes: 'Posebni nameni',
				storageDisclosure: 'Razkritje shranjevanja',
				usesCookies: 'Uporablja piškotke',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Pravilnik o piškotkih',
		privacyPolicy: 'Pravilnik o zasebnosti',
		termsOfService: 'Pogoji uporabe',
	},
	optOut: {
		action: 'Odjava',
		description:
			'To spletno mesto ne bo prodajalo ali delilo vaših osebnih podatkov, vaša izbira pa je shranjena v tem brskalniku.',
		done: 'Končano',
		headingAll:
			'Prodaja in deljenje vaših osebnih podatkov ter ciljno oglaševanje',
		headingSaleAndShare: 'Prodaja in deljenje vaših osebnih podatkov',
		headingSaleAndTargetedAds:
			'Prodaja vaših osebnih podatkov in ciljno oglaševanje',
		lockedByAccount:
			'Vaš račun se je odjavil in to lahko spremenite po prijavi.',
		lockedByGpc:
			'Signal Global Privacy Control v vašem brskalniku je vklopljen, zato to ostaja izklopljeno.',
		notOptedOut: 'V tem brskalniku se niste odjavili.',
		optInCancel: 'Ostani izključen',
		optInConfirm: 'Ponovno se vključi',
		optInDescription: 'Potrditev konča vašo izključitev v tem brskalniku.',
		optInDescriptionWithRights:
			'Potrditev konča vašo izključitev iz {rights} v tem brskalniku.',
		optInLink: 'Ponovno se vključi…',
		optInTitle: 'Se želite ponovno vključiti?',
		receiptAccount: 'Odjavljeni ste v tem brskalniku in v svojem računu.',
		receiptAccountWithRights:
			'Odjavljeni ste od {rights} v tem brskalniku in v svojem računu.',
		receiptBrowser: 'Odjavljeni ste v tem brskalniku.',
		receiptBrowserWithRights: 'Odjavljeni ste od {rights} v tem brskalniku.',
		recordedLabel: 'Zabeleženo',
		referenceLabel: 'Sklic',
		rightsAll: 'prodaje, deljenja in ciljanega oglaševanja',
		rightsSaleAndShare: 'prodaje in deljenja',
		rightsSaleAndTargetedAds: 'prodaje in ciljanega oglaševanja',
		statusRequest: 'Zahteva za zavrnitev je upoštevana',
		statusSignal: 'Signal nastavitve zavrnitve je upoštevan',
	},
	privacyChoices: {
		acceptAll: 'Sprejmi vse',
		advertisingFollowsSale: 'Oglaševanje sledi vaši zgornji izbiri.',
		advertisingTitle: 'Oglaševanje',
		allow: 'Dovoli',
		alwaysOn: 'Vedno vklopljeno',
		announceSaved: '{message} Shranjeno.',
		askAll: 'prodaja ali deli vaše osebne podatke, tudi za ciljno oglaševanje',
		askSaleAndShare: 'prodaja ali deli vaše osebne podatke',
		askSaleAndTargetedAds:
			'prodaja vaše osebne podatke ali jih uporablja za ciljno oglaševanje',
		bannerAllowedRightsOff:
			'Neobvezni piškotki so dovoljeni. {rights}: še naprej izklopljeno. To lahko spremenite v razdelku Vaše izbire glede zasebnosti.',
		bannerAllowedRightsOffGpc:
			'Neobvezni piškotki so dovoljeni. {rights}: še naprej izklopljeno zaradi vašega signala Global Privacy Control. To lahko spremenite v razdelku Vaše izbire glede zasebnosti.',
		bannerRejected:
			'Neobvezni piškotki so zavrnjeni. To lahko spremenite v razdelku Vaše izbire glede zasebnosti.',
		barDescription:
			'Piškotke uporabljamo za izboljšanje vaše izkušnje in analizo prometa.',
		businessFallback: 'to spletno mesto',
		choiceRecorded: 'Izbira je zabeležena.',
		choicesSaved:
			'Izbire so shranjene. Spremenite jih lahko v razdelku Vaše izbire glede zasebnosti.',
		choose: 'Izberi',
		chooseWhatToAllow: 'Izberi, kaj dovoliš',
		close: 'Zapri',
		confirmDescriptionOptIn:
			'{business} lahko {rights}. To lahko kadar koli spremenite.',
		confirmDescriptionOptOut:
			'{business} lahko {rights}. Kadar koli se lahko znova odjavite.',
		confirmKeepOptedOut: 'Ohrani odjavo',
		confirmTitleOptIn: 'Želite dovoliti: {rights}?',
		confirmTitleOptOut: 'Želite znova dovoliti: {rights}?',
		copyFailed: 'Kopiranje ni uspelo. Označite in kopirajte svoj sklic:',
		copyFailedAnnouncement:
			'Kopiranje ni uspelo. Celoten sklic je prikazan v potrdilu.',
		copyReference: 'Kopiraj sklic',
		dialogIntro: 'Vaše izbire začnejo veljati takoj.',
		dialogTitle: 'Vaše izbire glede zasebnosti',
		done: 'Končano',
		dontAllow: 'Ne dovoli',
		euDialogIntro:
			'Izberite, katere neobvezne piškotke lahko uporablja {business}. Neobvezni piškotki ostanejo izklopljeni, dokler jih ne vklopite.',
		euDialogTitle: 'Nastavitve zasebnosti',
		gpcNote:
			'Vaš brskalnik je poslal signal Global Privacy Control, zato {business} {rights} {scope}. Možnost Dovoli ni na voljo, dokler je signal vklopljen.',
		justNow: 'pravkar',
		nestedSheetNote:
			'Spremembe začnejo veljati, ko jih shranite v Nastavitvah zasebnosti.',
		noticeBarDescription:
			'Piškotke uporabljamo za delovanje te strani, merjenje prometa in prilagajanje oglasov. Kadar koli se lahko odjavite.',
		noticeBarDescriptionGpc:
			'Piškotke uporabljamo za delovanje te strani in merjenje prometa. Vaš signal Global Privacy Control upoštevamo.',
		noticeGpcHonored:
			'Signal Global Privacy Control vašega brskalnika upoštevamo.',
		noticeRightsAction: 'Ne prodajajte in ne delite mojih podatkov',
		nudge: 'Najprej izberite enega od obeh gumbov.',
		optInBarDescription:
			'{business} vas vpraša, preden uporabi neobvezne piškotke ali {rights}.',
		optInDescription:
			'Če dovolite, {business} uporablja neobvezne piškotke za funkcije strani in analitiko ter lahko {rights}. Nič se ne vklopi, če tega ne dovolite.',
		optInTitle: 'Vaše izbire glede zasebnosti',
		optOutOption: 'Odjava',
		panelExpanded: 'Prikazanih je več možnosti.',
		policyColumn: 'Pravilnik o zasebnosti',
		preferencesClose: 'Zapri nastavitve',
		preferencesOnCount: 'Vklopljeno: {count}',
		preferencesSheetIntro: 'Spremembe začnejo veljati takoj.',
		preferencesSummary: 'Funkcije strani in analitika',
		preferencesTitle: 'Nastavitve',
		purposeColumn: 'Namen',
		receiptAllowed: 'Dovoljeno: {rights}',
		receiptDetails: 'Podrobnosti',
		receiptFromGpc: 'na podlagi vašega signala Global Privacy Control',
		receiptLive: 'Upoštevamo signal Global Privacy Control iz tega brskalnika',
		receiptLiveDetail: 'Prebrano iz vašega brskalnika ob vsakem obisku.',
		receiptOptedOut: 'Odjava: {rights}',
		receiptRecorded: 'Zabeleženo: {date}',
		receiptReference: 'Sklic',
		receiptSavedAccount: 'Shranjeno v vašem računu · {date}',
		receiptSavedBrowser: 'Shranjeno za ta brskalnik · {date}',
		receiptScopeAccount: 'Velja za ta brskalnik in vaš račun {business}.',
		receiptScopeAccountUnnamed: 'Velja za ta brskalnik in vaš račun.',
		receiptScopeBrowser:
			'Velja za ta brskalnik. Prijavite se, da bo veljalo tudi za vaš račun.',
		receiptViaGpc: 'Signal Global Privacy Control',
		referenceCopied: 'Sklic je kopiran.',
		refuseAll:
			'ne prodaja in ne deli vaših osebnih podatkov ter jih ne uporablja za ciljno oglaševanje',
		refuseSaleAndShare: 'ne prodaja in ne deli vaših osebnih podatkov',
		refuseSaleAndTargetedAds:
			'ne prodaja vaših osebnih podatkov in jih ne uporablja za ciljno oglaševanje',
		rejectAll: 'Zavrni vse',
		rightsAllowed: '{rights}: dovoljeno.',
		rightsNotAllowed: '{rights}: ni dovoljeno.',
		rightsOptedOut: 'Odjava zabeležena: {rights}.',
		saleAllowed: '{business} lahko {rights}.',
		saleGroupOptIn: 'Dovoli: {rights}',
		saleGroupSaleAndTargetedAds:
			'Odjava od prodaje mojih osebnih podatkov in ciljnega oglaševanja',
		saleOffByDefault:
			'Privzeto izklopljeno. {business} {rights}, razen če to dovolite.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Shrani izbire',
		saveInSettings: 'Shranite svoje izbire v Nastavitvah zasebnosti',
		savedAutomatically: 'Samodejno shranjeno',
		savedCue: 'Shranjeno',
		scopeAccount: 'v tem brskalniku ali za vaš račun {business}',
		scopeAccountUnnamed: 'v tem brskalniku ali za vaš račun',
		scopeBrowser: 'v tem brskalniku',
		shortAll: 'proda ali deli vaše podatke za oglaševanje',
		shortSaleAndShare: 'proda ali deli vaše podatke',
		shortSaleAndTargetedAds:
			'proda vaše podatke ali jih uporabi za oglaševanje',
		stateOff: 'Izklopljeno',
		stateOn: 'Vklopljeno',
		switchColumn: 'Vklopljeno',
		switchedOff: '{name}: izklopljeno.',
		switchedOn: '{name}: vklopljeno.',
		titleAll: 'Prodaja, deljenje in ciljno oglaševanje',
		titleSaleAndShare: 'Prodaja in deljenje',
		titleSaleAndTargetedAds: 'Prodaja in ciljno oglaševanje',
		vendorColumn: 'Ponudnik',
		vendorPolicy: 'Pravilnik o zasebnosti: {vendor}',
		vendorsClose: 'Zapri ponudnike: {category}',
		vendorsFor: 'za kategorijo {category}',
		vendorsHide: 'Skrij ponudnike ({count})',
		vendorsHideOne: 'Skrij 1 ponudnika',
		vendorsOnCount: 'Vklopljeno: {count}',
		vendorsTable: 'Ponudniki: {category}',
		vendorsView: 'Prikaži ponudnike ({count})',
		vendorsViewOne: 'Prikaži 1 ponudnika',
	},
	rights: {
		californiaPrivacyChoices: 'Vaše izbire glede zasebnosti v Kaliforniji',
		optOut: 'Ne prodajajte in ne delite mojih podatkov',
		preferences: 'Upravljanje nastavitev',
		privacyChoices: 'Vaše izbire glede zasebnosti',
	},
};
export default translations;
