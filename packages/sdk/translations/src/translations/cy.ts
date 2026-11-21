import type { CompleteTranslations } from '../types';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Derbyn pob un',
		acknowledge: 'Iawn',
		close: 'Cau',
		customize: 'Addasu',
		dismiss: 'Diystyru',
		rejectAll: 'Gwrthod pob un',
		save: 'Cadw gosodiadau',
		securedBy: "Wedi'i ddiogelu gan",
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
	rights: {
		californiaPrivacyChoices: 'Eich Dewisiadau Preifatrwydd yng Nghaliffornia',
		optOut: 'Peidiwch â gwerthu na rhannu fy nata',
		preferences: 'Rheoli dewisiadau',
		privacyChoices: 'Eich Dewisiadau Preifatrwydd',
	},
};
export default translations;
