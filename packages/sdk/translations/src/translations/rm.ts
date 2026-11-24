import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Acceptar tut',
		acknowledge: 'OK',
		close: 'Serrar',
		customize: 'Persunalisar',
		dismiss: 'Serrar',
		rejectAll: 'Refusar tut',
		save: 'Memorisar las configuraziuns',
		securedBy: 'Consentiment da',
	},
	consentGate: {
		actionButton: 'Activar il consentiment da {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Acceptai il consentiment da {category} per vesair quest cuntegn.',
	},
	consentManagerDialog: {
		description:
			'Persunalisai vossas configuraziuns da la sfera privata qua. Vus pudais tscherner tge tips da cookies e tecnologias da tracking che vus lubis.',
		title: 'Configuraziuns da la sfera privata',
		vendors: {
			disabledByCategory:
				'Activescha questa categoria per tscherner proveders.',
			privacyPolicy: 'Directivas da protecziun da datas',
			switchLabel: 'Permetter {vendor}',
			title: 'Proveders ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				"Quests cookies ans gidan a porscher ina meglra experientscha d'utilisader e testar novas funcziuns.",
			title: 'Experientscha',
		},
		functionality: {
			description:
				"Quests cookies permettan funcziunalitads avanzadas e la persunalisaziun da la pagina d'internet.",
			title: 'Funcziunalitad',
		},
		marketing: {
			description:
				'Quests cookies vegnan duvrads per mussar reclamas relevantas e per evaluar lur efficacitad.',
			title: 'Marketing',
		},
		measurement: {
			description:
				"Quests cookies ans gidan a chapir co ils visitaders interageschan cun la pagina d'internet e meglierar sia prestaziun.",
			title: 'Analisa',
		},
		necessary: {
			description:
				"Quests cookies èn essenzials per il funcziunament da la pagina d'internet e na pon betg vegnir deactivads.",
			title: 'Absolutamain necessari',
		},
	},
	cookieBanner: {
		description:
			"Questa pagina d'internet dovra cookies per meglierar vossa experientscha da navigaziun, analisar il traffic da la pagina e mussar cuntegns persunalisads.",
		noticeDescription:
			'Nus duvrain cookies e tecnologias sumegliantas per manar questa pagina, per mesirar il traffic e per persunalisar cuntegns e reclamas. Vus pudais refusar u administrar vossas preferenzas da tut temp.',
		noticeTitle: 'Infurmaziun davart la protecziun da datas',
		title: 'Nus stimain vossa sfera privata',
	},
	iab: {
		app: {
			consentStorage:
				'Vossas tschernas vegnan memorisadas sin quest apparat, en la memoria da configuraziun standard da l’app sut clavs IABTCF, per maximalmain {days} dis. La durada da memorisaziun vegn renovada, cur che vus actualisais vossas tschernas.',
			description:
				'Nus ed noss {partnerCount} partunaris memorisain e/u accessain ad infurmaziuns sin voss apparat e processain datas persunalas, sco identificaturs unics e datas da navigaziun, per questa app, per:',
			legitimateInterestExplanation:
				'Intgins partunaris processan datas persunalas, sco identificaturs unics e datas da navigaziun, sin basa da lur interess legitim, empè da dumandar voss consentiment. Quai vala be per questa app. Vus avais il dretg da far opposiziun cunter quest processament per mintga intent e per mintga partunari.',
			scopeServiceSpecific:
				'Voss consent vala be per questa app e na pertutga betg auters servetschs.',
			withdraw:
				'Vus pudais midar vossas tschernas u revocar voss consentiment en mintga mument en las Configuraziuns da la sfera privata da questa app.',
		},
		banner: {
			andMore: 'Ed anc {count}...',
			description:
				'Nus ed noss {partnerCount} partunaris memorisain e/u accessain ad infurmaziuns sin voss apparat e processain datas persunalas, sco identificaturs unics e datas da navigaziun, per questa pagina d’internet, per:',
			legitimateInterestNotice:
				'Inscunter partunaris pretendan in interess legitim per processar vossas datas. Vus avais il dretg da far opposiziun cunter quest processament, persunalisar vossas tschernas e revocar voss consentiment en mintga mument.',
			partnersLink: '{count} partunaris',
			scopeGroup:
				'Vossa tscherna vala per tut nossas websites en quest gruppa.',
			scopeServiceSpecific:
				'Voss consent vala be per questa pagina web e na pertutga betg auters servetschs.',
			title: 'Configuraziuns da la sfera privata',
		},
		common: {
			acceptAll: 'Acceptar tut',
			clearSelection: 'Stizzar',
			customPartner: 'Partunari persunalisà betg registrà tar l’IAB',
			customize: 'Persunalisar',
			loading: 'Chargia...',
			rejectAll: 'Refusar tut',
			saveSettings: 'Memorisar las configuraziuns',
			showingSelectedVendor: 'Mussa il proveder tschernì',
		},
		preferenceCenter: {
			description:
				'Persunalisai vossas configuraziuns da la sfera privata qua. Vus pudais tscherner tge tips da cookies e tecnologias da tracking che vus lubis.',
			features: {
				description:
					'These means of processing can be used solely in pursuit of one or several purposes for which you are given a choice in this notice.',
				title: 'Funcziuns',
			},
			footer: {
				consentStorage:
					'Las preferenzas da consentiment vegnan memorisadas en in cookie numnà "euconsent-v2" per 13 mais. La durada da memorisaziun po vegnir renovada, cur che vus actualisais vossas preferenzas.',
			},
			purposeItem: {
				examples: 'Exempels',
				legitimateInterest: 'Interess legitim',
				objectButton: 'Far opposiziun',
				objected: 'Opposiziun fatta',
				partners: '{count} partunaris',
				partnersUsingPurpose: 'Partunaris che duvran questa finamira',
				rightToObject:
					'Vus avais il dretg da far opposiziun cunter il processament sa basond sin in interess legitim.',
				vendorsUseLegitimateInterest:
					'{count} proveders pretendan in interess legitim',
				withYourPermission: 'Cun vossa permissiun',
			},
			specialPurposes: {
				title: 'Funcziuns essenzialas (necessari)',
				tooltip:
					'Questas èn necessarias per la funcziunalitad e la segirezza da la pagina. Tenor IAB TCF na pudais vus betg far opposiziun cunter questas finamiras spezialas.',
			},
			tabs: {
				purposes: 'Finamiras',
				vendors: 'Proveders',
			},
			title: 'Configuraziuns da la sfera privata',
			vendorList: {
				adTechProvidersHeading: 'Proveders da tecnologia da reclama da Google',
				adTechProvidersNotice:
					'Google lavura cun quests proveders da tecnologia da reclama ordaifer il framework da l’IAB. Voss consentiment cuntanscha in proveder mo sche vus l’activais e lubis er la memorisaziun d’infurmaziuns sin voss apparat e la reclama persunalisada.',
				customVendorsHeading: 'Partunaris persunalisads',
				customVendorsNotice:
					'Quai èn partunaris persunalisads che n’èn betg registrads tar l’IAB Transparency & Consent Framework (TCF). Els processan datas sa basond sin voss consentiment e pon avair autras praticas da protecziun da datas che proveders registrads tar l’IAB.',
				dataCategories: 'Categorias da datas',
				features: 'Funcziuns',
				iabVendorsHeading: 'Proveders registrads tar l’IAB',
				iabVendorsNotice:
					'Quests partunaris èn registrads tar l’IAB Transparency & Consent Framework (TCF), in standard industrial per la gestiun dal consentiment',
				legitimateInterest: 'Int. legitim',
				maxAge: 'Gradi maximal: {days}d',
				nonCookieAccess: 'Access betg tras cookies',
				privacyPolicy: 'Directivas da protecziun da datas',
				purposes: 'Finamiras',
				requiredNotice:
					'Necessari per la funcziunalitad da la pagina, na po betg vegnir deactivà',
				retention: 'Retegnida: {days}d',
				search: 'Tscherchar proveders...',
				showingCount: 'Mussa {filtered} da {total} proveders',
				specialFeatures: 'Funcziuns spezialas',
				specialPurposes: 'Finamiras spezialas',
				storageDisclosure: 'Infurmaziun davart la memorisaziun',
				usesCookies: 'Dovra cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Directivas da cookies',
		privacyPolicy: 'Directivas da protecziun da datas',
		termsOfService: "Cundiziuns d'utilisaziun",
	},
	optOut: {
		action: 'Renunziar',
		description:
			'Questa pagina na venda e na cundivida betg tias datas persunalas, e tia elecziun è memorisada en quest navigatur.',
		done: 'Finì',
		headingAll:
			'Vendita e cundivisiun da tias datas persunalas e reclama dirigida',
		headingSaleAndShare: 'Vendita e cundivisiun da tias datas persunalas',
		headingSaleAndTargetedAds:
			'Vendita da tias datas persunalas e reclama dirigida',
		lockedByAccount:
			'Tes conto ha refusà e ti pos midar quai suenter esser s’annunzià.',
		lockedByGpc:
			'Il signal Global Privacy Control da tes navigatur è activà, perquai resta questa opziun deactivada.',
		notOptedOut: 'Ti n’has betg renunzià en quest navigatur.',
		optInCancel: 'Restar deannunzià',
		optInConfirm: "S'annunziar puspè",
		optInDescription:
			'Cun confermar finescha tia deannunzia en quest navigatur.',
		optInDescriptionWithRights:
			'Cun confermar finescha tia deannunzia da {rights} en quest navigatur.',
		optInLink: "S'annunziar puspè…",
		optInTitle: "S'annunziar puspè?",
		receiptAccount: 'Ti es annullà en quest navigatur e sin tes conto.',
		receiptAccountWithRights:
			'Ti es annullà da {rights} en quest navigatur e sin tes conto.',
		receiptBrowser: 'Ti es annullà en quest navigatur.',
		receiptBrowserWithRights: 'Ti es annullà da {rights} en quest navigatur.',
		recordedLabel: 'Registrà',
		referenceLabel: 'Referenza',
		rightsAll: 'vendita, cundivisiun e reclama dirigida',
		rightsSaleAndShare: 'vendita e cundivisiun',
		rightsSaleAndTargetedAds: 'vendita e reclama dirigida',
		statusRequest: 'Dumonda da refusa resguardada',
		statusSignal: 'Signal da preferenza da refusa resguardà',
	},
	privacyChoices: {
		acceptAll: 'Acceptar tut',
		advertisingFollowsSale: 'La reclama suonda tia tscherna survart.',
		advertisingTitle: 'Reclama',
		allow: 'Permetter',
		alwaysOn: 'Adina activ',
		announceSaved: '{message} Memorisà.',
		askAll:
			'vender u cundivider tias datas persunalas, era per reclama dirigida',
		askSaleAndShare: 'vender u cundivider tias datas persunalas',
		askSaleAndTargetedAds:
			'vender tias datas persunalas u las duvrar per reclama dirigida',
		bannerAllowedRightsOff:
			'Cookies opziunals permess. {rights} restan deactivadas. Ti pos midar quai en Tias tschernas da protecziun da datas.',
		bannerAllowedRightsOffGpc:
			'Cookies opziunals permess. {rights} restan deactivadas pervia da tes signal Global Privacy Control. Ti pos midar quai en Tias tschernas da protecziun da datas.',
		bannerRejected:
			'Cookies opziunals refusads. Ti pos midar quai en Tias tschernas da protecziun da datas.',
		barDescription:
			'Nus duvrain cookies per meglierar tia experientscha ed analisar il traffic.',
		businessFallback: 'questa pagina',
		choiceRecorded: 'Tscherna registrada.',
		choicesSaved:
			'Tschernas memorisadas. Ti pos midar ellas en Tias tschernas da protecziun da datas.',
		choose: 'Tscherner',
		chooseWhatToAllow: 'Tscherner tge che ti permettas',
		close: 'Serrar',
		confirmDescriptionOptIn:
			'{business} dastga {rights}. Ti pos midar quai da tut temp.',
		confirmDescriptionOptOut:
			'{business} dastga {rights}. Ti pos puspè renunziar da tut temp.',
		confirmKeepOptedOut: 'Restar deannunzià',
		confirmTitleOptIn: 'Permetter {rights}?',
		confirmTitleOptOut: 'Permetter puspè {rights}?',
		copyFailed: 'Impussibel da copiar. Marca e copiescha tia referenza:',
		copyFailedAnnouncement:
			'Impussibel da copiar. Tia referenza cumpletta vegn mussada en la quittanza.',
		copyReference: 'Copiar la referenza',
		dialogIntro: 'Tias tschernas valan immediat.',
		dialogTitle: 'Tias tschernas da protecziun da datas',
		done: 'Finì',
		dontAllow: 'Betg permetter',
		euDialogIntro:
			'Tscherna tge cookies opziunals che {business} dastga duvrar. Cookies opziunals restan deactivads, nun che ti als activeschias.',
		euDialogTitle: 'Configuraziuns da la sfera privata',
		gpcNote:
			"Tes navigatur ha tramess in signal Global Privacy Control. {business} {rights} {scope}. Permetter n'è betg disponibel uschè ditg ch'il signal è activà.",
		justNow: 'gist ussa',
		nestedSheetNote:
			'Las midadas valan cura che ti memoriseschas en las Configuraziuns da la sfera privata.',
		noticeBarDescription:
			'Nus duvrain cookies per manar questa pagina, mesirar il traffic e persunalisar reclamas. Ti pos renunziar da tut temp.',
		noticeBarDescriptionGpc:
			'Nus duvrain cookies per manar questa pagina e mesirar il traffic. Tes signal Global Privacy Control vegn respectà.',
		noticeGpcHonored:
			'Il signal Global Privacy Control da tes navigatur vegn respectà.',
		noticeRightsAction: 'Betg vender ni parter mias datas',
		nudge: "Tscherna l'emprim in dals dus buttuns.",
		optInBarDescription:
			'{business} dumonda tes consentiment per cookies opziunals e per {rights}.',
		optInDescription:
			'Cun tia permissiun duvrass {business} cookies opziunals per funcziuns da la pagina ed analisas, e pudess {rights}. Nagut na vegn activà senza che ti permettas quai.',
		optInTitle: 'Tias tschernas da protecziun da datas',
		optOutOption: 'Renunziar',
		panelExpanded: 'Dapli opziuns vegnan mussadas.',
		policyColumn: 'Directivas da protecziun da datas',
		preferencesClose: 'Serrar las preferenzas',
		preferencesOnCount: '{count} activadas',
		preferencesSheetIntro: 'Las midadas valan immediat.',
		preferencesSummary: 'Funcziuns da la pagina ed analisas',
		preferencesTitle: 'Preferenzas',
		purposeColumn: 'Intent',
		receiptAllowed: 'Permess: {rights}',
		receiptDetails: 'Detagls',
		receiptFromGpc: 'da tes signal Global Privacy Control',
		receiptLive: 'Global Privacy Control da quest navigatur vegn respectà',
		receiptLiveDetail: 'Vegn legì da tes navigatur tar mintga visita.',
		receiptOptedOut: 'Renunzià a {rights}',
		receiptRecorded: 'Registrà: {date}',
		receiptReference: 'Referenza',
		receiptSavedAccount: 'Memorisà en tes conto · {date}',
		receiptSavedBrowser: 'Memorisà per quest navigatur · {date}',
		receiptScopeAccount:
			'Vala per quest navigatur e per tes conto tar {business}.',
		receiptScopeAccountUnnamed: 'Vala per quest navigatur e per tes conto.',
		receiptScopeBrowser:
			'Vala per quest navigatur. Annunzia tai per applitgar quai era a tes conto.',
		receiptViaGpc: 'Signal Global Privacy Control',
		referenceCopied: 'Referenza copiada.',
		refuseAll:
			'na venda e na cundivida betg tias datas persunalas e na las dovra betg per reclama dirigida',
		refuseSaleAndShare: 'na venda e na cundivida betg tias datas persunalas',
		refuseSaleAndTargetedAds:
			'na venda betg tias datas persunalas e na las dovra betg per reclama dirigida',
		rejectAll: 'Refusar tut',
		rightsAllowed: '{rights}: permess.',
		rightsNotAllowed: '{rights}: betg permess.',
		rightsOptedOut: 'Renunzià a {rights}.',
		saleAllowed: '{business} dastga {rights}.',
		saleGroupOptIn: 'Permetter {rights}',
		saleGroupSaleAndTargetedAds:
			'Renunziar a la vendita da mias datas persunalas ed a reclama dirigida',
		saleOffByDefault:
			'Deactivà da standard. {business} {rights}, nun che ti permettas quai.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Memorisar las tschernas',
		saveInSettings:
			'Memorisescha tias tschernas en las Configuraziuns da la sfera privata',
		savedAutomatically: 'Memorisà automaticamain',
		savedCue: 'Memorisà',
		scopeAccount: 'en quest navigatur u per tes conto tar {business}',
		scopeAccountUnnamed: 'en quest navigatur u per tes conto',
		scopeBrowser: 'en quest navigatur',
		shortAll: 'la vendita u la cundivisiun da tias datas per reclama',
		shortSaleAndShare: 'la vendita u la cundivisiun da tias datas',
		shortSaleAndTargetedAds:
			'la vendita da tias datas u lur diever per reclama',
		stateOff: 'Deactivà',
		stateOn: 'Activà',
		switchColumn: 'Activà',
		switchedOff: '{name} deactivà.',
		switchedOn: '{name} activà.',
		titleAll: 'Vendita, cundivisiun e reclama dirigida',
		titleSaleAndShare: 'Vendita e cundivisiun',
		titleSaleAndTargetedAds: 'Vendita e reclama dirigida',
		vendorColumn: 'Proveder',
		vendorPolicy: 'Directivas da protecziun da datas da {vendor}',
		vendorsClose: 'Serrar ils proveders da {category}',
		vendorsFor: 'per {category}',
		vendorsHide: 'Zuppentar {count} proveders',
		vendorsHideOne: 'Zuppentar 1 proveder',
		vendorsOnCount: '{count} activads',
		vendorsTable: 'Proveders da {category}',
		vendorsView: 'Mussar {count} proveders',
		vendorsViewOne: 'Mussar 1 proveder',
	},
	rights: {
		californiaPrivacyChoices:
			'Tias tschernas da protecziun da datas en California',
		optOut: 'Betg vender ni parter mias datas',
		preferences: 'Administrar preferenzas',
		privacyChoices: 'Tias tschernas da protecziun da datas',
	},
};
export default translations;
