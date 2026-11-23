import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Aċċetta kollox',
		acknowledge: 'OK',
		close: 'Agħlaq',
		customize: 'Personalizza',
		dismiss: 'Agħlaq',
		rejectAll: 'Irrifjuta kollox',
		save: 'Issejvja s-settings',
		securedBy: 'Kunsens minn',
	},
	consentGate: {
		actionButton: "Attiva l-kunsens ta' {category}",
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: "Aċċetta l-kunsens ta' {category} biex tara dan il-kontenut.",
	},
	consentManagerDialog: {
		description:
			"Personalizza s-settings tal-privatezza tiegħek hawn. Tista' tagħżel liema tipi ta' cookies u teknoloġiji ta' traċċar tippermetti.",
		title: 'Settings tal-privatezza',
		vendors: {
			disabledByCategory: 'Ixgħel din il-kategorija biex tagħżel il-bejjiegħa.',
			privacyPolicy: 'Politika tal-Privatezza',
			switchLabel: 'Ħalli {vendor}',
			title: 'Bejjiegħa ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Dawn il-cookies jgħinuna nipprovdu esperjenza aħjar għall-utent u nittestjaw karatteristiċi ġodda.',
			title: 'Esperjenza',
		},
		functionality: {
			description:
				'Dawn il-cookies jippermettu funzjonalità mtejba u personalizzazzjoni tas-sit web.',
			title: 'Funzjonalità',
		},
		marketing: {
			description:
				'Dawn il-cookies jintużaw biex iwasslu riklami rilevanti u jittraċċaw l-effettività tagħhom.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Dawn il-cookies jgħinuna nifhmu kif il-viżitaturi jinteraġixxu mas-sit web u ntejbu l-prestazzjoni tiegħu.',
			title: 'Analitika',
		},
		necessary: {
			description:
				'Dawn il-cookies huma essenzjali biex is-sit web jaħdem sew u ma jistgħux jiġu diżattivati.',
			title: 'Strettament neċessarji',
		},
	},
	cookieBanner: {
		description:
			'Dan is-sit juża cookies biex itejjeb l-esperjenza tal-browsing tiegħek, janalizza t-traffiku tas-sit, u juri kontenut personalizzat.',
		noticeDescription:
			"Nużaw cookies u teknoloġiji simili biex inħaddmu dan is-sit, inkejlu t-traffiku, u nippersonalizzaw il-kontenut u r-reklami. Tista' tagħżel li toħroġ jew timmaniġġja l-preferenzi tiegħek fi kwalunkwe ħin.",
		noticeTitle: 'Avviż dwar il-privatezza',
		title: 'Napprezzaw il-privatezza tiegħek',
	},
	iab: {
		app: {
			consentStorage:
				'L-għażliet tiegħek huma maħżuna fuq dan l-apparat, fil-ħażna standard tas-settings tal-app taħt ċwievet IABTCF, għal mhux aktar minn {days} jum. Il-perjodu tal-ħażna jiġġedded meta taġġorna l-għażliet tiegħek.',
			description:
				'Aħna u l-{partnerCount} sieħeb tagħna naħżnu u/jew naċċessaw informazzjoni fuq apparat u nipproċessaw data personali, bħal identifikaturi uniċi u data tal-browsing, għal din l-app, biex:',
			legitimateInterestExplanation:
				'Xi sħab jipproċessaw data personali, bħal identifikaturi uniċi u data tal-browsing, abbażi tal-interess leġittimu tagħhom minflok ma jitolbu l-kunsens. Dan japplika biss għal din l-app. Għandek id-dritt li toġġezzjona għal dan il-proċessar għal kull skop u għal kull sieħeb.',
			scopeServiceSpecific:
				'Il-kunsens tiegħek japplika biss għal din l-app u ma jaffettwax servizzi oħra.',
			withdraw:
				'Tista’ tibdel l-għażliet tiegħek jew tirtira l-kunsens tiegħek fi kwalunkwe ħin minn Settings tal-privatezza f’din l-app.',
		},
		banner: {
			andMore: 'U {count} oħra...',
			description:
				'Aħna u l-{partnerCount} sieħeb tagħna naħżnu u/jew naċċessaw informazzjoni fuq apparat u nipproċessaw data personali, bħal identifikaturi uniċi u data tal-browsing, għal dan is-sit web, biex:',
			legitimateInterestNotice:
				'Xi sħab jitolbu interess leġittimu biex jipproċessaw id-data tiegħek. Għandek id-dritt li toġġezzjona għal dan il-proċessar, tippersonalizza l-għażliet tiegħek, u tirtira l-kunsens tiegħek fi kwalunkwe ħin.',
			partnersLink: '{count} sieħeb',
			scopeGroup:
				"L-għażla tiegħek tapplika għal kull sit web tagħna f'din il-grupp.",
			scopeServiceSpecific:
				'Il-kunsens tiegħek japplika biss għal dan is-sit web u ma jaffettwax servizzi oħra.',
			title: 'Settings tal-privatezza',
		},
		common: {
			acceptAll: 'Aċċetta kollox',
			clearSelection: 'Ikklerja',
			customPartner: 'Sieħeb personalizzat mhux reġistrat mal-IAB',
			customize: 'Personalizza',
			loading: 'Qed jillowdja...',
			rejectAll: 'Irrifjuta kollox',
			saveSettings: 'Issejvja s-settings',
			showingSelectedVendor: 'Qed jintwera l-bejjiegħ magħżul',
		},
		preferenceCenter: {
			description:
				"Personalizza s-settings tal-privatezza tiegħek hawn. Tista' tagħżel liema tipi ta' cookies u teknoloġiji ta' traċċar tippermetti.",
			features: {
				description:
					'Dawn il-mezzi ta’ pproċessar jistgħu jintużaw biss biex jintlaħaq skop wieħed jew diversi skopijiet li għalihom tingħata għażla f’dan l-avviż.',
				title: 'Karatteristiċi',
			},
			footer: {
				consentStorage:
					'Il-preferenzi tal-kunsens huma maħżuna f’cookie msemmija "euconsent-v2" għal 13-il xahar. Il-perjodu tal-ħażna jista’ jiġġedded meta taġġorna l-preferenzi tiegħek.',
			},
			purposeItem: {
				examples: 'Eżempji',
				legitimateInterest: 'Interess Leġittimu',
				objectButton: 'Oġġezzjona',
				objected: 'Oġġezzjonat',
				partners: '{count} sieħeb',
				partnersUsingPurpose: 'Sħab li Jużaw dan l-Għan',
				rightToObject:
					'Għandek id-dritt li toġġezzjona għall-ipproċessar ibbażat fuq interess leġittimu.',
				vendorsUseLegitimateInterest:
					'{count} bejjiegħ jitolbu interess leġittimu',
				withYourPermission: 'Bil-Permess Tiegħek',
			},
			specialPurposes: {
				title: 'Funzjonijiet Essenzjali (Meħtieġa)',
				tooltip:
					'Dawn huma meħtieġa għall-funzjonalità u s-sigurtà tas-sit. Skont l-IAB TCF, ma tistax toġġezzjona għal dawn l-għanijiet speċjali.',
			},
			tabs: {
				purposes: 'Għanijiet',
				vendors: 'Bejjiegħa',
			},
			title: 'Settings tal-privatezza',
			vendorList: {
				adTechProvidersHeading:
					'Fornituri tat-Teknoloġija tar-Reklamar ta’ Google',
				adTechProvidersNotice:
					'Google jaħdem ma’ dawn il-fornituri tat-teknoloġija tar-reklamar barra mill-qafas tal-IAB. Il-kunsens tiegħek jasal għand fornitur biss jekk tixgħelu u tippermetti wkoll il-ħżin ta’ informazzjoni fuq l-apparat tiegħek u r-reklamar personalizzat.',
				customVendorsHeading: 'Sħab Personalizzati',
				customVendorsNotice:
					'Dawn huma sħab personalizzati mhux reġistrati mal-IAB Transparency & Consent Framework (TCF). Huma jipproċessaw id-data abbażi tal-kunsens tiegħek u jista’ jkollhom prattiki ta’ privatezza differenti minn bejjiegħa reġistrati fl-IAB.',
				dataCategories: 'Kategoriji tad-Data',
				features: 'Karatteristiċi',
				iabVendorsHeading: 'Bejjiegħa Reġistrati fl-IAB',
				iabVendorsNotice:
					'Dawn is-sħab huma reġistrati mal-IAB Transparency & Consent Framework (TCF), standard tal-industrija għall-immaniġġjar tal-kunsens',
				legitimateInterest: 'Int. Leġittimu',
				maxAge: 'Età Massima: {days}j',
				nonCookieAccess: 'Aċċess Mhux tal-Cookie',
				privacyPolicy: 'Politika tal-Privatezza',
				purposes: 'Għanijiet',
				requiredNotice:
					'Meħtieġ għall-funzjonalità tas-sit, ma jistax jiġi diżattivat',
				retention: 'Żamma: {days}j',
				search: 'Fittex bejjiegħa...',
				showingCount: 'Qed jintwerew {filtered} minn {total} bejjiegħ',
				specialFeatures: 'Karatteristiċi Speċjali',
				specialPurposes: 'Għanijiet Speċjali',
				storageDisclosure: 'Żvelar tal-Ħażna',
				usesCookies: 'Juża l-Cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Politika tal-Cookies',
		privacyPolicy: 'Politika tal-Privatezza',
		termsOfService: 'Termini tas-Servizz',
	},
	optOut: {
		action: 'Agħżel li toħroġ',
		description:
			'Dan is-sit mhux se jbigħ jew jaqsam l-informazzjoni personali tiegħek, u l-għażla tiegħek hija salvata fuq dan il-brawżer.',
		done: 'Lest',
		headingAll:
			'Bejgħ u qsim tal-informazzjoni personali tiegħek u reklamar immirat',
		headingSaleAndShare: 'Bejgħ u qsim tal-informazzjoni personali tiegħek',
		headingSaleAndTargetedAds:
			'Bejgħ tal-informazzjoni personali tiegħek u reklamar immirat',
		lockedByAccount:
			'Il-kont tiegħek għażel li joħroġ, u tista’ tibdel dan wara li tidħol.',
		lockedByGpc:
			'Is-sinjal Global Privacy Control tal-brawżer tiegħek huwa mixgħul, għalhekk dan jibqa’ mitfi.',
		notOptedOut: 'Ma għażiltx li toħroġ fuq dan il-brawżer.',
		optInCancel: "Ibqa' eskluż",
		optInConfirm: "Erġa' aċċetta",
		optInDescription:
			'Il-konferma ttemm l-esklużjoni tiegħek fuq dan il-browser.',
		optInDescriptionWithRights:
			'Il-konferma ttemm l-esklużjoni tiegħek minn {rights} fuq dan il-browser.',
		optInLink: "Erġa' aċċetta…",
		optInTitle: "Trid terġa' taċċetta?",
		receiptAccount:
			'Inti għażilt li toħroġ fuq dan il-brawżer u fuq il-kont tiegħek.',
		receiptAccountWithRights:
			'Inti għażilt li toħroġ minn {rights} fuq dan il-brawżer u fuq il-kont tiegħek.',
		receiptBrowser: 'Inti għażilt li toħroġ fuq dan il-brawżer.',
		receiptBrowserWithRights:
			'Inti għażilt li toħroġ minn {rights} fuq dan il-brawżer.',
		recordedLabel: 'Irreġistrat',
		referenceLabel: 'Referenza',
		rightsAll: 'bejgħ, qsim u reklamar immirat',
		rightsSaleAndShare: 'bejgħ u qsim',
		rightsSaleAndTargetedAds: 'bejgħ u reklamar immirat',
		statusRequest: 'It-talba għall-ħruġ ġiet rispettata',
		statusSignal: 'Is-sinjal tal-preferenza għall-ħruġ ġie rispettat',
	},
	privacyChoices: {
		acceptAll: 'Aċċetta kollox',
		advertisingFollowsSale: "Ir-reklamar isegwi l-għażla tiegħek ta' hawn fuq.",
		advertisingTitle: 'Reklamar',
		allow: 'Ippermetti',
		alwaysOn: 'Dejjem mixgħul',
		announceSaved: '{message} Issejvjat.',
		askAll:
			'jbigħ jew jaqsam l-informazzjoni personali tiegħek, inkluż għal reklamar immirat',
		askSaleAndShare: 'jbigħ jew jaqsam l-informazzjoni personali tiegħek',
		askSaleAndTargetedAds:
			'jbigħ l-informazzjoni personali tiegħek jew jużaha għal reklamar immirat',
		bannerAllowedRightsOff:
			"Cookies fakultattivi permessi. {rights} jibqgħu mitfija. Tista' tibdel dan taħt L-Għażliet tal-Privatezza Tiegħek.",
		bannerAllowedRightsOffGpc:
			"Cookies fakultattivi permessi. {rights} jibqgħu mitfija minħabba s-sinjal Global Privacy Control tiegħek. Tista' tibdel dan taħt L-Għażliet tal-Privatezza Tiegħek.",
		bannerRejected:
			"Cookies fakultattivi rrifjutati. Tista' tibdel dan taħt L-Għażliet tal-Privatezza Tiegħek.",
		barDescription:
			'Nużaw cookies biex intejbu l-esperjenza tiegħek u nanalizzaw it-traffiku.',
		businessFallback: 'dan is-sit',
		choiceRecorded: 'L-għażla ġiet irreġistrata.',
		choicesSaved:
			"L-għażliet ġew issejvjati. Tista' tibdilhom taħt L-Għażliet tal-Privatezza Tiegħek.",
		choose: 'Agħżel',
		chooseWhatToAllow: "Agħżel x'tippermetti",
		close: 'Agħlaq',
		confirmDescriptionOptIn:
			"{business} jista' {rights}. Tista' tibdel dan fi kwalunkwe ħin.",
		confirmDescriptionOptOut:
			"{business} jista' {rights}. Tista' terġa' tagħżel li toħroġ fi kwalunkwe ħin.",
		confirmKeepOptedOut: "Ibqa' eskluż",
		confirmTitleOptIn: 'Tippermetti {rights}?',
		confirmTitleOptOut: "Terġa' tippermetti {rights}?",
		copyFailed: 'Ma setax jiġi kkupjat. Agħżel u kkopja r-referenza tiegħek:',
		copyFailedAnnouncement:
			'Ma setax jiġi kkupjat. Ir-referenza sħiħa tiegħek tidher fl-irċevuta.',
		copyReference: 'Ikkopja r-referenza',
		dialogIntro: 'L-għażliet tiegħek japplikaw minnufih.',
		dialogTitle: 'L-Għażliet tal-Privatezza Tiegħek',
		done: 'Lest',
		dontAllow: 'Tippermettix',
		euDialogIntro:
			"Agħżel liema cookies fakultattivi jista' juża {business}. Il-cookies fakultattivi jibqgħu mitfija sakemm ma tixgħelhomx int.",
		euDialogTitle: 'Settings tal-privatezza',
		gpcNote:
			'Il-brawżer tiegħek bagħat sinjal Global Privacy Control, għalhekk {business} {rights} {scope}. Ippermetti mhuwiex disponibbli sakemm is-sinjal ikun mixgħul.',
		justNow: 'issa stess',
		nestedSheetNote:
			'Il-bidliet japplikaw meta tissejvja fis-Settings tal-privatezza.',
		noticeBarDescription:
			"Nużaw cookies biex inħaddmu dan is-sit, inkejlu t-traffiku u nippersonalizzaw ir-reklami. Tista' tagħżel li toħroġ fi kwalunkwe ħin.",
		noticeBarDescriptionGpc:
			'Nużaw cookies biex inħaddmu dan is-sit u nkejlu t-traffiku. Is-sinjal Global Privacy Control tiegħek qed jiġi rispettat.',
		noticeGpcHonored:
			'Is-sinjal Global Privacy Control tal-brawżer tiegħek qed jiġi rispettat.',
		noticeRightsAction: 'Tbigħx u taqsamx id-data tiegħi',
		nudge: 'L-ewwel agħżel waħda miż-żewġ buttuni.',
		optInBarDescription:
			'{business} jitlob il-permess qabel juża cookies fakultattivi jew {rights}.',
		optInDescription:
			"Bil-permess tiegħek, {business} juża cookies fakultattivi għall-funzjonijiet tas-sit u l-analitika, u jkun jista' {rights}. Xejn ma jinxtegħel sakemm ma tippermettihx int.",
		optInTitle: 'L-għażliet tal-privatezza tiegħek',
		optOutOption: 'Agħżel li toħroġ',
		panelExpanded: 'Qed jintwerew aktar għażliet.',
		policyColumn: 'Politika tal-privatezza',
		preferencesClose: 'Agħlaq il-preferenzi',
		preferencesOnCount: '{count} mixgħula',
		preferencesSheetIntro: 'Il-bidliet japplikaw minnufih.',
		preferencesSummary: 'Funzjonijiet tas-sit u analitika',
		preferencesTitle: 'Preferenzi',
		purposeColumn: 'Skop',
		receiptAllowed: 'Permess: {rights}',
		receiptDetails: 'Dettalji',
		receiptFromGpc: 'mis-sinjal Global Privacy Control tiegħek',
		receiptLive:
			'Qed nirrispettaw il-Global Privacy Control minn dan il-brawżer',
		receiptLiveDetail: "Jinqara mill-brawżer tiegħek f'kull żjara.",
		receiptOptedOut: 'Għażilt li toħroġ minn {rights}',
		receiptRecorded: 'Irreġistrat: {date}',
		receiptReference: 'Referenza',
		receiptSavedAccount: 'Issejvjat fil-kont tiegħek · {date}',
		receiptSavedBrowser: 'Issejvjat għal dan il-brawżer · {date}',
		receiptScopeAccount:
			"Japplika għal dan il-brawżer u għall-kont tiegħek ta' {business}.",
		receiptScopeAccountUnnamed:
			'Japplika għal dan il-brawżer u għall-kont tiegħek.',
		receiptScopeBrowser:
			'Japplika għal dan il-brawżer. Idħol fil-kont tiegħek biex japplika għalih ukoll.',
		receiptViaGpc: 'Sinjal Global Privacy Control',
		referenceCopied: 'Ir-referenza ġiet ikkupjata.',
		refuseAll:
			'mhux se jbigħ jew jaqsam l-informazzjoni personali tiegħek u mhux se jużaha għal reklamar immirat',
		refuseSaleAndShare:
			'mhux se jbigħ jew jaqsam l-informazzjoni personali tiegħek',
		refuseSaleAndTargetedAds:
			'mhux se jbigħ l-informazzjoni personali tiegħek u mhux se jużaha għal reklamar immirat',
		rejectAll: 'Irrifjuta kollox',
		rightsAllowed: '{rights}: permess.',
		rightsNotAllowed: '{rights}: mhux permess.',
		rightsOptedOut: 'Għażilt li toħroġ minn {rights}.',
		saleAllowed: "{business} jista' {rights}.",
		saleGroupOptIn: 'Ippermetti {rights}',
		saleGroupSaleAndTargetedAds:
			'Irrid noħroġ mill-bejgħ tad-data personali tiegħi u mir-reklamar immirat',
		saleOffByDefault:
			"Mitfi b'mod awtomatiku. {business} {rights} sakemm ma tippermettihx int.",
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Issejvja l-għażliet',
		saveInSettings: 'Issejvja l-għażliet tiegħek fis-Settings tal-privatezza',
		savedAutomatically: 'Jiġi ssejvjat awtomatikament',
		savedCue: 'Issejvjat',
		scopeAccount: "fuq dan il-brawżer jew għall-kont tiegħek ta' {business}",
		scopeAccountUnnamed: 'fuq dan il-brawżer jew għall-kont tiegħek',
		scopeBrowser: 'fuq dan il-brawżer',
		shortAll: 'ibigħ jew jaqsam id-data tiegħek għar-reklami',
		shortSaleAndShare: 'ibigħ jew jaqsam id-data tiegħek',
		shortSaleAndTargetedAds: 'ibigħ id-data tiegħek jew jużaha għar-reklami',
		stateOff: 'Mitfi',
		stateOn: 'Mixgħul',
		switchColumn: 'Mixgħul',
		switchedOff: '{name} mitfi.',
		switchedOn: '{name} mixgħul.',
		titleAll: 'Bejgħ, qsim u reklamar immirat',
		titleSaleAndShare: 'Bejgħ u qsim',
		titleSaleAndTargetedAds: 'Bejgħ u reklamar immirat',
		vendorColumn: 'Bejjiegħ',
		vendorPolicy: "Politika tal-privatezza ta' {vendor}",
		vendorsClose: "Agħlaq il-bejjiegħa ta' {category}",
		vendorsFor: 'għal {category}',
		vendorsHide: 'Aħbi {count} bejjiegħa',
		vendorsHideOne: 'Aħbi bejjiegħ wieħed',
		vendorsOnCount: '{count} mixgħula',
		vendorsTable: "Bejjiegħa ta' {category}",
		vendorsView: 'Ara {count} bejjiegħa',
		vendorsViewOne: 'Ara bejjiegħ wieħed',
	},
	rights: {
		californiaPrivacyChoices: "L-Għażliet tal-Privatezza Tiegħek f'Kalifornja",
		optOut: 'Tbigħx u taqsamx id-data tiegħi',
		preferences: 'Immaniġġja l-preferenzi',
		privacyChoices: 'L-Għażliet tal-Privatezza Tiegħek',
	},
};
export default translations;
