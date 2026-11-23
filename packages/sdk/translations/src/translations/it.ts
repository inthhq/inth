import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Accetta tutto',
		acknowledge: 'OK',
		close: 'Chiudi',
		customize: 'Personalizza',
		dismiss: 'Chiudi',
		rejectAll: 'Rifiuta tutto',
		save: 'Salva impostazioni',
		securedBy: 'Consenso gestito da',
	},
	consentGate: {
		actionButton: 'Abilita consenso {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Accetta {category} per visualizzare questo contenuto',
	},
	consentManagerDialog: {
		description:
			'Personalizza le tue impostazioni di privacy. Puoi scegliere i tipi di cookies e tecnologie di tracciamento che autorizzi.',
		title: 'Impostazioni di privacy',
		vendors: {
			disabledByCategory: 'Attiva questa categoria per scegliere i fornitori.',
			privacyPolicy: 'Informativa sulla privacy',
			switchLabel: 'Consenti {vendor}',
			title: 'Fornitori ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Questi cookies ci aiutano a fornire una migliore esperienza utente e per testare nuove funzionalità.',
			title: 'Esperienza',
		},
		functionality: {
			description:
				'Questi cookies permettono di migliorare la funzionalità e la personalizzazione del sito web.',
			title: 'Funzionalità',
		},
		marketing: {
			description:
				'Questi cookies sono utilizzati per fornire pubblicità pertinenti e misurare la loro efficacia.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Questi cookies ci aiutano a comprendere come i visitatori interagiscano con il sito web per migliorarne le sue prestazioni.',
			title: 'Misurazione',
		},
		necessary: {
			description:
				'Questi cookies sono essenziali per il sito web per funzionare correttamente e non possono essere disabilitati.',
			title: 'Strettamente necessari',
		},
	},
	cookieBanner: {
		description:
			'Questo sito utilizza cookies per migliorare la tua esperienza di navigazione, analizzare il traffico e mostrare contenuti personalizzati.',
		noticeDescription:
			'Utilizziamo cookie e tecnologie simili per far funzionare questo sito, misurare il traffico e personalizzare contenuti e annunci. Puoi rifiutare o gestire le tue preferenze in qualsiasi momento.',
		noticeTitle: 'Informativa sulla privacy',
		title: 'Rispettiamo la tua privacy',
	},
	iab: {
		app: {
			consentStorage:
				"Le tue scelte vengono memorizzate su questo dispositivo, nell'archivio delle impostazioni standard dell'app con chiavi IABTCF, per un massimo di {days} giorni. La durata di memorizzazione si rinnova quando aggiorni le tue scelte.",
			description:
				'Noi e i nostri {partnerCount} partner archiviamo e/o accediamo a informazioni su un dispositivo e trattiamo dati personali, come identificatori univoci e informazioni di navigazione, per questa app, per:',
			legitimateInterestExplanation:
				'Alcuni partner trattano dati personali, come identificatori univoci e informazioni di navigazione, sulla base del loro interesse legittimo invece di chiedere il consenso. Questo vale solo per questa app. Hai il diritto di opporti a questo trattamento per ogni finalità e ogni partner.',
			scopeServiceSpecific:
				'Il tuo consenso si applica solo a questa app e non influisce su altri servizi.',
			withdraw:
				'Puoi modificare le tue scelte o revocare il tuo consenso in qualsiasi momento da Impostazioni di privacy in questa app.',
		},
		banner: {
			andMore: 'E altri {count}...',
			description:
				'Noi e i nostri {partnerCount} partner archiviamo e/o accediamo a informazioni su un dispositivo e trattiamo dati personali, come identificatori univoci e informazioni di navigazione, per questo sito web, per:',
			legitimateInterestNotice:
				'Alcuni partner rivendicano un interesse legittimo per trattare i tuoi dati. Hai il diritto di opporti a questo trattamento, personalizzare le tue scelte e revocare il tuo consenso in qualsiasi momento.',
			partnersLink: '{count} partner',
			scopeGroup:
				'La tua scelta si applica a tutti i nostri siti web di questo gruppo.',
			scopeServiceSpecific:
				'Il tuo consenso si applica solo a questo sito web e non influisce su altri servizi.',
			title: 'Impostazioni di privacy',
		},
		common: {
			acceptAll: 'Accetta tutto',
			clearSelection: 'Cancella',
			customPartner: 'Partner personalizzato non registrato presso l’IAB',
			customize: 'Personalizza',
			loading: 'Caricamento...',
			rejectAll: 'Rifiuta tutto',
			saveSettings: 'Salva impostazioni',
			showingSelectedVendor: 'Visualizzazione del fornitore selezionato',
		},
		preferenceCenter: {
			description:
				'Personalizza le tue impostazioni di privacy. Puoi scegliere i tipi di cookies e tecnologie di tracciamento che autorizzi.',
			features: {
				description:
					'Questi mezzi di trattamento possono essere usati esclusivamente per perseguire una o più finalità su cui all’utente è richiesto di esprimere una preferenza nella presente informativa.',
				title: 'Funzionalità',
			},
			footer: {
				consentStorage:
					'Le preferenze di consenso vengono memorizzate in un cookie denominato "euconsent-v2" per 13 mesi. La durata di memorizzazione può essere rinnovata quando aggiorni le tue preferenze.',
			},
			purposeItem: {
				examples: 'Esempi',
				legitimateInterest: 'Interesse legittimo',
				objectButton: 'Opponiti',
				objected: 'Opposizione registrata',
				partners: '{count} partner',
				partnersUsingPurpose: 'Partner che utilizzano questa finalità',
				rightToObject:
					'Hai il diritto di opporti al trattamento basato sull’interesse legittimo.',
				vendorsUseLegitimateInterest:
					'{count} fornitori rivendicano un interesse legittimo',
				withYourPermission: 'Con la tua autorizzazione',
			},
			specialPurposes: {
				title: 'Funzioni essenziali (obbligatorie)',
				tooltip:
					'Queste sono necessarie per la funzionalità e la sicurezza del sito. Secondo l’IAB TCF, non puoi opporti a queste finalità speciali.',
			},
			tabs: {
				purposes: 'Finalità',
				vendors: 'Fornitori',
			},
			title: 'Impostazioni di privacy',
			vendorList: {
				adTechProvidersHeading:
					'Fornitori di tecnologia pubblicitaria di Google',
				adTechProvidersNotice:
					'Google collabora con questi fornitori di tecnologia pubblicitaria al di fuori del framework IAB. Il tuo consenso raggiunge un fornitore solo se lo attivi e consenti anche l’archiviazione di informazioni sul dispositivo e la pubblicità personalizzata.',
				customVendorsHeading: 'Partner personalizzati',
				customVendorsNotice:
					'Si tratta di partner personalizzati non registrati presso l’IAB Transparency & Consent Framework (TCF). Trattano i dati sulla base del tuo consenso e possono avere pratiche di privacy diverse rispetto ai fornitori registrati IAB.',
				dataCategories: 'Categorie di dati',
				features: 'Funzionalità',
				iabVendorsHeading: 'Fornitori registrati IAB',
				iabVendorsNotice:
					'Questi partner sono registrati presso l’IAB Transparency & Consent Framework (TCF), uno standard industriale per la gestione del consenso',
				legitimateInterest: 'Int. legittimo',
				maxAge: 'Durata massima: {days}g',
				nonCookieAccess: 'Accesso senza cookie',
				privacyPolicy: 'Informativa sulla privacy',
				purposes: 'Finalità',
				requiredNotice:
					'Richiesto per la funzionalità del sito, non può essere disabilitato',
				retention: 'Conservazione: {days}g',
				search: 'Cerca fornitori...',
				showingCount: '{filtered} di {total} fornitori',
				specialFeatures: 'Funzionalità speciali',
				specialPurposes: 'Finalità speciali',
				storageDisclosure: 'Informativa sull’archiviazione',
				usesCookies: 'Utilizza cookie',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Politica sui Cookie',
		privacyPolicy: 'Informativa sulla Privacy',
		termsOfService: 'Termini di Servizio',
	},
	optOut: {
		action: 'Rifiuta',
		description:
			'Questo sito non venderà né condividerà i tuoi dati personali e la tua scelta è salvata in questo browser.',
		done: 'Fine',
		headingAll:
			'Vendita e condivisione delle tue informazioni personali e pubblicità mirata',
		headingSaleAndShare:
			'Vendita e condivisione delle tue informazioni personali',
		headingSaleAndTargetedAds:
			'Vendita delle tue informazioni personali e pubblicità mirata',
		lockedByAccount:
			'Il tuo account ha scelto di opporsi e puoi modificare questa impostazione dopo aver effettuato l’accesso.',
		lockedByGpc:
			'Il segnale Global Privacy Control del browser è attivo, quindi questa opzione resta disattivata.',
		notOptedOut: 'Non hai esercitato la rinuncia su questo browser.',
		optInCancel: 'Resta escluso',
		optInConfirm: 'Rientra',
		optInDescription:
			'La conferma termina la tua esclusione su questo browser.',
		optInDescriptionWithRights:
			'La conferma termina la tua esclusione da {rights} su questo browser.',
		optInLink: 'Rientra…',
		optInTitle: 'Vuoi rientrare?',
		receiptAccount:
			'Hai effettuato l’esclusione su questo browser e sul tuo account.',
		receiptAccountWithRights:
			'Hai effettuato l’esclusione da {rights} su questo browser e sul tuo account.',
		receiptBrowser: 'Hai effettuato l’esclusione su questo browser.',
		receiptBrowserWithRights:
			'Hai effettuato l’esclusione da {rights} su questo browser.',
		recordedLabel: 'Registrato',
		referenceLabel: 'Riferimento',
		rightsAll: 'vendita, condivisione e pubblicità mirata',
		rightsSaleAndShare: 'vendita e condivisione',
		rightsSaleAndTargetedAds: 'vendita e pubblicità mirata',
		statusRequest: 'Richiesta di esclusione rispettata',
		statusSignal: 'Segnale di preferenza di esclusione rispettato',
	},
	privacyChoices: {
		acceptAll: 'Accetta tutto',
		advertisingFollowsSale: 'La pubblicità segue la tua scelta qui sopra.',
		advertisingTitle: 'Pubblicità',
		allow: 'Consenti',
		alwaysOn: 'Sempre attivi',
		announceSaved: '{message} Salvato.',
		askAll:
			'vendere o condividere i tuoi dati personali, anche per la pubblicità mirata',
		askSaleAndShare: 'vendere o condividere i tuoi dati personali',
		askSaleAndTargetedAds:
			'vendere i tuoi dati personali o usarli per la pubblicità mirata',
		bannerAllowedRightsOff:
			'Cookie facoltativi consentiti. {rights} restano disattivate. Puoi cambiare questa scelta in «Le tue scelte sulla privacy».',
		bannerAllowedRightsOffGpc:
			'Cookie facoltativi consentiti. {rights} restano disattivate per via del tuo segnale Global Privacy Control. Puoi cambiare questa scelta in «Le tue scelte sulla privacy».',
		bannerRejected:
			'Cookie facoltativi rifiutati. Puoi cambiare questa scelta in «Le tue scelte sulla privacy».',
		barDescription:
			'Usiamo i cookie per migliorare la tua esperienza e analizzare il traffico.',
		businessFallback: 'questo sito',
		choiceRecorded: 'Scelta registrata.',
		choicesSaved:
			'Scelte salvate. Puoi cambiarle in «Le tue scelte sulla privacy».',
		choose: 'Scegli',
		chooseWhatToAllow: 'Scegli cosa consentire',
		close: 'Chiudi',
		confirmDescriptionOptIn:
			'{business} potrà {rights}. Puoi cambiare questa scelta in qualsiasi momento.',
		confirmDescriptionOptOut:
			'{business} potrà {rights}. Puoi rifiutare di nuovo in qualsiasi momento.',
		confirmKeepOptedOut: 'Resta escluso',
		confirmTitleOptIn: 'Consentire {rights}?',
		confirmTitleOptOut: 'Consentire di nuovo {rights}?',
		copyFailed: 'Copia non riuscita. Seleziona e copia il tuo riferimento:',
		copyFailedAnnouncement:
			'Copia non riuscita. Il riferimento completo è visibile nella ricevuta.',
		copyReference: 'Copia riferimento',
		dialogIntro: 'Le tue scelte si applicano subito.',
		dialogTitle: 'Le tue scelte sulla privacy',
		done: 'Fine',
		dontAllow: 'Non consentire',
		euDialogIntro:
			'Scegli quali cookie facoltativi può usare {business}. I cookie facoltativi restano disattivati finché non li attivi.',
		euDialogTitle: 'Impostazioni di privacy',
		gpcNote:
			'Il tuo browser ha inviato un segnale Global Privacy Control, quindi {business} {rights} {scope}. L’opzione Consenti non è disponibile finché il segnale è attivo.',
		justNow: 'adesso',
		nestedSheetNote:
			'Le modifiche si applicano quando salvi in Impostazioni di privacy.',
		noticeBarDescription:
			'Usiamo i cookie per far funzionare questo sito, misurare il traffico e personalizzare gli annunci. Puoi rifiutare in qualsiasi momento.',
		noticeBarDescriptionGpc:
			'Usiamo i cookie per far funzionare questo sito e misurare il traffico. Il tuo segnale Global Privacy Control viene rispettato.',
		noticeGpcHonored:
			'Il segnale Global Privacy Control del tuo browser viene rispettato.',
		noticeRightsAction: 'Non vendere né condividere i miei dati',
		nudge: 'Scegli prima uno dei due pulsanti.',
		optInBarDescription:
			'{business} chiede il tuo permesso prima di usare i cookie facoltativi o di {rights}.',
		optInDescription:
			'Con il tuo permesso, {business} userebbe i cookie facoltativi per le funzionalità del sito e le analisi, e potrebbe {rights}. Niente viene attivato senza il tuo consenso.',
		optInTitle: 'Le tue scelte sulla privacy',
		optOutOption: 'Rifiuta',
		panelExpanded: 'Altre opzioni visualizzate.',
		policyColumn: 'Informativa sulla privacy',
		preferencesClose: 'Chiudi preferenze',
		preferencesOnCount: 'Attive: {count}',
		preferencesSheetIntro: 'Le modifiche si applicano subito.',
		preferencesSummary: 'Funzionalità del sito e analisi',
		preferencesTitle: 'Preferenze',
		purposeColumn: 'Finalità',
		receiptAllowed: 'Consenso a {rights}',
		receiptDetails: 'Dettagli',
		receiptFromGpc: 'dal tuo segnale Global Privacy Control',
		receiptLive: 'Segnale Global Privacy Control di questo browser rispettato',
		receiptLiveDetail: 'Letto dal tuo browser a ogni visita.',
		receiptOptedOut: 'Esclusione da {rights}',
		receiptRecorded: 'Registrato: {date}',
		receiptReference: 'Riferimento',
		receiptSavedAccount: 'Salvato nel tuo account · {date}',
		receiptSavedBrowser: 'Salvato per questo browser · {date}',
		receiptScopeAccount:
			'Vale per questo browser e per il tuo account {business}.',
		receiptScopeAccountUnnamed: 'Vale per questo browser e per il tuo account.',
		receiptScopeBrowser:
			'Vale per questo browser. Accedi per applicarlo anche al tuo account.',
		receiptViaGpc: 'Segnale Global Privacy Control',
		referenceCopied: 'Riferimento copiato.',
		refuseAll:
			'non venderà né condividerà i tuoi dati personali e non li userà per la pubblicità mirata',
		refuseSaleAndShare: 'non venderà né condividerà i tuoi dati personali',
		refuseSaleAndTargetedAds:
			'non venderà i tuoi dati personali e non li userà per la pubblicità mirata',
		rejectAll: 'Rifiuta tutto',
		rightsAllowed: '{rights} consentite.',
		rightsNotAllowed: '{rights} non consentite.',
		rightsOptedOut: 'Esclusione da {rights} effettuata.',
		saleAllowed: '{business} può {rights}.',
		saleGroupOptIn: 'Consenti {rights}',
		saleGroupSaleAndTargetedAds:
			'Rifiuta la vendita dei miei dati personali e la pubblicità mirata',
		saleOffByDefault:
			'Disattivato per impostazione predefinita. {business} {rights}, a meno che tu non lo consenta.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Salva scelte',
		saveInSettings: 'Salva le tue scelte in Impostazioni di privacy',
		savedAutomatically: 'Salvato automaticamente',
		savedCue: 'Salvato',
		scopeAccount: 'su questo browser o per il tuo account {business}',
		scopeAccountUnnamed: 'su questo browser o per il tuo account',
		scopeBrowser: 'su questo browser',
		shortAll: 'vendere o condividere i tuoi dati per la pubblicità',
		shortSaleAndShare: 'vendere o condividere i tuoi dati',
		shortSaleAndTargetedAds: 'vendere i tuoi dati o usarli per la pubblicità',
		stateOff: 'Disattivata',
		stateOn: 'Attiva',
		switchColumn: 'Attivo',
		switchedOff: '{name}: disattivato.',
		switchedOn: '{name}: attivato.',
		titleAll: 'Vendita, condivisione e pubblicità mirata',
		titleSaleAndShare: 'Vendita e condivisione',
		titleSaleAndTargetedAds: 'Vendita e pubblicità mirata',
		vendorColumn: 'Fornitore',
		vendorPolicy: 'Informativa sulla privacy di {vendor}',
		vendorsClose: 'Chiudi i fornitori per {category}',
		vendorsFor: 'per {category}',
		vendorsHide: 'Nascondi {count} fornitori',
		vendorsHideOne: 'Nascondi 1 fornitore',
		vendorsOnCount: 'Attivi: {count}',
		vendorsTable: 'Fornitori per {category}',
		vendorsView: 'Mostra {count} fornitori',
		vendorsViewOne: 'Mostra 1 fornitore',
	},
	rights: {
		californiaPrivacyChoices: 'Le tue scelte sulla privacy in California',
		optOut: 'Non vendere né condividere i miei dati',
		preferences: 'Gestisci preferenze',
		privacyChoices: 'Le tue scelte sulla privacy',
	},
};
export default translations;
