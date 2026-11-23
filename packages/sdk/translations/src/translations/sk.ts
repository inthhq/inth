import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Prijať všetko',
		acknowledge: 'OK',
		close: 'Zavrieť',
		customize: 'Prispôsobiť',
		dismiss: 'Zavrieť',
		rejectAll: 'Odmietnuť všetko',
		save: 'Uložiť nastavenia',
		securedBy: 'Zabezpečuje',
	},
	consentGate: {
		actionButton: 'Povoliť súhlas pre {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title:
			'Prijmite súhlas pre kategóriu {category} na zobrazenie tohto obsahu.',
	},
	consentManagerDialog: {
		description:
			'Prispôsobte si nastavenia súkromia tu. Môžete si vybrať, ktoré typy cookies a sledovacích technológií povolíte.',
		title: 'Nastavenia súkromia',
		vendors: {
			disabledByCategory:
				'Zapnite túto kategóriu, aby ste mohli vybrať dodávateľov.',
			privacyPolicy: 'Zásady ochrany súkromia',
			switchLabel: 'Povoliť {vendor}',
			title: 'Dodávatelia ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Tieto cookies nám pomáhajú poskytovať lepšiu používateľskú skúsenosť a testovať nové funkcie.',
			title: 'Používateľská skúsenosť',
		},
		functionality: {
			description:
				'Tieto cookies umožňujú rozšírenú funkčnosť a personalizáciu webovej stránky.',
			title: 'Funkčnosť',
		},
		marketing: {
			description:
				'Tieto cookies sa používajú na doručovanie relevantných reklám a sledovanie ich účinnosti.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Tieto cookies nám pomáhajú pochopiť, ako návštevníci interagujú s webovou stránkou a zlepšiť jej výkon.',
			title: 'Analytika',
		},
		necessary: {
			description:
				'Tieto cookies sú nevyhnutné pre správne fungovanie webovej stránky a nemožno ich deaktivovať.',
			title: 'Nevyhnutné',
		},
	},
	cookieBanner: {
		description:
			'Táto stránka používa cookies na zlepšenie vášho prehliadania, analýzu návštevnosti a zobrazovanie personalizovaného obsahu.',
		noticeDescription:
			'Používame súbory cookie a podobné technológie na prevádzku tejto stránky, meranie návštevnosti a personalizáciu obsahu a reklám. Kedykoľvek sa môžete odhlásiť alebo spravovať svoje predvoľby.',
		noticeTitle: 'Oznámenie o ochrane súkromia',
		title: 'Vážime si vaše súkromie',
	},
	iab: {
		app: {
			consentStorage:
				'Vaše voľby sú uložené v tomto zariadení, v štandardnom úložisku nastavení aplikácie pod kľúčmi IABTCF, najviac {days} dní. Doba uloženia sa obnoví, keď aktualizujete svoje voľby.',
			description:
				'My a naši {partnerCount} partneri ukladáme a/alebo pristupujeme k informáciám vo vašom zariadení a spracúvame osobné údaje, ako sú jedinečné identifikátory a údaje o prehliadaní, pre túto aplikáciu s cieľom:',
			legitimateInterestExplanation:
				'Niektorí partneri spracúvajú osobné údaje, ako sú jedinečné identifikátory a údaje o prehliadaní, na základe svojho oprávneného záujmu namiesto toho, aby žiadali o súhlas. Týka sa to len tejto aplikácie. Máte právo vzniesť námietku proti tomuto spracúvaniu pre každý účel a každého partnera.',
			scopeServiceSpecific:
				'Váš súhlas platí len pre túto aplikáciu a neovplyvní iné služby.',
			withdraw:
				'Svoje voľby môžete kedykoľvek zmeniť alebo odvolať svoj súhlas v Nastaveniach súkromia v tejto aplikácii.',
		},
		banner: {
			andMore: 'A ďalších {count}...',
			description:
				'My a naši {partnerCount} partneri ukladáme a/alebo pristupujeme k informáciám vo vašom zariadení a spracúvame osobné údaje, ako sú jedinečné identifikátory a údaje o prehliadaní, pre túto webovú stránku s cieľom:',
			legitimateInterestNotice:
				'Niektorí partneri si uplatňujú oprávnený záujem na spracúvanie vašich údajov. Máte právo vzniesť námietku proti tomuto spracúvaniu, prispôsobiť svoje voľby a kedykoľvek odvolať svoj súhlas.',
			partnersLink: '{count} partneri',
			scopeGroup: 'Vaša voľba platí pre všetky naše weby v tejto skupine.',
			scopeServiceSpecific:
				'Váš súhlas platí len pre túto webovú stránku a neovplyvní iné služby.',
			title: 'Nastavenia súkromia',
		},
		common: {
			acceptAll: 'Prijať všetko',
			clearSelection: 'Vymazať',
			customPartner: 'Vlastný partner neregistrovaný v IAB',
			customize: 'Prispôsobiť',
			loading: 'Načítava sa...',
			rejectAll: 'Odmietnuť všetko',
			saveSettings: 'Uložiť nastavenia',
			showingSelectedVendor: 'Zobrazenie vybraného dodávateľa',
		},
		preferenceCenter: {
			description:
				'Prispôsobte si nastavenia súkromia tu. Môžete si vybrať, ktoré typy cookies a sledovacích technológií povolíte.',
			features: {
				description:
					'Tieto spôsoby spracúvania možno použiť výlučne na dosiahnutie jedného alebo viacerých účelov, z ktorých si môžete zvoliť v tomto oznámení.',
				title: 'Funkcie',
			},
			footer: {
				consentStorage:
					'Predvoľby súhlasu sú uložené v cookie s názvom "euconsent-v2" po dobu 13 mesiacov. Doba uloženia sa môže obnoviť, keď aktualizujete svoje predvoľby.',
			},
			purposeItem: {
				examples: 'Príklady',
				legitimateInterest: 'Oprávnený záujem',
				objectButton: 'Vzniesť námietku',
				objected: 'Námietka vznesená',
				partners: '{count} partneri',
				partnersUsingPurpose: 'Partneri využívajúci tento účel',
				rightToObject:
					'Máte právo vzniesť námietku proti spracúvaniu založenému na oprávnenom záujme.',
				vendorsUseLegitimateInterest:
					'{count} dodávatelia si uplatňujú oprávnený záujem',
				withYourPermission: 'S vaším povolením',
			},
			specialPurposes: {
				title: 'Základné funkcie (povinné)',
				tooltip:
					'Tieto sú potrebné pre funkčnosť a bezpečnosť stránky. Podľa IAB TCF nemôžete vzniesť námietku proti týmto osobitným účelom.',
			},
			tabs: {
				purposes: 'Účely',
				vendors: 'Dodávatelia',
			},
			title: 'Nastavenia súkromia',
			vendorList: {
				adTechProvidersHeading: 'Poskytovatelia reklamných technológií Google',
				adTechProvidersNotice:
					'Google spolupracuje s týmito poskytovateľmi reklamných technológií mimo rámca IAB. Váš súhlas sa k poskytovateľovi dostane, len ak ho zapnete a zároveň povolíte ukladanie informácií vo vašom zariadení a personalizovanú reklamu.',
				customVendorsHeading: 'Vlastní partneri',
				customVendorsNotice:
					'Toto sú vlastní partneri, ktorí nie sú registrovaní v rámci IAB Transparency & Consent Framework (TCF). Spracúvajú údaje na základe vášho súhlasu a môžu mať iné postupy ochrany súkromia ako dodávatelia registrovaní v IAB.',
				dataCategories: 'Kategórie údajov',
				features: 'Funkcie',
				iabVendorsHeading: 'Dodávatelia registrovaní v IAB',
				iabVendorsNotice:
					'Títo partneri sú registrovaní v rámci IAB Transparency & Consent Framework (TCF), priemyselného štandardu pre správu súhlasu',
				legitimateInterest: 'Opráv. záujem',
				maxAge: 'Max. vek: {days}d',
				nonCookieAccess: 'Prístup bez cookies',
				privacyPolicy: 'Zásady ochrany súkromia',
				purposes: 'Účely',
				requiredNotice: 'Vyžaduje sa pre funkčnosť stránky, nemožno zakázať',
				retention: 'Uchovávanie: {days}d',
				search: 'Hľadať dodávateľov...',
				showingCount: 'Zobrazuje sa {filtered} z {total} dodávateľov',
				specialFeatures: 'Osobitné funkcie',
				specialPurposes: 'Osobitné účely',
				storageDisclosure: 'Zverejnenie informácií o ukladaní',
				usesCookies: 'Používa cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Zásady používania súborov cookie',
		privacyPolicy: 'Zásady ochrany osobných údajov',
		termsOfService: 'Podmienky používania služby',
	},
	optOut: {
		action: 'Odhlásiť sa',
		description:
			'Táto stránka nebude predávať ani zdieľať vaše osobné údaje a vaša voľba je uložená v tomto prehliadači.',
		done: 'Hotovo',
		headingAll: 'Predaj a zdieľanie vašich osobných údajov a cielená reklama',
		headingSaleAndShare: 'Predaj a zdieľanie vašich osobných údajov',
		headingSaleAndTargetedAds:
			'Predaj vašich osobných údajov a cielená reklama',
		lockedByAccount: 'Váš účet sa odhlásil a po prihlásení to môžete zmeniť.',
		lockedByGpc:
			'Signál Global Privacy Control vo vašom prehliadači je zapnutý, takže toto zostáva vypnuté.',
		notOptedOut: 'V tomto prehliadači ste sa nezahlásili na odhlásenie.',
		optInCancel: 'Zostať odhlásený',
		optInConfirm: 'Znova sa prihlásiť',
		optInDescription:
			'Potvrdením ukončíte svoje odhlásenie v tomto prehliadači.',
		optInDescriptionWithRights:
			'Potvrdením ukončíte svoje odhlásenie z {rights} v tomto prehliadači.',
		optInLink: 'Znova sa prihlásiť…',
		optInTitle: 'Znova sa prihlásiť?',
		receiptAccount: 'Ste odhlásení v tomto prehliadači a vo svojom účte.',
		receiptAccountWithRights:
			'Ste odhlásení z {rights} v tomto prehliadači a vo svojom účte.',
		receiptBrowser: 'Ste odhlásení v tomto prehliadači.',
		receiptBrowserWithRights: 'Ste odhlásení z {rights} v tomto prehliadači.',
		recordedLabel: 'Zaznamenané',
		referenceLabel: 'Referencia',
		rightsAll: 'predaja, zdieľania a cielenej reklamy',
		rightsSaleAndShare: 'predaja a zdieľania',
		rightsSaleAndTargetedAds: 'predaja a cielenej reklamy',
		statusRequest: 'Žiadosť o odhlásenie bola splnená',
		statusSignal: 'Signál predvoľby odhlásenia bol splnený',
	},
	rights: {
		californiaPrivacyChoices: 'Vaše voľby ochrany súkromia v Kalifornii',
		optOut: 'Nepredávajte ani nezdieľajte moje údaje',
		preferences: 'Spravovať predvoľby',
		privacyChoices: 'Vaše voľby ochrany súkromia',
	},
};
export default translations;
