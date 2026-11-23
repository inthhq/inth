import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Összes elfogadása',
		acknowledge: 'OK',
		close: 'Bezárás',
		customize: 'Testreszabás',
		dismiss: 'Bezárás',
		rejectAll: 'Összes elutasítása',
		save: 'Beállítások mentése',
		securedBy: 'Hozzájárulás-kezelés:',
	},
	consentGate: {
		actionButton: 'A(z) {category} hozzájárulás engedélyezése',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title:
			'Fogadja el a(z) {category} hozzájárulást a tartalom megtekintéséhez.',
	},
	consentManagerDialog: {
		description:
			'Testreszabhatja adatvédelmi beállításait itt. Kiválaszthatja, hogy milyen típusú sütiket és nyomkövető technológiákat engedélyez.',
		title: 'Adatvédelmi beállítások',
		vendors: {
			disabledByCategory:
				'Kapcsolja be ezt a kategóriát a szolgáltatók kiválasztásához.',
			privacyPolicy: 'Adatvédelmi szabályzat',
			switchLabel: '{vendor} engedélyezése',
			title: 'Szolgáltatók ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Ezek a sütik segítenek jobb felhasználói élményt nyújtani és új funkciókat tesztelni.',
			title: 'Felhasználói élmény',
		},
		functionality: {
			description:
				'Ezek a sütik lehetővé teszik a weboldal továbbfejlesztett funkcióit és személyre szabását.',
			title: 'Funkcionalitás',
		},
		marketing: {
			description:
				'Ezeket a sütiket releváns hirdetések megjelenítésére és hatékonyságuk nyomon követésére használjuk.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Ezek a sütik segítenek megérteni, hogyan lépnek kapcsolatba a látogatók a weboldallal, és javítják annak teljesítményét.',
			title: 'Analitika',
		},
		necessary: {
			description:
				'Ezek a sütik elengedhetetlenek a weboldal megfelelő működéséhez, és nem kapcsolhatók ki.',
			title: 'Feltétlenül szükséges',
		},
	},
	cookieBanner: {
		description:
			'Ez a webhely sütiket használ a böngészési élmény javítására, a forgalom elemzésére és személyre szabott tartalom megjelenítésére.',
		noticeDescription:
			'Sütiket és hasonló technológiákat használunk a webhely működtetéséhez, a forgalom méréséhez, valamint a tartalom és a hirdetések személyre szabásához. Bármikor leiratkozhat, vagy kezelheti a beállításait.',
		noticeTitle: 'Adatvédelmi tájékoztató',
		title: 'Értékeljük az adatvédelmet',
	},
	iab: {
		app: {
			consentStorage:
				'Választásait ezen az eszközön tároljuk, az alkalmazás szokásos beállítás-tárolójában IABTCF kulcsok alatt, legfeljebb {days} napig. A tárolási időtartam megújul, amikor Ön frissíti a választásait.',
			description:
				'Mi és a(z) {partnerCount} partnerünk információkat tárolunk az Ön eszközén és/vagy érünk el azokhoz, valamint személyes adatokat, például egyedi azonosítókat és böngészési adatokat dolgozunk fel ebben az alkalmazásban a következő célokból:',
			legitimateInterestExplanation:
				'Néhány partner a jogos érdekére hivatkozva dolgoz fel személyes adatokat, például egyedi azonosítókat és böngészési adatokat, ahelyett hogy hozzájárulást kérne. Ez csak erre az alkalmazásra vonatkozik. Önnek joga van tiltakozni ez ellen az adatkezelés ellen minden egyes cél és minden egyes partner esetében.',
			scopeServiceSpecific:
				'Az Ön hozzájárulása csak erre az alkalmazásra vonatkozik, és nem érinti más szolgáltatásokat.',
			withdraw:
				'Választásait bármikor módosíthatja, vagy visszavonhatja hozzájárulását az alkalmazás Adatvédelmi beállítások menüjében.',
		},
		banner: {
			andMore: 'És még {count}...',
			description:
				'Mi és a(z) {partnerCount} partnerünk információkat tárolunk az Ön eszközén és/vagy érünk el azokhoz, valamint személyes adatokat, például egyedi azonosítókat és böngészési adatokat dolgozunk fel ezen a weboldalon a következő célokból:',
			legitimateInterestNotice:
				'Néhány partner jogos érdekre hivatkozik az Ön adatainak feldolgozásához. Önnek joga van tiltakozni ez ellen a feldolgozás ellen, testreszabni választásait, és bármikor visszavonni hozzájárulását.',
			partnersLink: '{count} partner',
			scopeGroup:
				'A választása az ebben a csoportban lévő összes weboldalunkra vonatkozik.',
			scopeServiceSpecific:
				'Az Ön hozzájárulása csak erre a webhelyre vonatkozik, és nem érinti más szolgáltatásokat.',
			title: 'Adatvédelmi beállítások',
		},
		common: {
			acceptAll: 'Összes elfogadása',
			clearSelection: 'Törlés',
			customPartner: 'IAB-n kívüli egyedi partner',
			customize: 'Testreszabás',
			loading: 'Betöltés...',
			rejectAll: 'Összes elutasítása',
			saveSettings: 'Beállítások mentése',
			showingSelectedVendor: 'A kiválasztott szolgáltató megjelenítése',
		},
		preferenceCenter: {
			description:
				'Testreszabhatja adatvédelmi beállításait itt. Kiválaszthatja, hogy milyen típusú sütiket és nyomkövető technológiákat engedélyez.',
			features: {
				description:
					'Ezek az adatkezelési módok kizárólag egy vagy több olyan cél érdekében használhatók fel, amelyekre vonatkozóan Önnek választási lehetősége van a jelen közleményben.',
				title: 'Funkciók',
			},
			footer: {
				consentStorage:
					'A hozzájárulási beállításokat egy "euconsent-v2" nevű sütiben tároljuk 13 hónapig. A tárolási időtartam megújulhat, amikor Ön frissíti a beállításait.',
			},
			purposeItem: {
				examples: 'Példák',
				legitimateInterest: 'Jogos érdek',
				objectButton: 'Tiltakozás',
				objected: 'Tiltakozott',
				partners: '{count} partner',
				partnersUsingPurpose: 'Ezt a célt használó partnerek',
				rightToObject:
					'Önnek joga van tiltakozni a jogos érdeken alapuló adatkezelés ellen.',
				vendorsUseLegitimateInterest:
					'{count} szolgáltató jogos érdekre hivatkozik',
				withYourPermission: 'Az Ön engedélyével',
			},
			specialPurposes: {
				title: 'Alapvető funkciók (szükséges)',
				tooltip:
					'Ezek a webhely működéséhez és biztonságához szükségesek. Az IAB TCF szerint Ön nem tiltakozhat ezen különleges célok ellen.',
			},
			tabs: {
				purposes: 'Célok',
				vendors: 'Szolgáltatók',
			},
			title: 'Adatvédelmi beállítások',
			vendorList: {
				adTechProvidersHeading: 'Google hirdetéstechnológiai szolgáltatók',
				adTechProvidersNotice:
					'A Google ezekkel a hirdetéstechnológiai szolgáltatókkal az IAB keretrendszerén kívül dolgozik együtt. Az Ön hozzájárulása csak akkor jut el egy szolgáltatóhoz, ha bekapcsolja, és emellett engedélyezi az információk tárolását az eszközén, valamint a személyre szabott hirdetéseket.',
				customVendorsHeading: 'Egyedi partnerek',
				customVendorsNotice:
					'Ezek olyan egyedi partnerek, akik nincsenek regisztrálva az IAB Transparency & Consent Framework (TCF) rendszerében. Az Ön hozzájárulása alapján kezelik az adatokat, és az IAB-regisztrált szolgáltatóktól eltérő adatvédelmi gyakorlatot folytathatnak.',
				dataCategories: 'Adatkategóriák',
				features: 'Funkciók',
				iabVendorsHeading: 'IAB regisztrált szolgáltatók',
				iabVendorsNotice:
					'Ezek a partnerek regisztrálva vannak az IAB Transparency & Consent Framework (TCF) rendszerében, amely a hozzájárulások kezelésének iparági szabványa',
				legitimateInterest: 'Jogos érdek',
				maxAge: 'Max. élettartam: {days} nap',
				nonCookieAccess: 'Nem süti alapú hozzáférés',
				privacyPolicy: 'Adatvédelmi szabályzat',
				purposes: 'Célok',
				requiredNotice: 'A webhely működéséhez szükséges, nem kapcsolható ki',
				retention: 'Megőrzés: {days} nap',
				search: 'Szolgáltatók keresése...',
				showingCount: '{total} szolgáltatóból {filtered} megjelenítése',
				specialFeatures: 'Különleges funkciók',
				specialPurposes: 'Különleges célok',
				storageDisclosure: 'Tárolási tájékoztató',
				usesCookies: 'Sütiket használ',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Süti szabályzat',
		privacyPolicy: 'Adatvédelmi szabályzat',
		termsOfService: 'Felhasználási feltételek',
	},
	optOut: {
		action: 'Leiratkozás',
		description:
			'Ez az oldal nem adja el és nem osztja meg személyes adataidat, választásodat pedig ebben a böngészőben mentettük.',
		done: 'Kész',
		headingAll:
			'Személyes adatainak értékesítése és megosztása, valamint célzott hirdetések',
		headingSaleAndShare: 'Személyes adatainak értékesítése és megosztása',
		headingSaleAndTargetedAds:
			'Személyes adatainak értékesítése és célzott hirdetések',
		lockedByAccount:
			'Fiókod leiratkozott, és ezt bejelentkezés után módosíthatod.',
		lockedByGpc:
			'A böngésződ Global Privacy Control jelzése be van kapcsolva, ezért ez kikapcsolva marad.',
		notOptedOut: 'Ebben a böngészőben még nem iratkozott le.',
		optInCancel: 'Maradjon letiltva',
		optInConfirm: 'Újbóli engedélyezés',
		optInDescription:
			'A megerősítés megszünteti a letiltást ebben a böngészőben.',
		optInDescriptionWithRights:
			'A megerősítés megszünteti a letiltást a következőkre ebben a böngészőben: {rights}.',
		optInLink: 'Újbóli engedélyezés…',
		optInTitle: 'Újra engedélyezi?',
		receiptAccount: 'Leiratkoztál ebben a böngészőben és a fiókodban.',
		receiptAccountWithRights:
			'Leiratkoztál a következőkről ebben a böngészőben és a fiókodban: {rights}.',
		receiptBrowser: 'Leiratkoztál ebben a böngészőben.',
		receiptBrowserWithRights:
			'Leiratkoztál a következőkről ebben a böngészőben: {rights}.',
		recordedLabel: 'Rögzítve',
		referenceLabel: 'Hivatkozás',
		rightsAll: 'értékesítés, megosztás és célzott hirdetés',
		rightsSaleAndShare: 'értékesítés és megosztás',
		rightsSaleAndTargetedAds: 'értékesítés és célzott hirdetés',
		statusRequest: 'Leiratkozási kérelem teljesítve',
		statusSignal: 'Leiratkozási preferenciajelzés teljesítve',
	},
	privacyChoices: {
		acceptAll: 'Összes elfogadása',
		advertisingFollowsSale: 'A hirdetésekre a fenti választása érvényes.',
		advertisingTitle: 'Hirdetések',
		allow: 'Engedélyezés',
		alwaysOn: 'Mindig bekapcsolva',
		announceSaved: '{message} Mentve.',
		askAll:
			'eladhatja vagy megoszthatja a személyes adatait, célzott hirdetésekhez is',
		askSaleAndShare: 'eladhatja vagy megoszthatja a személyes adatait',
		askSaleAndTargetedAds:
			'eladhatja a személyes adatait, vagy felhasználhatja őket célzott hirdetésekhez',
		bannerAllowedRightsOff:
			'Az opcionális sütik engedélyezve. {rights}: továbbra is kikapcsolva. Ezt „Az Ön adatvédelmi beállításai” részben módosíthatja.',
		bannerAllowedRightsOffGpc:
			'Az opcionális sütik engedélyezve. {rights}: a Global Privacy Control jelzése miatt továbbra is kikapcsolva. Ezt „Az Ön adatvédelmi beállításai” részben módosíthatja.',
		bannerRejected:
			'Az opcionális sütik elutasítva. Ezt „Az Ön adatvédelmi beállításai” részben módosíthatja.',
		barDescription:
			'Sütiket használunk a felhasználói élmény javításához és a forgalom elemzéséhez.',
		businessFallback: 'ez a webhely',
		choiceRecorded: 'A választását rögzítettük.',
		choicesSaved:
			'A beállításokat mentettük. „Az Ön adatvédelmi beállításai” részben módosíthatja őket.',
		choose: 'Választás',
		chooseWhatToAllow: 'Válassza ki, mit engedélyez',
		close: 'Bezárás',
		confirmDescriptionOptIn: '{business} {rights}. Ezt bármikor módosíthatja.',
		confirmDescriptionOptOut:
			'{business} {rights}. Bármikor újra leiratkozhat.',
		confirmKeepOptedOut: 'Maradjon letiltva',
		confirmTitleOptIn: 'Engedélyezi a következőket: {rights}?',
		confirmTitleOptOut: 'Újra engedélyezi a következőket: {rights}?',
		copyFailed:
			'A másolás nem sikerült. Jelölje ki és másolja ki a hivatkozását:',
		copyFailedAnnouncement:
			'A másolás nem sikerült. A teljes hivatkozás a visszaigazolásban látható.',
		copyReference: 'Hivatkozás másolása',
		dialogIntro: 'A választásai azonnal érvénybe lépnek.',
		dialogTitle: 'Az Ön adatvédelmi beállításai',
		done: 'Kész',
		dontAllow: 'Tiltás',
		euDialogIntro:
			'Válassza ki, mely opcionális sütiket használhatja {business}. Az opcionális sütik kikapcsolva maradnak, amíg be nem kapcsolja őket.',
		euDialogTitle: 'Adatvédelmi beállítások',
		gpcNote:
			'A böngészője Global Privacy Control jelzést küldött, ezért {business} {rights} {scope}. Amíg a jelzés be van kapcsolva, az Engedélyezés nem választható.',
		justNow: 'az imént',
		nestedSheetNote:
			'A módosítások akkor lépnek érvénybe, amikor menti őket az Adatvédelmi beállításokban.',
		noticeBarDescription:
			'Sütiket használunk a webhely működtetéséhez, a forgalom méréséhez és a hirdetések személyre szabásához. Bármikor leiratkozhat.',
		noticeBarDescriptionGpc:
			'Sütiket használunk a webhely működtetéséhez és a forgalom méréséhez. A Global Privacy Control jelzését figyelembe vesszük.',
		noticeGpcHonored:
			'A böngészője Global Privacy Control jelzését figyelembe vesszük.',
		noticeRightsAction: 'Ne adják el és ne osszák meg az adataimat',
		nudge: 'Előbb válasszon a két gomb közül.',
		optInBarDescription:
			'{business} engedélyt kér, mielőtt opcionális sütiket használna, illetve {rights}.',
		optInDescription:
			'Ha engedélyezi, {business} opcionális sütiket használ a webhely funkcióihoz és az elemzéshez, továbbá {rights}. Semmi sem kapcsol be, amíg Ön nem engedélyezi.',
		optInTitle: 'Az Ön adatvédelmi beállításai',
		optOutOption: 'Leiratkozás',
		panelExpanded: 'További lehetőségek láthatók.',
		policyColumn: 'Adatvédelmi szabályzat',
		preferencesClose: 'Beállítások bezárása',
		preferencesOnCount: '{count} bekapcsolva',
		preferencesSheetIntro: 'A módosítások azonnal érvénybe lépnek.',
		preferencesSummary: 'Webhelyfunkciók és elemzés',
		preferencesTitle: 'Beállítások',
		purposeColumn: 'Cél',
		receiptAllowed: 'Engedélyezve: {rights}',
		receiptDetails: 'Részletek',
		receiptFromGpc: 'a Global Privacy Control jelzése alapján',
		receiptLive:
			'A böngésző Global Privacy Control jelzését figyelembe vesszük',
		receiptLiveDetail: 'Minden látogatáskor a böngészőjéből olvassuk ki.',
		receiptOptedOut: 'Leiratkozás: {rights}',
		receiptRecorded: 'Rögzítve: {date}',
		receiptReference: 'Hivatkozás',
		receiptSavedAccount: 'Mentve a fiókjába · {date}',
		receiptSavedBrowser: 'Mentve ehhez a böngészőhöz · {date}',
		receiptScopeAccount:
			'Erre a böngészőre és az Ön {business}-fiókjára érvényes.',
		receiptScopeAccountUnnamed: 'Erre a böngészőre és a fiókjára érvényes.',
		receiptScopeBrowser:
			'Erre a böngészőre érvényes. Jelentkezzen be, hogy a fiókjára is érvényes legyen.',
		receiptViaGpc: 'Global Privacy Control jelzés',
		referenceCopied: 'Hivatkozás kimásolva.',
		refuseAll:
			'nem adja el és nem osztja meg a személyes adatait, és nem használja fel őket célzott hirdetésekhez',
		refuseSaleAndShare: 'nem adja el és nem osztja meg a személyes adatait',
		refuseSaleAndTargetedAds:
			'nem adja el a személyes adatait, és nem használja fel őket célzott hirdetésekhez',
		rejectAll: 'Összes elutasítása',
		rightsAllowed: '{rights}: engedélyezve.',
		rightsNotAllowed: '{rights}: nincs engedélyezve.',
		rightsOptedOut: 'Leiratkozott a következőkről: {rights}.',
		saleAllowed: '{business} {rights}.',
		saleGroupOptIn: 'Engedélyezés: {rights}',
		saleGroupSaleAndTargetedAds:
			'Leiratkozás a személyes adataim értékesítéséről és a célzott hirdetésekről',
		saleOffByDefault:
			'Alapértelmezés szerint kikapcsolva. {business} {rights}, hacsak Ön nem engedélyezi.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Beállítások mentése',
		saveInSettings: 'Mentse a választásait az Adatvédelmi beállításokban',
		savedAutomatically: 'Automatikusan mentve',
		savedCue: 'Mentve',
		scopeAccount: 'ebben a böngészőben és az Ön {business}-fiókjában',
		scopeAccountUnnamed: 'ebben a böngészőben és a fiókjában',
		scopeBrowser: 'ebben a böngészőben',
		shortAll: 'hirdetési célból eladná vagy megosztaná az adatait',
		shortSaleAndShare: 'eladná vagy megosztaná az adatait',
		shortSaleAndTargetedAds:
			'eladná az adatait, vagy hirdetésekhez használná fel őket',
		stateOff: 'Kikapcsolva',
		stateOn: 'Bekapcsolva',
		switchColumn: 'Bekapcsolva',
		switchedOff: '{name}: kikapcsolva.',
		switchedOn: '{name}: bekapcsolva.',
		titleAll: 'Értékesítés, megosztás és célzott hirdetések',
		titleSaleAndShare: 'Értékesítés és megosztás',
		titleSaleAndTargetedAds: 'Értékesítés és célzott hirdetések',
		vendorColumn: 'Szolgáltató',
		vendorPolicy: 'Adatvédelmi szabályzat: {vendor}',
		vendorsClose: 'Szolgáltatók bezárása: {category}',
		vendorsFor: 'ehhez: {category}',
		vendorsHide: '{count} szolgáltató elrejtése',
		vendorsHideOne: '1 szolgáltató elrejtése',
		vendorsOnCount: '{count} bekapcsolva',
		vendorsTable: 'Szolgáltatók: {category}',
		vendorsView: '{count} szolgáltató megjelenítése',
		vendorsViewOne: '1 szolgáltató megjelenítése',
	},
	rights: {
		californiaPrivacyChoices: 'Az Ön kaliforniai adatvédelmi beállításai',
		optOut: 'Ne adják el és ne osszák meg az adataimat',
		preferences: 'Beállítások kezelése',
		privacyChoices: 'Az Ön adatvédelmi beállításai',
	},
};
export default translations;
