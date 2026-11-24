import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Terima Semua',
		acknowledge: 'Baiklah',
		close: 'Tutup',
		customize: 'Sesuaikan',
		dismiss: 'Abaikan',
		rejectAll: 'Tolak Semua',
		save: 'Simpan Tetapan',
		securedBy: 'Persetujuan oleh',
	},
	consentGate: {
		actionButton: 'Beri persetujuan untuk {category}',
		error: 'Kandungan ini tidak dapat dimuatkan.',
		loading: 'Memuatkan kandungan…',
		policyBlocked:
			'Kandungan ini tidak tersedia di bawah dasar persetujuan bagi wilayah anda.',
		title: 'Beri persetujuan untuk {category} bagi melihat kandungan ini.',
	},
	consentManagerDialog: {
		description:
			'Sesuaikan tetapan privasi anda di sini. Anda boleh memilih jenis kuki dan teknologi penjejakan yang anda benarkan.',
		title: 'Tetapan Privasi',
		vendors: {
			disabledByCategory: 'Hidupkan kategori ini untuk memilih vendor.',
			privacyPolicy: 'Dasar privasi',
			switchLabel: 'Benarkan {vendor}',
			title: 'Vendor ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Kuki ini membantu kami menyediakan pengalaman pengguna yang lebih baik dan menguji ciri baharu.',
			title: 'Pengalaman',
		},
		functionality: {
			description:
				'Kuki ini membolehkan fungsi yang dipertingkatkan dan pemperibadian laman web.',
			title: 'Kefungsian',
		},
		marketing: {
			description:
				'Kuki ini digunakan untuk memaparkan iklan yang berkaitan dan menjejaki keberkesanannya.',
			title: 'Pemasaran',
		},
		measurement: {
			description:
				'Kuki ini membantu kami memahami cara pelawat berinteraksi dengan laman web dan meningkatkan prestasinya.',
			title: 'Analitik',
		},
		necessary: {
			description:
				'Kuki ini penting untuk laman web berfungsi dengan betul dan tidak boleh dilumpuhkan.',
			title: 'Sangat Diperlukan',
		},
	},
	cookieBanner: {
		description:
			'Laman ini menggunakan kuki untuk meningkatkan pengalaman pelayaran anda, menganalisis trafik laman dan memaparkan kandungan yang diperibadikan.',
		noticeDescription:
			'Kami menggunakan kuki dan teknologi serupa untuk mengendalikan laman ini, mengukur trafik serta memperibadikan kandungan dan iklan. Anda boleh menarik diri atau mengurus pilihan anda pada bila-bila masa.',
		noticeTitle: 'Notis privasi',
		title: 'Kami menghargai privasi anda',
	},
	iab: {
		app: {
			consentStorage:
				'Pilihan anda disimpan pada peranti ini, dalam storan tetapan standard aplikasi di bawah kunci IABTCF, sehingga {days} hari. Tempoh penyimpanan dimulakan semula apabila anda mengemas kini pilihan anda.',
			description:
				'Kami dan {partnerCount} rakan kongsi kami menyimpan dan/atau mengakses maklumat pada peranti anda serta memproses data peribadi, seperti pengecam unik dan data pelayaran, untuk aplikasi ini, bagi tujuan:',
			legitimateInterestExplanation:
				'Sesetengah rakan kongsi memproses data peribadi, seperti pengecam unik dan data pelayaran, atas dasar kepentingan sah mereka dan bukannya meminta persetujuan. Ini hanya terpakai bagi aplikasi ini. Anda berhak membantah pemprosesan ini bagi setiap tujuan dan setiap rakan kongsi.',
			scopeServiceSpecific:
				'Persetujuan anda hanya terpakai bagi aplikasi ini dan tidak akan menjejaskan perkhidmatan lain.',
			withdraw:
				'Anda boleh menukar pilihan anda atau menarik balik persetujuan anda pada bila-bila masa daripada Tetapan Privasi dalam aplikasi ini.',
		},
		banner: {
			andMore: 'Dan {count} lagi...',
			description:
				'Kami dan {partnerCount} rakan kongsi kami menyimpan dan/atau mengakses maklumat pada peranti anda serta memproses data peribadi, seperti pengecam unik dan data pelayaran, untuk laman web ini, bagi tujuan:',
			legitimateInterestNotice:
				'Sesetengah rakan kongsi mendakwa mempunyai kepentingan sah untuk memproses data anda. Anda berhak membantah pemprosesan ini, menyesuaikan pilihan anda dan menarik balik persetujuan anda pada bila-bila masa.',
			partnersLink: '{count} rakan kongsi',
			scopeGroup:
				'Pilihan anda terpakai bagi semua laman web kami dalam kumpulan ini.',
			scopeServiceSpecific:
				'Persetujuan anda hanya terpakai bagi laman web ini dan tidak akan menjejaskan perkhidmatan lain.',
			title: 'Tetapan Privasi',
		},
		common: {
			acceptAll: 'Terima Semua',
			clearSelection: 'Kosongkan',
			customPartner: 'Rakan kongsi tersuai yang tidak berdaftar dengan IAB',
			customize: 'Sesuaikan',
			loading: 'Memuatkan...',
			rejectAll: 'Tolak Semua',
			saveSettings: 'Simpan Tetapan',
			showingSelectedVendor: 'Memaparkan vendor yang dipilih',
		},
		preferenceCenter: {
			description:
				'Sesuaikan tetapan privasi anda di sini. Anda boleh memilih jenis kuki dan teknologi penjejakan yang anda benarkan.',
			features: {
				description:
					'Kaedah pemprosesan ini hanya boleh digunakan bagi mencapai satu atau beberapa tujuan yang anda diberi pilihan dalam notis ini.',
				title: 'Ciri',
			},
			footer: {
				consentStorage:
					'Pilihan persetujuan disimpan dalam kuki bernama "euconsent-v2" selama 13 bulan. Tempoh penyimpanan mungkin dilanjutkan apabila anda mengemas kini pilihan anda.',
			},
			purposeItem: {
				examples: 'Contoh',
				legitimateInterest: 'Kepentingan Sah',
				objectButton: 'Bantah',
				objected: 'Dibantah',
				partners: '{count} rakan kongsi',
				partnersUsingPurpose: 'Rakan Kongsi yang Menggunakan Tujuan Ini',
				rightToObject:
					'Anda berhak membantah pemprosesan berdasarkan kepentingan sah.',
				vendorsUseLegitimateInterest:
					'{count} vendor mendakwa mempunyai kepentingan sah',
				withYourPermission: 'Dengan Kebenaran Anda',
			},
			specialPurposes: {
				title: 'Fungsi Penting (Wajib)',
				tooltip:
					'Ini diperlukan untuk fungsi dan keselamatan laman. Menurut IAB TCF, anda tidak boleh membantah tujuan khas ini.',
			},
			tabs: {
				purposes: 'Tujuan',
				vendors: 'Vendor',
			},
			title: 'Tetapan Privasi',
			vendorList: {
				adTechProvidersHeading: 'Penyedia Teknologi Iklan Google',
				adTechProvidersNotice:
					'Google bekerjasama dengan penyedia teknologi iklan ini di luar rangka kerja IAB. Persetujuan anda hanya sampai kepada penyedia jika anda menghidupkannya dan juga membenarkan storan peranti serta pengiklanan yang diperibadikan.',
				customVendorsHeading: 'Rakan Kongsi Tersuai',
				customVendorsNotice:
					'Ini ialah rakan kongsi tersuai yang tidak berdaftar dengan Rangka Kerja Ketelusan & Persetujuan (TCF) IAB. Mereka memproses data berdasarkan persetujuan anda dan mungkin mempunyai amalan privasi yang berbeza daripada vendor yang berdaftar dengan IAB.',
				dataCategories: 'Kategori Data',
				features: 'Ciri',
				iabVendorsHeading: 'Vendor Berdaftar IAB',
				iabVendorsNotice:
					'Rakan kongsi ini berdaftar dengan Rangka Kerja Ketelusan & Persetujuan (TCF) IAB, iaitu piawaian industri untuk mengurus persetujuan',
				legitimateInterest: 'Kep. Sah',
				maxAge: 'Umur Maksimum: {days} hari',
				maxAgeRefreshes: '(diperbaharui)',
				noVendorsFound: 'Tiada vendor yang sepadan dengan "{searchTerm}"',
				nonCookieAccess: 'Akses Bukan Kuki',
				partnerCount: '{count} rakan kongsi',
				partnerPlural: 'rakan kongsi',
				partnerSingular: 'rakan kongsi',
				privacyPolicy: 'Dasar Privasi',
				purposes: 'Tujuan',
				requiredNotice:
					'Diperlukan untuk fungsi laman, tidak boleh dilumpuhkan',
				retainedDays: 'Disimpan: {days} hari',
				retention: 'Tempoh penyimpanan: {days} hari',
				search: 'Cari vendor...',
				showingCount: '{filtered} daripada {total} vendor',
				specialFeatures: 'Ciri Khas',
				specialPurposes: 'Tujuan Khas',
				storageDisclosure: 'Pendedahan Storan',
				usesCookies: 'Menggunakan Kuki',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Dasar Kuki',
		privacyPolicy: 'Dasar Privasi',
		termsOfService: 'Terma Perkhidmatan',
	},
	optOut: {
		action: 'Pilih keluar',
		description:
			'Laman ini tidak akan menjual atau berkongsi maklumat peribadi anda, dan pilihan anda disimpan pada pelayar ini.',
		done: 'Selesai',
		headingAll:
			'Penjualan dan perkongsian maklumat peribadi anda serta pengiklanan disasarkan',
		headingSaleAndShare: 'Penjualan dan perkongsian maklumat peribadi anda',
		headingSaleAndTargetedAds:
			'Penjualan maklumat peribadi anda dan pengiklanan disasarkan',
		lockedByAccount:
			'Akaun anda telah memilih keluar, dan anda boleh menukarnya selepas log masuk.',
		lockedByGpc:
			'Isyarat Global Privacy Control pelayar anda dihidupkan, jadi tetapan ini kekal dimatikan.',
		notOptedOut: 'Anda belum memilih keluar pada pelayar ini.',
		optInCancel: 'Kekal tidak menyertai',
		optInConfirm: 'Sertai semula',
		optInDescription:
			'Mengesahkan menamatkan pilihan keluar anda pada pelayar ini.',
		optInDescriptionWithRights:
			'Mengesahkan menamatkan pilihan keluar anda daripada {rights} pada pelayar ini.',
		optInLink: 'Sertai semula…',
		optInTitle: 'Sertai semula?',
		receiptAccount:
			'Anda telah memilih keluar pada pelayar ini dan akaun anda.',
		receiptAccountWithRights:
			'Anda telah memilih keluar daripada {rights} pada pelayar ini dan akaun anda.',
		receiptBrowser: 'Anda telah memilih keluar pada pelayar ini.',
		receiptBrowserWithRights:
			'Anda telah memilih keluar daripada {rights} pada pelayar ini.',
		recordedLabel: 'Direkodkan',
		referenceLabel: 'Rujukan',
		rightsAll: 'jualan, perkongsian dan pengiklanan disasarkan',
		rightsSaleAndShare: 'jualan dan perkongsian',
		rightsSaleAndTargetedAds: 'jualan dan pengiklanan disasarkan',
		statusRequest: 'Permintaan memilih keluar dipenuhi',
		statusSignal: 'Isyarat keutamaan memilih keluar dipenuhi',
	},
	privacyChoices: {
		acceptAll: 'Terima Semua',
		advertisingFollowsSale: 'Pengiklanan mengikut pilihan anda di atas.',
		advertisingTitle: 'Pengiklanan',
		allow: 'Benarkan',
		alwaysOn: 'Sentiasa hidup',
		announceSaved: '{message} Disimpan.',
		askAll:
			'menjual atau berkongsi maklumat peribadi anda, termasuk untuk pengiklanan disasarkan',
		askSaleAndShare: 'menjual atau berkongsi maklumat peribadi anda',
		askSaleAndTargetedAds:
			'menjual maklumat peribadi anda atau menggunakannya untuk pengiklanan disasarkan',
		bannerAllowedRightsOff:
			'Kuki pilihan dibenarkan. {rights} kekal dimatikan. Anda boleh menukarnya dalam Pilihan Privasi Anda.',
		bannerAllowedRightsOffGpc:
			'Kuki pilihan dibenarkan. {rights} kekal dimatikan kerana isyarat Global Privacy Control anda. Anda boleh menukarnya dalam Pilihan Privasi Anda.',
		bannerRejected:
			'Kuki pilihan ditolak. Anda boleh menukarnya dalam Pilihan Privasi Anda.',
		barDescription:
			'Kami menggunakan kuki untuk meningkatkan pengalaman anda dan menganalisis trafik.',
		businessFallback: 'laman ini',
		choiceRecorded: 'Pilihan direkodkan.',
		choicesSaved:
			'Pilihan disimpan. Anda boleh menukarnya dalam Pilihan Privasi Anda.',
		choose: 'Pilih',
		chooseWhatToAllow: 'Pilih apa yang dibenarkan',
		close: 'Tutup',
		confirmDescriptionOptIn:
			'{business} boleh {rights}. Anda boleh menukarnya pada bila-bila masa.',
		confirmDescriptionOptOut:
			'{business} boleh {rights}. Anda boleh memilih keluar semula pada bila-bila masa.',
		confirmKeepOptedOut: 'Kekal memilih keluar',
		confirmTitleOptIn: 'Benarkan {rights}?',
		confirmTitleOptOut: 'Benarkan {rights} semula?',
		copyFailed: 'Tidak dapat menyalin. Pilih dan salin rujukan anda:',
		copyFailedAnnouncement:
			'Tidak dapat menyalin. Rujukan penuh anda ditunjukkan dalam resit.',
		copyReference: 'Salin rujukan',
		dialogIntro: 'Pilihan anda berkuat kuasa serta-merta.',
		dialogTitle: 'Pilihan Privasi Anda',
		done: 'Selesai',
		dontAllow: 'Jangan benarkan',
		euDialogIntro:
			'Pilih kuki pilihan yang boleh digunakan oleh {business}. Kuki pilihan kekal dimatikan melainkan anda menghidupkannya.',
		euDialogTitle: 'Tetapan Privasi',
		gpcNote:
			'Pelayar anda menghantar isyarat Global Privacy Control, jadi {business} {rights} {scope}. Benarkan tidak tersedia semasa isyarat itu dihidupkan.',
		justNow: 'sebentar tadi',
		nestedSheetNote:
			'Perubahan berkuat kuasa apabila anda menyimpan dalam Tetapan Privasi.',
		noticeBarDescription:
			'Kami menggunakan kuki untuk mengendalikan laman ini, mengukur trafik dan memperibadikan iklan. Anda boleh memilih keluar pada bila-bila masa.',
		noticeBarDescriptionGpc:
			'Kami menggunakan kuki untuk mengendalikan laman ini dan mengukur trafik. Isyarat Global Privacy Control anda dipatuhi.',
		noticeGpcHonored:
			'Isyarat Global Privacy Control pelayar anda sedang dipatuhi.',
		noticeRightsAction: 'Jangan jual atau kongsi data saya',
		nudge: 'Pilih salah satu daripada dua butang itu dahulu.',
		optInBarDescription:
			'{business} meminta kebenaran sebelum menggunakan kuki pilihan atau {rights}.',
		optInDescription:
			'Dengan kebenaran anda, {business} akan menggunakan kuki pilihan untuk ciri laman dan analitik, serta {rights}. Tiada apa-apa yang dihidupkan melainkan anda membenarkannya.',
		optInTitle: 'Pilihan privasi anda',
		optOutOption: 'Pilih keluar',
		panelExpanded: 'Lebih banyak pilihan ditunjukkan.',
		policyColumn: 'Dasar privasi',
		preferencesClose: 'Tutup keutamaan',
		preferencesOnCount: '{count} dihidupkan',
		preferencesSheetIntro: 'Perubahan berkuat kuasa serta-merta.',
		preferencesSummary: 'Ciri laman dan analitik',
		preferencesTitle: 'Keutamaan',
		purposeColumn: 'Tujuan',
		receiptAllowed: 'Dibenarkan: {rights}',
		receiptDetails: 'Butiran',
		receiptFromGpc: 'daripada isyarat Global Privacy Control anda',
		receiptLive: 'Mematuhi Global Privacy Control daripada pelayar ini',
		receiptLiveDetail: 'Dibaca daripada pelayar anda pada setiap lawatan.',
		receiptOptedOut: 'Memilih keluar daripada {rights}',
		receiptRecorded: 'Direkodkan: {date}',
		receiptReference: 'Rujukan',
		receiptSavedAccount: 'Disimpan pada akaun anda · {date}',
		receiptSavedBrowser: 'Disimpan untuk pelayar ini · {date}',
		receiptScopeAccount: 'Terpakai pada pelayar ini dan akaun {business} anda.',
		receiptScopeAccountUnnamed: 'Terpakai pada pelayar ini dan akaun anda.',
		receiptScopeBrowser:
			'Terpakai pada pelayar ini. Log masuk untuk menggunakannya pada akaun anda juga.',
		receiptViaGpc: 'Isyarat Global Privacy Control',
		referenceCopied: 'Rujukan disalin.',
		refuseAll:
			'tidak akan menjual atau berkongsi maklumat peribadi anda atau menggunakannya untuk pengiklanan disasarkan',
		refuseSaleAndShare:
			'tidak akan menjual atau berkongsi maklumat peribadi anda',
		refuseSaleAndTargetedAds:
			'tidak akan menjual maklumat peribadi anda atau menggunakannya untuk pengiklanan disasarkan',
		rejectAll: 'Tolak Semua',
		rightsAllowed: '{rights} dibenarkan.',
		rightsNotAllowed: '{rights} tidak dibenarkan.',
		rightsOptedOut: 'Memilih keluar daripada {rights}.',
		saleAllowed: '{business} boleh {rights}.',
		saleGroupOptIn: 'Benarkan {rights}',
		saleGroupSaleAndTargetedAds:
			'Pilih keluar daripada penjualan data peribadi saya dan pengiklanan disasarkan',
		saleOffByDefault:
			'Dimatikan secara lalai. {business} {rights} melainkan anda membenarkannya.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Simpan pilihan',
		saveInSettings: 'Simpan pilihan anda dalam Tetapan Privasi',
		savedAutomatically: 'Disimpan secara automatik',
		savedCue: 'Disimpan',
		scopeAccount: 'pada pelayar ini atau untuk akaun {business} anda',
		scopeAccountUnnamed: 'pada pelayar ini atau untuk akaun anda',
		scopeBrowser: 'pada pelayar ini',
		shortAll: 'menjual atau berkongsi data anda untuk iklan',
		shortSaleAndShare: 'menjual atau berkongsi data anda',
		shortSaleAndTargetedAds:
			'menjual data anda atau menggunakannya untuk iklan',
		stateOff: 'Mati',
		stateOn: 'Hidup',
		switchColumn: 'Hidup',
		switchedOff: '{name} dimatikan.',
		switchedOn: '{name} dihidupkan.',
		titleAll: 'Penjualan, perkongsian dan pengiklanan disasarkan',
		titleSaleAndShare: 'Penjualan dan perkongsian',
		titleSaleAndTargetedAds: 'Penjualan dan pengiklanan disasarkan',
		vendorColumn: 'Vendor',
		vendorPolicy: 'Dasar privasi {vendor}',
		vendorsClose: 'Tutup vendor {category}',
		vendorsFor: 'untuk {category}',
		vendorsHide: 'Sembunyikan {count} vendor',
		vendorsHideOne: 'Sembunyikan 1 vendor',
		vendorsOnCount: '{count} dihidupkan',
		vendorsTable: 'Vendor {category}',
		vendorsView: 'Lihat {count} vendor',
		vendorsViewOne: 'Lihat 1 vendor',
	},
	rights: {
		californiaPrivacyChoices: 'Pilihan Privasi California Anda',
		optOut: 'Jangan jual atau kongsi data saya',
		preferences: 'Urus pilihan',
		privacyChoices: 'Pilihan Privasi Anda',
	},
};

export default translations;
