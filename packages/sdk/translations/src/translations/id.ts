import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Terima Semua',
		acknowledge: 'Oke',
		close: 'Tutup',
		customize: 'Sesuaikan',
		dismiss: 'Tutup',
		rejectAll: 'Tolak Semua',
		save: 'Simpan Pengaturan',
		securedBy: 'Persetujuan oleh',
	},
	consentGate: {
		actionButton: 'Aktifkan persetujuan {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Setujui {category} untuk melihat konten ini.',
	},
	consentManagerDialog: {
		description:
			'Atur preferensi privasi Anda di sini. Anda dapat memilih jenis cookie dan teknologi pelacakan yang diizinkan.',
		title: 'Pengaturan Privasi',
		vendors: {
			disabledByCategory: 'Aktifkan kategori ini untuk memilih vendor.',
			privacyPolicy: 'Kebijakan Privasi',
			switchLabel: 'Izinkan {vendor}',
			title: 'Vendor ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Cookie ini membantu kami memberikan pengalaman pengguna yang lebih baik dan menguji fitur baru.',
			title: 'Pengalaman',
		},
		functionality: {
			description:
				'Cookie ini memungkinkan peningkatan fungsionalitas dan personalisasi situs web.',
			title: 'Fungsionalitas',
		},
		marketing: {
			description:
				'Cookie ini digunakan untuk menampilkan iklan yang relevan dan melacak efektivitasnya.',
			title: 'Pemasaran',
		},
		measurement: {
			description:
				'Cookie ini membantu kami memahami bagaimana pengunjung berinteraksi dengan situs web dan meningkatkan kinerjanya.',
			title: 'Analitik',
		},
		necessary: {
			description:
				'Cookie ini penting agar situs web dapat berfungsi dengan baik dan tidak dapat dinonaktifkan.',
			title: 'Sangat Diperlukan',
		},
	},
	cookieBanner: {
		description:
			'Situs ini menggunakan cookie untuk meningkatkan pengalaman penelusuran Anda, menganalisis lalu lintas situs, dan menampilkan konten yang dipersonalisasi.',
		noticeDescription:
			'Kami menggunakan cookie dan teknologi serupa untuk menjalankan situs ini, mengukur lalu lintas, serta mempersonalisasi konten dan iklan. Anda dapat memilih keluar atau mengelola preferensi Anda kapan saja.',
		noticeTitle: 'Pemberitahuan privasi',
		title: 'Kami menghargai privasi Anda',
	},
	iab: {
		app: {
			consentStorage:
				'Pilihan Anda disimpan di perangkat ini, dalam penyimpanan pengaturan standar aplikasi dengan kunci IABTCF, hingga {days} hari. Masa penyimpanan dimulai ulang saat Anda memperbarui pilihan Anda.',
			description:
				'Kami dan {partnerCount} mitra kami menyimpan dan/atau mengakses informasi pada perangkat Anda dan memproses data pribadi, seperti pengidentifikasi unik dan data penelusuran, untuk aplikasi ini, untuk:',
			legitimateInterestExplanation:
				'Beberapa mitra memproses data pribadi, seperti pengidentifikasi unik dan data penelusuran, berdasarkan kepentingan sah mereka alih-alih meminta persetujuan. Hal ini hanya berlaku untuk aplikasi ini. Anda memiliki hak untuk menolak pemrosesan ini untuk setiap tujuan dan setiap mitra.',
			scopeServiceSpecific:
				'Persetujuan Anda hanya berlaku untuk aplikasi ini dan tidak memengaruhi layanan lainnya.',
			withdraw:
				'Anda dapat mengubah pilihan atau menarik persetujuan Anda kapan saja dari Pengaturan Privasi di aplikasi ini.',
		},
		banner: {
			andMore: 'Dan {count} lainnya...',
			description:
				'Kami dan {partnerCount} mitra kami menyimpan dan/atau mengakses informasi pada perangkat Anda dan memproses data pribadi, seperti pengidentifikasi unik dan data penelusuran, untuk situs web ini, untuk:',
			legitimateInterestNotice:
				'Beberapa mitra mengklaim kepentingan sah untuk memproses data Anda. Anda memiliki hak untuk menolak pemrosesan ini, menyesuaikan pilihan Anda, dan menarik persetujuan Anda kapan saja.',
			partnersLink: '{count} mitra',
			scopeGroup:
				'Pilihan Anda berlaku untuk semua situs web kami dalam grup ini.',
			scopeServiceSpecific:
				'Persetujuan Anda hanya berlaku untuk situs web ini dan tidak memengaruhi layanan lainnya.',
			title: 'Pengaturan Privasi',
		},
		common: {
			acceptAll: 'Terima Semua',
			clearSelection: 'Bersihkan',
			customPartner: 'Mitra kustom tidak terdaftar di IAB',
			customize: 'Sesuaikan',
			loading: 'Memuat...',
			rejectAll: 'Tolak Semua',
			saveSettings: 'Simpan Pengaturan',
			showingSelectedVendor: 'Menampilkan vendor terpilih',
		},
		preferenceCenter: {
			description:
				'Atur preferensi privasi Anda di sini. Anda dapat memilih jenis cookie dan teknologi pelacakan yang diizinkan.',
			features: {
				description:
					'Sarana pemrosesan ini hanya dapat digunakan untuk mencapai satu atau beberapa tujuan yang dapat Anda pilih dalam pemberitahuan ini.',
				title: 'Fitur',
			},
			footer: {
				consentStorage:
					'Preferensi persetujuan disimpan dalam cookie bernama "euconsent-v2" selama 13 bulan. Masa penyimpanan tersebut dapat dimulai ulang saat Anda memperbarui preferensi Anda.',
			},
			purposeItem: {
				examples: 'Contoh',
				legitimateInterest: 'Kepentingan Sah',
				objectButton: 'Keberatan',
				objected: 'Ditolak',
				partners: '{count} mitra',
				partnersUsingPurpose: 'Mitra yang Menggunakan Tujuan Ini',
				rightToObject:
					'Anda memiliki hak untuk menolak pemrosesan berdasarkan kepentingan sah.',
				vendorsUseLegitimateInterest:
					'{count} vendor mengklaim kepentingan sah',
				withYourPermission: 'Dengan Izin Anda',
			},
			specialPurposes: {
				title: 'Fungsi Penting (Wajib)',
				tooltip:
					'Ini diperlukan untuk fungsionalitas dan keamanan situs. Per IAB TCF, Anda tidak dapat menolak tujuan khusus ini.',
			},
			tabs: {
				purposes: 'Tujuan',
				vendors: 'Vendor',
			},
			title: 'Pengaturan Privasi',
			vendorList: {
				adTechProvidersHeading: 'Penyedia Teknologi Iklan Google',
				adTechProvidersNotice:
					'Google bekerja sama dengan penyedia teknologi iklan ini di luar kerangka IAB. Persetujuan Anda hanya sampai ke penyedia jika Anda mengaktifkannya dan juga mengizinkan penyimpanan informasi di perangkat Anda serta iklan yang dipersonalisasi.',
				customVendorsHeading: 'Mitra Kustom',
				customVendorsNotice:
					'Ini adalah mitra kustom yang tidak terdaftar di IAB Transparency & Consent Framework (TCF). Mereka memproses data berdasarkan persetujuan Anda dan mungkin memiliki praktik privasi yang berbeda dari vendor terdaftar IAB.',
				dataCategories: 'Kategori Data',
				features: 'Fitur',
				iabVendorsHeading: 'Vendor Terdaftar IAB',
				iabVendorsNotice:
					'Mitra-mitra ini terdaftar di IAB Transparency & Consent Framework (TCF), standar industri untuk mengelola persetujuan',
				legitimateInterest: 'Kepent. Sah',
				maxAge: 'Usia Maks: {days}h',
				nonCookieAccess: 'Akses Non-Cookie',
				privacyPolicy: 'Kebijakan Privasi',
				purposes: 'Tujuan',
				requiredNotice:
					'Diperlukan untuk fungsionalitas situs, tidak dapat dinonaktifkan',
				retention: 'Retensi: {days}h',
				search: 'Cari vendor...',
				showingCount: '{filtered} dari {total} vendor',
				specialFeatures: 'Fitur Khusus',
				specialPurposes: 'Tujuan Khusus',
				storageDisclosure: 'Pengungkapan Penyimpanan',
				usesCookies: 'Menggunakan Cookie',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Kebijakan Cookie',
		privacyPolicy: 'Kebijakan Privasi',
		termsOfService: 'Syarat Layanan',
	},
	optOut: {
		action: 'Pilih keluar',
		description:
			'Situs ini tidak akan menjual atau membagikan informasi pribadi Anda, dan pilihan Anda disimpan di peramban ini.',
		done: 'Selesai',
		headingAll:
			'Penjualan dan pembagian informasi pribadi Anda serta iklan bertarget',
		headingSaleAndShare: 'Penjualan dan pembagian informasi pribadi Anda',
		headingSaleAndTargetedAds:
			'Penjualan informasi pribadi Anda dan iklan bertarget',
		lockedByAccount:
			'Akun Anda telah memilih keluar, dan Anda dapat mengubahnya setelah masuk.',
		lockedByGpc:
			'Sinyal Global Privacy Control peramban Anda aktif, sehingga ini tetap nonaktif.',
		notOptedOut: 'Anda belum memilih keluar di browser ini.',
		optInCancel: 'Tetap menolak',
		optInConfirm: 'Ikut kembali',
		optInDescription: 'Mengonfirmasi mengakhiri penolakan Anda di browser ini.',
		optInDescriptionWithRights:
			'Mengonfirmasi mengakhiri penolakan Anda atas {rights} di browser ini.',
		optInLink: 'Ikut kembali…',
		optInTitle: 'Ikut kembali?',
		receiptAccount:
			'Anda telah memilih keluar di browser ini dan di akun Anda.',
		receiptAccountWithRights:
			'Anda telah memilih keluar dari {rights} di browser ini dan di akun Anda.',
		receiptBrowser: 'Anda telah memilih keluar di browser ini.',
		receiptBrowserWithRights:
			'Anda telah memilih keluar dari {rights} di browser ini.',
		recordedLabel: 'Tercatat',
		referenceLabel: 'Referensi',
		rightsAll: 'penjualan, berbagi, dan iklan bertarget',
		rightsSaleAndShare: 'penjualan dan berbagi',
		rightsSaleAndTargetedAds: 'penjualan dan iklan bertarget',
		statusRequest: 'Permintaan keluar dipenuhi',
		statusSignal: 'Sinyal preferensi keluar dipenuhi',
	},
	privacyChoices: {
		acceptAll: 'Terima Semua',
		advertisingFollowsSale: 'Iklan mengikuti pilihan Anda di atas.',
		advertisingTitle: 'Iklan',
		allow: 'Izinkan',
		alwaysOn: 'Selalu aktif',
		announceSaved: '{message} Tersimpan.',
		askAll:
			'menjual atau membagikan informasi pribadi Anda, termasuk untuk iklan bertarget',
		askSaleAndShare: 'menjual atau membagikan informasi pribadi Anda',
		askSaleAndTargetedAds:
			'menjual informasi pribadi Anda atau menggunakannya untuk iklan bertarget',
		bannerAllowedRightsOff:
			'Cookie opsional diizinkan. {rights} tetap nonaktif. Anda dapat mengubahnya di Pilihan Privasi Anda.',
		bannerAllowedRightsOffGpc:
			'Cookie opsional diizinkan. {rights} tetap nonaktif karena sinyal Global Privacy Control Anda. Anda dapat mengubahnya di Pilihan Privasi Anda.',
		bannerRejected:
			'Cookie opsional ditolak. Anda dapat mengubahnya di Pilihan Privasi Anda.',
		barDescription:
			'Kami menggunakan cookie untuk meningkatkan pengalaman Anda dan menganalisis lalu lintas.',
		businessFallback: 'situs ini',
		choiceRecorded: 'Pilihan dicatat.',
		choicesSaved:
			'Pilihan disimpan. Anda dapat mengubahnya di Pilihan Privasi Anda.',
		choose: 'Pilih',
		chooseWhatToAllow: 'Pilih yang ingin diizinkan',
		close: 'Tutup',
		confirmDescriptionOptIn:
			'{business} boleh {rights}. Anda dapat mengubahnya kapan saja.',
		confirmDescriptionOptOut:
			'{business} boleh {rights}. Anda dapat memilih keluar lagi kapan saja.',
		confirmKeepOptedOut: 'Tetap menolak',
		confirmTitleOptIn: 'Izinkan {rights}?',
		confirmTitleOptOut: 'Izinkan lagi {rights}?',
		copyFailed: 'Tidak dapat menyalin. Pilih dan salin referensi Anda:',
		copyFailedAnnouncement:
			'Tidak dapat menyalin. Referensi lengkap Anda ditampilkan di tanda terima.',
		copyReference: 'Salin referensi',
		dialogIntro: 'Pilihan Anda langsung berlaku.',
		dialogTitle: 'Pilihan Privasi Anda',
		done: 'Selesai',
		dontAllow: 'Jangan izinkan',
		euDialogIntro:
			'Pilih cookie opsional yang boleh digunakan {business}. Cookie opsional tetap nonaktif kecuali Anda mengaktifkannya.',
		euDialogTitle: 'Pengaturan Privasi',
		gpcNote:
			'Browser Anda mengirim sinyal Global Privacy Control, sehingga {business} {rights} {scope}. Opsi Izinkan tidak tersedia selama sinyal aktif.',
		justNow: 'baru saja',
		nestedSheetNote:
			'Perubahan berlaku saat Anda menyimpan di Pengaturan Privasi.',
		noticeBarDescription:
			'Kami menggunakan cookie untuk menjalankan situs ini, mengukur lalu lintas, dan mempersonalisasi iklan. Anda dapat memilih keluar kapan saja.',
		noticeBarDescriptionGpc:
			'Kami menggunakan cookie untuk menjalankan situs ini dan mengukur lalu lintas. Sinyal Global Privacy Control Anda dipatuhi.',
		noticeGpcHonored: 'Sinyal Global Privacy Control browser Anda dipatuhi.',
		noticeRightsAction: 'Jangan jual atau bagikan data saya',
		nudge: 'Pilih salah satu dari dua tombol terlebih dahulu.',
		optInBarDescription:
			'{business} meminta izin sebelum menggunakan cookie opsional atau {rights}.',
		optInDescription:
			'Dengan izin Anda, {business} akan menggunakan cookie opsional untuk fitur situs dan analitik, serta {rights}. Tidak ada yang diaktifkan kecuali Anda mengizinkannya.',
		optInTitle: 'Pilihan privasi Anda',
		optOutOption: 'Pilih keluar',
		panelExpanded: 'Opsi lainnya ditampilkan.',
		policyColumn: 'Kebijakan privasi',
		preferencesClose: 'Tutup preferensi',
		preferencesOnCount: '{count} aktif',
		preferencesSheetIntro: 'Perubahan langsung berlaku.',
		preferencesSummary: 'Fitur situs dan analitik',
		preferencesTitle: 'Preferensi',
		purposeColumn: 'Tujuan',
		receiptAllowed: 'Mengizinkan {rights}',
		receiptDetails: 'Detail',
		receiptFromGpc: 'dari sinyal Global Privacy Control Anda',
		receiptLive: 'Mematuhi Global Privacy Control dari browser ini',
		receiptLiveDetail: 'Dibaca dari browser Anda pada setiap kunjungan.',
		receiptOptedOut: 'Memilih keluar dari {rights}',
		receiptRecorded: 'Dicatat {date}',
		receiptReference: 'Referensi',
		receiptSavedAccount: 'Disimpan ke akun Anda · {date}',
		receiptSavedBrowser: 'Disimpan untuk browser ini · {date}',
		receiptScopeAccount: 'Berlaku untuk browser ini dan akun {business} Anda.',
		receiptScopeAccountUnnamed: 'Berlaku untuk browser ini dan akun Anda.',
		receiptScopeBrowser:
			'Berlaku untuk browser ini. Masuk agar berlaku juga untuk akun Anda.',
		receiptViaGpc: 'Sinyal Global Privacy Control',
		referenceCopied: 'Referensi disalin.',
		refuseAll:
			'tidak akan menjual atau membagikan informasi pribadi Anda atau menggunakannya untuk iklan bertarget',
		refuseSaleAndShare:
			'tidak akan menjual atau membagikan informasi pribadi Anda',
		refuseSaleAndTargetedAds:
			'tidak akan menjual informasi pribadi Anda atau menggunakannya untuk iklan bertarget',
		rejectAll: 'Tolak Semua',
		rightsAllowed: '{rights} diizinkan.',
		rightsNotAllowed: '{rights} tidak diizinkan.',
		rightsOptedOut: 'Memilih keluar dari {rights}.',
		saleAllowed: '{business} boleh {rights}.',
		saleGroupOptIn: 'Izinkan {rights}',
		saleGroupSaleAndTargetedAds:
			'Pilih keluar dari penjualan data pribadi saya dan iklan bertarget',
		saleOffByDefault:
			'Nonaktif secara default. {business} {rights} kecuali Anda mengizinkannya.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Simpan pilihan',
		saveInSettings: 'Simpan pilihan Anda di Pengaturan Privasi',
		savedAutomatically: 'Disimpan otomatis',
		savedCue: 'Tersimpan',
		scopeAccount: 'di browser ini atau untuk akun {business} Anda',
		scopeAccountUnnamed: 'di browser ini atau untuk akun Anda',
		scopeBrowser: 'di browser ini',
		shortAll: 'menjual atau membagikan data Anda untuk iklan',
		shortSaleAndShare: 'menjual atau membagikan data Anda',
		shortSaleAndTargetedAds:
			'menjual data Anda atau menggunakannya untuk iklan',
		stateOff: 'Nonaktif',
		stateOn: 'Aktif',
		switchColumn: 'Aktif',
		switchedOff: '{name} nonaktif.',
		switchedOn: '{name} aktif.',
		titleAll: 'Penjualan, pembagian, dan iklan bertarget',
		titleSaleAndShare: 'Penjualan dan pembagian',
		titleSaleAndTargetedAds: 'Penjualan dan iklan bertarget',
		vendorColumn: 'Vendor',
		vendorPolicy: 'Kebijakan privasi {vendor}',
		vendorsClose: 'Tutup vendor {category}',
		vendorsFor: 'untuk {category}',
		vendorsHide: 'Sembunyikan {count} vendor',
		vendorsHideOne: 'Sembunyikan 1 vendor',
		vendorsOnCount: '{count} aktif',
		vendorsTable: 'Vendor {category}',
		vendorsView: 'Lihat {count} vendor',
		vendorsViewOne: 'Lihat 1 vendor',
	},
	rights: {
		californiaPrivacyChoices: 'Pilihan Privasi California Anda',
		optOut: 'Jangan jual atau bagikan data saya',
		preferences: 'Kelola preferensi',
		privacyChoices: 'Pilihan Privasi Anda',
	},
};
export default translations;
