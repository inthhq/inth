import type { CompleteTranslations } from '../types';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Acceptar tut',
		acknowledge: 'OK',
		close: 'Serrar',
		customize: 'Persunalisar',
		dismiss: 'Serrar',
		rejectAll: 'Refusar tut',
		save: 'Memorisar las configuraziuns',
		securedBy: 'Protegiu da',
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
		description:
			'Questa pagina na venda e na cundivida betg tias datas persunalas, e tia elecziun è memorisada en quest navigatur.',
		done: 'Finì',
		lockedByAccount:
			'Tes conto ha refusà e ti pos midar quai suenter esser s’annunzià.',
		lockedByGpc:
			'Il signal Global Privacy Control da tes navigatur è activà, perquai resta questa opziun deactivada.',
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
	rights: {
		californiaPrivacyChoices:
			'Tias tschernas da protecziun da datas en California',
		optOut: 'Betg vender ni parter mias datas',
		preferences: 'Administrar preferenzas',
		privacyChoices: 'Tias tschernas da protecziun da datas',
	},
};
export default translations;
