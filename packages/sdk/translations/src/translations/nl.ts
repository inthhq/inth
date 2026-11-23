import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Alles accepteren',
		acknowledge: 'OK',
		close: 'Sluiten',
		customize: 'Aanpassen',
		dismiss: 'Sluiten',
		rejectAll: 'Alles weigeren',
		save: 'Instellingen opslaan',
		securedBy: 'Toestemming via',
	},
	consentGate: {
		actionButton: 'Schakel {category} toestemming in',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Accepteer {category} om deze inhoud te bekijken',
	},
	consentManagerDialog: {
		description:
			'Pas hier uw privacyinstellingen aan. U kunt kiezen welke soorten cookies en trackingtechnologieën u toestaat.',
		title: 'Privacy-instellingen',
		vendors: {
			disabledByCategory:
				'Schakel deze categorie in om leveranciers te kiezen.',
			privacyPolicy: 'Privacybeleid',
			switchLabel: '{vendor} toestaan',
			title: 'Leveranciers ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Deze cookies helpen ons om een betere gebruikerservaring te bieden en nieuwe functies te testen',
			title: 'Ervaring',
		},
		functionality: {
			description:
				'Deze cookies maken verbeterde functionaliteit en personalisatie van de website mogelijk.',
			title: 'Functionaliteit',
		},
		marketing: {
			description:
				'Deze cookies worden gebruikt om relevante advertenties aan te bieden en de effectiviteit ervan bij te houden',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Deze cookies helpen ons te begrijpen hoe bezoekers omgaan met de website en de prestaties ervan te verbeteren',
			title: 'Analytics',
		},
		necessary: {
			description:
				'Deze cookies zijn essentieel voor het goed functioneren van de website en kunnen niet worden uitgeschakeld',
			title: 'Strikt noodzakelijk',
		},
	},
	cookieBanner: {
		description:
			'Deze site gebruikt cookies om uw surfervaring te verbeteren, het verkeer op de site te analyseren en gepersonaliseerde inhoud te tonen',
		noticeDescription:
			'Wij gebruiken cookies en vergelijkbare technologieën om deze site te laten werken, verkeer te meten en inhoud en advertenties te personaliseren. U kunt zich op elk moment afmelden of uw voorkeuren beheren.',
		noticeTitle: 'Privacymelding',
		title: 'Wij hechten waarde aan uw privacy',
	},
	iab: {
		app: {
			consentStorage:
				'Uw keuzes worden op dit apparaat opgeslagen, in de standaardopslag voor instellingen van de app onder IABTCF-sleutels, voor maximaal {days} dagen. De bewaartermijn gaat opnieuw in wanneer u uw keuzes aanpast.',
			description:
				'Wij en onze {partnerCount} partners slaan informatie op een apparaat op en/of openen deze en verwerken persoonlijke gegevens, zoals unieke identificatoren en browsegegevens, voor deze app, om:',
			legitimateInterestExplanation:
				'Sommige partners verwerken persoonlijke gegevens, zoals unieke identificatoren en browsegegevens, op basis van hun gerechtvaardigd belang in plaats van om toestemming te vragen. Dit geldt alleen voor deze app. U heeft het recht om bezwaar te maken tegen deze verwerking per doel en per partner.',
			scopeServiceSpecific:
				'Uw toestemming geldt alleen voor deze app en heeft geen invloed op andere diensten.',
			withdraw:
				'U kunt uw keuzes op elk moment wijzigen of uw toestemming intrekken via Privacy-instellingen in deze app.',
		},
		banner: {
			andMore: 'En nog {count}...',
			description:
				'Wij en onze {partnerCount} partners slaan informatie op een apparaat op en/of openen deze en verwerken persoonlijke gegevens, zoals unieke identificatoren en browsegegevens, voor deze website, om:',
			legitimateInterestNotice:
				'Sommige partners maken aanspraak op een gerechtvaardigd belang om uw gegevens te verwerken. U heeft het recht om bezwaar te maken tegen deze verwerking, uw keuzes aan te passen en uw toestemming op elk moment in te trekken.',
			partnersLink: '{count} partners',
			scopeGroup: 'Uw keuze geldt voor al onze websites in deze groep.',
			scopeServiceSpecific:
				'Je toestemming geldt alleen voor deze website en heeft geen invloed op andere diensten.',
			title: 'Privacy-instellingen',
		},
		common: {
			acceptAll: 'Alles accepteren',
			clearSelection: 'Wissen',
			customPartner: 'Aangepaste partner niet geregistreerd bij het IAB',
			customize: 'Aanpassen',
			loading: 'Laden...',
			rejectAll: 'Alles weigeren',
			saveSettings: 'Instellingen opslaan',
			showingSelectedVendor: 'Geselecteerde leverancier wordt getoond',
		},
		preferenceCenter: {
			description:
				'Pas hier uw privacyinstellingen aan. U kunt kiezen welke soorten cookies en trackingtechnologieën u toestaat.',
			features: {
				description:
					'Deze verwerkingsmethoden mogen uitsluitend worden gebruikt ter verwezenlijking van een of meerdere doeleinden waarvoor u in deze kennisgeving de keuze krijgt.',
				title: 'Functies',
			},
			footer: {
				consentStorage:
					'Toestemmingsvoorkeuren worden gedurende 13 maanden opgeslagen in een cookie genaamd "euconsent-v2". De bewaartermijn kan opnieuw ingaan wanneer u uw voorkeuren aanpast.',
			},
			purposeItem: {
				examples: 'Voorbeelden',
				legitimateInterest: 'Gerechtvaardigd belang',
				objectButton: 'Bezwaar maken',
				objected: 'Bezwaar gemaakt',
				partners: '{count} partners',
				partnersUsingPurpose: 'Partners die dit doeleinde gebruiken',
				rightToObject:
					'U heeft het recht om bezwaar te maken tegen verwerking op basis van gerechtvaardigd belang.',
				vendorsUseLegitimateInterest:
					'{count} leveranciers maken aanspraak op gerechtvaardigd belang',
				withYourPermission: 'Met uw toestemming',
			},
			specialPurposes: {
				title: 'Essentiële functies (vereist)',
				tooltip:
					'Deze zijn vereist voor de functionaliteit en beveiliging van de site. Volgens IAB TCF kunt u geen bezwaar maken tegen deze speciale doeleinden.',
			},
			tabs: {
				purposes: 'Doeleinden',
				vendors: 'Leveranciers',
			},
			title: 'Privacy-instellingen',
			vendorList: {
				adTechProvidersHeading:
					'Google-leveranciers van advertentietechnologie',
				adTechProvidersNotice:
					'Google werkt buiten het IAB-framework samen met deze leveranciers van advertentietechnologie. Uw toestemming bereikt een leverancier alleen als u deze inschakelt en ook het opslaan van informatie op uw apparaat en gepersonaliseerde advertenties toestaat.',
				customVendorsHeading: 'Aangepaste partners',
				customVendorsNotice:
					'Dit zijn aangepaste partners die niet zijn geregistreerd bij het IAB Transparency & Consent Framework (TCF). Ze verwerken gegevens op basis van uw toestemming en kunnen andere privacypraktijken hebben dan IAB-geregistreerde leveranciers.',
				dataCategories: 'Datacategorieën',
				features: 'Functies',
				iabVendorsHeading: 'IAB-geregistreerde leveranciers',
				iabVendorsNotice:
					'Deze partners zijn geregistreerd bij het IAB Transparency & Consent Framework (TCF), een industriestandaard voor het beheren van toestemming',
				legitimateInterest: 'Gerechtv. belang',
				maxAge: 'Max. leeftijd: {days}d',
				nonCookieAccess: 'Toegang zonder cookies',
				privacyPolicy: 'Privacybeleid',
				purposes: 'Doeleinden',
				requiredNotice:
					'Vereist voor websitefunctionaliteit, kan niet worden uitgeschakeld',
				retention: 'Bewaartermijn: {days}d',
				search: 'Zoek leveranciers...',
				showingCount: '{filtered} van {total} leveranciers',
				specialFeatures: 'Speciale functies',
				specialPurposes: 'Speciale doeleinden',
				storageDisclosure: 'Openbaarmaking van opslag',
				usesCookies: 'Gebruikt cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Cookiebeleid',
		privacyPolicy: 'Privacybeleid',
		termsOfService: 'Servicevoorwaarden',
	},
	optOut: {
		action: 'Afmelden',
		description:
			'Deze site verkoopt of deelt je persoonsgegevens niet, en je keuze is opgeslagen in deze browser.',
		done: 'Klaar',
		headingAll:
			'Verkoop en delen van uw persoonlijke gegevens en gerichte advertenties',
		headingSaleAndShare: 'Verkoop en delen van uw persoonlijke gegevens',
		headingSaleAndTargetedAds:
			'Verkoop van uw persoonlijke gegevens en gerichte advertenties',
		lockedByAccount:
			'Je account heeft zich afgemeld en je kunt dit wijzigen nadat je bent ingelogd.',
		lockedByGpc:
			'Het Global Privacy Control-signaal van je browser staat aan, dus dit blijft uitgeschakeld.',
		notOptedOut: 'U bent in deze browser niet afgemeld.',
		optInCancel: 'Afgemeld blijven',
		optInConfirm: 'Opnieuw aanmelden',
		optInDescription: 'Bevestigen beëindigt je afmelding in deze browser.',
		optInDescriptionWithRights:
			'Bevestigen beëindigt je afmelding voor {rights} in deze browser.',
		optInLink: 'Opnieuw aanmelden…',
		optInTitle: 'Opnieuw aanmelden?',
		receiptAccount: 'Je bent afgemeld in deze browser en op je account.',
		receiptAccountWithRights:
			'Je bent afgemeld voor {rights} in deze browser en op je account.',
		receiptBrowser: 'Je bent afgemeld in deze browser.',
		receiptBrowserWithRights: 'Je bent afgemeld voor {rights} in deze browser.',
		recordedLabel: 'Vastgelegd',
		referenceLabel: 'Referentie',
		rightsAll: 'verkoop, delen en gerichte advertenties',
		rightsSaleAndShare: 'verkoop en delen',
		rightsSaleAndTargetedAds: 'verkoop en gerichte advertenties',
		statusRequest: 'Afmeldingsverzoek gehonoreerd',
		statusSignal: 'Signaal voor afmeldingsvoorkeur gehonoreerd',
	},
	privacyChoices: {
		acceptAll: 'Alles accepteren',
		advertisingFollowsSale: 'Advertenties volgen uw keuze hierboven.',
		advertisingTitle: 'Advertenties',
		allow: 'Toestaan',
		alwaysOn: 'Altijd aan',
		announceSaved: '{message} Opgeslagen.',
		askAll:
			'uw persoonsgegevens verkopen of delen, ook voor gerichte advertenties',
		askSaleAndShare: 'uw persoonsgegevens verkopen of delen',
		askSaleAndTargetedAds:
			'uw persoonsgegevens verkopen of gebruiken voor gerichte advertenties',
		bannerAllowedRightsOff:
			'Optionele cookies toegestaan. {rights} blijven uit. U kunt dit wijzigen in Uw privacykeuzes.',
		bannerAllowedRightsOffGpc:
			'Optionele cookies toegestaan. {rights} blijven uit vanwege uw Global Privacy Control-signaal. U kunt dit wijzigen in Uw privacykeuzes.',
		bannerRejected:
			'Optionele cookies geweigerd. U kunt dit wijzigen in Uw privacykeuzes.',
		barDescription:
			'Wij gebruiken cookies om uw ervaring te verbeteren en het verkeer te analyseren.',
		businessFallback: 'deze site',
		choiceRecorded: 'Keuze vastgelegd.',
		choicesSaved: 'Keuzes opgeslagen. U kunt ze wijzigen in Uw privacykeuzes.',
		choose: 'Kiezen',
		chooseWhatToAllow: 'Kies wat u toestaat',
		close: 'Sluiten',
		confirmDescriptionOptIn:
			'{business} mag {rights}. U kunt dit op elk moment wijzigen.',
		confirmDescriptionOptOut:
			'{business} mag {rights}. U kunt zich op elk moment weer afmelden.',
		confirmKeepOptedOut: 'Afgemeld blijven',
		confirmTitleOptIn: 'Wilt u {rights} toestaan?',
		confirmTitleOptOut: 'Wilt u {rights} weer toestaan?',
		copyFailed: 'Kopiëren is mislukt. Selecteer en kopieer uw referentie:',
		copyFailedAnnouncement:
			'Kopiëren is mislukt. Uw volledige referentie staat in de bevestiging.',
		copyReference: 'Referentie kopiëren',
		dialogIntro: 'Uw keuzes gaan direct in.',
		dialogTitle: 'Uw privacykeuzes',
		done: 'Klaar',
		dontAllow: 'Niet toestaan',
		euDialogIntro:
			'Kies welke optionele cookies {business} mag gebruiken. Optionele cookies blijven uit, tenzij u ze aanzet.',
		euDialogTitle: 'Privacy-instellingen',
		gpcNote:
			'Uw browser heeft een Global Privacy Control-signaal verzonden. {business} {rights} {scope}. Toestaan is niet beschikbaar zolang het signaal aan staat.',
		justNow: 'zojuist',
		nestedSheetNote:
			'Wijzigingen gaan in wanneer u opslaat in Privacy-instellingen.',
		noticeBarDescription:
			'Wij gebruiken cookies om deze site te laten werken, verkeer te meten en advertenties te personaliseren. U kunt zich op elk moment afmelden.',
		noticeBarDescriptionGpc:
			'Wij gebruiken cookies om deze site te laten werken en verkeer te meten. Uw Global Privacy Control-signaal wordt gerespecteerd.',
		noticeGpcHonored:
			'Het Global Privacy Control-signaal van uw browser wordt gerespecteerd.',
		noticeRightsAction: 'Mijn gegevens niet verkopen of delen',
		nudge: 'Kies eerst een van de twee knoppen.',
		optInBarDescription:
			'{business} vraagt uw toestemming voor optionele cookies en voor {rights}.',
		optInDescription:
			'Met uw toestemming zou {business} optionele cookies gebruiken voor sitefuncties en analyse, en {rights}. Er wordt niets ingeschakeld tenzij u het toestaat.',
		optInTitle: 'Uw privacykeuzes',
		optOutOption: 'Afmelden',
		panelExpanded: 'Meer opties weergegeven.',
		policyColumn: 'Privacybeleid',
		preferencesClose: 'Voorkeuren sluiten',
		preferencesOnCount: '{count} aan',
		preferencesSheetIntro: 'Wijzigingen gaan direct in.',
		preferencesSummary: 'Sitefuncties en analyse',
		preferencesTitle: 'Voorkeuren',
		purposeColumn: 'Doel',
		receiptAllowed: 'Toegestaan: {rights}',
		receiptDetails: 'Details',
		receiptFromGpc: 'via uw Global Privacy Control-signaal',
		receiptLive: 'Global Privacy Control van deze browser wordt gerespecteerd',
		receiptLiveDetail: 'Bij elk bezoek uit uw browser gelezen.',
		receiptOptedOut: 'Afgemeld voor {rights}',
		receiptRecorded: 'Vastgelegd: {date}',
		receiptReference: 'Referentie',
		receiptSavedAccount: 'Opgeslagen in uw account · {date}',
		receiptSavedBrowser: 'Opgeslagen voor deze browser · {date}',
		receiptScopeAccount:
			'Geldt voor deze browser en uw account bij {business}.',
		receiptScopeAccountUnnamed: 'Geldt voor deze browser en uw account.',
		receiptScopeBrowser:
			'Geldt voor deze browser. Log in om het ook op uw account toe te passen.',
		receiptViaGpc: 'Global Privacy Control-signaal',
		referenceCopied: 'Referentie gekopieerd.',
		refuseAll:
			'zal uw persoonsgegevens niet verkopen, delen of gebruiken voor gerichte advertenties',
		refuseSaleAndShare: 'zal uw persoonsgegevens niet verkopen of delen',
		refuseSaleAndTargetedAds:
			'zal uw persoonsgegevens niet verkopen of gebruiken voor gerichte advertenties',
		rejectAll: 'Alles weigeren',
		rightsAllowed: '{rights} toegestaan.',
		rightsNotAllowed: '{rights} niet toegestaan.',
		rightsOptedOut: 'Afgemeld voor {rights}.',
		saleAllowed: '{business} mag {rights}.',
		saleGroupOptIn: 'Toestemming voor {rights}',
		saleGroupSaleAndTargetedAds:
			'Afmelden voor de verkoop van mijn persoonsgegevens en gerichte advertenties',
		saleOffByDefault:
			'Standaard uit. {business} {rights}, tenzij u dat toestaat.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Keuzes opslaan',
		saveInSettings: 'Sla uw keuzes op in Privacy-instellingen',
		savedAutomatically: 'Automatisch opgeslagen',
		savedCue: 'Opgeslagen',
		scopeAccount: 'in deze browser of voor uw account bij {business}',
		scopeAccountUnnamed: 'in deze browser of voor uw account',
		scopeBrowser: 'in deze browser',
		shortAll: 'het verkopen of delen van uw gegevens voor advertenties',
		shortSaleAndShare: 'het verkopen of delen van uw gegevens',
		shortSaleAndTargetedAds:
			'het verkopen van uw gegevens of het gebruik ervan voor advertenties',
		stateOff: 'Uit',
		stateOn: 'Aan',
		switchColumn: 'Aan',
		switchedOff: '{name} uit.',
		switchedOn: '{name} aan.',
		titleAll: 'Verkoop, delen en gerichte advertenties',
		titleSaleAndShare: 'Verkoop en delen',
		titleSaleAndTargetedAds: 'Verkoop en gerichte advertenties',
		vendorColumn: 'Leverancier',
		vendorPolicy: 'Privacybeleid van {vendor}',
		vendorsClose: 'Leveranciers voor {category} sluiten',
		vendorsFor: 'voor {category}',
		vendorsHide: '{count} leveranciers verbergen',
		vendorsHideOne: '1 leverancier verbergen',
		vendorsOnCount: '{count} aan',
		vendorsTable: 'Leveranciers voor {category}',
		vendorsView: '{count} leveranciers bekijken',
		vendorsViewOne: '1 leverancier bekijken',
	},
	rights: {
		californiaPrivacyChoices: 'Uw privacykeuzes voor Californië',
		optOut: 'Mijn gegevens niet verkopen of delen',
		preferences: 'Voorkeuren beheren',
		privacyChoices: 'Uw privacykeuzes',
	},
};
export default translations;
