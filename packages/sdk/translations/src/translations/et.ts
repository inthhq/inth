import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Nõustu kõigiga',
		acknowledge: 'OK',
		close: 'Sulge',
		customize: 'Kohanda',
		dismiss: 'Sulge',
		rejectAll: 'Keeldu kõigist',
		save: 'Salvesta seaded',
		securedBy: 'Nõusolekut haldab',
	},
	consentGate: {
		actionButton: 'Luba kategooria {category} nõusolek',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Selle sisu vaatamiseks nõustuge kategooria {category} nõusolekuga.',
	},
	consentManagerDialog: {
		description:
			'Kohandage siin oma privaatsusseadeid. Saate valida, milliseid küpsiseid ja jälgimistehnoloogiaid lubate.',
		title: 'Privaatsusseaded',
		vendors: {
			disabledByCategory:
				'Lülita see kategooria sisse, et valida teenusepakkujaid.',
			privacyPolicy: 'Privaatsuspoliitika',
			switchLabel: 'Luba {vendor}',
			title: 'Teenusepakkujad ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Need küpsised aitavad meil pakkuda paremat kasutajakogemust ja testida uusi funktsioone.',
			title: 'Kogemus',
		},
		functionality: {
			description:
				'Need küpsised võimaldavad veebisaidi täiustatud funktsionaalsust ja isikupärastamist.',
			title: 'Funktsionaalsus',
		},
		marketing: {
			description:
				'Neid küpsiseid kasutatakse asjakohaste reklaamide edastamiseks ja nende tõhususe jälgimiseks.',
			title: 'Turundus',
		},
		measurement: {
			description:
				'Need küpsised aitavad meil mõista, kuidas külastajad veebisaidiga suhtlevad, ja parandada selle toimivust.',
			title: 'Analüütika',
		},
		necessary: {
			description:
				'Need küpsised on veebisaidi nõuetekohaseks toimimiseks hädavajalikud ja neid ei saa keelata.',
			title: 'Hädavajalikud',
		},
	},
	cookieBanner: {
		description:
			'See sait kasutab küpsiseid, et parandada teie sirvimiskogemust, analüüsida saidi liiklust ja näidata isikupärastatud sisu.',
		noticeDescription:
			'Kasutame küpsiseid ja sarnaseid tehnoloogiaid selle saidi töös hoidmiseks, liikluse mõõtmiseks ning sisu ja reklaamide isikupärastamiseks. Saate igal ajal loobuda või oma eelistusi hallata.',
		noticeTitle: 'Privaatsusteade',
		title: 'Hindame teie privaatsust',
	},
	iab: {
		app: {
			consentStorage:
				'Teie valikud salvestatakse selles seadmes rakenduse tavapärasesse seadete salvestusruumi IABTCF-võtmete all kuni {days} päevaks. Salvestusaeg algab uuesti, kui oma valikuid uuendate.',
			description:
				'Meie ja meie {partnerCount} partnerit salvestavad ja/või pääsevad ligi teie seadmes olevatele andmetele ning töötlevad isikuandmeid, nagu unikaalsed identifikaatorid ja sirvimisandmed, selle rakenduse jaoks, et:',
			legitimateInterestExplanation:
				'Mõned partnerid töötlevad isikuandmeid, nagu unikaalsed identifikaatorid ja sirvimisandmed, oma õigustatud huvi alusel, selle asemel et nõusolekut küsida. See kehtib ainult selle rakenduse kohta. Teil on õigus sellele töötlemisele vastu vaielda iga eesmärgi ja iga partneri puhul.',
			scopeServiceSpecific:
				'Teie nõusolek kehtib ainult sellele rakendusele ega mõjuta teisi teenuseid.',
			withdraw:
				'Saate oma valikuid igal ajal muuta või nõusoleku tagasi võtta selle rakenduse jaotises Privaatsusseaded.',
		},
		banner: {
			andMore: 'Ja veel {count}...',
			description:
				'Meie ja meie {partnerCount} partnerit salvestavad ja/või pääsevad ligi teie seadmes olevatele andmetele ning töötlevad isikuandmeid, nagu unikaalsed identifikaatorid ja sirvimisandmed sellel veebilehel, et:',
			legitimateInterestNotice:
				'Mõned partnerid väidavad, et neil on õigustatud huvi teie andmete töötlemiseks. Teil on õigus sellele töötlemisele vastu vaielda, oma valikuid kohandada ja nõusolek igal ajal tagasi võtta.',
			partnersLink: '{count} partnerit',
			scopeGroup: 'Teie valik kehtib kõigil meie veebisaitidel selles grupis.',
			scopeServiceSpecific:
				'Sinu nõusolek kehtib ainult sellele veebisaidile ega mõjuta teisi teenuseid.',
			title: 'Privaatsusseaded',
		},
		common: {
			acceptAll: 'Nõustu kõigiga',
			clearSelection: 'Tühjenda',
			customPartner: 'Kohandatud partner, kes ei ole IAB-s registreeritud',
			customize: 'Kohanda',
			loading: 'Laadimine...',
			rejectAll: 'Keeldu kõigist',
			saveSettings: 'Salvesta seaded',
			showingSelectedVendor: 'Kuvatakse valitud partner',
		},
		preferenceCenter: {
			description:
				'Kohandage siin oma privaatsusseadeid. Saate valida, milliseid küpsiseid ja jälgimistehnoloogiaid lubate.',
			features: {
				description:
					'Sellist töötlemist saab kasutada ainult ühe või mitme sellise eesmärgi saavutamiseks, millega nõustumiseks teile selles teatises valik antakse.',
				title: 'Omadused',
			},
			footer: {
				consentStorage:
					'Nõusoleku eelistused salvestatakse küpsisesse nimega "euconsent-v2" 13 kuuks. Salvestusaeg võib teie eelistuste uuendamisel uuesti alata.',
			},
			purposeItem: {
				examples: 'Näited',
				legitimateInterest: 'Õigustatud huvi',
				objectButton: 'Vaidle vastu',
				objected: 'Vastu vaieldud',
				partners: '{count} partnerit',
				partnersUsingPurpose: 'Selle eesmärgi kasutavad partnerid',
				rightToObject:
					'Teil on õigus vaielda vastu töötlemisele, mis põhineb õigustatud huvil.',
				vendorsUseLegitimateInterest:
					'{count} teenusepakkujat väidavad õigustatud huvi',
				withYourPermission: 'Teie loal',
			},
			specialPurposes: {
				title: 'Olulised funktsioonid (nõutud)',
				tooltip:
					'Need on vajalikud saidi toimimiseks ja turvalisuseks. IAB TCF-i kohaselt ei saa nendele erieesmärkidele vastu vaielda.',
			},
			tabs: {
				purposes: 'Eesmärgid',
				vendors: 'Teenusepakkujad',
			},
			title: 'Privaatsusseaded',
			vendorList: {
				adTechProvidersHeading: 'Google’i reklaamitehnoloogia teenusepakkujad',
				adTechProvidersNotice:
					'Google teeb nende reklaamitehnoloogia teenusepakkujatega koostööd väljaspool IAB raamistikku. Teie nõusolek jõuab teenusepakkujani ainult siis, kui lülitate selle sisse ning lubate ka teabe salvestamise teie seadmesse ja isikupärastatud reklaami.',
				customVendorsHeading: 'Kohandatud partnerid',
				customVendorsNotice:
					'Need on kohandatud partnerid, kes ei ole registreeritud IAB läbipaistvuse ja nõusoleku raamistikus (TCF). Nad töötlevad andmeid teie nõusoleku alusel ning nende privaatsustavad võivad erineda IAB-sertifitseeritud partnerite omadest.',
				dataCategories: 'Andmekategooriad',
				features: 'Omadused',
				iabVendorsHeading: 'IAB registreeritud teenusepakkujad',
				iabVendorsNotice:
					'Need partnerid on registreeritud IAB läbipaistvuse ja nõusoleku raamistikus (TCF), mis on tööstusstandard nõusoleku haldamiseks',
				legitimateInterest: 'Õigustatud huvi',
				maxAge: 'Maksimaalne vanus: {days}p',
				nonCookieAccess: 'Küpsisteta juurdepääs',
				privacyPolicy: 'Privaatsuspoliitika',
				purposes: 'Eesmärgid',
				requiredNotice: 'Vajalik saidi toimimiseks, ei saa keelata',
				retention: 'Säilitamine: {days}p',
				search: 'Otsi teenusepakkujaid...',
				showingCount: 'Kuvatakse {filtered} / {total} teenusepakkujat',
				specialFeatures: 'Eriomadused',
				specialPurposes: 'Eriotstarbed',
				storageDisclosure: 'Salvestamise teave',
				usesCookies: 'Kasutab küpsiseid',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Küpsiste poliitika',
		privacyPolicy: 'Privaatsuspoliitika',
		termsOfService: 'Kasutustingimused',
	},
	optOut: {
		action: 'Loobu',
		description:
			'See sait ei müü ega jaga teie isikuandmeid ja teie valik on selles brauseris salvestatud.',
		done: 'Valmis',
		headingAll: 'Teie isikuandmete müük, jagamine ja suunatud reklaam',
		headingSaleAndShare: 'Teie isikuandmete müük ja jagamine',
		headingSaleAndTargetedAds: 'Teie isikuandmete müük ja suunatud reklaam',
		lockedByAccount:
			'Teie konto on loobunud ja saate seda muuta pärast sisselogimist.',
		lockedByGpc:
			'Teie brauseri Global Privacy Control signaal on sisse lülitatud, seega jääb see välja lülitatuks.',
		notOptedOut: 'Te ei ole selles brauseris loobunud.',
		optInCancel: 'Jää loobunuks',
		optInConfirm: 'Nõustu uuesti',
		optInDescription: 'Kinnitamine lõpetab sinu loobumise selles brauseris.',
		optInDescriptionWithRights:
			'Kinnitamine lõpetab sinu loobumise tegevustest {rights} selles brauseris.',
		optInLink: 'Nõustu uuesti…',
		optInTitle: 'Kas soovid uuesti nõustuda?',
		receiptAccount: 'Olete selles brauseris ja oma kontol loobunud.',
		receiptAccountWithRights:
			'Olete selles brauseris ja oma kontol loobunud järgmisest: {rights}.',
		receiptBrowser: 'Olete selles brauseris loobunud.',
		receiptBrowserWithRights:
			'Olete selles brauseris loobunud järgmisest: {rights}.',
		recordedLabel: 'Salvestatud',
		referenceLabel: 'Viide',
		rightsAll: 'müük, jagamine ja sihitud reklaam',
		rightsSaleAndShare: 'müük ja jagamine',
		rightsSaleAndTargetedAds: 'müük ja sihitud reklaam',
		statusRequest: 'Loobumistaotlus on täidetud',
		statusSignal: 'Loobumiseelistuse signaal on täidetud',
	},
	privacyChoices: {
		acceptAll: 'Nõustu kõigiga',
		advertisingFollowsSale: 'Reklaam järgib teie ülaltoodud valikut.',
		advertisingTitle: 'Reklaam',
		allow: 'Luba',
		alwaysOn: 'Alati sees',
		announceSaved: '{message} Salvestatud.',
		askAll:
			'teie isikuandmeid müüa või jagada, sealhulgas suunatud reklaami jaoks',
		askSaleAndShare: 'teie isikuandmeid müüa või jagada',
		askSaleAndTargetedAds:
			'teie isikuandmeid müüa või kasutada neid suunatud reklaamiks',
		bannerAllowedRightsOff:
			'Valikulised küpsised on lubatud. {rights} jäävad välja lülitatuks. Saate seda muuta jaotises „Teie privaatsusvalikud“.',
		bannerAllowedRightsOffGpc:
			'Valikulised küpsised on lubatud. {rights} jäävad teie Global Privacy Control signaali tõttu välja lülitatuks. Saate seda muuta jaotises „Teie privaatsusvalikud“.',
		bannerRejected:
			'Valikulistest küpsistest on keeldutud. Saate seda muuta jaotises „Teie privaatsusvalikud“.',
		barDescription:
			'Kasutame küpsiseid, et parandada teie kogemust ja analüüsida liiklust.',
		businessFallback: 'see sait',
		choiceRecorded: 'Valik on kirja pandud.',
		choicesSaved:
			'Valikud on salvestatud. Saate neid muuta jaotises „Teie privaatsusvalikud“.',
		choose: 'Vali',
		chooseWhatToAllow: 'Vali, mida lubada',
		close: 'Sulge',
		confirmDescriptionOptIn:
			'{business} võib {rights}. Saate seda igal ajal muuta.',
		confirmDescriptionOptOut:
			'{business} võib {rights}. Saate igal ajal uuesti loobuda.',
		confirmKeepOptedOut: 'Jää loobunuks',
		confirmTitleOptIn: 'Kas lubada {rights}?',
		confirmTitleOptOut: 'Kas lubada uuesti {rights}?',
		copyFailed: 'Kopeerimine ei õnnestunud. Valige ja kopeerige oma viide:',
		copyFailedAnnouncement:
			'Kopeerimine ei õnnestunud. Teie täielik viide on kinnitusel näha.',
		copyReference: 'Kopeeri viide',
		dialogIntro: 'Teie valikud hakkavad kohe kehtima.',
		dialogTitle: 'Teie privaatsusvalikud',
		done: 'Valmis',
		dontAllow: 'Ära luba',
		euDialogIntro:
			'Valige, milliseid valikulisi küpsiseid {business} võib kasutada. Valikulised küpsised jäävad välja lülitatuks, kui te neid sisse ei lülita.',
		euDialogTitle: 'Privaatsusseaded',
		gpcNote:
			'Teie brauser saatis Global Privacy Control signaali, seega {business} {rights} {scope}. Lubamine pole võimalik, kuni signaal on sisse lülitatud.',
		justNow: 'just praegu',
		nestedSheetNote:
			'Muudatused hakkavad kehtima, kui salvestate need privaatsusseadetes.',
		noticeBarDescription:
			'Kasutame küpsiseid selle saidi töös hoidmiseks, liikluse mõõtmiseks ja reklaamide isikupärastamiseks. Saate igal ajal loobuda.',
		noticeBarDescriptionGpc:
			'Kasutame küpsiseid selle saidi töös hoidmiseks ja liikluse mõõtmiseks. Teie Global Privacy Control signaali arvestatakse.',
		noticeGpcHonored:
			'Teie brauseri Global Privacy Control signaali arvestatakse.',
		noticeRightsAction: 'Ära müü ega jaga minu andmeid',
		nudge: 'Valige esmalt üks kahest nupust.',
		optInBarDescription:
			'{business} küsib luba enne valikuliste küpsiste kasutamist või {rights}.',
		optInDescription:
			'Teie loal kasutaks {business} valikulisi küpsiseid saidi funktsioonide ja analüütika jaoks ning võiks {rights}. Midagi ei lülitata sisse, kui te seda ei luba.',
		optInTitle: 'Teie privaatsusvalikud',
		optOutOption: 'Loobu',
		panelExpanded: 'Kuvatakse rohkem valikuid.',
		policyColumn: 'Privaatsuspoliitika',
		preferencesClose: 'Sulge eelistused',
		preferencesOnCount: '{count} sees',
		preferencesSheetIntro: 'Muudatused hakkavad kohe kehtima.',
		preferencesSummary: 'Saidi funktsioonid ja analüütika',
		preferencesTitle: 'Eelistused',
		purposeColumn: 'Eesmärk',
		receiptAllowed: 'Lubatud: {rights}',
		receiptDetails: 'Üksikasjad',
		receiptFromGpc: 'teie Global Privacy Control signaali põhjal',
		receiptLive: 'Arvestatakse selle brauseri Global Privacy Control signaali',
		receiptLiveDetail: 'Loetakse teie brauserist igal külastusel.',
		receiptOptedOut: 'Loobutud: {rights}',
		receiptRecorded: 'Kirja pandud: {date}',
		receiptReference: 'Viide',
		receiptSavedAccount: 'Salvestatud teie kontole · {date}',
		receiptSavedBrowser: 'Salvestatud selle brauseri jaoks · {date}',
		receiptScopeAccount: 'Kehtib selles brauseris ja teie {business} kontol.',
		receiptScopeAccountUnnamed: 'Kehtib selles brauseris ja teie kontol.',
		receiptScopeBrowser:
			'Kehtib selles brauseris. Logige sisse, et see kehtiks ka teie kontol.',
		receiptViaGpc: 'Global Privacy Control signaal',
		referenceCopied: 'Viide on kopeeritud.',
		refuseAll:
			'ei müü ega jaga teie isikuandmeid ega kasuta neid suunatud reklaamiks',
		refuseSaleAndShare: 'ei müü ega jaga teie isikuandmeid',
		refuseSaleAndTargetedAds:
			'ei müü teie isikuandmeid ega kasuta neid suunatud reklaamiks',
		rejectAll: 'Keeldu kõigist',
		rightsAllowed: '{rights}: lubatud.',
		rightsNotAllowed: '{rights}: ei ole lubatud.',
		rightsOptedOut: 'Loobutud: {rights}.',
		saleAllowed: '{business} võib {rights}.',
		saleGroupOptIn: 'Luba {rights}',
		saleGroupSaleAndTargetedAds:
			'Loobu minu isikuandmete müügist ja suunatud reklaamist',
		saleOffByDefault:
			'Vaikimisi välja lülitatud. {business} {rights}, kui te seda ei luba.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Salvesta valikud',
		saveInSettings: 'Salvestage oma valikud privaatsusseadetes',
		savedAutomatically: 'Salvestatakse automaatselt',
		savedCue: 'Salvestatud',
		scopeAccount: 'selles brauseris ega teie {business} kontol',
		scopeAccountUnnamed: 'selles brauseris ega teie kontol',
		scopeBrowser: 'selles brauseris',
		shortAll: 'teie andmete müümist või jagamist reklaami jaoks',
		shortSaleAndShare: 'teie andmete müümist või jagamist',
		shortSaleAndTargetedAds: 'teie andmete müümist või reklaamiks kasutamist',
		stateOff: 'Väljas',
		stateOn: 'Sees',
		switchColumn: 'Sees',
		switchedOff: '{name} on väljas.',
		switchedOn: '{name} on sees.',
		titleAll: 'Müük, jagamine ja suunatud reklaam',
		titleSaleAndShare: 'Müük ja jagamine',
		titleSaleAndTargetedAds: 'Müük ja suunatud reklaam',
		vendorColumn: 'Teenusepakkuja',
		vendorPolicy: 'Privaatsuspoliitika: {vendor}',
		vendorsClose: 'Sulge teenusepakkujad: {category}',
		vendorsFor: 'kategoorias {category}',
		vendorsHide: 'Peida {count} teenusepakkujat',
		vendorsHideOne: 'Peida 1 teenusepakkuja',
		vendorsOnCount: '{count} sees',
		vendorsTable: 'Teenusepakkujad: {category}',
		vendorsView: 'Kuva {count} teenusepakkujat',
		vendorsViewOne: 'Kuva 1 teenusepakkuja',
	},
	rights: {
		californiaPrivacyChoices: 'Teie California privaatsusvalikud',
		optOut: 'Ära müü ega jaga minu andmeid',
		preferences: 'Halda eelistusi',
		privacyChoices: 'Teie privaatsusvalikud',
	},
};
export default translations;
