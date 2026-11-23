import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Přijmout vše',
		acknowledge: 'OK',
		close: 'Zavřít',
		customize: 'Přizpůsobit',
		dismiss: 'Zavřít',
		rejectAll: 'Odmítnout vše',
		save: 'Uložit nastavení',
		securedBy: 'Souhlas zajišťuje',
	},
	consentGate: {
		actionButton: 'Povolit souhlas s kategorií {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title:
			'Pro zobrazení tohoto obsahu přijměte souhlas s kategorií {category}.',
	},
	consentManagerDialog: {
		description:
			'Zde si můžete přizpůsobit nastavení soukromí. Můžete zvolit, které typy souborů cookie a sledovacích technologií povolíte.',
		title: 'Nastavení soukromí',
		vendors: {
			disabledByCategory:
				'Zapněte tuto kategorii, abyste mohli vybrat partnery.',
			privacyPolicy: 'Zásady ochrany osobních údajů',
			switchLabel: 'Povolit {vendor}',
			title: 'Partneři ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Tyto soubory cookie nám pomáhají poskytovat lepší uživatelskou zkušenost a testovat nové funkce.',
			title: 'Uživatelská zkušenost',
		},
		functionality: {
			description:
				'Tyto soubory cookie umožňují rozšířenou funkčnost a personalizaci webových stránek.',
			title: 'Funkčnost',
		},
		marketing: {
			description:
				'Tyto soubory cookie se používají k doručování relevantních reklam a sledování jejich účinnosti.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Tyto soubory cookie nám pomáhají pochopit, jak návštěvníci interagují s webem a zlepšují jeho výkon.',
			title: 'Analytika',
		},
		necessary: {
			description:
				'Tyto soubory cookie jsou nezbytné pro správné fungování webových stránek a nelze je deaktivovat.',
			title: 'Nezbytně nutné',
		},
	},
	cookieBanner: {
		description:
			'Tento web používá soubory cookie ke zlepšení vašeho prohlížení, analýze provozu na webu a zobrazování personalizovaného obsahu.',
		noticeDescription:
			'Používáme soubory cookie a podobné technologie k provozu tohoto webu, měření návštěvnosti a personalizaci obsahu a reklam. Kdykoli se můžete odhlásit nebo spravovat své předvolby.',
		noticeTitle: 'Oznámení o ochraně soukromí',
		title: 'Vážíme si vašeho soukromí',
	},
	iab: {
		app: {
			consentStorage:
				'Vaše volby jsou uloženy v tomto zařízení, ve standardním úložišti nastavení aplikace pod klíči IABTCF, po dobu nejvýše {days} dní. Doba uložení se obnoví, když své volby aktualizujete.',
			description:
				'My a {partnerCount, plural, one {náš # partner} few {naši # partneři} other {našich # partnerů}} ukládáme a/nebo přistupujeme k informacím na vašem zařízení a zpracováváme osobní údaje, jako jsou jedinečné identifikátory a údaje o prohlížení, pro tuto aplikaci za účelem:',
			legitimateInterestExplanation:
				'Někteří partneři zpracovávají osobní údaje, jako jsou jedinečné identifikátory a údaje o prohlížení, na základě svého oprávněného zájmu, místo aby žádali o souhlas. Týká se to pouze této aplikace. Máte právo vznést námitku proti tomuto zpracování pro každý účel a každého partnera.',
			scopeServiceSpecific:
				'Váš souhlas platí pouze pro tuto aplikaci a neovlivní jiné služby.',
			withdraw:
				'Své volby můžete kdykoli změnit nebo svůj souhlas odvolat v Nastavení soukromí v této aplikaci.',
		},
		banner: {
			andMore: 'A dalších {count}...',
			description:
				'My a našich {partnerCount} partnerů ukládáme a/nebo přistupujeme k informacím na vašem zařízení a zpracováváme osobní údaje, jako jsou jedinečné identifikátory a údaje o prohlížení, pro tento web za účelem:',
			legitimateInterestNotice:
				'Někteří partneři uplatňují oprávněný zájem na zpracování vašich údajů. Máte právo proti tomuto zpracování vznést námitku, přizpůsobit své volby a kdykoli odvolat svůj souhlas.',
			partnersLink:
				'{count, plural, one {# partner} few {# partneři} other {# partnerů}}',
			scopeGroup: 'Vaše volba platí pro všechny naše weby v této skupině.',
			scopeServiceSpecific:
				'Váš souhlas platí pouze pro tento web a neovlivní jiné služby.',
			title: 'Nastavení soukromí',
		},
		common: {
			acceptAll: 'Přijmout vše',
			clearSelection: 'Vymazat',
			customPartner: 'Vlastní partner neregistrovaný v IAB',
			customize: 'Přizpůsobit',
			loading: 'Načítání...',
			rejectAll: 'Odmítnout vše',
			saveSettings: 'Uložit nastavení',
			showingSelectedVendor: 'Zobrazení vybraného partnera',
		},
		preferenceCenter: {
			description:
				'Zde si můžete přizpůsobit nastavení soukromí. Můžete zvolit, které typy souborů cookie a sledovacích technologií povolíte.',
			features: {
				description:
					'Tyto prostředky zpracování mohou být použity pouze za účelem dosažení jednoho či více účelů, pro které máte v tomto oznámení možnost volby.',
				title: 'Funkce',
			},
			footer: {
				consentStorage:
					'Předvolby souhlasu jsou uloženy v cookie s názvem "euconsent-v2" po dobu 13 měsíců. Doba uložení se může obnovit, když aktualizujete své předvolby.',
			},
			purposeItem: {
				examples: 'Příklady',
				legitimateInterest: 'Oprávněný zájem',
				objectButton: 'Vznést námitku',
				objected: 'Námitka vznesena',
				partners:
					'{count, plural, one {# partner} few {# partneři} other {# partnerů}}',
				partnersUsingPurpose: 'Partneři využívající tento účel',
				rightToObject:
					'Máte právo vznést námitku proti zpracování založenému na oprávněném zájmu.',
				vendorsUseLegitimateInterest:
					'{count, plural, one {# partner uplatňuje} few {# partneři uplatňují} other {# partnerů uplatňuje}} oprávněný zájem',
				withYourPermission: 'S vaším svolením',
			},
			specialPurposes: {
				title: 'Základní funkce (povinné)',
				tooltip:
					'Tyto funkce jsou nezbytné pro funkčnost a zabezpečení webu. Podle IAB TCF nemůžete proti těmto zvláštním účelům vznést námitku.',
			},
			tabs: {
				purposes: 'Účely',
				vendors: 'Partneři',
			},
			title: 'Nastavení soukromí',
			vendorList: {
				adTechProvidersHeading: 'Poskytovatelé reklamních technologií Google',
				adTechProvidersNotice:
					'Google spolupracuje s těmito poskytovateli reklamních technologií mimo rámec IAB. Váš souhlas se k poskytovateli dostane, jen pokud ho zapnete a zároveň povolíte ukládání informací na vašem zařízení a personalizovanou reklamu.',
				customVendorsHeading: 'Vlastní partneři',
				customVendorsNotice:
					'Toto jsou vlastní partneři, kteří nejsou registrováni v rámci IAB Transparency & Consent Framework (TCF). Zpracovávají data na základě vašeho souhlasu a mohou mít odlišné postupy ochrany osobních údajů než partneři registrovaní v IAB.',
				dataCategories: 'Kategorie dat',
				features: 'Funkce',
				iabVendorsHeading: 'Partneři registrovaní v IAB',
				iabVendorsNotice:
					'Tito partneři jsou registrováni v rámci IAB Transparency & Consent Framework (TCF), což je průmyslový standard pro správu souhlasu',
				legitimateInterest: 'Oprávněný zájem',
				maxAge: 'Maximální doba: {days} d',
				nonCookieAccess: 'Přístup bez cookies',
				privacyPolicy: 'Zásady ochrany osobních údajů',
				purposes: 'Účely',
				requiredNotice: 'Vyžadováno pro funkčnost webu, nelze zakázat',
				retention: 'Uchovávání: {days} d',
				search: 'Hledat partnery...',
				showingCount:
					'{filtered} z {total, plural, one {# partnera} few {# partnerů} other {# partnerů}}',
				specialFeatures: 'Zvláštní funkce',
				specialPurposes: 'Zvláštní účely',
				storageDisclosure: 'Informace o ukládání',
				usesCookies: 'Používá cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Zásady používání souborů cookie',
		privacyPolicy: 'Zásady ochrany osobních údajů',
		termsOfService: 'Podmínky služby',
	},
	optOut: {
		action: 'Odhlásit se',
		description:
			'Tento web nebude prodávat ani sdílet vaše osobní údaje a vaše volba je uložena v tomto prohlížeči.',
		done: 'Hotovo',
		headingAll: 'Prodej a sdílení vašich osobních údajů a cílená reklama',
		headingSaleAndShare: 'Prodej a sdílení vašich osobních údajů',
		headingSaleAndTargetedAds: 'Prodej vašich osobních údajů a cílená reklama',
		lockedByAccount: 'Váš účet se odhlásil a po přihlášení to můžete změnit.',
		lockedByGpc:
			'Signál Global Privacy Control ve vašem prohlížeči je zapnutý, takže toto zůstává vypnuté.',
		notOptedOut: 'V tomto prohlížeči jste se neodhlásili.',
		optInCancel: 'Zůstat odhlášen',
		optInConfirm: 'Znovu se přihlásit',
		optInDescription: 'Potvrzením ukončíte své odhlášení v tomto prohlížeči.',
		optInDescriptionWithRights:
			'Potvrzením ukončíte své odhlášení z {rights} v tomto prohlížeči.',
		optInLink: 'Znovu se přihlásit…',
		optInTitle: 'Znovu se přihlásit?',
		receiptAccount: 'Jste odhlášeni v tomto prohlížeči a ve svém účtu.',
		receiptAccountWithRights:
			'Jste odhlášeni z {rights} v tomto prohlížeči a ve svém účtu.',
		receiptBrowser: 'Jste odhlášeni v tomto prohlížeči.',
		receiptBrowserWithRights: 'Jste odhlášeni z {rights} v tomto prohlížeči.',
		recordedLabel: 'Zaznamenáno',
		referenceLabel: 'Reference',
		rightsAll: 'prodeje, sdílení a cílené reklamy',
		rightsSaleAndShare: 'prodeje a sdílení',
		rightsSaleAndTargetedAds: 'prodeje a cílené reklamy',
		statusRequest: 'Žádost o odhlášení byla respektována',
		statusSignal: 'Signál předvolby odhlášení byl respektován',
	},
	privacyChoices: {
		acceptAll: 'Přijmout vše',
		advertisingFollowsSale: 'Reklama se řídí vaší volbou výše.',
		advertisingTitle: 'Reklama',
		allow: 'Povolit',
		alwaysOn: 'Vždy zapnuto',
		announceSaved: '{message} Uloženo.',
		askAll:
			'prodávat nebo sdílet vaše osobní údaje, a to i pro cílenou reklamu',
		askSaleAndShare: 'prodávat nebo sdílet vaše osobní údaje',
		askSaleAndTargetedAds:
			'prodávat vaše osobní údaje nebo je používat pro cílenou reklamu',
		bannerAllowedRightsOff:
			'Volitelné soubory cookie jsou povoleny. {rights} zůstávají vypnuté. Můžete to změnit v části Vaše volby ochrany osobních údajů.',
		bannerAllowedRightsOffGpc:
			'Volitelné soubory cookie jsou povoleny. {rights} zůstávají vypnuté kvůli vašemu signálu Global Privacy Control. Můžete to změnit v části Vaše volby ochrany osobních údajů.',
		bannerRejected:
			'Volitelné soubory cookie jsou odmítnuty. Můžete to změnit v části Vaše volby ochrany osobních údajů.',
		barDescription:
			'Používáme soubory cookie ke zlepšení vašeho prohlížení a k analýze návštěvnosti.',
		businessFallback: 'tento web',
		choiceRecorded: 'Volba zaznamenána.',
		choicesSaved:
			'Volby uloženy. Můžete je změnit v části Vaše volby ochrany osobních údajů.',
		choose: 'Vybrat',
		chooseWhatToAllow: 'Vybrat, co povolíte',
		close: 'Zavřít',
		confirmDescriptionOptIn:
			'{business} může {rights}. Kdykoli to můžete změnit.',
		confirmDescriptionOptOut:
			'{business} může {rights}. Kdykoli se můžete znovu odhlásit.',
		confirmKeepOptedOut: 'Zůstat odhlášen',
		confirmTitleOptIn: 'Povolit možnost „{rights}“?',
		confirmTitleOptOut: 'Znovu povolit možnost „{rights}“?',
		copyFailed: 'Kopírování se nezdařilo. Označte a zkopírujte svou referenci:',
		copyFailedAnnouncement:
			'Kopírování se nezdařilo. Celou referenci najdete v potvrzení.',
		copyReference: 'Zkopírovat referenci',
		dialogIntro: 'Vaše volby platí okamžitě.',
		dialogTitle: 'Vaše volby ochrany osobních údajů',
		done: 'Hotovo',
		dontAllow: 'Nepovolit',
		euDialogIntro:
			'Vyberte, které volitelné soubory cookie může {business} používat. Volitelné soubory cookie zůstávají vypnuté, dokud je nezapnete.',
		euDialogTitle: 'Nastavení soukromí',
		gpcNote:
			'Váš prohlížeč odeslal signál Global Privacy Control, takže {business} {rights} {scope}. Možnost Povolit není dostupná, dokud je signál zapnutý.',
		justNow: 'právě teď',
		nestedSheetNote: 'Změny se projeví po uložení v Nastavení soukromí.',
		noticeBarDescription:
			'Používáme soubory cookie k provozu tohoto webu, měření návštěvnosti a personalizaci reklam. Kdykoli se můžete odhlásit.',
		noticeBarDescriptionGpc:
			'Používáme soubory cookie k provozu tohoto webu a měření návštěvnosti. Váš signál Global Privacy Control respektujeme.',
		noticeGpcHonored:
			'Signál Global Privacy Control vašeho prohlížeče respektujeme.',
		noticeRightsAction: 'Neprodávejte ani nesdílejte moje údaje',
		nudge: 'Nejdřív vyberte jedno ze dvou tlačítek.',
		optInBarDescription:
			'{business} se zeptá, než použije volitelné soubory cookie nebo než začne {rights}.',
		optInDescription:
			'S vaším svolením bude {business} používat volitelné soubory cookie pro funkce webu a analytiku a bude moci {rights}. Nic se nezapne, dokud to nepovolíte.',
		optInTitle: 'Vaše volby ochrany osobních údajů',
		optOutOption: 'Odhlásit se',
		panelExpanded: 'Zobrazeny další možnosti.',
		policyColumn: 'Zásady ochrany osobních údajů',
		preferencesClose: 'Zavřít předvolby',
		preferencesOnCount: 'Zapnuto: {count}',
		preferencesSheetIntro: 'Změny platí okamžitě.',
		preferencesSummary: 'Funkce webu a analytika',
		preferencesTitle: 'Předvolby',
		purposeColumn: 'Účel',
		receiptAllowed: 'Povoleno: {rights}',
		receiptDetails: 'Podrobnosti',
		receiptFromGpc: 'podle vašeho signálu Global Privacy Control',
		receiptLive:
			'Respektujeme signál Global Privacy Control z tohoto prohlížeče',
		receiptLiveDetail: 'Načítá se z vašeho prohlížeče při každé návštěvě.',
		receiptOptedOut: 'Odhlášeno: {rights}',
		receiptRecorded: 'Zaznamenáno: {date}',
		receiptReference: 'Reference',
		receiptSavedAccount: 'Uloženo ve vašem účtu · {date}',
		receiptSavedBrowser: 'Uloženo pro tento prohlížeč · {date}',
		receiptScopeAccount: 'Platí pro tento prohlížeč a váš účet {business}.',
		receiptScopeAccountUnnamed: 'Platí pro tento prohlížeč a váš účet.',
		receiptScopeBrowser:
			'Platí pro tento prohlížeč. Po přihlášení to můžete použít i pro svůj účet.',
		receiptViaGpc: 'Signál Global Privacy Control',
		referenceCopied: 'Reference zkopírována.',
		refuseAll:
			'nebude prodávat ani sdílet vaše osobní údaje ani je používat pro cílenou reklamu',
		refuseSaleAndShare: 'nebude prodávat ani sdílet vaše osobní údaje',
		refuseSaleAndTargetedAds:
			'nebude prodávat vaše osobní údaje ani je používat pro cílenou reklamu',
		rejectAll: 'Odmítnout vše',
		rightsAllowed: '{rights}: povoleno.',
		rightsNotAllowed: '{rights}: nepovoleno.',
		rightsOptedOut: 'Odhlášeno: {rights}.',
		saleAllowed: '{business} může {rights}.',
		saleGroupOptIn: 'Povolit: {rights}',
		saleGroupSaleAndTargetedAds:
			'Odhlásit se z prodeje mých osobních údajů a z cílené reklamy',
		saleOffByDefault:
			'Ve výchozím nastavení vypnuto. {business} {rights}, pokud to nepovolíte.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Uložit volby',
		saveInSettings: 'Uložte své volby v Nastavení soukromí',
		savedAutomatically: 'Ukládá se automaticky',
		savedCue: 'Uloženo',
		scopeAccount: 'v tomto prohlížeči ani ve vašem účtu {business}',
		scopeAccountUnnamed: 'v tomto prohlížeči ani ve vašem účtu',
		scopeBrowser: 'v tomto prohlížeči',
		shortAll: 'prodávat nebo sdílet vaše údaje pro reklamu',
		shortSaleAndShare: 'prodávat nebo sdílet vaše údaje',
		shortSaleAndTargetedAds: 'prodávat vaše údaje nebo je používat pro reklamu',
		stateOff: 'Vypnuto',
		stateOn: 'Zapnuto',
		switchColumn: 'Zapnuto',
		switchedOff: '{name}: vypnuto.',
		switchedOn: '{name}: zapnuto.',
		titleAll: 'Prodej, sdílení a cílená reklama',
		titleSaleAndShare: 'Prodej a sdílení',
		titleSaleAndTargetedAds: 'Prodej a cílená reklama',
		vendorColumn: 'Partner',
		vendorPolicy: 'Zásady ochrany osobních údajů: {vendor}',
		vendorsClose: 'Zavřít partnery: {category}',
		vendorsFor: 'pro kategorii {category}',
		vendorsHide: 'Skrýt partnery ({count})',
		vendorsHideOne: 'Skrýt 1 partnera',
		vendorsOnCount: 'Zapnuto: {count}',
		vendorsTable: 'Partneři: {category}',
		vendorsView: 'Zobrazit partnery ({count})',
		vendorsViewOne: 'Zobrazit 1 partnera',
	},
	rights: {
		californiaPrivacyChoices: 'Vaše volby ochrany osobních údajů v Kalifornii',
		optOut: 'Neprodávejte ani nesdílejte moje údaje',
		preferences: 'Spravovat předvolby',
		privacyChoices: 'Vaše volby ochrany osobních údajů',
	},
};
export default translations;
