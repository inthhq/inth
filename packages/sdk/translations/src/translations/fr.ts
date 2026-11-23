import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Accepter tout',
		acknowledge: 'OK',
		close: 'Fermer',
		customize: 'Personnaliser',
		dismiss: 'Fermer',
		rejectAll: 'Tout rejeter',
		save: 'Enregistrer les paramètres',
		securedBy: 'Consentement par',
	},
	consentGate: {
		actionButton: 'Activer le consentement {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Acceptez {category} pour afficher ce contenu.',
	},
	consentManagerDialog: {
		description:
			'Personnalisez vos paramètres de confidentialité ici. Vous pouvez choisir les types de cookies et de technologies de suivi que vous autorisez.',
		title: 'Paramètres de confidentialité',
		vendors: {
			disabledByCategory:
				'Activez cette catégorie pour choisir des fournisseurs.',
			privacyPolicy: 'Politique de confidentialité',
			switchLabel: 'Autoriser {vendor}',
			title: 'Fournisseurs ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Ces cookies nous permettent de fournir une meilleure expérience utilisateur et de tester de nouvelles fonctionnalités.',
			title: 'Expérience',
		},
		functionality: {
			description:
				"Ces cookies permettent d'améliorer la fonctionnalité et la personnalisation du site web.",
			title: 'Fonctionnalité',
		},
		marketing: {
			description:
				'Ces cookies sont utilisés pour offrir des publicités pertinentes et suivre leur efficacité.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Ces cookies nous permettent de comprendre comment les visiteurs interagissent avec le site web et améliorent ses performances.',
			title: 'Analyse',
		},
		necessary: {
			description:
				'Ces cookies sont essentiels pour que le site web fonctionne correctement et ne peuvent pas être désactivés.',
			title: 'Strictement nécessaire',
		},
	},
	cookieBanner: {
		description:
			'Ce site utilise des cookies pour améliorer votre expérience de navigation, analyser le trafic du site et afficher du contenu personnalisé.',
		noticeDescription:
			'Nous utilisons des cookies et des technologies similaires pour faire fonctionner ce site, mesurer le trafic et personnaliser le contenu et les publicités. Vous pouvez vous désinscrire ou gérer vos préférences à tout moment.',
		noticeTitle: 'Avis de confidentialité',
		title: 'Nous respectons votre vie privée',
	},
	iab: {
		app: {
			consentStorage:
				"Vos choix sont stockés sur cet appareil, dans l'espace de stockage standard des paramètres de l'application sous des clés IABTCF, pendant {days} jours au maximum. La durée de stockage est renouvelée lorsque vous mettez à jour vos choix.",
			description:
				'Nous et nos {partnerCount} partenaires stockons et/ou accédons à des informations sur votre appareil et traitons des données personnelles, telles que des identifiants uniques et des données de navigation, pour cette application, afin de :',
			legitimateInterestExplanation:
				"Certains partenaires traitent des données personnelles, telles que des identifiants uniques et des données de navigation, sur la base de leur intérêt légitime au lieu de demander votre consentement. Cela s'applique uniquement à cette application. Vous avez le droit de vous opposer à ce traitement pour chaque finalité et chaque partenaire.",
			scopeServiceSpecific:
				"Votre consentement s'applique uniquement à cette application et n'affecte pas d'autres services.",
			withdraw:
				'Vous pouvez modifier vos choix ou retirer votre consentement à tout moment depuis les Paramètres de confidentialité de cette application.',
		},
		banner: {
			andMore: 'Et {count} de plus...',
			description:
				'Nous et nos {partnerCount} partenaires stockons et/ou accédons à des informations sur votre appareil et traitons des données personnelles, telles que des identifiants uniques et des données de navigation, pour ce site web, afin de :',
			legitimateInterestNotice:
				'Certains partenaires revendiquent un intérêt légitime pour traiter vos données. Vous avez le droit de vous opposer à ce traitement, de personnaliser vos choix et de retirer votre consentement à tout moment.',
			partnersLink: '{count} partenaires',
			scopeGroup: "Votre choix s'applique à tous nos sites web de ce groupe.",
			scopeServiceSpecific:
				"Votre consentement s'applique uniquement à ce site web et n'affecte pas d'autres services.",
			title: 'Paramètres de confidentialité',
		},
		common: {
			acceptAll: 'Accepter tout',
			clearSelection: 'Effacer',
			customPartner: "Partenaire personnalisé non enregistré auprès de l'IAB",
			customize: 'Personnaliser',
			loading: 'Chargement...',
			rejectAll: 'Tout rejeter',
			saveSettings: 'Enregistrer les paramètres',
			showingSelectedVendor: 'Affichage du fournisseur sélectionné',
		},
		preferenceCenter: {
			description:
				'Personnalisez vos paramètres de confidentialité ici. Vous pouvez choisir les types de cookies et de technologies de suivi que vous autorisez.',
			features: {
				description:
					'Ces méthodes de traitement ne peuvent être utilisées que dans le cadre d’une ou plusieurs finalités pour lesquelles vous avez la possibilité de choisir dans le présent avis.',
				title: 'Fonctionnalités',
			},
			footer: {
				consentStorage:
					'Les préférences de consentement sont stockées dans un cookie nommé « euconsent-v2 » pendant 13 mois. La durée de stockage peut être renouvelée lorsque vous mettez à jour vos préférences.',
			},
			purposeItem: {
				examples: 'Exemples',
				legitimateInterest: 'Intérêt légitime',
				objectButton: "S'opposer",
				objected: 'Opposition enregistrée',
				partners: '{count} partenaires',
				partnersUsingPurpose: 'Partenaires utilisant cette finalité',
				rightToObject:
					"Vous avez le droit de vous opposer au traitement fondé sur l'intérêt légitime.",
				vendorsUseLegitimateInterest:
					'{count} fournisseurs revendiquent un intérêt légitime',
				withYourPermission: 'Avec votre autorisation',
			},
			specialPurposes: {
				title: 'Fonctions essentielles (obligatoires)',
				tooltip:
					"Ces fonctions sont nécessaires au fonctionnement et à la sécurité du site. Conformément au TCF de l'IAB, vous ne pouvez pas vous opposer à ces finalités spéciales.",
			},
			tabs: {
				purposes: 'Finalités',
				vendors: 'Fournisseurs',
			},
			title: 'Paramètres de confidentialité',
			vendorList: {
				adTechProvidersHeading:
					'Fournisseurs de technologies publicitaires Google',
				adTechProvidersNotice:
					"Google collabore avec ces fournisseurs de technologies publicitaires en dehors du cadre de l'IAB. Votre consentement ne parvient à un fournisseur que si vous l'activez et autorisez également le stockage d'informations sur votre appareil et la publicité personnalisée.",
				customVendorsHeading: 'Partenaires personnalisés',
				customVendorsNotice:
					"Il s'agit de partenaires personnalisés non enregistrés auprès de l'IAB Transparency & Consent Framework (TCF). Ils traitent les données sur la base de votre consentement et peuvent avoir des pratiques de confidentialité différentes de celles des fournisseurs enregistrés auprès de l'IAB.",
				dataCategories: 'Catégories de données',
				features: 'Fonctionnalités',
				iabVendorsHeading: 'Fournisseurs enregistrés IAB',
				iabVendorsNotice:
					"Ces partenaires sont enregistrés auprès du Transparency & Consent Framework (TCF) de l'IAB, une norme industrielle pour la gestion du consentement",
				legitimateInterest: 'Intérêt légitime',
				maxAge: 'Durée max. : {days} j',
				nonCookieAccess: 'Accès sans cookie',
				privacyPolicy: 'Politique de confidentialité',
				purposes: 'Finalités',
				requiredNotice:
					'Requis pour le fonctionnement du site, ne peut pas être désactivé',
				retention: 'Rétention : {days} j',
				search: 'Rechercher des fournisseurs...',
				showingCount: '{filtered} sur {total} fournisseurs',
				specialFeatures: 'Fonctionnalités spéciales',
				specialPurposes: 'Finalités spéciales',
				storageDisclosure: 'Divulgation du stockage',
				usesCookies: 'Utilise des cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Politique des Cookies',
		privacyPolicy: 'Politique de Confidentialité',
		termsOfService: 'Conditions de Service',
	},
	optOut: {
		action: 'Refuser',
		description:
			'Ce site ne vendra ni ne partagera vos informations personnelles, et votre choix est enregistré dans ce navigateur.',
		done: 'Terminé',
		headingAll:
			'Vente et partage de vos informations personnelles et publicité ciblée',
		headingSaleAndShare: 'Vente et partage de vos informations personnelles',
		headingSaleAndTargetedAds:
			'Vente de vos informations personnelles et publicité ciblée',
		lockedByAccount:
			'Votre compte a choisi de se désinscrire, et vous pouvez modifier cela après connexion.',
		lockedByGpc:
			'Le signal Global Privacy Control de votre navigateur est activé, cette option reste donc désactivée.',
		notOptedOut: 'Vous ne vous êtes pas opposé sur ce navigateur.',
		optInCancel: 'Rester désinscrit',
		optInConfirm: 'Accepter à nouveau',
		optInDescription: 'Confirmer met fin à votre opposition sur ce navigateur.',
		optInDescriptionWithRights:
			'Confirmer met fin à votre opposition concernant {rights} sur ce navigateur.',
		optInLink: 'Accepter à nouveau…',
		optInTitle: 'Accepter à nouveau ?',
		receiptAccount:
			'Vous êtes désinscrit sur ce navigateur et sur votre compte.',
		receiptAccountWithRights:
			'Vous êtes désinscrit de {rights} sur ce navigateur et sur votre compte.',
		receiptBrowser: 'Vous êtes désinscrit sur ce navigateur.',
		receiptBrowserWithRights:
			'Vous êtes désinscrit de {rights} sur ce navigateur.',
		recordedLabel: 'Enregistré',
		referenceLabel: 'Référence',
		rightsAll: 'la vente, le partage et la publicité ciblée',
		rightsSaleAndShare: 'la vente et le partage',
		rightsSaleAndTargetedAds: 'la vente et la publicité ciblée',
		statusRequest: 'Demande de refus prise en compte',
		statusSignal: 'Signal de préférence de refus pris en compte',
	},
	privacyChoices: {
		acceptAll: 'Accepter tout',
		advertisingFollowsSale: 'La publicité suit votre choix ci-dessus.',
		advertisingTitle: 'Publicité',
		allow: 'Autoriser',
		alwaysOn: 'Toujours actif',
		announceSaved: '{message} Enregistré.',
		askAll:
			'vendre ou partager vos informations personnelles, y compris pour la publicité ciblée',
		askSaleAndShare: 'vendre ou partager vos informations personnelles',
		askSaleAndTargetedAds:
			'vendre vos informations personnelles ou les utiliser pour la publicité ciblée',
		bannerAllowedRightsOff:
			'Cookies facultatifs autorisés. {rights} : cela reste désactivé. Vous pouvez modifier cela dans « Vos choix de confidentialité ».',
		bannerAllowedRightsOffGpc:
			'Cookies facultatifs autorisés. {rights} : cela reste désactivé en raison de votre signal Global Privacy Control. Vous pouvez modifier cela dans « Vos choix de confidentialité ».',
		bannerRejected:
			'Cookies facultatifs refusés. Vous pouvez modifier cela dans « Vos choix de confidentialité ».',
		barDescription:
			'Nous utilisons des cookies pour améliorer votre expérience et analyser le trafic.',
		businessFallback: 'ce site',
		choiceRecorded: 'Choix enregistré.',
		choicesSaved:
			'Choix enregistrés. Vous pouvez les modifier dans « Vos choix de confidentialité ».',
		choose: 'Choisir',
		chooseWhatToAllow: 'Choisir ce que vous autorisez',
		close: 'Fermer',
		confirmDescriptionOptIn:
			'{business} pourra {rights}. Vous pouvez modifier cela à tout moment.',
		confirmDescriptionOptOut:
			'{business} pourra {rights}. Vous pouvez refuser à nouveau à tout moment.',
		confirmKeepOptedOut: 'Rester désinscrit',
		confirmTitleOptIn: 'Autoriser {rights} ?',
		confirmTitleOptOut: 'Autoriser à nouveau {rights} ?',
		copyFailed: 'Échec de la copie. Sélectionnez et copiez votre référence :',
		copyFailedAnnouncement:
			'Échec de la copie. Votre référence complète figure dans le reçu.',
		copyReference: 'Copier la référence',
		dialogIntro: "Vos choix s'appliquent immédiatement.",
		dialogTitle: 'Vos choix de confidentialité',
		done: 'Terminé',
		dontAllow: 'Ne pas autoriser',
		euDialogIntro:
			'Choisissez les cookies facultatifs que {business} peut utiliser. Les cookies facultatifs restent désactivés tant que vous ne les activez pas.',
		euDialogTitle: 'Paramètres de confidentialité',
		gpcNote:
			"Votre navigateur a envoyé un signal Global Privacy Control, donc {business} {rights} {scope}. « Autoriser » n'est pas disponible tant que le signal est actif.",
		justNow: "à l'instant",
		nestedSheetNote:
			"Les modifications s'appliquent lorsque vous enregistrez dans Paramètres de confidentialité.",
		noticeBarDescription:
			'Nous utilisons des cookies pour faire fonctionner ce site, mesurer le trafic et personnaliser les publicités. Vous pouvez refuser à tout moment.',
		noticeBarDescriptionGpc:
			'Nous utilisons des cookies pour faire fonctionner ce site et mesurer le trafic. Votre signal Global Privacy Control est respecté.',
		noticeGpcHonored:
			'Le signal Global Privacy Control de votre navigateur est respecté.',
		noticeRightsAction: 'Ne pas vendre ni partager mes données',
		nudge: "Choisissez d'abord l'un des deux boutons.",
		optInBarDescription:
			"{business} demande votre accord avant d'utiliser des cookies facultatifs ou de {rights}.",
		optInDescription:
			"Avec votre accord, {business} utiliserait des cookies facultatifs pour les fonctionnalités du site et l'analyse, et pourrait {rights}. Rien n'est activé sans votre autorisation.",
		optInTitle: 'Vos choix de confidentialité',
		optOutOption: 'Refuser',
		panelExpanded: "Plus d'options affichées.",
		policyColumn: 'Politique de confidentialité',
		preferencesClose: 'Fermer les préférences',
		preferencesOnCount: 'Activées : {count}',
		preferencesSheetIntro: "Les modifications s'appliquent immédiatement.",
		preferencesSummary: 'Fonctionnalités du site et analyse',
		preferencesTitle: 'Préférences',
		purposeColumn: 'Finalité',
		receiptAllowed: 'Autorisé : {rights}',
		receiptDetails: 'Détails',
		receiptFromGpc: 'via votre signal Global Privacy Control',
		receiptLive:
			'Signal Global Privacy Control de ce navigateur pris en compte',
		receiptLiveDetail: 'Lu depuis votre navigateur à chaque visite.',
		receiptOptedOut: 'Refusé : {rights}',
		receiptRecorded: 'Enregistré : {date}',
		receiptReference: 'Référence',
		receiptSavedAccount: 'Enregistré sur votre compte · {date}',
		receiptSavedBrowser: 'Enregistré pour ce navigateur · {date}',
		receiptScopeAccount:
			"S'applique à ce navigateur et à votre compte {business}.",
		receiptScopeAccountUnnamed: "S'applique à ce navigateur et à votre compte.",
		receiptScopeBrowser:
			"S'applique à ce navigateur. Connectez-vous pour l'appliquer aussi à votre compte.",
		receiptViaGpc: 'Signal Global Privacy Control',
		referenceCopied: 'Référence copiée.',
		refuseAll:
			'ne vendra ni ne partagera vos informations personnelles et ne les utilisera pas pour la publicité ciblée',
		refuseSaleAndShare:
			'ne vendra ni ne partagera vos informations personnelles',
		refuseSaleAndTargetedAds:
			'ne vendra pas vos informations personnelles et ne les utilisera pas pour la publicité ciblée',
		rejectAll: 'Tout rejeter',
		rightsAllowed: '{rights} : autorisé.',
		rightsNotAllowed: '{rights} : non autorisé.',
		rightsOptedOut: 'Vous avez refusé {rights}.',
		saleAllowed: '{business} peut {rights}.',
		saleGroupOptIn: 'Autoriser {rights}',
		saleGroupSaleAndTargetedAds:
			'Refuser la vente de mes données personnelles et la publicité ciblée',
		saleOffByDefault:
			"Désactivé par défaut. {business} {rights} sauf si vous l'autorisez.",
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Enregistrer mes choix',
		saveInSettings: 'Enregistrez vos choix dans Paramètres de confidentialité',
		savedAutomatically: 'Enregistré automatiquement',
		savedCue: 'Enregistré',
		scopeAccount: 'sur ce navigateur ni sur votre compte {business}',
		scopeAccountUnnamed: 'sur ce navigateur ni sur votre compte',
		scopeBrowser: 'sur ce navigateur',
		shortAll: 'vendre ou partager vos données à des fins publicitaires',
		shortSaleAndShare: 'vendre ou partager vos données',
		shortSaleAndTargetedAds:
			'vendre vos données ou les utiliser pour la publicité',
		stateOff: 'Désactivé',
		stateOn: 'Activé',
		switchColumn: 'Activé',
		switchedOff: '{name} : désactivé.',
		switchedOn: '{name} : activé.',
		titleAll: 'La vente, le partage et la publicité ciblée',
		titleSaleAndShare: 'La vente et le partage',
		titleSaleAndTargetedAds: 'La vente et la publicité ciblée',
		vendorColumn: 'Fournisseur',
		vendorPolicy: 'Politique de confidentialité de {vendor}',
		vendorsClose: 'Fermer les fournisseurs pour {category}',
		vendorsFor: 'pour {category}',
		vendorsHide: 'Masquer {count} fournisseurs',
		vendorsHideOne: 'Masquer 1 fournisseur',
		vendorsOnCount: 'Activés : {count}',
		vendorsTable: 'Fournisseurs pour {category}',
		vendorsView: 'Voir {count} fournisseurs',
		vendorsViewOne: 'Voir 1 fournisseur',
	},
	rights: {
		californiaPrivacyChoices: 'Vos choix de confidentialité en Californie',
		optOut: 'Ne pas vendre ni partager mes données',
		preferences: 'Gérer les préférences',
		privacyChoices: 'Vos choix de confidentialité',
	},
};
export default translations;
