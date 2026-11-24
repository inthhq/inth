import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Derbyn pob un',
		acknowledge: 'Iawn',
		close: 'Cau',
		customize: 'Addasu',
		dismiss: 'Diystyru',
		rejectAll: 'Gwrthod pob un',
		save: 'Cadw gosodiadau',
		securedBy: 'Cydsyniad gan',
	},
	consentGate: {
		actionButton: 'Galluogi caniatâd {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Derbyn caniatâd {category} i weld y cynnwys hwn.',
	},
	consentManagerDialog: {
		description:
			'Addaswch eich gosodiadau preifatrwydd yma. Gallwch ddewis pa fathau o gwcis a thechnolegau tracio rydych yn eu caniatáu.',
		title: 'Gosodiadau preifatrwydd',
		vendors: {
			disabledByCategory: 'Trowch y categori hwn ymlaen i ddewis gwerthwyr.',
			privacyPolicy: 'Polisi Preifatrwydd',
			switchLabel: 'Caniatáu {vendor}',
			title: 'Gwerthwyr ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				"Mae'r cwcis hyn yn ein helpu i ddarparu profiad defnyddiwr gwell a phrofi nodweddion newydd.",
			title: 'Profiad',
		},
		functionality: {
			description:
				"Mae'r cwcis hyn yn galluogi swyddogaeth a phersonoli gwell o'r wefan.",
			title: 'Swyddogaeth',
		},
		marketing: {
			description:
				'Defnyddir y cwcis hyn i ddarparu hysbysebion perthnasol a thracio eu heffeithiolrwydd.',
			title: 'Marchnata',
		},
		measurement: {
			description:
				"Mae'r cwcis hyn yn ein helpu i ddeall sut mae ymwelwyr yn rhyngweithio â'r wefan a gwella ei pherfformiad.",
			title: 'Dadansoddeg',
		},
		necessary: {
			description:
				"Mae'r cwcis hyn yn hanfodol i'r wefan weithredu'n iawn ac ni ellir eu hanalluogi.",
			title: 'Cwbl angenrheidiol',
		},
	},
	cookieBanner: {
		description:
			"Mae'r wefan hon yn defnyddio cwcis i wella eich profiad pori, dadansoddi traffig y wefan, a dangos cynnwys wedi'i bersonoli.",
		noticeDescription:
			'Rydym yn defnyddio cwcis a thechnolegau tebyg i redeg y wefan hon, mesur traffig, a phersonoli cynnwys a hysbysebion. Gallwch optio allan neu reoli eich dewisiadau ar unrhyw adeg.',
		noticeTitle: 'Hysbysiad preifatrwydd',
		title: 'Rydym yn gwerthfawrogi eich preifatrwydd',
	},
	iab: {
		app: {
			consentStorage:
				'Mae eich dewisiadau’n cael eu storio ar y ddyfais hon, yn storfa gosodiadau safonol yr ap o dan allweddi IABTCF, am hyd at {days} diwrnod. Mae’r cyfnod storio’n cael ei adnewyddu pan fyddwch yn diweddaru eich dewisiadau.',
			description:
				'Rydym ni a’n {partnerCount} partner yn storio a/neu’n cyrchu gwybodaeth ar eich dyfais ac yn prosesu data personol, megis dynodwyr unigryw a data pori, ar gyfer yr ap hwn, er mwyn:',
			legitimateInterestExplanation:
				'Mae rhai partneriaid yn prosesu data personol, megis dynodwyr unigryw a data pori, ar sail eu buddiant cyfreithlon yn hytrach na gofyn am gydsyniad. Mae hyn yn berthnasol i’r ap hwn yn unig. Mae gennych hawl i wrthwynebu’r prosesu hwn ar gyfer pob diben a phob partner.',
			scopeServiceSpecific:
				'Mae eich caniatâd yn berthnasol i’r ap hwn yn unig ac ni fydd yn effeithio ar wasanaethau eraill.',
			withdraw:
				'Gallwch newid eich dewisiadau neu dynnu eich cydsyniad yn ôl unrhyw bryd o Gosodiadau preifatrwydd yn yr ap hwn.',
		},
		banner: {
			andMore: 'Ac {count} arall...',
			description:
				'Rydym ni a’n {partnerCount} partner yn storio a/neu’n cyrchu gwybodaeth ar eich dyfais ac yn prosesu data personol, megis dynodwyr unigryw a data pori, ar gyfer y wefan hon, er mwyn:',
			legitimateInterestNotice:
				'Mae rhai partneriaid yn hawlio buddiant cyfreithlon i brosesu eich data. Mae gennych hawl i wrthwynebu’r prosesu hwn, addasu eich dewisiadau, a thynnu eich cydsyniad yn ôl unrhyw bryd.',
			partnersLink: '{count} partner',
			scopeGroup:
				'Mae eich dewis yn berthnasol ar draws ein gwefannau yn y grŵp hwn.',
			scopeServiceSpecific:
				'Mae eich caniatâd yn berthnasol i’r wefan hon yn unig ac ni fydd yn effeithio ar wasanaethau eraill.',
			title: 'Gosodiadau preifatrwydd',
		},
		common: {
			acceptAll: 'Derbyn pob un',
			clearSelection: 'Clirio',
			customPartner: 'Partner personol heb ei gofrestru gyda’r IAB',
			customize: 'Addasu',
			loading: 'Wrthi’n llwytho...',
			rejectAll: 'Gwrthod pob un',
			saveSettings: 'Cadw gosodiadau',
			showingSelectedVendor: 'Yn dangos y gwerthwr a ddewiswyd',
		},
		preferenceCenter: {
			description:
				'Addaswch eich gosodiadau preifatrwydd yma. Gallwch ddewis pa fathau o gwcis a thechnolegau tracio rydych yn eu caniatáu.',
			features: {
				description:
					'Dim ond at ddiben neu fwy y rhoddir dewis i chi yn yr hysbysiad hwn y gellir defnyddio yr dulliau prosesu hyn.',
				title: 'Nodweddion',
			},
			footer: {
				consentStorage:
					'Mae dewisiadau cydsyniad yn cael eu storio mewn cwci o’r enw "euconsent-v2" am 13 mis. Gall y cyfnod storio gael ei adnewyddu pan fyddwch yn diweddaru eich dewisiadau.',
			},
			purposeItem: {
				examples: 'Enghreifftiau',
				legitimateInterest: 'Buddiant Cyfreithlon',
				objectButton: 'Gwrthwynebu',
				objected: 'Gwrthwynebwyd',
				partners: '{count} partner',
				partnersUsingPurpose: 'Partneriaid sy’n Defnyddio’r Diben Hwn',
				rightToObject:
					'Mae gennych hawl i wrthwynebu prosesu sy’n seiliedig ar fuddiant cyfreithlon.',
				vendorsUseLegitimateInterest:
					'{count} gwerthwr yn hawlio buddiant cyfreithlon',
				withYourPermission: 'Gyda’ch Caniatâd',
			},
			specialPurposes: {
				title: 'Swyddogaethau Hanfodol (Angenrheidiol)',
				tooltip:
					'Mae’r rhain yn angenrheidiol ar gyfer swyddogaethau a diogelwch y wefan. Yn unol ag IAB TCF, ni allwch wrthwynebu’r dibenion arbennig hyn.',
			},
			tabs: {
				purposes: 'Dibenion',
				vendors: 'Gwerthwyr',
			},
			title: 'Gosodiadau preifatrwydd',
			vendorList: {
				adTechProvidersHeading: 'Darparwyr Technoleg Hysbysebu Google',
				adTechProvidersNotice:
					'Mae Google yn gweithio gyda’r darparwyr technoleg hysbysebu hyn y tu allan i fframwaith yr IAB. Dim ond os byddwch yn ei droi ymlaen a hefyd yn caniatáu storio gwybodaeth ar eich dyfais a hysbysebu wedi’i bersonoli y bydd eich cydsyniad yn cyrraedd darparwr.',
				customVendorsHeading: 'Partneriaid Personol',
				customVendorsNotice:
					'Partneriaid personol yw’r rhain nad ydynt wedi’u cofrestru gyda Fframwaith Tryloywder a Chydsyniad (TCF) yr IAB. Maent yn prosesu data yn seiliedig ar eich cydsyniad ac fe allant fod ag arferion preifatrwydd gwahanol i werthwyr cofrestredig IAB.',
				dataCategories: 'Categorïau Data',
				features: 'Nodweddion',
				iabVendorsHeading: 'Gwerthwyr Cofrestredig IAB',
				iabVendorsNotice:
					'Mae’r partneriaid hyn wedi’u cofrestru gyda Fframwaith Tryloywder a Chydsyniad (TCF) yr IAB, safon diwydiant ar gyfer rheoli cydsyniad',
				legitimateInterest: 'Buddiant Cyf.',
				maxAge: 'Oed Uchaf: {days}d',
				nonCookieAccess: 'Mynediad Heb Gwcis',
				privacyPolicy: 'Polisi Preifatrwydd',
				purposes: 'Dibenion',
				requiredNotice:
					'Angenrheidiol ar gyfer swyddogaeth y wefan, ni ellir ei analluogi',
				retention: 'Cadw: {days}d',
				search: 'Chwilio gwerthwyr...',
				showingCount: '{filtered} o {total} gwerthwr',
				specialFeatures: 'Nodweddion Arbennig',
				specialPurposes: 'Dibenion Arbennig',
				storageDisclosure: 'Datgelu Storio',
				usesCookies: 'Yn Defnyddio Cwcis',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Polisi cwcis',
		privacyPolicy: 'Polisi preifatrwydd',
		termsOfService: 'Telerau gwasanaeth',
	},
	optOut: {
		action: 'Optio allan',
		description:
			'Ni fydd y wefan hon yn gwerthu nac yn rhannu eich gwybodaeth bersonol, ac mae eich dewis wedi ei gadw yn y porwr hwn.',
		done: 'Wedi gorffen',
		headingAll:
			'Gwerthu a rhannu eich gwybodaeth bersonol a hysbysebu wedi’i dargedu',
		headingSaleAndShare: 'Gwerthu a rhannu eich gwybodaeth bersonol',
		headingSaleAndTargetedAds:
			'Gwerthu eich gwybodaeth bersonol a hysbysebu wedi’i dargedu',
		lockedByAccount:
			'Mae eich cyfrif wedi optio allan, a gallwch newid hyn ar ôl mewngofnodi.',
		lockedByGpc:
			'Mae signal Global Privacy Control eich porwr ymlaen, felly mae hyn yn aros i ffwrdd.',
		notOptedOut: 'Nid ydych wedi optio allan ar y porwr hwn.',
		optInCancel: 'Aros wedi optio allan',
		optInConfirm: 'Optio yn ôl i mewn',
		optInDescription:
			"Mae cadarnhau yn dod â'ch optio allan i ben ar y porwr hwn.",
		optInDescriptionWithRights:
			"Mae cadarnhau yn dod â'ch optio allan o {rights} i ben ar y porwr hwn.",
		optInLink: 'Optio yn ôl i mewn…',
		optInTitle: 'Optio yn ôl i mewn?',
		receiptAccount: 'Rydych wedi optio allan yn y porwr hwn ac ar eich cyfrif.',
		receiptAccountWithRights:
			'Rydych wedi optio allan o {rights} yn y porwr hwn ac ar eich cyfrif.',
		receiptBrowser: 'Rydych wedi optio allan yn y porwr hwn.',
		receiptBrowserWithRights:
			'Rydych wedi optio allan o {rights} yn y porwr hwn.',
		recordedLabel: 'Cofnodwyd',
		referenceLabel: 'Cyfeirnod',
		rightsAll: 'gwerthu, rhannu a hysbysebu wedi’i dargedu',
		rightsSaleAndShare: 'gwerthu a rhannu',
		rightsSaleAndTargetedAds: 'gwerthu a hysbysebu wedi’i dargedu',
		statusRequest: 'Cais optio allan wedi ei anrhydeddu',
		statusSignal: 'Signal dewis optio allan wedi ei anrhydeddu',
	},
	privacyChoices: {
		acceptAll: 'Derbyn pob un',
		advertisingFollowsSale: "Mae hysbysebu'n dilyn eich dewis uchod.",
		advertisingTitle: 'Hysbysebu',
		allow: 'Caniatáu',
		alwaysOn: 'Ymlaen bob amser',
		announceSaved: "{message} Wedi'i gadw.",
		askAll:
			"werthu neu rannu eich gwybodaeth bersonol, gan gynnwys ar gyfer hysbysebu wedi'i dargedu",
		askSaleAndShare: 'werthu neu rannu eich gwybodaeth bersonol',
		askSaleAndTargetedAds:
			"werthu eich gwybodaeth bersonol neu ei defnyddio ar gyfer hysbysebu wedi'i dargedu",
		bannerAllowedRightsOff:
			"Cwcis dewisol wedi'u caniatáu. {rights}: yn aros i ffwrdd. Gallwch newid hyn yn Eich Dewisiadau Preifatrwydd.",
		bannerAllowedRightsOffGpc:
			"Cwcis dewisol wedi'u caniatáu. {rights}: yn aros i ffwrdd oherwydd eich signal Global Privacy Control. Gallwch newid hyn yn Eich Dewisiadau Preifatrwydd.",
		bannerRejected:
			"Cwcis dewisol wedi'u gwrthod. Gallwch newid hyn yn Eich Dewisiadau Preifatrwydd.",
		barDescription:
			'Rydym yn defnyddio cwcis i wella eich profiad a dadansoddi traffig.',
		businessFallback: 'y wefan hon',
		choiceRecorded: "Dewis wedi'i gofnodi.",
		choicesSaved:
			"Dewisiadau wedi'u cadw. Gallwch eu newid yn Eich Dewisiadau Preifatrwydd.",
		choose: 'Dewis',
		chooseWhatToAllow: "Dewis beth i'w ganiatáu",
		close: 'Cau',
		confirmDescriptionOptIn:
			'Gall {business} {rights}. Gallwch newid hyn ar unrhyw adeg.',
		confirmDescriptionOptOut:
			'Gall {business} {rights}. Gallwch optio allan eto ar unrhyw adeg.',
		confirmKeepOptedOut: 'Aros wedi optio allan',
		confirmTitleOptIn: 'Caniatáu {rights}?',
		confirmTitleOptOut: 'Caniatáu {rights} eto?',
		copyFailed: 'Wedi methu copïo. Dewiswch a chopïwch eich cyfeirnod:',
		copyFailedAnnouncement:
			"Wedi methu copïo. Mae eich cyfeirnod llawn i'w weld yn y dderbynneb.",
		copyReference: "Copïo'r cyfeirnod",
		dialogIntro: "Mae eich dewisiadau'n dod i rym ar unwaith.",
		dialogTitle: 'Eich Dewisiadau Preifatrwydd',
		done: 'Wedi gorffen',
		dontAllow: 'Peidio â chaniatáu',
		euDialogIntro:
			'Dewiswch pa gwcis dewisol y caiff {business} eu defnyddio. Mae cwcis dewisol yn aros i ffwrdd oni bai eich bod yn eu troi ymlaen.',
		euDialogTitle: 'Gosodiadau preifatrwydd',
		gpcNote:
			"Anfonodd eich porwr signal Global Privacy Control, felly ni fydd {business} {rights} {scope}. Nid yw Caniatáu ar gael tra bo'r signal ymlaen.",
		justNow: 'nawr',
		nestedSheetNote:
			'Daw newidiadau i rym pan fyddwch yn cadw yn Gosodiadau preifatrwydd.',
		noticeBarDescription:
			'Rydym yn defnyddio cwcis i redeg y wefan hon, mesur traffig a phersonoli hysbysebion. Gallwch optio allan ar unrhyw adeg.',
		noticeBarDescriptionGpc:
			'Rydym yn defnyddio cwcis i redeg y wefan hon a mesur traffig. Mae eich signal Global Privacy Control yn cael ei barchu.',
		noticeGpcHonored:
			'Mae signal Global Privacy Control eich porwr yn cael ei barchu.',
		noticeRightsAction: 'Peidiwch â gwerthu na rhannu fy nata',
		nudge: "Dewiswch un o'r ddau fotwm yn gyntaf.",
		optInBarDescription:
			'Bydd {business} yn gofyn cyn defnyddio cwcis dewisol neu {rights}.',
		optInDescription:
			"Gyda'ch caniatâd, bydd {business} yn defnyddio cwcis dewisol ar gyfer nodweddion y wefan a dadansoddeg, a gall hefyd {rights}. Does dim yn cael ei droi ymlaen oni bai eich bod yn ei ganiatáu.",
		optInTitle: 'Eich dewisiadau preifatrwydd',
		optOutOption: 'Optio allan',
		panelExpanded: "Mae rhagor o opsiynau i'w gweld.",
		policyColumn: 'Polisi preifatrwydd',
		preferencesClose: 'Cau dewisiadau',
		preferencesOnCount: '{count} ymlaen',
		preferencesSheetIntro: "Mae newidiadau'n dod i rym ar unwaith.",
		preferencesSummary: 'Nodweddion y wefan a dadansoddeg',
		preferencesTitle: 'Dewisiadau',
		purposeColumn: 'Diben',
		receiptAllowed: "Wedi'i ganiatáu: {rights}",
		receiptDetails: 'Manylion',
		receiptFromGpc: "o'ch signal Global Privacy Control",
		receiptLive: "Yn parchu Global Privacy Control o'r porwr hwn",
		receiptLiveDetail: "Yn cael ei ddarllen o'ch porwr ar bob ymweliad.",
		receiptOptedOut: 'Wedi optio allan: {rights}',
		receiptRecorded: 'Cofnodwyd: {date}',
		receiptReference: 'Cyfeirnod',
		receiptSavedAccount: "Wedi'i gadw i'ch cyfrif · {date}",
		receiptSavedBrowser: "Wedi'i gadw ar gyfer y porwr hwn · {date}",
		receiptScopeAccount: "Yn berthnasol i'r porwr hwn a'ch cyfrif {business}.",
		receiptScopeAccountUnnamed: "Yn berthnasol i'r porwr hwn a'ch cyfrif.",
		receiptScopeBrowser:
			"Yn berthnasol i'r porwr hwn. Mewngofnodwch i'w gymhwyso i'ch cyfrif hefyd.",
		receiptViaGpc: 'Signal Global Privacy Control',
		referenceCopied: "Cyfeirnod wedi'i gopïo.",
		refuseAll:
			"yn gwerthu nac yn rhannu eich gwybodaeth bersonol, nac yn ei defnyddio ar gyfer hysbysebu wedi'i dargedu",
		refuseSaleAndShare: 'yn gwerthu nac yn rhannu eich gwybodaeth bersonol',
		refuseSaleAndTargetedAds:
			"yn gwerthu eich gwybodaeth bersonol nac yn ei defnyddio ar gyfer hysbysebu wedi'i dargedu",
		rejectAll: 'Gwrthod pob un',
		rightsAllowed: "{rights}: wedi'i ganiatáu.",
		rightsNotAllowed: '{rights}: heb ei ganiatáu.',
		rightsOptedOut: 'Wedi optio allan: {rights}.',
		saleAllowed: 'Gall {business} {rights}.',
		saleGroupOptIn: 'Caniatáu {rights}',
		saleGroupSaleAndTargetedAds:
			"Optio allan o werthu fy nata personol ac o hysbysebu wedi'i dargedu",
		saleOffByDefault:
			'I ffwrdd yn ddiofyn. Ni fydd {business} {rights} oni bai eich bod yn ei ganiatáu.',
		saleRefused: 'Ni fydd {business} {rights} {scope}.',
		saveChoices: 'Cadw dewisiadau',
		saveInSettings: 'Cadwch eich dewisiadau yn Gosodiadau preifatrwydd',
		savedAutomatically: "Yn cael ei gadw'n awtomatig",
		savedCue: "Wedi'i gadw",
		scopeAccount: 'ar y porwr hwn nac ar gyfer eich cyfrif {business}',
		scopeAccountUnnamed: 'ar y porwr hwn nac ar gyfer eich cyfrif',
		scopeBrowser: 'ar y porwr hwn',
		shortAll: 'werthu neu rannu eich data ar gyfer hysbysebion',
		shortSaleAndShare: 'werthu neu rannu eich data',
		shortSaleAndTargetedAds:
			'werthu eich data neu ei ddefnyddio ar gyfer hysbysebion',
		stateOff: 'I ffwrdd',
		stateOn: 'Ymlaen',
		switchColumn: 'Ymlaen',
		switchedOff: '{name} i ffwrdd.',
		switchedOn: '{name} ymlaen.',
		titleAll: "Gwerthu, rhannu a hysbysebu wedi'i dargedu",
		titleSaleAndShare: 'Gwerthu a rhannu',
		titleSaleAndTargetedAds: "Gwerthu a hysbysebu wedi'i dargedu",
		vendorColumn: 'Gwerthwr',
		vendorPolicy: 'Polisi preifatrwydd {vendor}',
		vendorsClose: 'Cau gwerthwyr {category}',
		vendorsFor: 'ar gyfer {category}',
		vendorsHide: 'Cuddio gwerthwyr ({count})',
		vendorsHideOne: 'Cuddio 1 gwerthwr',
		vendorsOnCount: '{count} ymlaen',
		vendorsTable: 'Gwerthwyr {category}',
		vendorsView: 'Gweld gwerthwyr ({count})',
		vendorsViewOne: 'Gweld 1 gwerthwr',
	},
	rights: {
		californiaPrivacyChoices: 'Eich Dewisiadau Preifatrwydd yng Nghaliffornia',
		optOut: 'Peidiwch â gwerthu na rhannu fy nata',
		preferences: 'Rheoli dewisiadau',
		privacyChoices: 'Eich Dewisiadau Preifatrwydd',
	},
};
export default translations;
