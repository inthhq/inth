import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Aksepte tout',
		acknowledge: 'Dakò',
		close: 'Fèmen',
		customize: 'Pèsonalize',
		dismiss: 'Kache',
		rejectAll: 'Refize tout',
		save: 'Anrejistre paramèt yo',
		securedBy: 'Konsantman pa',
	},
	consentGate: {
		actionButton: 'Aktive konsantman pou {category}',
		error: 'Nou pa t kapab chaje kontni sa a.',
		loading: 'N ap chaje kontni an…',
		policyBlocked:
			'Kontni sa a pa disponib dapre règ konsantman ki aplike nan rejyon ou a.',
		title: 'Bay konsantman pou kategori «{category}» pou ou ka wè kontni sa a.',
	},
	consentManagerDialog: {
		description:
			'Pèsonalize paramèt konfidansyalite ou yo isit la. Ou ka chwazi ki kalite cookie ak teknoloji swivi ou vle otorize.',
		title: 'Paramèt konfidansyalite',
		vendors: {
			disabledByCategory: 'Aktive kategori sa a pou ou ka chwazi founisè yo.',
			privacyPolicy: 'Politik konfidansyalite',
			switchLabel: 'Pèmèt {vendor}',
			title: 'Founisè ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Cookie sa yo ede nou ba ou yon pi bon eksperyans epi teste nouvo fonksyon.',
			title: 'Eksperyans',
		},
		functionality: {
			description:
				'Cookie sa yo pèmèt sit entènèt la ofri plis fonksyon epi adapte li pou ou.',
			title: 'Fonksyonalite',
		},
		marketing: {
			description:
				'Cookie sa yo sèvi pou montre ou piblisite ki enterese ou epi mezire si piblisite sa yo efikas.',
			title: 'Maketing',
		},
		measurement: {
			description:
				'Cookie sa yo ede nou konprann ki jan vizitè yo itilize sit entènèt la pou nou ka amelyore pèfòmans li.',
			title: 'Analiz',
		},
		necessary: {
			description:
				'Cookie sa yo esansyèl pou sit entènèt la mache byen, epi ou pa ka dezaktive yo.',
			title: 'Absoliman nesesè',
		},
	},
	cookieBanner: {
		description:
			'Sit sa a itilize cookie pou amelyore eksperyans navigasyon ou, analize trafik sit la epi montre ou kontni ki pèsonalize.',
		noticeDescription:
			'Nou itilize cookie ak lòt teknoloji ki sanble pou fè sit sa a mache, pou mezire trafik, epi pou pèsonalize kontni ak piblisite. Ou ka refize oswa jere preferans ou yo nenpòt ki lè.',
		noticeTitle: 'Avi sou konfidansyalite',
		title: 'Nou respekte vi prive ou',
	},
	iab: {
		app: {
			consentStorage:
				'Nou estoke chwa ou yo sou aparèy sa a, nan estokaj paramèt estanda aplikasyon an anba kle IABTCF, pandan jiska {days} jou. Dire estokaj la rekòmanse lè ou mete chwa ou yo ajou.',
			description:
				'Nou menm ak {partnerCount} patnè nou yo estoke enfòmasyon sou aparèy ou epi/oswa jwenn aksè ak enfòmasyon sa yo, epi nou trete done pèsonèl, tankou idantifyan inik ak done navigasyon, pou aplikasyon sa a, pou nou ka:',
			legitimateInterestExplanation:
				'Kèk patnè trete done pèsonèl, tankou idantifyan inik ak done navigasyon, sou baz enterè lejitim yo olye yo mande konsantman ou. Sa aplike sèlman pou aplikasyon sa a. Ou gen dwa opoze ou ak tretman sa a pou chak objektif ak pou chak patnè.',
			scopeServiceSpecific:
				'Konsantman ou aplike sèlman pou aplikasyon sa a, li p ap afekte lòt sèvis.',
			withdraw:
				'Ou ka chanje chwa ou yo oswa retire konsantman ou nenpòt ki lè nan Paramèt konfidansyalite nan aplikasyon sa a.',
		},
		banner: {
			andMore: 'Ak {count} lòt...',
			description:
				'Nou menm ak {partnerCount} patnè nou yo estoke enfòmasyon sou aparèy ou epi/oswa jwenn aksè ak enfòmasyon sa yo, epi nou trete done pèsonèl, tankou idantifyan inik ak done navigasyon, pou sit entènèt sa a, pou nou ka:',
			legitimateInterestNotice:
				'Kèk patnè di yo gen yon enterè lejitim pou trete done ou yo. Ou gen dwa opoze ou ak tretman sa a, pèsonalize chwa ou yo epi retire konsantman ou nenpòt ki lè.',
			partnersLink: '{count} patnè',
			scopeGroup:
				'Chwa ou a aplike sou tout sit entènèt nou yo ki nan gwoup sa a.',
			scopeServiceSpecific:
				'Konsantman ou aplike sèlman pou sit entènèt sa a, li p ap afekte lòt sèvis.',
			title: 'Paramèt konfidansyalite',
		},
		common: {
			acceptAll: 'Aksepte tout',
			clearSelection: 'Efase',
			customPartner: 'Patnè pèsonalize ki pa anrejistre nan IAB',
			customize: 'Pèsonalize',
			loading: 'N ap chaje...',
			rejectAll: 'Refize tout',
			saveSettings: 'Anrejistre paramèt yo',
			showingSelectedVendor: 'N ap montre founisè ou chwazi a',
		},
		preferenceCenter: {
			description:
				'Pèsonalize paramèt konfidansyalite ou yo isit la. Ou ka chwazi ki kalite cookie ak teknoloji swivi ou vle otorize.',
			features: {
				description:
					'Metòd tretman sa yo ka sèvi sèlman pou reyalize youn oswa plizyè nan objektif avi sa a kite ou chwazi.',
				title: 'Karakteristik',
			},
			footer: {
				consentStorage:
					'Nou estoke preferans konsantman ou yo nan yon cookie ki rele "euconsent-v2" pandan 13 mwa. Dire estokaj la ka rekòmanse lè ou mete preferans ou yo ajou.',
			},
			purposeItem: {
				examples: 'Egzanp',
				legitimateInterest: 'Enterè lejitim',
				objectButton: 'Opoze',
				objected: 'Opozisyon anrejistre',
				partners: '{count} patnè',
				partnersUsingPurpose: 'Patnè ki itilize objektif sa a',
				rightToObject:
					'Ou gen dwa opoze ou ak tretman ki baze sou enterè lejitim.',
				vendorsUseLegitimateInterest:
					'{count} founisè di yo gen yon enterè lejitim',
				withYourPermission: 'Avèk pèmisyon ou',
			},
			specialPurposes: {
				title: 'Fonksyon esansyèl (obligatwa)',
				tooltip:
					'Sit la bezwen fonksyon sa yo pou li mache epi pou li rete an sekirite. Dapre IAB TCF, ou pa ka opoze ou ak objektif espesyal sa yo.',
			},
			tabs: {
				purposes: 'Objektif',
				vendors: 'Founisè',
			},
			title: 'Paramèt konfidansyalite',
			vendorList: {
				adTechProvidersHeading: 'Founisè teknoloji piblisite Google yo',
				adTechProvidersNotice:
					'Google travay ak founisè teknoloji piblisite sa yo andeyò kad IAB la. Konsantman ou rive jwenn yon founisè sèlman si ou aktive li, epi si ou pèmèt tou estokaj sou aparèy ou ak piblisite pèsonalize.',
				customVendorsHeading: 'Patnè pèsonalize',
				customVendorsNotice:
					'Sa yo se patnè pèsonalize ki pa anrejistre nan Kad Transparans ak Konsantman IAB la (TCF). Yo trete done yo dapre konsantman ou, epi pratik konfidansyalite yo ka diferan de pa founisè ki anrejistre nan IAB yo.',
				dataCategories: 'Kategori done',
				features: 'Karakteristik',
				iabVendorsHeading: 'Founisè ki anrejistre nan IAB',
				iabVendorsNotice:
					'Patnè sa yo anrejistre nan Kad Transparans ak Konsantman IAB la (TCF), yon estanda endistri a itilize pou jere konsantman',
				legitimateInterest: 'Enterè lejitim',
				maxAge: 'Dire maksimòm: {days} jou',
				maxAgeRefreshes: '(li renouvle)',
				noVendorsFound: 'Pa gen founisè ki koresponn ak "{searchTerm}"',
				nonCookieAccess: 'Aksè san cookie',
				partnerCount: '{count} patnè',
				partnerPlural: 'patnè',
				partnerSingular: 'patnè',
				privacyPolicy: 'Politik konfidansyalite',
				purposes: 'Objektif',
				requiredNotice: 'Obligatwa pou sit la mache, ou pa ka dezaktive li',
				retainedDays: 'Konsève: {days} jou',
				retention: 'Dire konsèvasyon: {days} jou',
				search: 'Chèche founisè...',
				showingCount: '{filtered} sou {total} founisè',
				specialFeatures: 'Karakteristik espesyal',
				specialPurposes: 'Objektif espesyal',
				storageDisclosure: 'Enfòmasyon sou estokaj',
				usesCookies: 'Itilize cookie',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Politik sou cookie',
		privacyPolicy: 'Politik konfidansyalite',
		termsOfService: 'Kondisyon itilizasyon',
	},
	optOut: {
		action: 'Refize',
		description:
			'Sit sa a p ap vann ni pataje enfòmasyon pèsonèl ou yo, epi chwa ou anrejistre nan navigatè sa a.',
		done: 'Fini',
		headingAll: 'Vant ak pataj enfòmasyon pèsonèl ou ak piblisite sible',
		headingSaleAndShare: 'Vant ak pataj enfòmasyon pèsonèl ou',
		headingSaleAndTargetedAds: 'Vant enfòmasyon pèsonèl ou ak piblisite sible',
		lockedByAccount:
			'Kont ou a te refize pataj la, epi ou ka chanje sa apre ou fin konekte.',
		lockedByGpc:
			'Siyal Global Privacy Control navigatè ou a aktive, kidonk sa a rete etenn.',
		notOptedOut: 'Ou pa refize sou navigatè sa a.',
		optInCancel: 'Rete refize',
		optInConfirm: 'Aksepte ankò',
		optInDescription: 'Konfime mete fen nan refi ou sou navigatè sa a.',
		optInDescriptionWithRights:
			'Konfime mete fen nan refi ou pou {rights} sou navigatè sa a.',
		optInLink: 'Aksepte ankò…',
		optInTitle: 'Aksepte ankò?',
		receiptAccount: 'Ou dezabòne sou navigatè sa a ak sou kont ou.',
		receiptAccountWithRights:
			'Ou dezabòne pou {rights} sou navigatè sa a ak sou kont ou.',
		receiptBrowser: 'Ou dezabòne sou navigatè sa a.',
		receiptBrowserWithRights: 'Ou dezabòne pou {rights} sou navigatè sa a.',
		recordedLabel: 'Anrejistre',
		referenceLabel: 'Referans',
		rightsAll: 'vant, pataj ak piblisite sible',
		rightsSaleAndShare: 'vant ak pataj',
		rightsSaleAndTargetedAds: 'vant ak piblisite sible',
		statusRequest: 'Demann refi a respekte',
		statusSignal: 'Siyal preferans refi a respekte',
	},
	privacyChoices: {
		acceptAll: 'Aksepte tout',
		advertisingFollowsSale: 'Piblisite swiv chwa ou fè anwo a.',
		advertisingTitle: 'Piblisite',
		allow: 'Pèmèt',
		alwaysOn: 'Toujou aktive',
		announceSaved: '{message} Anrejistre.',
		askAll:
			'vann oswa pataje enfòmasyon pèsonèl ou yo, menm pou piblisite sible',
		askSaleAndShare: 'vann oswa pataje enfòmasyon pèsonèl ou yo',
		askSaleAndTargetedAds:
			'vann enfòmasyon pèsonèl ou yo oswa itilize yo pou piblisite sible',
		bannerAllowedRightsOff:
			'Cookie opsyonèl yo pèmèt. {rights} rete etenn. Ou ka chanje sa nan Chwa Konfidansyalite Ou.',
		bannerAllowedRightsOffGpc:
			'Cookie opsyonèl yo pèmèt. {rights} rete etenn akòz siyal Global Privacy Control ou a. Ou ka chanje sa nan Chwa Konfidansyalite Ou.',
		bannerRejected:
			'Cookie opsyonèl yo refize. Ou ka chanje sa nan Chwa Konfidansyalite Ou.',
		barDescription:
			'Nou itilize cookie pou amelyore eksperyans ou epi analize trafik.',
		businessFallback: 'sit sa a',
		choiceRecorded: 'Chwa a anrejistre.',
		choicesSaved:
			'Chwa yo anrejistre. Ou ka chanje yo nan Chwa Konfidansyalite Ou.',
		choose: 'Chwazi',
		chooseWhatToAllow: 'Chwazi sa ou vle pèmèt',
		close: 'Fèmen',
		confirmDescriptionOptIn:
			'{business} ap ka {rights}. Ou ka chanje sa nenpòt ki lè.',
		confirmDescriptionOptOut:
			'{business} ap ka {rights}. Ou ka refize ankò nenpòt ki lè.',
		confirmKeepOptedOut: 'Rete refize',
		confirmTitleOptIn: 'Pèmèt {rights}?',
		confirmTitleOptOut: 'Pèmèt {rights} ankò?',
		copyFailed: 'Kopi a pa mache. Seleksyone epi kopye referans ou:',
		copyFailedAnnouncement:
			'Kopi a pa mache. Tout referans ou a parèt nan resi a.',
		copyReference: 'Kopye referans',
		dialogIntro: 'Chwa ou yo aplike touswit.',
		dialogTitle: 'Chwa Konfidansyalite Ou',
		done: 'Fini',
		dontAllow: 'Pa pèmèt',
		euDialogIntro:
			'Chwazi ki cookie opsyonèl {business} ka itilize. Cookie opsyonèl yo rete etenn toutotan ou pa aktive yo.',
		euDialogTitle: 'Paramèt konfidansyalite',
		gpcNote:
			'Navigatè ou a voye yon siyal Global Privacy Control, kidonk {business} {rights} {scope}. Ou pa ka chwazi Pèmèt toutotan siyal la aktive.',
		justNow: 'kounye a la',
		nestedSheetNote:
			'Chanjman yo aplike lè ou anrejistre nan Paramèt konfidansyalite.',
		noticeBarDescription:
			'Nou itilize cookie pou fè sit sa a mache, mezire trafik epi pèsonalize piblisite. Ou ka refize nenpòt ki lè.',
		noticeBarDescriptionGpc:
			'Nou itilize cookie pou fè sit sa a mache epi mezire trafik. Nou respekte siyal Global Privacy Control ou a.',
		noticeGpcHonored:
			'Nou respekte siyal Global Privacy Control navigatè ou a.',
		noticeRightsAction: 'Pa vann ni pataje done mwen yo',
		nudge: 'Chwazi youn nan de bouton yo anvan.',
		optInBarDescription:
			'{business} mande pèmisyon ou anvan li itilize cookie opsyonèl oswa {rights}.',
		optInDescription:
			'Avèk pèmisyon ou, {business} ta itilize cookie opsyonèl pou fonksyon sit la ak analiz, epi li ta ka {rights}. Anyen pa aktive toutotan ou pa pèmèt li.',
		optInTitle: 'Chwa konfidansyalite ou',
		optOutOption: 'Refize',
		panelExpanded: 'Plis opsyon parèt.',
		policyColumn: 'Politik konfidansyalite',
		preferencesClose: 'Fèmen preferans yo',
		preferencesOnCount: '{count} aktive',
		preferencesSheetIntro: 'Chanjman yo aplike touswit.',
		preferencesSummary: 'Fonksyon sit la ak analiz',
		preferencesTitle: 'Preferans',
		purposeColumn: 'Objektif',
		receiptAllowed: 'Ou pèmèt {rights}',
		receiptDetails: 'Detay',
		receiptFromGpc: 'apati siyal Global Privacy Control ou a',
		receiptLive: 'Nou respekte Global Privacy Control navigatè sa a',
		receiptLiveDetail: 'Nou li li nan navigatè ou a chak fwa ou vizite.',
		receiptOptedOut: 'Ou refize {rights}',
		receiptRecorded: 'Anrejistre {date}',
		receiptReference: 'Referans',
		receiptSavedAccount: 'Anrejistre nan kont ou · {date}',
		receiptSavedBrowser: 'Anrejistre pou navigatè sa a · {date}',
		receiptScopeAccount: 'Li aplike pou navigatè sa a ak kont {business} ou a.',
		receiptScopeAccountUnnamed: 'Li aplike pou navigatè sa a ak kont ou a.',
		receiptScopeBrowser:
			'Li aplike pou navigatè sa a. Konekte pou li aplike pou kont ou a tou.',
		receiptViaGpc: 'Siyal Global Privacy Control',
		referenceCopied: 'Referans lan kopye.',
		refuseAll:
			'p ap vann ni pataje enfòmasyon pèsonèl ou yo, ni itilize yo pou piblisite sible',
		refuseSaleAndShare: 'p ap vann ni pataje enfòmasyon pèsonèl ou yo',
		refuseSaleAndTargetedAds:
			'p ap vann enfòmasyon pèsonèl ou yo ni itilize yo pou piblisite sible',
		rejectAll: 'Refize tout',
		rightsAllowed: '{rights} pèmèt.',
		rightsNotAllowed: '{rights} pa pèmèt.',
		rightsOptedOut: 'Ou refize {rights}.',
		saleAllowed: '{business} ka {rights}.',
		saleGroupOptIn: 'Pèmèt {rights}',
		saleGroupSaleAndTargetedAds:
			'Refize vant done pèsonèl mwen yo ak piblisite sible',
		saleOffByDefault:
			'Etenn pa defo. {business} {rights} toutotan ou pa pèmèt li.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Anrejistre chwa yo',
		saveInSettings: 'Anrejistre chwa ou yo nan Paramèt konfidansyalite',
		savedAutomatically: 'Anrejistre otomatikman',
		savedCue: 'Anrejistre',
		scopeAccount: 'sou navigatè sa a ni pou kont {business} ou a',
		scopeAccountUnnamed: 'sou navigatè sa a ni pou kont ou a',
		scopeBrowser: 'sou navigatè sa a',
		shortAll: 'vann oswa pataje done ou yo pou piblisite',
		shortSaleAndShare: 'vann oswa pataje done ou yo',
		shortSaleAndTargetedAds: 'vann done ou yo oswa itilize yo pou piblisite',
		stateOff: 'Etenn',
		stateOn: 'Aktive',
		switchColumn: 'Aktive',
		switchedOff: '{name} etenn.',
		switchedOn: '{name} aktive.',
		titleAll: 'Vant, pataj ak piblisite sible',
		titleSaleAndShare: 'Vant ak pataj',
		titleSaleAndTargetedAds: 'Vant ak piblisite sible',
		vendorColumn: 'Founisè',
		vendorPolicy: 'Politik konfidansyalite {vendor}',
		vendorsClose: 'Fèmen founisè {category} yo',
		vendorsFor: 'pou {category}',
		vendorsHide: 'Kache {count} founisè',
		vendorsHideOne: 'Kache 1 founisè',
		vendorsOnCount: '{count} aktive',
		vendorsTable: 'Founisè {category}',
		vendorsView: 'Gade {count} founisè',
		vendorsViewOne: 'Gade 1 founisè',
	},
	rights: {
		californiaPrivacyChoices: 'Chwa Konfidansyalite Kalifòni Ou',
		optOut: 'Pa vann ni pataje done mwen yo',
		preferences: 'Jere preferans yo',
		privacyChoices: 'Chwa Konfidansyalite Ou',
	},
};

export default translations;
