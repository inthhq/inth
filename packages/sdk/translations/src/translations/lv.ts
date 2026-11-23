import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Pieņemt visu',
		acknowledge: 'Labi',
		close: 'Aizvērt',
		customize: 'Pielāgot',
		dismiss: 'Aizvērt',
		rejectAll: 'Noraidīt visu',
		save: 'Saglabāt iestatījumus',
		securedBy: 'Aizsardzību nodrošina',
	},
	consentGate: {
		actionButton: 'Iespējot {category} piekrišanu',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Pieņemiet {category} piekrišanu, lai skatītu šo saturu.',
	},
	consentManagerDialog: {
		description:
			'Pielāgojiet savus privātuma iestatījumus šeit. Jūs varat izvēlēties, kāda veida sīkdatnes un izsekošanas tehnoloģijas atļaut.',
		title: 'Privātuma iestatījumi',
		vendors: {
			disabledByCategory:
				'Ieslēdziet šo kategoriju, lai izvēlētos piegādātājus.',
			privacyPolicy: 'Privātuma politika',
			switchLabel: 'Atļaut {vendor}',
			title: 'Piegādātāji ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Šīs sīkdatnes palīdz mums nodrošināt labāku lietotāja pieredzi un testēt jaunas funkcijas.',
			title: 'Pieredze',
		},
		functionality: {
			description:
				'Šīs sīkdatnes nodrošina uzlabotu funkcionalitāti un vietnes personalizāciju.',
			title: 'Funkcionalitāte',
		},
		marketing: {
			description:
				'Šīs sīkdatnes tiek izmantotas, lai piegādātu atbilstošas reklāmas un izsekotu to efektivitāti.',
			title: 'Mārketings',
		},
		measurement: {
			description:
				'Šīs sīkdatnes palīdz mums saprast, kā apmeklētāji mijiedarbojas ar vietni un uzlabo tās veiktspēju.',
			title: 'Analītika',
		},
		necessary: {
			description:
				'Šīs sīkdatnes ir būtiskas, lai vietne darbotos pareizi, un tās nevar atspējot.',
			title: 'Stingri nepieciešamās',
		},
	},
	cookieBanner: {
		description:
			'Šī vietne izmanto sīkdatnes, lai uzlabotu jūsu pārlūkošanas pieredzi, analizētu vietnes datplūsmu un rādītu personalizētu saturu.',
		noticeDescription:
			'Mēs izmantojam sīkdatnes un līdzīgas tehnoloģijas, lai nodrošinātu šīs vietnes darbību, mērītu datplūsmu un personalizētu saturu un reklāmas. Jūs jebkurā laikā varat atteikties vai pārvaldīt savas preferences.',
		noticeTitle: 'Privātuma paziņojums',
		title: 'Mēs novērtējam jūsu privātumu',
	},
	iab: {
		app: {
			consentStorage:
				'Jūsu izvēle tiek glabāta šajā ierīcē, lietotnes standarta iestatījumu krātuvē zem IABTCF atslēgām, līdz {days} dienām. Glabāšanas ilgums tiek atjaunots, kad jūs atjaunināt savu izvēli.',
			description:
				'Mēs un mūsu {partnerCount} partneri uzglabājam un/vai piekļūstam informācijai jūsu ierīcē un apstrādājam personas datus, piemēram, unikālus identifikatorus un pārlūkošanas datus, šai lietotnei, lai:',
			legitimateInterestExplanation:
				'Daži partneri apstrādā personas datus, piemēram, unikālus identifikatorus un pārlūkošanas datus, pamatojoties uz savām leģitīmajām interesēm, nevis lūdzot piekrišanu. Tas attiecas tikai uz šo lietotni. Jums ir tiesības iebilst pret šo apstrādi attiecībā uz katru nolūku un katru partneri.',
			scopeServiceSpecific:
				'Jūsu piekrišana attiecas tikai uz šo lietotni un neietekmēs citus pakalpojumus.',
			withdraw:
				'Jūs jebkurā laikā varat mainīt savu izvēli vai atsaukt piekrišanu šīs lietotnes sadaļā Privātuma iestatījumi.',
		},
		banner: {
			andMore: 'Un vēl {count}...',
			description:
				'Mēs un mūsu {partnerCount} partneri uzglabājam un/vai piekļūstam informācijai jūsu ierīcē un apstrādājam personas datus, piemēram, unikālus identifikatorus un pārlūkošanas datus, šai vietnei, lai:',
			legitimateInterestNotice:
				'Daži partneri pieprasa leģitīmas intereses jūsu datu apstrādei. Jums ir tiesības iebilst pret šo apstrādi, pielāgot savu izvēli un jebkurā laikā atsaukt savu piekrišanu.',
			partnersLink: '{count} partneri',
			scopeGroup: 'Jūsu izvēle attiecas uz visām mūsu vietnēm šajā grupā.',
			scopeServiceSpecific:
				'Jūsu piekrišana attiecas tikai uz šo vietni un neietekmēs citus pakalpojumus.',
			title: 'Privātuma iestatījumi',
		},
		common: {
			acceptAll: 'Pieņemt visu',
			clearSelection: 'Notīrīt',
			customPartner: 'Pielāgots partneris, kas nav reģistrēts IAB',
			customize: 'Pielāgot',
			loading: 'Ielādē...',
			rejectAll: 'Noraidīt visu',
			saveSettings: 'Saglabāt iestatījumus',
			showingSelectedVendor: 'Rāda atlasīto piegādātāju',
		},
		preferenceCenter: {
			description:
				'Pielāgojiet savus privātuma iestatījumus šeit. Jūs varat izvēlēties, kāda veida sīkdatnes un izsekošanas tehnoloģijas atļaut.',
			features: {
				description:
					'Šos apstrādes līdzekļus var izmantot tikai viena vai vairāku mērķu sasniegšanai, attiecībā uz kuriem jums ir dota izvēle šajā paziņojumā.',
				title: 'Funkcijas',
			},
			footer: {
				consentStorage:
					'Piekrišanas iestatījumi tiek glabāti sīkdatnē ar nosaukumu "euconsent-v2" 13 mēnešus. Glabāšanas ilgums var tikt atjaunots, kad jūs atjaunināt savus iestatījumus.',
			},
			purposeItem: {
				examples: 'Piemēri',
				legitimateInterest: 'Leģitīmās intereses',
				objectButton: 'Iebilst',
				objected: 'Iebilsts',
				partners: '{count} partneri',
				partnersUsingPurpose: 'Partneri, kas izmanto šo mērķi',
				rightToObject:
					'Jums ir tiesības iebilst pret apstrādi, kuras pamatā ir leģitīmas intereses.',
				vendorsUseLegitimateInterest:
					'{count} piegādātāji pieprasa leģitīmas intereses',
				withYourPermission: 'Ar jūsu atļauju',
			},
			specialPurposes: {
				title: 'Būtiskas funkcijas (nepieciešams)',
				tooltip:
					'Tās ir nepieciešamas vietnes funkcionalitātei un drošībai. Saskaņā ar IAB TCF jūs nevarat iebilst pret šiem īpašajiem mērķiem.',
			},
			tabs: {
				purposes: 'Mērķi',
				vendors: 'Piegādātāji',
			},
			title: 'Privātuma iestatījumi',
			vendorList: {
				adTechProvidersHeading: 'Google reklāmas tehnoloģiju nodrošinātāji',
				adTechProvidersNotice:
					'Google sadarbojas ar šiem reklāmas tehnoloģiju nodrošinātājiem ārpus IAB ietvara. Jūsu piekrišana sasniedz nodrošinātāju tikai tad, ja jūs to ieslēdzat un arī atļaujat informācijas uzglabāšanu jūsu ierīcē un personalizētu reklāmu.',
				customVendorsHeading: 'Pielāgoti partneri',
				customVendorsNotice:
					'Šie ir pielāgoti partneri, kas nav reģistrēti IAB Transparency & Consent Framework (TCF). Viņi apstrādā datus, pamatojoties uz jūsu piekrišanu, un viņiem var būt atšķirīga privātuma prakse nekā IAB reģistrētajiem piegādātājiem.',
				dataCategories: 'Datu kategorijas',
				features: 'Funkcijas',
				iabVendorsHeading: 'IAB reģistrētie piegādātāji',
				iabVendorsNotice:
					'Šie partneri ir reģistrēti IAB Transparency & Consent Framework (TCF) — nozares standartā piekrišanas pārvaldībai',
				legitimateInterest: 'Leģ. intereses',
				maxAge: 'Maks. vecums: {days}d',
				nonCookieAccess: 'Piekļuve bez sīkdatnēm',
				privacyPolicy: 'Privātuma politika',
				purposes: 'Mērķi',
				requiredNotice: 'Nepieciešams vietnes funkcionalitātei, nevar atspējot',
				retention: 'Saglabāšana: {days}d',
				search: 'Meklēt piegādātājus...',
				showingCount: 'Rāda {filtered} no {total} piegādātājiem',
				specialFeatures: 'Īpašās funkcijas',
				specialPurposes: 'Īpašie mērķi',
				storageDisclosure: 'Informācija par glabāšanu',
				usesCookies: 'Izmanto sīkdatnes',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Sīkdatņu politika',
		privacyPolicy: 'Privātuma politika',
		termsOfService: 'Pakalpojumu sniegšanas noteikumi',
	},
	optOut: {
		action: 'Atteikties',
		description:
			'Šī vietne nepārdos un nekopīgos jūsu personas datus, un jūsu izvēle ir saglabāta šajā pārlūkprogrammā.',
		done: 'Gatavs',
		headingAll:
			'Jūsu personas datu pārdošana, kopīgošana un mērķtiecīga reklāma',
		headingSaleAndShare: 'Jūsu personas datu pārdošana un kopīgošana',
		headingSaleAndTargetedAds:
			'Jūsu personas datu pārdošana un mērķtiecīga reklāma',
		lockedByAccount:
			'Jūsu konts ir atteicies, un jūs varat to mainīt pēc pierakstīšanās.',
		lockedByGpc:
			'Jūsu pārlūkprogrammas Global Privacy Control signāls ir ieslēgts, tāpēc tas paliek izslēgts.',
		notOptedOut: 'Šajā pārlūkprogrammā neesat atteicies.',
		optInCancel: 'Palikt atteikušamies',
		optInConfirm: 'Piekrist vēlreiz',
		optInDescription:
			'Apstiprināšana izbeidz jūsu atteikšanos šajā pārlūkprogrammā.',
		optInDescriptionWithRights:
			'Apstiprināšana izbeidz jūsu atteikšanos no {rights} šajā pārlūkprogrammā.',
		optInLink: 'Piekrist vēlreiz…',
		optInTitle: 'Piekrist vēlreiz?',
		receiptAccount: 'Jūs esat atteicies šajā pārlūkprogrammā un savā kontā.',
		receiptAccountWithRights:
			'Jūs esat atteicies no {rights} šajā pārlūkprogrammā un savā kontā.',
		receiptBrowser: 'Jūs esat atteicies šajā pārlūkprogrammā.',
		receiptBrowserWithRights:
			'Jūs esat atteicies no {rights} šajā pārlūkprogrammā.',
		recordedLabel: 'Reģistrēts',
		referenceLabel: 'Atsauce',
		rightsAll: 'pārdošanas, kopīgošanas un mērķētas reklāmas',
		rightsSaleAndShare: 'pārdošanas un kopīgošanas',
		rightsSaleAndTargetedAds: 'pārdošanas un mērķētas reklāmas',
		statusRequest: 'Atteikšanās pieprasījums ievērots',
		statusSignal: 'Atteikšanās preferences signāls ievērots',
	},
	rights: {
		californiaPrivacyChoices: 'Jūsu Kalifornijas privātuma izvēles',
		optOut: 'Nepārdot un nekopīgot manus datus',
		preferences: 'Pārvaldīt preferences',
		privacyChoices: 'Jūsu privātuma izvēles',
	},
};
export default translations;
