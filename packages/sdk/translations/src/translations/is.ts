import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Samþykkja allt',
		acknowledge: 'Í lagi',
		close: 'Loka',
		customize: 'Sérsníða',
		dismiss: 'Loka',
		rejectAll: 'Hafna öllu',
		save: 'Vista stillingar',
		securedBy: 'Samþykki frá',
	},
	consentGate: {
		actionButton: 'Virkja {category} samþykki',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Samþykktu {category} samþykki til að skoða þetta efni.',
	},
	consentManagerDialog: {
		description:
			'Sérsníðaðu persónuverndastillingar þínar hér. Þú getur valið hvaða tegundir af vafrakökum og rakningartækni þú leyfir.',
		title: 'Persónuverndastillingar',
		vendors: {
			disabledByCategory: 'Kveiktu á þessum flokki til að velja söluaðila.',
			privacyPolicy: 'Persónuverndarstefna',
			switchLabel: 'Leyfa {vendor}',
			title: 'Söluaðilar ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Þessar vafrakökur hjálpa okkur að veita betri notendaupplifun og prófa nýja eiginleika.',
			title: 'Upplifun',
		},
		functionality: {
			description:
				'Þessar vafrakökur gera mögulegt að auka virkni og persónumiða vefsíðuna.',
			title: 'Virkni',
		},
		marketing: {
			description:
				'Þessar vafrakökur eru notaðar til að birta viðeigandi auglýsingar og fylgjast með árangri þeirra.',
			title: 'Markaðssetning',
		},
		measurement: {
			description:
				'Þessar vafrakökur hjálpa okkur að skilja hvernig gestir nota vefsíðuna og bæta frammistöðu hennar.',
			title: 'Greining',
		},
		necessary: {
			description:
				'Þessar vafrakökur eru nauðsynlegar til að vefsíðan virki rétt og ekki er hægt að slökkva á þeim.',
			title: 'Nauðsynlegar',
		},
	},
	cookieBanner: {
		description:
			'Þessi vefur notar vafrakökur til að bæta vafraupplifun þína, greina umferð á vefnum og sýna persónumiðað efni.',
		noticeDescription:
			'Við notum vafrakökur og sambærilega tækni til að reka þennan vef, mæla umferð og sérsníða efni og auglýsingar. Þú getur afþakkað eða stjórnað stillingum þínum hvenær sem er.',
		noticeTitle: 'Persónuverndartilkynning',
		title: 'Við metum friðhelgi þína',
	},
	iab: {
		app: {
			consentStorage:
				'Val þitt er geymt á þessu tæki, í hefðbundinni stillingageymslu forritsins undir IABTCF-lyklum, í allt að {days} daga. Geymslutíminn endurnýjast þegar þú uppfærir val þitt.',
			description:
				'Við og {partnerCount} samstarfsaðilar okkar geymum og/eða höfum aðgang að upplýsingum á tækinu þínu og vinnum persónuupplýsingar, svo sem einstök auðkenni og vafraupplýsingar, fyrir þetta forrit, til að:',
			legitimateInterestExplanation:
				'Sumir samstarfsaðilar vinna persónuupplýsingar, svo sem einstök auðkenni og vafraupplýsingar, á grundvelli lögmætra hagsmuna sinna í stað þess að biðja um samþykki. Þetta gildir aðeins fyrir þetta forrit. Þú átt rétt á að andmæla þessari vinnslu fyrir hvern tilgang og hvern samstarfsaðila.',
			scopeServiceSpecific:
				'Samþykki þitt gildir aðeins fyrir þetta forrit og hefur ekki áhrif á aðrar þjónustur.',
			withdraw:
				'Þú getur breytt vali þínu eða dregið samþykki þitt til baka hvenær sem er í Persónuverndastillingum í þessu forriti.',
		},
		banner: {
			andMore: 'Og {count} til viðbótar...',
			description:
				'Við og {partnerCount} samstarfsaðilar okkar geymum og/eða höfum aðgang að upplýsingum á tækinu þínu og vinnum persónuupplýsingar, svo sem einstök auðkenni og vafraupplýsingar, fyrir þessa vefsíðu, til að:',
			legitimateInterestNotice:
				'Sumir samstarfsaðilar krefjast lögmætra hagsmuna til að vinna gögnin þín. Þú átt rétt á að andmæla þessari vinnslu, sérsníða val þitt og draga samþykki þitt til baka hvenær sem er.',
			partnersLink: '{count} samstarfsaðilar',
			scopeGroup: 'Val þitt gildir á öllum vefsíðum okkar í þessum hóp.',
			scopeServiceSpecific:
				'Samþykki þitt gildir aðeins fyrir þessa vefsíðu og hefur ekki áhrif á aðrar þjónustur.',
			title: 'Persónuverndastillingar',
		},
		common: {
			acceptAll: 'Samþykkja allt',
			clearSelection: 'Hreinsa',
			customPartner: 'Sérsniðinn samstarfsaðili ekki skráður hjá IAB',
			customize: 'Sérsníða',
			loading: 'Hleður...',
			rejectAll: 'Hafna öllu',
			saveSettings: 'Vista stillingar',
			showingSelectedVendor: 'Sýnir valdan söluaðila',
		},
		preferenceCenter: {
			description:
				'Sérsníðaðu persónuverndastillingar þínar hér. Þú getur valið hvaða tegundir af vafrakökum og rakningartækni þú leyfir.',
			features: {
				description:
					'Þessar vinnsluaðferðir má eingöngu nota til að ná einum eða fleiri þeirra tilganga sem þér er gefinn kostur á að velja í þessari tilkynningu.',
				title: 'Eiginleikar',
			},
			footer: {
				consentStorage:
					'Samþykkisstillingar eru geymdar í vafraköku sem heitir "euconsent-v2" í 13 mánuði. Geymslutíminn kann að endurnýjast þegar þú uppfærir stillingar þínar.',
			},
			purposeItem: {
				examples: 'Dæmi',
				legitimateInterest: 'Lögmætir hagsmunir',
				objectButton: 'Andmæla',
				objected: 'Andmælt',
				partners: '{count} samstarfsaðilar',
				partnersUsingPurpose: 'Samstarfsaðilar sem nota þennan tilgang',
				rightToObject:
					'Þú átt rétt á að andmæla vinnslu sem byggir á lögmætum hagsmunum.',
				vendorsUseLegitimateInterest:
					'{count} söluaðilar krefjast lögmætra hagsmuna',
				withYourPermission: 'Með þínu leyfi',
			},
			specialPurposes: {
				title: 'Nauðsynleg virkni (krafist)',
				tooltip:
					'Þetta er nauðsynlegt fyrir virkni og öryggi vefsins. Samkvæmt IAB TCF geturðu ekki andmælt þessum sérstöku markmiðum.',
			},
			tabs: {
				purposes: 'Tilgangur',
				vendors: 'Söluaðilar',
			},
			title: 'Persónuverndastillingar',
			vendorList: {
				adTechProvidersHeading: 'Auglýsingatækniveitur Google',
				adTechProvidersNotice:
					'Google vinnur með þessum auglýsingatækniveitum utan IAB-rammans. Samþykki þitt berst aðeins til veitu ef þú kveikir á henni og leyfir einnig geymslu upplýsinga á tækinu þínu og sérsniðnar auglýsingar.',
				customVendorsHeading: 'Sérsniðnir samstarfsaðilar',
				customVendorsNotice:
					'Þetta eru sérsniðnir samstarfsaðilar sem eru ekki skráðir hjá IAB Transparency & Consent Framework (TCF). Þeir vinna gögn byggt á samþykki þínu og gætu haft aðrar persónuverndarreglur en IAB-skráðir söluaðilar.',
				dataCategories: 'Gagnaflokkar',
				features: 'Eiginleikar',
				iabVendorsHeading: 'IAB skráðir söluaðilar',
				iabVendorsNotice:
					'Þessir samstarfsaðilar eru skráðir hjá IAB Transparency & Consent Framework (TCF), iðnaðarstaðli til að stjórna samþykki',
				legitimateInterest: 'Lögm. hagsmunir',
				maxAge: 'Hámarksaldur: {days}d',
				nonCookieAccess: 'Aðgangur án vafrakaka',
				privacyPolicy: 'Persónuverndarstefna',
				purposes: 'Tilgangur',
				requiredNotice:
					'Nauðsynlegt fyrir virkni vefsins, ekki hægt að slökkva á',
				retention: 'Varðveisla: {days}d',
				search: 'Leita að söluaðilum...',
				showingCount: '{filtered} af {total} söluaðilum',
				specialFeatures: 'Sérstakir eiginleikar',
				specialPurposes: 'Sérstakur tilgangur',
				storageDisclosure: 'Upplýsingar um geymslu',
				usesCookies: 'Notar vafrakökur',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Stefna um vafrakökur',
		privacyPolicy: 'Persónuverndarstefna',
		termsOfService: 'Þjónustuskilmálar',
	},
	optOut: {
		action: 'Afþakka',
		description:
			'Þessi vefsíða mun ekki selja eða deila persónuupplýsingum þínum og val þitt er vistað í þessum vafra.',
		done: 'Lokið',
		headingAll:
			'Sala og miðlun persónuupplýsinga þinna og markvissar auglýsingar',
		headingSaleAndShare: 'Sala og miðlun persónuupplýsinga þinna',
		headingSaleAndTargetedAds:
			'Sala persónuupplýsinga þinna og markvissar auglýsingar',
		lockedByAccount:
			'Reikningur þinn hefur afþakkað og þú getur breytt þessu eftir innskráningu.',
		lockedByGpc:
			'Global Privacy Control-merki vafrans þíns er virkt, svo þetta helst óvirkt.',
		notOptedOut: 'Þú hefur ekki afþakkað í þessum vafra.',
		optInCancel: 'Vera áfram afskráður',
		optInConfirm: 'Skrá aftur inn',
		optInDescription: 'Staðfesting lýkur afskráningu þinni í þessum vafra.',
		optInDescriptionWithRights:
			'Staðfesting lýkur afskráningu þinni frá {rights} í þessum vafra.',
		optInLink: 'Skrá aftur inn…',
		optInTitle: 'Skrá aftur inn?',
		receiptAccount: 'Þú hefur afþakkað í þessum vafra og á reikningnum þínum.',
		receiptAccountWithRights:
			'Þú hefur afþakkað {rights} í þessum vafra og á reikningnum þínum.',
		receiptBrowser: 'Þú hefur afþakkað í þessum vafra.',
		receiptBrowserWithRights: 'Þú hefur afþakkað {rights} í þessum vafra.',
		recordedLabel: 'Skráð',
		referenceLabel: 'Tilvísun',
		rightsAll: 'sölu, deilingu og markvissar auglýsingar',
		rightsSaleAndShare: 'sölu og deilingu',
		rightsSaleAndTargetedAds: 'sölu og markvissar auglýsingar',
		statusRequest: 'Beiðni um afþökkun virt',
		statusSignal: 'Kjörstillingamerki um afþökkun virt',
	},
	privacyChoices: {
		acceptAll: 'Samþykkja allt',
		advertisingFollowsSale: 'Auglýsingar fylgja vali þínu hér að ofan.',
		advertisingTitle: 'Auglýsingar',
		allow: 'Leyfa',
		alwaysOn: 'Alltaf virkt',
		announceSaved: '{message} Vistað.',
		askAll:
			'selja eða deila persónuupplýsingum þínum, þar á meðal fyrir markvissar auglýsingar',
		askSaleAndShare: 'selja eða deila persónuupplýsingum þínum',
		askSaleAndTargetedAds:
			'selja persónuupplýsingar þínar eða nota þær í markvissar auglýsingar',
		bannerAllowedRightsOff:
			'Valfrjálsar vafrakökur leyfðar. {rights}: áfram slökkt. Þú getur breytt þessu í „Persónuverndarval þitt“.',
		bannerAllowedRightsOffGpc:
			'Valfrjálsar vafrakökur leyfðar. {rights}: áfram slökkt vegna Global Privacy Control-merkisins þíns. Þú getur breytt þessu í „Persónuverndarval þitt“.',
		bannerRejected:
			'Valfrjálsum vafrakökum hafnað. Þú getur breytt þessu í „Persónuverndarval þitt“.',
		barDescription:
			'Við notum vafrakökur til að bæta upplifun þína og greina umferð.',
		businessFallback: 'þessi vefur',
		choiceRecorded: 'Val skráð.',
		choicesSaved: 'Val vistað. Þú getur breytt því í „Persónuverndarval þitt“.',
		choose: 'Velja',
		chooseWhatToAllow: 'Veldu hvað á að leyfa',
		close: 'Loka',
		confirmDescriptionOptIn:
			'{business} má þá {rights}. Þú getur breytt þessu hvenær sem er.',
		confirmDescriptionOptOut:
			'{business} má þá {rights}. Þú getur afþakkað aftur hvenær sem er.',
		confirmKeepOptedOut: 'Afþakka áfram',
		confirmTitleOptIn: 'Leyfa eftirfarandi: {rights}?',
		confirmTitleOptOut: 'Leyfa aftur eftirfarandi: {rights}?',
		copyFailed: 'Ekki tókst að afrita. Veldu og afritaðu tilvísunina þína:',
		copyFailedAnnouncement:
			'Ekki tókst að afrita. Tilvísunin þín er sýnd í heild í kvittuninni.',
		copyReference: 'Afrita tilvísun',
		dialogIntro: 'Val þitt tekur gildi strax.',
		dialogTitle: 'Persónuverndarval þitt',
		done: 'Lokið',
		dontAllow: 'Ekki leyfa',
		euDialogIntro:
			'Veldu hvaða valfrjálsar vafrakökur {business} má nota. Valfrjálsar vafrakökur eru óvirkar nema þú kveikir á þeim.',
		euDialogTitle: 'Persónuverndastillingar',
		gpcNote:
			'Vafrinn þinn sendi Global Privacy Control-merki, þannig að {business} {rights} {scope}. Ekki er hægt að velja „Leyfa“ á meðan merkið er virkt.',
		justNow: 'rétt í þessu',
		nestedSheetNote:
			'Breytingar taka gildi þegar þú vistar í Persónuverndastillingum.',
		noticeBarDescription:
			'Við notum vafrakökur til að reka þennan vef, mæla umferð og sérsníða auglýsingar. Þú getur afþakkað hvenær sem er.',
		noticeBarDescriptionGpc:
			'Við notum vafrakökur til að reka þennan vef og mæla umferð. Global Privacy Control-merkið þitt er virt.',
		noticeGpcHonored: 'Global Privacy Control-merki vafrans þíns er virt.',
		noticeRightsAction: 'Ekki selja eða deila gögnunum mínum',
		nudge: 'Veldu fyrst annan hvorn hnappinn.',
		optInBarDescription:
			'{business} biður um leyfi þitt til að nota valfrjálsar vafrakökur og til að {rights}.',
		optInDescription:
			'Með þínu leyfi myndi {business} nota valfrjálsar vafrakökur fyrir eiginleika vefsins og greiningu, og {rights}. Ekkert er virkjað nema þú leyfir það.',
		optInTitle: 'Persónuverndarval þitt',
		optOutOption: 'Afþakka',
		panelExpanded: 'Fleiri valkostir sýndir.',
		policyColumn: 'Persónuverndarstefna',
		preferencesClose: 'Loka stillingum',
		preferencesOnCount: 'Virkt: {count}',
		preferencesSheetIntro: 'Breytingar taka gildi strax.',
		preferencesSummary: 'Eiginleikar vefsins og greining',
		preferencesTitle: 'Stillingar',
		purposeColumn: 'Tilgangur',
		receiptAllowed: 'Leyft: {rights}',
		receiptDetails: 'Nánar',
		receiptFromGpc: 'samkvæmt Global Privacy Control-merkinu þínu',
		receiptLive: 'Global Privacy Control-merki þessa vafra er virt',
		receiptLiveDetail: 'Lesið úr vafranum þínum í hverri heimsókn.',
		receiptOptedOut: 'Afþakkað: {rights}',
		receiptRecorded: 'Skráð: {date}',
		receiptReference: 'Tilvísun',
		receiptSavedAccount: 'Vistað á reikningnum þínum · {date}',
		receiptSavedBrowser: 'Vistað fyrir þennan vafra · {date}',
		receiptScopeAccount:
			'Gildir fyrir þennan vafra og {business}-reikninginn þinn.',
		receiptScopeAccountUnnamed:
			'Gildir fyrir þennan vafra og reikninginn þinn.',
		receiptScopeBrowser:
			'Gildir fyrir þennan vafra. Skráðu þig inn til að það gildi líka fyrir reikninginn þinn.',
		receiptViaGpc: 'Global Privacy Control-merki',
		referenceCopied: 'Tilvísun afrituð.',
		refuseAll:
			'mun ekki selja eða deila persónuupplýsingum þínum né nota þær í markvissar auglýsingar',
		refuseSaleAndShare: 'mun ekki selja eða deila persónuupplýsingum þínum',
		refuseSaleAndTargetedAds:
			'mun ekki selja persónuupplýsingar þínar né nota þær í markvissar auglýsingar',
		rejectAll: 'Hafna öllu',
		rightsAllowed: '{rights}: leyft.',
		rightsNotAllowed: '{rights}: ekki leyft.',
		rightsOptedOut: 'Afþakkað: {rights}.',
		saleAllowed: '{business} má {rights}.',
		saleGroupOptIn: 'Leyfa: {rights}',
		saleGroupSaleAndTargetedAds:
			'Afþakka sölu persónuupplýsinga minna og markvissar auglýsingar',
		saleOffByDefault:
			'Sjálfgefið slökkt. {business} {rights} nema þú leyfir það.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Vista val',
		saveInSettings: 'Vistaðu val þitt í Persónuverndastillingum',
		savedAutomatically: 'Vistað sjálfkrafa',
		savedCue: 'Vistað',
		scopeAccount: 'í þessum vafra eða á {business}-reikningnum þínum',
		scopeAccountUnnamed: 'í þessum vafra eða á reikningnum þínum',
		scopeBrowser: 'í þessum vafra',
		shortAll: 'selja eða deila gögnunum þínum vegna auglýsinga',
		shortSaleAndShare: 'selja eða deila gögnunum þínum',
		shortSaleAndTargetedAds: 'selja gögnin þín eða nota þau í auglýsingar',
		stateOff: 'Slökkt',
		stateOn: 'Kveikt',
		switchColumn: 'Kveikt',
		switchedOff: '{name}: slökkt.',
		switchedOn: '{name}: kveikt.',
		titleAll: 'Sala, deiling og markvissar auglýsingar',
		titleSaleAndShare: 'Sala og deiling',
		titleSaleAndTargetedAds: 'Sala og markvissar auglýsingar',
		vendorColumn: 'Söluaðili',
		vendorPolicy: 'Persónuverndarstefna: {vendor}',
		vendorsClose: 'Loka söluaðilum: {category}',
		vendorsFor: 'fyrir flokkinn {category}',
		vendorsHide: 'Fela söluaðila ({count})',
		vendorsHideOne: 'Fela 1 söluaðila',
		vendorsOnCount: 'Virkt: {count}',
		vendorsTable: 'Söluaðilar: {category}',
		vendorsView: 'Sýna söluaðila ({count})',
		vendorsViewOne: 'Sýna 1 söluaðila',
	},
	rights: {
		californiaPrivacyChoices: 'Persónuverndarval þitt í Kaliforníu',
		optOut: 'Ekki selja eða deila gögnunum mínum',
		preferences: 'Stjórna stillingum',
		privacyChoices: 'Persónuverndarval þitt',
	},
};
export default translations;
