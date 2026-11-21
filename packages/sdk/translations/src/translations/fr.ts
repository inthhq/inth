import type { CompleteTranslations } from '../types';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Accepter tout',
		acknowledge: 'OK',
		close: 'Fermer',
		customize: 'Personnaliser',
		dismiss: 'Fermer',
		rejectAll: 'Tout rejeter',
		save: 'Enregistrer les paramètres',
		securedBy: 'Sécurisé par',
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
	rights: {
		californiaPrivacyChoices: 'Vos choix de confidentialité en Californie',
		optOut: 'Ne pas vendre ni partager mes données',
		preferences: 'Gérer les préférences',
		privacyChoices: 'Vos choix de confidentialité',
	},
};
export default translations;
