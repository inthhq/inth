import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Priimti visus',
		acknowledge: 'Gerai',
		close: 'Uždaryti',
		customize: 'Rinktis',
		dismiss: 'Uždaryti',
		rejectAll: 'Atmesti visus',
		save: 'Išsaugoti nustatymus',
		securedBy: 'Sutikimus valdo',
	},
	consentGate: {
		actionButton: 'Įgalinti {category} sutikimą',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title:
			'Priimkite {category} sutikimą, kad galėtumėte peržiūrėti šį turinį.',
	},
	consentManagerDialog: {
		description:
			'Čia galite tinkinti savo privatumo nustatymus. Galite pasirinkti, kokių tipų slapukus ir sekimo technologijas leidžiate naudoti.',
		title: 'Privatumo nustatymai',
		vendors: {
			disabledByCategory:
				'Įjunkite šią kategoriją, kad galėtumėte pasirinkti tiekėjus.',
			privacyPolicy: 'Privatumo politika',
			switchLabel: 'Leisti {vendor}',
			title: 'Tiekėjai ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Šie slapukai padeda mums užtikrinti geresnę vartotojo patirtį ir išbandyti naujas funkcijas.',
			title: 'Patirties',
		},
		functionality: {
			description:
				'Šie slapukai įgalina išplėstinį funkcionalumą ir svetainės personalizavimą.',
			title: 'Funkcionalumo',
		},
		marketing: {
			description:
				'Šie slapukai naudojami pateikti aktualius skelbimus ir sekti jų efektyvumą.',
			title: 'Rinkodaros',
		},
		measurement: {
			description:
				'Šie slapukai padeda mums suprasti, kaip lankytojai sąveikauja su svetaine, ir pagerinti jos veikimą.',
			title: 'Analitikos',
		},
		necessary: {
			description:
				'Šie slapukai yra būtini tinkamam svetainės veikimui ir negali būti išjungti.',
			title: 'Būtinieji',
		},
	},
	cookieBanner: {
		description:
			'Ši svetainė naudoja slapukus naršymo patirčiai gerinti, svetainės srautui analizuoti ir rodyti jums pritaikytą turinį.',
		noticeDescription:
			'Naudojame slapukus ir panašias technologijas šiai svetainei veikti, srautui matuoti bei turiniui ir reklamoms pritaikyti. Galite bet kada atsisakyti arba tvarkyti savo nuostatas.',
		noticeTitle: 'Privatumo pranešimas',
		title: 'Mes vertiname jūsų privatumą',
	},
	iab: {
		app: {
			consentStorage:
				'Jūsų pasirinkimai saugomi šiame įrenginyje, standartinėje programėlės nustatymų saugykloje su IABTCF raktais, ne ilgiau kaip {days} d. Kai atnaujinate savo pasirinkimus, saugojimo trukmė skaičiuojama iš naujo.',
			description:
				'Mes ir mūsų {partnerCount} partneriai saugome ir (arba) pasiekiame informaciją jūsų įrenginyje ir tvarkome asmens duomenis, tokius kaip unikalūs identifikatoriai ir naršymo duomenys, šioje programėlėje, kad galėtume:',
			legitimateInterestExplanation:
				'Kai kurie partneriai tvarko asmens duomenis, tokius kaip unikalūs identifikatoriai ir naršymo duomenys, remdamiesi savo teisėtu interesu, užuot prašę sutikimo. Tai taikoma tik šiai programėlei. Jūs turite teisę nesutikti su tokiu tvarkymu dėl kiekvieno tikslo ir kiekvieno partnerio.',
			scopeServiceSpecific:
				'Jūsų sutikimas taikomas tik šiai programėlei ir neturės įtakos kitoms paslaugoms.',
			withdraw:
				'Savo pasirinkimus galite bet kada pakeisti arba atšaukti sutikimą šios programėlės skiltyje Privatumo nustatymai.',
		},
		banner: {
			andMore: 'Ir dar {count}...',
			description:
				'Mes ir mūsų {partnerCount} partneriai saugome ir (arba) pasiekiame informaciją jūsų įrenginyje ir tvarkome asmens duomenis, tokius kaip unikalūs identifikatoriai ir naršymo duomenys, šioje svetainėje, kad galėtume:',
			legitimateInterestNotice:
				'Kai kurie partneriai teigia turintys teisėtą interesą tvarkyti jūsų duomenis. Jūs turite teisę nesutikti su tokiu tvarkymu, tinkinti savo pasirinkimus ir bet kada atšaukti sutikimą.',
			partnersLink: '{count} partneriai',
			scopeGroup:
				'Jūsų pasirinkimas taikomas visoms mūsų svetainėms šioje grupėje.',
			scopeServiceSpecific:
				'Jūsų sutikimas taikomas tik šiai svetainei ir neturės įtakos kitoms paslaugoms.',
			title: 'Privatumo nustatymai',
		},
		common: {
			acceptAll: 'Priimti visus',
			clearSelection: 'Išvalyti',
			customPartner: 'Pasirinktinis partneris, neįregistruotas IAB',
			customize: 'Rinktis',
			loading: 'Įkeliama...',
			rejectAll: 'Atmesti visus',
			saveSettings: 'Išsaugoti nustatymus',
			showingSelectedVendor: 'Rodomas pasirinktas tiekėjas',
		},
		preferenceCenter: {
			description:
				'Čia galite tinkinti savo privatumo nustatymus. Galite pasirinkti, kokių tipų slapukus ir sekimo technologijas leidžiate naudoti.',
			features: {
				description:
					'Šie apdorojimo būdai gali būti naudojami tik siekiant vieno ar kelių tikslų, dėl kurių Jums šiame pranešime suteikiamas pasirinkimas.',
				title: 'Funkcijos',
			},
			footer: {
				consentStorage:
					'Sutikimo nuostatos saugomos slapuke pavadinimu „euconsent-v2“ 13 mėnesių. Kai atnaujinate savo nuostatas, saugojimo trukmė gali būti pradėta skaičiuoti iš naujo.',
			},
			purposeItem: {
				examples: 'Pavyzdžiai',
				legitimateInterest: 'Teisėtas interesas',
				objectButton: 'Nesutikti',
				objected: 'Prieštarauta',
				partners: '{count} partneriai',
				partnersUsingPurpose: 'Partneriai, naudojantys šį tikslą',
				rightToObject:
					'Jūs turite teisę nesutikti su tvarkymu, pagrįstu teisėtu interesu.',
				vendorsUseLegitimateInterest:
					'{count} tiekėjai teigia turintys teisėtą interesą',
				withYourPermission: 'Su jūsų leidimu',
			},
			specialPurposes: {
				title: 'Esminės funkcijos (privaloma)',
				tooltip:
					'Jos reikalingos svetainės funkcionalumui ir saugumui užtikrinti. Pagal IAB TCF negalite nesutikti su šiais specialiais tikslais.',
			},
			tabs: {
				purposes: 'Tikslai',
				vendors: 'Tiekėjai',
			},
			title: 'Privatumo nustatymai',
			vendorList: {
				adTechProvidersHeading: 'Google reklamos technologijų teikėjai',
				adTechProvidersNotice:
					'Google bendradarbiauja su šiais reklamos technologijų teikėjais už IAB sistemos ribų. Jūsų sutikimas pasiekia teikėją tik tada, jei jį įjungiate ir taip pat leidžiate saugoti informaciją jūsų įrenginyje bei rodyti jums pritaikytas reklamas.',
				customVendorsHeading: 'Pasirinktiniai partneriai',
				customVendorsNotice:
					'Tai yra pasirinktiniai partneriai, kurie nėra užregistruoti IAB Transparency & Consent Framework (TCF). Jie tvarko duomenis remdamiesi jūsų sutikimu ir gali taikyti kitokią privatumo praktiką nei IAB registruoti tiekėjai.',
				dataCategories: 'Duomenų kategorijos',
				features: 'Funkcijos',
				iabVendorsHeading: 'IAB registruoti tiekėjai',
				iabVendorsNotice:
					'Šie partneriai yra užregistruoti IAB Transparency & Consent Framework (TCF) – pramonės standarte, skirtame sutikimų valdymui',
				legitimateInterest: 'Teisėtas int.',
				maxAge: 'Maks. amžius: {days}d',
				nonCookieAccess: 'Prieiga be slapukų',
				privacyPolicy: 'Privatumo politika',
				purposes: 'Tikslai',
				requiredNotice:
					'Reikalinga svetainės funkcionalumui, negalima išjungti',
				retention: 'Saugojimas: {days}d',
				search: 'Ieškoti tiekėjų...',
				showingCount: 'Rodoma {filtered} iš {total} tiekėjų',
				specialFeatures: 'Specialios funkcijos',
				specialPurposes: 'Specialūs tikslai',
				storageDisclosure: 'Informacija apie saugojimą',
				usesCookies: 'Naudoja slapukus',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Slapukų politika',
		privacyPolicy: 'Privatumo politika',
		termsOfService: 'Naudojimosi sąlygos',
	},
	optOut: {
		action: 'Atsisakyti',
		description:
			'Ši svetainė neparduos ir nesidalins jūsų asmens duomenimis, o jūsų pasirinkimas išsaugotas šioje naršyklėje.',
		done: 'Atlikta',
		headingAll:
			'Jūsų asmeninės informacijos pardavimas, dalijimasis ir tikslinė reklama',
		headingSaleAndShare:
			'Jūsų asmeninės informacijos pardavimas ir dalijimasis',
		headingSaleAndTargetedAds:
			'Jūsų asmeninės informacijos pardavimas ir tikslinė reklama',
		lockedByAccount:
			'Jūsų paskyra atsisakė, ir tai galite pakeisti prisijungę.',
		lockedByGpc:
			'Jūsų naršyklės Global Privacy Control signalas įjungtas, todėl tai lieka išjungta.',
		notOptedOut: 'Šioje naršyklėje neatsisakėte.',
		optInCancel: 'Likti atsisakius',
		optInConfirm: 'Vėl sutikti',
		optInDescription:
			'Patvirtinimas užbaigia jūsų atsisakymą šioje naršyklėje.',
		optInDescriptionWithRights:
			'Patvirtinimas užbaigia jūsų atsisakymą nuo {rights} šioje naršyklėje.',
		optInLink: 'Vėl sutikti…',
		optInTitle: 'Vėl sutikti?',
		receiptAccount: 'Atsisakėte šioje naršyklėje ir savo paskyroje.',
		receiptAccountWithRights:
			'Atsisakėte {rights} šioje naršyklėje ir savo paskyroje.',
		receiptBrowser: 'Atsisakėte šioje naršyklėje.',
		receiptBrowserWithRights: 'Atsisakėte {rights} šioje naršyklėje.',
		recordedLabel: 'Užregistruota',
		referenceLabel: 'Nuoroda',
		rightsAll: 'pardavimo, dalijimosi ir tikslinės reklamos',
		rightsSaleAndShare: 'pardavimo ir dalijimosi',
		rightsSaleAndTargetedAds: 'pardavimo ir tikslinės reklamos',
		statusRequest: 'Atsisakymo prašymas įvykdytas',
		statusSignal: 'Atsisakymo nuostatos signalas įvykdytas',
	},
	privacyChoices: {
		acceptAll: 'Priimti visus',
		advertisingFollowsSale: 'Reklama priklauso nuo jūsų pasirinkimo aukščiau.',
		advertisingTitle: 'Reklama',
		allow: 'Leisti',
		alwaysOn: 'Visada įjungta',
		announceSaved: '{message} Išsaugota.',
		askAll:
			'parduoti jūsų asmens duomenis arba jais dalytis, taip pat ir tikslinės reklamos tikslais',
		askSaleAndShare: 'parduoti jūsų asmens duomenis arba jais dalytis',
		askSaleAndTargetedAds:
			'parduoti jūsų asmens duomenis arba naudoti juos tikslinei reklamai',
		bannerAllowedRightsOff:
			'Neprivalomi slapukai leidžiami. {rights} lieka išjungta. Tai galite pakeisti skiltyje „Jūsų privatumo pasirinkimai“.',
		bannerAllowedRightsOffGpc:
			'Neprivalomi slapukai leidžiami. {rights} lieka išjungta dėl jūsų Global Privacy Control signalo. Tai galite pakeisti skiltyje „Jūsų privatumo pasirinkimai“.',
		bannerRejected:
			'Neprivalomi slapukai atmesti. Tai galite pakeisti skiltyje „Jūsų privatumo pasirinkimai“.',
		barDescription:
			'Naudojame slapukus, kad pagerintume jūsų patirtį ir analizuotume srautą.',
		businessFallback: 'ši svetainė',
		choiceRecorded: 'Pasirinkimas užregistruotas.',
		choicesSaved:
			'Pasirinkimai išsaugoti. Juos galite pakeisti skiltyje „Jūsų privatumo pasirinkimai“.',
		choose: 'Pasirinkti',
		chooseWhatToAllow: 'Pasirinkite, ką leisti',
		close: 'Uždaryti',
		confirmDescriptionOptIn:
			'{business} galės {rights}. Tai galite bet kada pakeisti.',
		confirmDescriptionOptOut:
			'{business} galės {rights}. Bet kada galėsite vėl atsisakyti.',
		confirmKeepOptedOut: 'Likti atsisakius',
		confirmTitleOptIn: 'Leisti: {rights}?',
		confirmTitleOptOut: 'Vėl leisti: {rights}?',
		copyFailed:
			'Nepavyko nukopijuoti. Pažymėkite ir nukopijuokite savo nuorodą:',
		copyFailedAnnouncement:
			'Nepavyko nukopijuoti. Visa nuoroda rodoma patvirtinime.',
		copyReference: 'Kopijuoti nuorodą',
		dialogIntro: 'Jūsų pasirinkimai įsigalioja iš karto.',
		dialogTitle: 'Jūsų privatumo pasirinkimai',
		done: 'Atlikta',
		dontAllow: 'Neleisti',
		euDialogIntro:
			'Pasirinkite, kuriuos neprivalomus slapukus gali naudoti {business}. Neprivalomi slapukai lieka išjungti, kol jų neįjungiate.',
		euDialogTitle: 'Privatumo nustatymai',
		gpcNote:
			'Jūsų naršyklė atsiuntė Global Privacy Control signalą, todėl {business} {rights} {scope}. Kol signalas įjungtas, parinktis „Leisti“ negalima.',
		justNow: 'ką tik',
		nestedSheetNote:
			'Pakeitimai įsigalios, kai išsaugosite privatumo nustatymuose.',
		noticeBarDescription:
			'Naudojame slapukus šiai svetainei veikti, srautui matuoti ir reklamoms pritaikyti. Galite bet kada atsisakyti.',
		noticeBarDescriptionGpc:
			'Naudojame slapukus šiai svetainei veikti ir srautui matuoti. Jūsų Global Privacy Control signalo paisoma.',
		noticeGpcHonored: 'Jūsų naršyklės Global Privacy Control signalo paisoma.',
		noticeRightsAction: 'Neparduoti ir nesidalyti mano duomenimis',
		nudge: 'Pirmiausia pasirinkite vieną iš dviejų mygtukų.',
		optInBarDescription:
			'{business} prašo jūsų sutikimo dėl neprivalomų slapukų ir dėl {rights}.',
		optInDescription:
			'Jums leidus, {business} naudotų neprivalomus slapukus svetainės funkcijoms ir analizei, taip pat galėtų {rights}. Niekas neįjungiama, kol neleidžiate.',
		optInTitle: 'Jūsų privatumo pasirinkimai',
		optOutOption: 'Atsisakyti',
		panelExpanded: 'Rodoma daugiau parinkčių.',
		policyColumn: 'Privatumo politika',
		preferencesClose: 'Uždaryti nuostatas',
		preferencesOnCount: 'Įjungta: {count}',
		preferencesSheetIntro: 'Pakeitimai įsigalioja iš karto.',
		preferencesSummary: 'Svetainės funkcijos ir analizė',
		preferencesTitle: 'Nuostatos',
		purposeColumn: 'Tikslas',
		receiptAllowed: 'Leista: {rights}',
		receiptDetails: 'Išsami informacija',
		receiptFromGpc: 'pagal jūsų Global Privacy Control signalą',
		receiptLive: 'Paisoma šios naršyklės Global Privacy Control signalo',
		receiptLiveDetail:
			'Nuskaitoma iš jūsų naršyklės kiekvieno apsilankymo metu.',
		receiptOptedOut: 'Atsisakyta: {rights}',
		receiptRecorded: 'Užregistruota: {date}',
		receiptReference: 'Nuoroda',
		receiptSavedAccount: 'Išsaugota jūsų paskyroje · {date}',
		receiptSavedBrowser: 'Išsaugota šiai naršyklei · {date}',
		receiptScopeAccount:
			'Taikoma šiai naršyklei ir jūsų „{business}“ paskyrai.',
		receiptScopeAccountUnnamed: 'Taikoma šiai naršyklei ir jūsų paskyrai.',
		receiptScopeBrowser:
			'Taikoma šiai naršyklei. Prisijunkite, kad tai būtų taikoma ir jūsų paskyrai.',
		receiptViaGpc: 'Global Privacy Control signalas',
		referenceCopied: 'Nuoroda nukopijuota.',
		refuseAll:
			'neparduos jūsų asmens duomenų, jais nesidalys ir nenaudos jų tikslinei reklamai',
		refuseSaleAndShare: 'neparduos jūsų asmens duomenų ir jais nesidalys',
		refuseSaleAndTargetedAds:
			'neparduos jūsų asmens duomenų ir nenaudos jų tikslinei reklamai',
		rejectAll: 'Atmesti visus',
		rightsAllowed: '{rights}: leista.',
		rightsNotAllowed: '{rights}: neleista.',
		rightsOptedOut: 'Atsisakyta: {rights}.',
		saleAllowed: '{business} gali {rights}.',
		saleGroupOptIn: 'Leisti: {rights}',
		saleGroupSaleAndTargetedAds:
			'Atsisakyti mano asmens duomenų pardavimo ir tikslinės reklamos',
		saleOffByDefault:
			'Pagal numatytuosius nustatymus išjungta. {business} {rights}, kol neleisite.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Išsaugoti pasirinkimus',
		saveInSettings: 'Išsaugokite savo pasirinkimus privatumo nustatymuose',
		savedAutomatically: 'Išsaugoma automatiškai',
		savedCue: 'Išsaugota',
		scopeAccount: 'nei šioje naršyklėje, nei jūsų „{business}“ paskyroje',
		scopeAccountUnnamed: 'nei šioje naršyklėje, nei jūsų paskyroje',
		scopeBrowser: 'šioje naršyklėje',
		shortAll: 'jūsų duomenų pardavimo ar dalijimosi jais reklamos tikslais',
		shortSaleAndShare: 'jūsų duomenų pardavimo ar dalijimosi jais',
		shortSaleAndTargetedAds: 'jūsų duomenų pardavimo ar naudojimo reklamai',
		stateOff: 'Išjungta',
		stateOn: 'Įjungta',
		switchColumn: 'Įjungta',
		switchedOff: '{name}: išjungta.',
		switchedOn: '{name}: įjungta.',
		titleAll: 'Pardavimas, dalijimasis ir tikslinė reklama',
		titleSaleAndShare: 'Pardavimas ir dalijimasis',
		titleSaleAndTargetedAds: 'Pardavimas ir tikslinė reklama',
		vendorColumn: 'Tiekėjas',
		vendorPolicy: '„{vendor}“ privatumo politika',
		vendorsClose: 'Uždaryti kategorijos „{category}“ tiekėjus',
		vendorsFor: 'kategorijoje „{category}“',
		vendorsHide: 'Slėpti tiekėjus ({count})',
		vendorsHideOne: 'Slėpti 1 tiekėją',
		vendorsOnCount: 'Įjungta: {count}',
		vendorsTable: 'Kategorijos „{category}“ tiekėjai',
		vendorsView: 'Rodyti tiekėjus ({count})',
		vendorsViewOne: 'Rodyti 1 tiekėją',
	},
	rights: {
		californiaPrivacyChoices: 'Jūsų Kalifornijos privatumo pasirinkimai',
		optOut: 'Neparduoti ir nesidalyti mano duomenimis',
		preferences: 'Tvarkyti nuostatas',
		privacyChoices: 'Jūsų privatumo pasirinkimai',
	},
};
export default translations;
