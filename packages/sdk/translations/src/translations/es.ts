import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Aceptar todo',
		acknowledge: 'OK',
		close: 'Cerrar',
		customize: 'Personalizar',
		dismiss: 'Cerrar',
		rejectAll: 'Rechazar todo',
		save: 'Guardar ajustes',
		securedBy: 'Consentimiento por',
	},
	consentGate: {
		actionButton: 'Habilitar consentimiento de {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Acepta {category} para ver este contenido.',
	},
	consentManagerDialog: {
		description:
			'Personaliza tus ajustes de privacidad aquí. Puedes elegir qué tipos de cookies y tecnologías de seguimiento permites.',
		title: 'Configuración de privacidad',
		vendors: {
			disabledByCategory: 'Activa esta categoría para elegir proveedores.',
			privacyPolicy: 'Política de privacidad',
			switchLabel: 'Permitir {vendor}',
			title: 'Proveedores ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Estas cookies nos ayudan a proporcionar una mejor experiencia de usuario y a probar nuevas funciones.',
			title: 'Experiencia',
		},
		functionality: {
			description:
				'Estas cookies permiten una mejor funcionalidad y personalización del sitio web.',
			title: 'Funcionalidad',
		},
		marketing: {
			description:
				'Estas cookies se utilizan para ofrecer anuncios relevantes y realizar un seguimiento de su eficacia.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Estas cookies nos ayudan a comprender cómo los visitantes interactúan con el sitio web y a mejorar su rendimiento.',
			title: 'Analítica',
		},
		necessary: {
			description:
				'Estas cookies son esenciales para que el sitio web funcione correctamente y no pueden ser deshabilitadas.',
			title: 'Necesario',
		},
	},
	cookieBanner: {
		description:
			'Este sitio web utiliza cookies para mejorar tu experiencia de navegación, analizar el tráfico del sitio y mostrar contenido personalizado.',
		noticeDescription:
			'Utilizamos cookies y tecnologías similares para el funcionamiento de este sitio, medir el tráfico y personalizar el contenido y los anuncios. Puedes optar por no participar o gestionar tus preferencias en cualquier momento.',
		noticeTitle: 'Aviso de privacidad',
		title: 'Valoramos tu privacidad',
	},
	iab: {
		app: {
			consentStorage:
				'Tus opciones se almacenan en este dispositivo, en el almacenamiento de configuración estándar de la aplicación bajo claves IABTCF, durante un máximo de {days} días. La duración del almacenamiento se renueva cuando actualizas tus opciones.',
			description:
				'Nosotros y nuestros {partnerCount} socios almacenamos y/o accedemos a información en tu dispositivo y procesamos datos personales, como identificadores únicos y datos de navegación, para esta aplicación, con el fin de:',
			legitimateInterestExplanation:
				'Algunos socios procesan datos personales, como identificadores únicos y datos de navegación, basándose en su interés legítimo en lugar de pedir tu consentimiento. Esto se aplica solo a esta aplicación. Tienes derecho a oponerte a este procesamiento para cada finalidad y cada socio.',
			scopeServiceSpecific:
				'Tu consentimiento se aplica solo a esta aplicación y no afectará a otros servicios.',
			withdraw:
				'Puedes cambiar tus opciones o retirar tu consentimiento en cualquier momento desde Configuración de privacidad en esta aplicación.',
		},
		banner: {
			andMore: 'Y {count} más...',
			description:
				'Nosotros y nuestros {partnerCount} socios almacenamos y/o accedemos a información en tu dispositivo y procesamos datos personales, como identificadores únicos y datos de navegación, para este sitio web, con el fin de:',
			legitimateInterestNotice:
				'Algunos socios reclaman un interés legítimo para procesar tus datos. Tienes derecho a oponerte a este procesamiento, personalizar tus opciones y retirar tu consentimiento en cualquier momento.',
			partnersLink: '{count} socios',
			scopeGroup:
				'Su elección se aplica a todos nuestros sitios web de este grupo.',
			scopeServiceSpecific:
				'Tu consentimiento se aplica solo a este sitio web y no afectará a otros servicios.',
			title: 'Configuración de privacidad',
		},
		common: {
			acceptAll: 'Aceptar todo',
			clearSelection: 'Limpiar',
			customPartner: 'Socio personalizado no registrado en IAB',
			customize: 'Personalizar',
			loading: 'Cargando...',
			rejectAll: 'Rechazar todo',
			saveSettings: 'Guardar ajustes',
			showingSelectedVendor: 'Mostrando proveedor seleccionado',
		},
		preferenceCenter: {
			description:
				'Personaliza tus ajustes de privacidad aquí. Puedes elegir qué tipos de cookies y tecnologías de seguimiento permites.',
			features: {
				description:
					'Estos medios de tratamiento pueden utilizarse únicamente para uno o varios fines para los que se te da la opción en este aviso.',
				title: 'Características',
			},
			footer: {
				consentStorage:
					'Las preferencias de consentimiento se almacenan en una cookie llamada "euconsent-v2" durante 13 meses. La duración del almacenamiento puede renovarse cuando actualices tus preferencias.',
			},
			purposeItem: {
				examples: 'Ejemplos',
				legitimateInterest: 'Interés legítimo',
				objectButton: 'Oponerse',
				objected: 'Opuesto',
				partners: '{count} socios',
				partnersUsingPurpose: 'Socios que utilizan este propósito',
				rightToObject:
					'Tienes derecho a oponerte al procesamiento basado en interés legítimo.',
				vendorsUseLegitimateInterest:
					'{count} proveedores reclaman interés legítimo',
				withYourPermission: 'Con tu permiso',
			},
			specialPurposes: {
				title: 'Funciones esenciales (requeridas)',
				tooltip:
					'Estas son necesarias para la funcionalidad y seguridad del sitio. Según el TCF de IAB, no puedes oponerte a estos propósitos especiales.',
			},
			tabs: {
				purposes: 'Propósitos',
				vendors: 'Proveedores',
			},
			title: 'Configuración de privacidad',
			vendorList: {
				adTechProvidersHeading:
					'Proveedores de tecnología publicitaria de Google',
				adTechProvidersNotice:
					'Google trabaja con estos proveedores de tecnología publicitaria fuera del marco de IAB. Tu consentimiento solo llega a un proveedor si lo activas y además permites el almacenamiento de información en tu dispositivo y la publicidad personalizada.',
				customVendorsHeading: 'Socios personalizados',
				customVendorsNotice:
					'Estos son socios personalizados no registrados en el Marco de Transparencia y Consentimiento de IAB (TCF). Procesan datos basándose en tu consentimiento y pueden tener prácticas de privacidad diferentes a las de los proveedores registrados en IAB.',
				dataCategories: 'Categorías de datos',
				features: 'Características',
				iabVendorsHeading: 'Proveedores registrados en IAB',
				iabVendorsNotice:
					'Estos socios están registrados en el Marco de Transparencia y Consentimiento (TCF) de IAB, un estándar de la industria para gestionar el consentimiento',
				legitimateInterest: 'Interés legítimo',
				maxAge: 'Duración máxima: {days}d',
				nonCookieAccess: 'Acceso sin cookies',
				privacyPolicy: 'Política de privacidad',
				purposes: 'Finalidades',
				requiredNotice:
					'Requerido para la funcionalidad del sitio, no se puede desactivar',
				retention: 'Retención: {days}d',
				search: 'Buscar proveedores...',
				showingCount: '{filtered} de {total} proveedores',
				specialFeatures: 'Características especiales',
				specialPurposes: 'Finalidades especiales',
				storageDisclosure: 'Divulgación de almacenamiento',
				usesCookies: 'Usa cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Política de Cookies',
		privacyPolicy: 'Política de Privacidad',
		termsOfService: 'Términos de Servicio',
	},
	optOut: {
		action: 'Excluirme',
		description:
			'Este sitio no venderá ni compartirá tu información personal, y tu elección queda guardada en este navegador.',
		done: 'Listo',
		headingAll:
			'Venta e intercambio de su información personal y publicidad dirigida',
		headingSaleAndShare: 'Venta e intercambio de su información personal',
		headingSaleAndTargetedAds:
			'Venta de su información personal y publicidad dirigida',
		lockedByAccount:
			'Tu cuenta ha optado por excluirse, y puedes cambiar esto después de iniciar sesión.',
		lockedByGpc:
			'La señal Global Privacy Control de tu navegador está activada, por lo que esto permanece desactivado.',
		notOptedOut: 'No se ha excluido en este navegador.',
		optInCancel: 'Seguir excluido',
		optInConfirm: 'Volver a participar',
		optInDescription: 'Confirmar finaliza tu exclusión en este navegador.',
		optInDescriptionWithRights:
			'Confirmar finaliza tu exclusión de {rights} en este navegador.',
		optInLink: 'Volver a participar…',
		optInTitle: '¿Volver a participar?',
		receiptAccount: 'Has quedado excluido en este navegador y en tu cuenta.',
		receiptAccountWithRights:
			'Has quedado excluido de {rights} en este navegador y en tu cuenta.',
		receiptBrowser: 'Has quedado excluido en este navegador.',
		receiptBrowserWithRights:
			'Has quedado excluido de {rights} en este navegador.',
		recordedLabel: 'Registrado',
		referenceLabel: 'Referencia',
		rightsAll: 'venta, intercambio y publicidad dirigida',
		rightsSaleAndShare: 'venta e intercambio',
		rightsSaleAndTargetedAds: 'venta y publicidad dirigida',
		statusRequest: 'Solicitud de exclusión aplicada',
		statusSignal: 'Señal de preferencia de exclusión aplicada',
	},
	privacyChoices: {
		acceptAll: 'Aceptar todo',
		advertisingFollowsSale: 'La publicidad depende de tu elección de arriba.',
		advertisingTitle: 'Publicidad',
		allow: 'Permitir',
		alwaysOn: 'Siempre activo',
		announceSaved: '{message} Guardado.',
		askAll:
			'vender o compartir tu información personal, incluso para publicidad dirigida',
		askSaleAndShare: 'vender o compartir tu información personal',
		askSaleAndTargetedAds:
			'vender tu información personal o usarla para publicidad dirigida',
		bannerAllowedRightsOff:
			'Cookies opcionales permitidas. {rights} siguen sin activarse. Puedes cambiarlo en «Sus opciones de privacidad».',
		bannerAllowedRightsOffGpc:
			'Cookies opcionales permitidas. {rights} siguen sin activarse por tu señal Global Privacy Control. Puedes cambiarlo en «Sus opciones de privacidad».',
		bannerRejected:
			'Cookies opcionales rechazadas. Puedes cambiarlo en «Sus opciones de privacidad».',
		barDescription:
			'Usamos cookies para mejorar tu experiencia y analizar el tráfico.',
		businessFallback: 'este sitio',
		choiceRecorded: 'Elección registrada.',
		choicesSaved:
			'Opciones guardadas. Puedes cambiarlas en «Sus opciones de privacidad».',
		choose: 'Elegir',
		chooseWhatToAllow: 'Elegir qué permitir',
		close: 'Cerrar',
		confirmDescriptionOptIn:
			'{business} podrá {rights}. Puedes cambiarlo en cualquier momento.',
		confirmDescriptionOptOut:
			'{business} podrá {rights}. Puedes volver a excluirte en cualquier momento.',
		confirmKeepOptedOut: 'Seguir excluido',
		confirmTitleOptIn: '¿Permitir {rights}?',
		confirmTitleOptOut: '¿Volver a permitir {rights}?',
		copyFailed: 'No se pudo copiar. Selecciona y copia tu referencia:',
		copyFailedAnnouncement:
			'No se pudo copiar. Tu referencia completa aparece en el comprobante.',
		copyReference: 'Copiar referencia',
		dialogIntro: 'Tus opciones se aplican al instante.',
		dialogTitle: 'Sus opciones de privacidad',
		done: 'Listo',
		dontAllow: 'No permitir',
		euDialogIntro:
			'Elige qué cookies opcionales puede usar {business}. Las cookies opcionales siguen desactivadas a menos que las actives.',
		euDialogTitle: 'Configuración de privacidad',
		gpcNote:
			'Tu navegador envió una señal Global Privacy Control, así que {business} {rights} {scope}. «Permitir» no está disponible mientras la señal esté activa.',
		justNow: 'ahora mismo',
		nestedSheetNote:
			'Los cambios se aplican cuando guardas en Configuración de privacidad.',
		noticeBarDescription:
			'Usamos cookies para el funcionamiento de este sitio, medir el tráfico y personalizar los anuncios. Puedes excluirte en cualquier momento.',
		noticeBarDescriptionGpc:
			'Usamos cookies para el funcionamiento de este sitio y medir el tráfico. Se respeta tu señal Global Privacy Control.',
		noticeGpcHonored:
			'Se está respetando la señal Global Privacy Control de tu navegador.',
		noticeRightsAction: 'No vender ni compartir mis datos',
		nudge: 'Elige primero uno de los dos botones.',
		optInBarDescription:
			'{business} te pregunta antes de usar cookies opcionales o de {rights}.',
		optInDescription:
			'Con tu permiso, {business} usaría cookies opcionales para funciones del sitio y analítica, y podría {rights}. No se activa nada a menos que lo permitas.',
		optInTitle: 'Sus opciones de privacidad',
		optOutOption: 'Excluirme',
		panelExpanded: 'Se muestran más opciones.',
		policyColumn: 'Política de privacidad',
		preferencesClose: 'Cerrar preferencias',
		preferencesOnCount: 'Activas: {count}',
		preferencesSheetIntro: 'Los cambios se aplican al instante.',
		preferencesSummary: 'Funciones del sitio y analítica',
		preferencesTitle: 'Preferencias',
		purposeColumn: 'Finalidad',
		receiptAllowed: 'Permitiste {rights}',
		receiptDetails: 'Detalles',
		receiptFromGpc: 'por tu señal Global Privacy Control',
		receiptLive: 'Se respeta la señal Global Privacy Control de este navegador',
		receiptLiveDetail: 'Se lee de tu navegador en cada visita.',
		receiptOptedOut: 'Te excluiste de {rights}',
		receiptRecorded: 'Registrado: {date}',
		receiptReference: 'Referencia',
		receiptSavedAccount: 'Guardado en tu cuenta · {date}',
		receiptSavedBrowser: 'Guardado para este navegador · {date}',
		receiptScopeAccount:
			'Se aplica a este navegador y a tu cuenta de {business}.',
		receiptScopeAccountUnnamed: 'Se aplica a este navegador y a tu cuenta.',
		receiptScopeBrowser:
			'Se aplica a este navegador. Inicia sesión para aplicarlo también a tu cuenta.',
		receiptViaGpc: 'Señal Global Privacy Control',
		referenceCopied: 'Referencia copiada.',
		refuseAll:
			'no venderá ni compartirá tu información personal ni la usará para publicidad dirigida',
		refuseSaleAndShare: 'no venderá ni compartirá tu información personal',
		refuseSaleAndTargetedAds:
			'no venderá tu información personal ni la usará para publicidad dirigida',
		rejectAll: 'Rechazar todo',
		rightsAllowed: '{rights}: permitido.',
		rightsNotAllowed: '{rights}: no permitido.',
		rightsOptedOut: 'Te excluiste de {rights}.',
		saleAllowed: '{business} puede {rights}.',
		saleGroupOptIn: 'Permitir {rights}',
		saleGroupSaleAndTargetedAds:
			'Excluirme de la venta de mis datos personales y de la publicidad dirigida',
		saleOffByDefault:
			'Desactivado de forma predeterminada. {business} {rights} a menos que lo permitas.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Guardar opciones',
		saveInSettings: 'Guarda tus opciones en Configuración de privacidad',
		savedAutomatically: 'Se guarda automáticamente',
		savedCue: 'Guardado',
		scopeAccount: 'en este navegador ni en tu cuenta de {business}',
		scopeAccountUnnamed: 'en este navegador ni en tu cuenta',
		scopeBrowser: 'en este navegador',
		shortAll: 'vender o compartir tus datos para anuncios',
		shortSaleAndShare: 'vender o compartir tus datos',
		shortSaleAndTargetedAds: 'vender tus datos o usarlos para anuncios',
		stateOff: 'Desactivado',
		stateOn: 'Activado',
		switchColumn: 'Activado',
		switchedOff: '{name}: desactivado.',
		switchedOn: '{name}: activado.',
		titleAll: 'La venta, el intercambio y la publicidad dirigida',
		titleSaleAndShare: 'La venta y el intercambio',
		titleSaleAndTargetedAds: 'La venta y la publicidad dirigida',
		vendorColumn: 'Proveedor',
		vendorPolicy: 'Política de privacidad de {vendor}',
		vendorsClose: 'Cerrar proveedores de {category}',
		vendorsFor: 'de {category}',
		vendorsHide: 'Ocultar {count} proveedores',
		vendorsHideOne: 'Ocultar 1 proveedor',
		vendorsOnCount: 'Activos: {count}',
		vendorsTable: 'Proveedores de {category}',
		vendorsView: 'Ver {count} proveedores',
		vendorsViewOne: 'Ver 1 proveedor',
	},
	rights: {
		californiaPrivacyChoices: 'Sus opciones de privacidad de California',
		optOut: 'No vender ni compartir mis datos',
		preferences: 'Gestionar preferencias',
		privacyChoices: 'Sus opciones de privacidad',
	},
};
export default translations;
