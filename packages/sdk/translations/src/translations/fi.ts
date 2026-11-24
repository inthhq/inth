import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Hyväksy kaikki',
		acknowledge: 'OK',
		close: 'Sulje',
		customize: 'Mukauta',
		dismiss: 'Sulje',
		rejectAll: 'Hylkää kaikki',
		save: 'Tallenna asetukset',
		securedBy: 'Suostumuksen tarjoaa',
	},
	consentGate: {
		actionButton: 'Ota {category} käyttöön',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Hyväksy {category}, jotta voit tarkastella tätä sisältöä.',
	},
	consentManagerDialog: {
		description:
			'Mukauta yksityisyysasetuksiasi täällä. Voit valita, minkä tyyppiset evästeet ja seurantatekniikat sallit.',
		title: 'Tietosuoja-asetukset',
		vendors: {
			disabledByCategory: 'Ota tämä luokka käyttöön valitaksesi kumppanit.',
			privacyPolicy: 'Tietosuojakäytäntö',
			switchLabel: 'Salli {vendor}',
			title: 'Kumppanit ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Nämä evästeet auttavat meitä tarjoamaan paremman käyttökokemuksen ja testaamaan uusia ominaisuuksia.',
			title: 'Kokemus',
		},
		functionality: {
			description:
				'Nämä evästeet mahdollistavat verkkosivuston tehostetun toiminnallisuuden ja personoinnin.',
			title: 'Toiminnallisuus',
		},
		marketing: {
			description:
				'Näitä evästeitä käytetään relevanttien mainosten lähettämiseen ja niiden tehokkuuden seurantaan.',
			title: 'Markkinointi',
		},
		measurement: {
			description:
				'Nämä evästeet auttavat meitä ymmärtämään, miten kävijät ovat vuorovaikutuksessa verkkosivuston kanssa, ja parantamaan sen suorituskykyä.',
			title: 'Analytiikka',
		},
		necessary: {
			description:
				'Nämä evästeet ovat välttämättömiä, jotta verkkosivusto toimisi oikein, eikä niitä voi poistaa käytöstä.',
			title: 'Ehdottoman tarpeellinen',
		},
	},
	cookieBanner: {
		description:
			'Tämä sivusto käyttää evästeitä parantaakseen selauskokemustasi, analysoidakseen sivuston liikennettä ja näyttääkseen yksilöllistä sisältöä.',
		noticeDescription:
			'Käytämme evästeitä ja vastaavia tekniikoita sivuston toimintaan, liikenteen mittaamiseen sekä sisällön ja mainosten yksilöimiseen. Voit kieltäytyä tai hallita asetuksiasi milloin tahansa.',
		noticeTitle: 'Tietosuojailmoitus',
		title: 'Arvostamme yksityisyyttäsi',
	},
	iab: {
		app: {
			consentStorage:
				'Valintasi tallennetaan tähän laitteeseen sovelluksen tavalliseen asetustallennustilaan IABTCF-avainten alle enintään {days} päiväksi. Säilytysaika alkaa alusta, kun päivität valintojasi.',
			description:
				'Me ja {partnerCount} kumppaniamme tallennamme ja/tai käytämme tietoja laitteellasi ja käsittelemme henkilötietoja, kuten yksilöllisiä tunnisteita ja selaustietoja, tässä sovelluksessa seuraaviin tarkoituksiin:',
			legitimateInterestExplanation:
				'Jotkut kumppanit käsittelevät henkilötietoja, kuten yksilöllisiä tunnisteita ja selaustietoja, oikeutetun etunsa perusteella pyytämättä suostumusta. Tämä koskee vain tätä sovellusta. Sinulla on oikeus vastustaa tätä käsittelyä jokaisen käyttötarkoituksen ja jokaisen kumppanin osalta.',
			scopeServiceSpecific:
				'Suostumuksesi koskee vain tätä sovellusta eikä vaikuta muihin palveluihin.',
			withdraw:
				'Voit muuttaa valintojasi tai peruuttaa suostumuksesi milloin tahansa tämän sovelluksen Tietosuoja-asetuksista.',
		},
		banner: {
			andMore: 'Ja {count} muuta...',
			description:
				'Me ja {partnerCount} kumppaniamme tallennamme ja/tai käytämme tietoja laitteellasi ja käsittelemme henkilötietoja, kuten yksilöllisiä tunnisteita ja selaustietoja, tällä verkkosivustolla seuraaviin tarkoituksiin:',
			legitimateInterestNotice:
				'Jotkut kumppanit vetoavat oikeutettuun etuun tietojesi käsittelyssä. Sinulla on oikeus vastustaa tätä käsittelyä, mukauttaa valintojasi ja peruuttaa suostumuksesi milloin tahansa.',
			partnersLink: '{count} kumppania',
			scopeGroup: 'Valintasi koskee kaikkia verkkosivujamme tässä ryhmässä.',
			scopeServiceSpecific:
				'Suostumuksesi koskee vain tätä verkkosivustoa eikä vaikuta muihin palveluihin.',
			title: 'Tietosuoja-asetukset',
		},
		common: {
			acceptAll: 'Hyväksy kaikki',
			clearSelection: 'Tyhjennä',
			customPartner: 'Mukautettu kumppani, joka ei ole rekisteröitynyt IAB:hen',
			customize: 'Mukauta',
			loading: 'Ladataan...',
			rejectAll: 'Hylkää kaikki',
			saveSettings: 'Tallenna asetukset',
			showingSelectedVendor: 'Näytetään valittu toimittaja',
		},
		preferenceCenter: {
			description:
				'Mukauta yksityisyysasetuksiasi täällä. Voit valita, minkä tyyppiset evästeet ja seurantatekniikat sallit.',
			features: {
				description:
					'Näitä käsittelytapoja voidaan käyttää ainoastaan yhteen tai useampaan tarkoitukseen, joihin sinulle on tässä ilmoituksessa annettu mahdollisuus.',
				title: 'Ominaisuudet',
			},
			footer: {
				consentStorage:
					'Suostumusasetukset tallennetaan evästeeseen nimeltä "euconsent-v2" 13 kuukaudeksi. Säilytysaika voi alkaa alusta, kun päivität asetuksiasi.',
			},
			purposeItem: {
				examples: 'Esimerkit',
				legitimateInterest: 'Oikeutettu etu',
				objectButton: 'Vastusta',
				objected: 'Vastustettu',
				partners: '{count} kumppania',
				partnersUsingPurpose: 'Tätä käyttötarkoitusta käyttävät kumppanit',
				rightToObject:
					'Sinulla on oikeus vastustaa oikeutettuun etuun perustuvaa käsittelyä.',
				vendorsUseLegitimateInterest:
					'{count} kumppania vetoaa oikeutettuun etuun',
				withYourPermission: 'Luvallasi',
			},
			specialPurposes: {
				title: 'Välttämättömät toiminnot (pakollinen)',
				tooltip:
					'Nämä ovat välttämättömiä sivuston toimivuuden ja turvallisuuden kannalta. IAB TCF:n mukaan et voi vastustaa näitä erityisiä käyttötarkoituksia.',
			},
			tabs: {
				purposes: 'Käyttötarkoitukset',
				vendors: 'Kumppanit',
			},
			title: 'Tietosuoja-asetukset',
			vendorList: {
				adTechProvidersHeading: 'Googlen mainosteknologian tarjoajat',
				adTechProvidersNotice:
					'Google tekee yhteistyötä näiden mainosteknologian tarjoajien kanssa IAB-kehyksen ulkopuolella. Suostumuksesi välittyy tarjoajalle vain, jos otat sen käyttöön ja sallit myös tietojen tallentamisen laitteellesi ja yksilöidyn mainonnan.',
				customVendorsHeading: 'Mukautetut kumppanit',
				customVendorsNotice:
					'Nämä ovat mukautettuja kumppaneita, jotka eivät ole rekisteröityneet IAB Transparency & Consent Framework (TCF) -järjestelmään. Ne käsittelevät tietoja suostumuksesi perusteella, ja niillä voi olla erilaiset tietosuojakäytännöt kuin IAB:hen rekisteröityneillä toimittajilla.',
				dataCategories: 'Tietoluokat',
				features: 'Ominaisuudet',
				iabVendorsHeading: 'IAB-rekisteröidyt kumppanit',
				iabVendorsNotice:
					'Nämä kumppanit on rekisteröity IAB Transparency & Consent Framework (TCF) -järjestelmään, joka on alan standardi suostumusten hallintaan',
				legitimateInterest: 'Oikeutettu etu',
				maxAge: 'Enimmäisikä: {days} pv',
				nonCookieAccess: 'Muu kuin evästepohjainen käyttö',
				privacyPolicy: 'Tietosuojakäytäntö',
				purposes: 'Tarkoitukset',
				requiredNotice:
					'Vaaditaan sivuston toiminnallisuuden vuoksi, ei voi poistaa käytöstä',
				retention: 'Säilytys: {days} pv',
				search: 'Hae kumppaneita...',
				showingCount: '{filtered}/{total} kumppania',
				specialFeatures: 'Erikoisominaisuudet',
				specialPurposes: 'Erityistarkoitukset',
				storageDisclosure: 'Tallennustietojen julkistaminen',
				usesCookies: 'Käyttää evästeitä',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Evästekäytäntö',
		privacyPolicy: 'Tietosuojakäytäntö',
		termsOfService: 'Käyttöehdot',
	},
	optOut: {
		action: 'Kieltäydy',
		description:
			'Tämä sivusto ei myy eikä jaa henkilötietojasi, ja valintasi on tallennettu tähän selaimeen.',
		done: 'Valmis',
		headingAll: 'Henkilötietojesi myynti, jakaminen ja kohdennettu mainonta',
		headingSaleAndShare: 'Henkilötietojesi myynti ja jakaminen',
		headingSaleAndTargetedAds:
			'Henkilötietojesi myynti ja kohdennettu mainonta',
		lockedByAccount:
			'Tilisi on kieltäytynyt, ja voit muuttaa tätä kirjauduttuasi sisään.',
		lockedByGpc:
			'Selaimesi Global Privacy Control -signaali on päällä, joten tämä pysyy poissa käytöstä.',
		notOptedOut: 'Et ole kieltäytynyt tässä selaimessa.',
		optInCancel: 'Pysy kieltäytyneenä',
		optInConfirm: 'Salli uudelleen',
		optInDescription: 'Vahvistaminen päättää kieltäytymisesi tässä selaimessa.',
		optInDescriptionWithRights:
			'Vahvistaminen päättää kieltäytymisesi kohteesta {rights} tässä selaimessa.',
		optInLink: 'Salli uudelleen…',
		optInTitle: 'Sallitaanko uudelleen?',
		receiptAccount: 'Olet kieltäytynyt tässä selaimessa ja tililläsi.',
		receiptAccountWithRights:
			'Olet kieltäytynyt kohteesta {rights} tässä selaimessa ja tililläsi.',
		receiptBrowser: 'Olet kieltäytynyt tässä selaimessa.',
		receiptBrowserWithRights:
			'Olet kieltäytynyt kohteesta {rights} tässä selaimessa.',
		recordedLabel: 'Tallennettu',
		referenceLabel: 'Viite',
		rightsAll: 'myynti, jakaminen ja kohdennettu mainonta',
		rightsSaleAndShare: 'myynti ja jakaminen',
		rightsSaleAndTargetedAds: 'myynti ja kohdennettu mainonta',
		statusRequest: 'Kieltäytymispyyntö huomioitu',
		statusSignal: 'Kieltäytymissignaali huomioitu',
	},
	privacyChoices: {
		acceptAll: 'Hyväksy kaikki',
		advertisingFollowsSale: 'Mainonta noudattaa yllä tekemääsi valintaa.',
		advertisingTitle: 'Mainonta',
		allow: 'Salli',
		alwaysOn: 'Aina päällä',
		announceSaved: '{message} Tallennettu.',
		askAll:
			'myydä tai jakaa henkilötietojasi myös kohdennettua mainontaa varten',
		askSaleAndShare: 'myydä tai jakaa henkilötietojasi',
		askSaleAndTargetedAds:
			'myydä henkilötietojasi tai käyttää niitä kohdennettuun mainontaan',
		bannerAllowedRightsOff:
			'Valinnaiset evästeet sallittu. {rights} pysyvät pois päältä. Voit muuttaa tätä kohdassa Tietosuojavalintasi.',
		bannerAllowedRightsOffGpc:
			'Valinnaiset evästeet sallittu. {rights} pysyvät pois päältä Global Privacy Control -signaalisi vuoksi. Voit muuttaa tätä kohdassa Tietosuojavalintasi.',
		bannerRejected:
			'Valinnaiset evästeet hylätty. Voit muuttaa tätä kohdassa Tietosuojavalintasi.',
		barDescription:
			'Käytämme evästeitä parantaaksemme kokemustasi ja analysoidaksemme liikennettä.',
		businessFallback: 'tämä sivusto',
		choiceRecorded: 'Valinta kirjattu.',
		choicesSaved:
			'Valinnat tallennettu. Voit muuttaa niitä kohdassa Tietosuojavalintasi.',
		choose: 'Valitse',
		chooseWhatToAllow: 'Valitse, mitä sallit',
		close: 'Sulje',
		confirmDescriptionOptIn:
			'{business} saa {rights}. Voit muuttaa tätä milloin tahansa.',
		confirmDescriptionOptOut:
			'{business} saa {rights}. Voit kieltäytyä uudelleen milloin tahansa.',
		confirmKeepOptedOut: 'Pysy kieltäytyneenä',
		confirmTitleOptIn: 'Sallitaanko {rights}?',
		confirmTitleOptOut: 'Sallitaanko {rights} uudelleen?',
		copyFailed: 'Kopiointi ei onnistunut. Valitse ja kopioi viitteesi:',
		copyFailedAnnouncement:
			'Kopiointi ei onnistunut. Koko viitteesi näkyy kuitissa.',
		copyReference: 'Kopioi viite',
		dialogIntro: 'Valintasi tulevat voimaan heti.',
		dialogTitle: 'Tietosuojavalintasi',
		done: 'Valmis',
		dontAllow: 'Älä salli',
		euDialogIntro:
			'Valitse, mitä valinnaisia evästeitä {business} saa käyttää. Valinnaiset evästeet pysyvät pois päältä, ellet ota niitä käyttöön.',
		euDialogTitle: 'Tietosuoja-asetukset',
		gpcNote:
			'Selaimesi lähetti Global Privacy Control -signaalin, joten {business} {rights} {scope}. Salli-vaihtoehto ei ole käytettävissä, kun signaali on päällä.',
		justNow: 'juuri nyt',
		nestedSheetNote:
			'Muutokset tulevat voimaan, kun tallennat Tietosuoja-asetuksissa.',
		noticeBarDescription:
			'Käytämme evästeitä sivuston toimintaan, liikenteen mittaamiseen ja mainosten yksilöimiseen. Voit kieltäytyä milloin tahansa.',
		noticeBarDescriptionGpc:
			'Käytämme evästeitä sivuston toimintaan ja liikenteen mittaamiseen. Global Privacy Control -signaaliasi noudatetaan.',
		noticeGpcHonored:
			'Selaimesi Global Privacy Control -signaalia noudatetaan.',
		noticeRightsAction: 'Älä myy tai jaa tietojani',
		nudge: 'Valitse ensin jompikumpi kahdesta painikkeesta.',
		optInBarDescription:
			'{business} kysyy luvan ennen valinnaisten evästeiden käyttöä tai {rights}.',
		optInDescription:
			'Luvallasi {business} käyttäisi valinnaisia evästeitä sivuston toimintoihin ja analytiikkaan ja saisi {rights}. Mitään ei oteta käyttöön, ellet salli sitä.',
		optInTitle: 'Tietosuojavalintasi',
		optOutOption: 'Kieltäydy',
		panelExpanded: 'Lisää vaihtoehtoja näkyvissä.',
		policyColumn: 'Tietosuojakäytäntö',
		preferencesClose: 'Sulje asetukset',
		preferencesOnCount: '{count} päällä',
		preferencesSheetIntro: 'Muutokset tulevat voimaan heti.',
		preferencesSummary: 'Sivuston toiminnot ja analytiikka',
		preferencesTitle: 'Asetukset',
		purposeColumn: 'Tarkoitus',
		receiptAllowed: 'Sallittu: {rights}',
		receiptDetails: 'Tiedot',
		receiptFromGpc: 'Global Privacy Control -signaalisi perusteella',
		receiptLive: 'Noudatetaan tämän selaimen Global Privacy Control -signaalia',
		receiptLiveDetail: 'Luetaan selaimestasi jokaisella käynnillä.',
		receiptOptedOut: 'Kieltäydytty: {rights}',
		receiptRecorded: 'Kirjattu {date}',
		receiptReference: 'Viite',
		receiptSavedAccount: 'Tallennettu tilillesi · {date}',
		receiptSavedBrowser: 'Tallennettu tälle selaimelle · {date}',
		receiptScopeAccount:
			'Koskee tätä selainta ja tiliäsi palvelussa {business}.',
		receiptScopeAccountUnnamed: 'Koskee tätä selainta ja tiliäsi.',
		receiptScopeBrowser:
			'Koskee tätä selainta. Kirjaudu sisään, niin se koskee myös tiliäsi.',
		receiptViaGpc: 'Global Privacy Control -signaali',
		referenceCopied: 'Viite kopioitu.',
		refuseAll:
			'ei myy eikä jaa henkilötietojasi eikä käytä niitä kohdennettuun mainontaan',
		refuseSaleAndShare: 'ei myy eikä jaa henkilötietojasi',
		refuseSaleAndTargetedAds:
			'ei myy henkilötietojasi eikä käytä niitä kohdennettuun mainontaan',
		rejectAll: 'Hylkää kaikki',
		rightsAllowed: '{rights}: sallittu.',
		rightsNotAllowed: '{rights}: ei sallittu.',
		rightsOptedOut: 'Kieltäydytty: {rights}.',
		saleAllowed: '{business} saa {rights}.',
		saleGroupOptIn: 'Salli {rights}',
		saleGroupSaleAndTargetedAds:
			'Kieltäydy henkilötietojeni myynnistä ja kohdennetusta mainonnasta',
		saleOffByDefault:
			'Oletuksena pois päältä. {business} {rights}, ellet salli sitä.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Tallenna valinnat',
		saveInSettings: 'Tallenna valintasi Tietosuoja-asetuksissa',
		savedAutomatically: 'Tallennetaan automaattisesti',
		savedCue: 'Tallennettu',
		scopeAccount: 'tässä selaimessa eikä tililläsi palvelussa {business}',
		scopeAccountUnnamed: 'tässä selaimessa eikä tililläsi',
		scopeBrowser: 'tässä selaimessa',
		shortAll: 'tietojesi myyntiä tai jakamista mainontaa varten',
		shortSaleAndShare: 'tietojesi myyntiä tai jakamista',
		shortSaleAndTargetedAds: 'tietojesi myyntiä tai käyttöä mainontaan',
		stateOff: 'Pois päältä',
		stateOn: 'Päällä',
		switchColumn: 'Päällä',
		switchedOff: '{name} pois päältä.',
		switchedOn: '{name} päällä.',
		titleAll: 'Myynti, jakaminen ja kohdennettu mainonta',
		titleSaleAndShare: 'Myynti ja jakaminen',
		titleSaleAndTargetedAds: 'Myynti ja kohdennettu mainonta',
		vendorColumn: 'Kumppani',
		vendorPolicy: 'Tietosuojakäytäntö: {vendor}',
		vendorsClose: 'Sulje kumppanit: {category}',
		vendorsFor: 'luokalle {category}',
		vendorsHide: 'Piilota {count} kumppania',
		vendorsHideOne: 'Piilota 1 kumppani',
		vendorsOnCount: '{count} päällä',
		vendorsTable: 'Kumppanit: {category}',
		vendorsView: 'Näytä {count} kumppania',
		vendorsViewOne: 'Näytä 1 kumppani',
	},
	rights: {
		californiaPrivacyChoices: 'Kalifornian tietosuojavalintasi',
		optOut: 'Älä myy tai jaa tietojani',
		preferences: 'Hallitse asetuksia',
		privacyChoices: 'Tietosuojavalintasi',
	},
};
export default translations;
