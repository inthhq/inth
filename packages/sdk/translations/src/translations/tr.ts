import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Tümünü Kabul Et',
		acknowledge: 'Tamam',
		close: 'Kapat',
		customize: 'Özelleştir',
		dismiss: 'Gizle',
		rejectAll: 'Tümünü Reddet',
		save: 'Ayarları Kaydet',
		securedBy: 'Rıza sağlayıcısı:',
	},
	consentGate: {
		actionButton: '{category} çerezlerine rıza verin',
		error: 'Bu içerik yüklenemedi.',
		loading: 'İçerik yükleniyor…',
		policyBlocked:
			'Bu içerik, bölgenizdeki rıza politikası nedeniyle kullanılamıyor.',
		title: 'Bu içeriği görüntülemek için {category} çerezlerine rıza verin.',
	},
	consentManagerDialog: {
		description:
			'Gizlilik ayarlarınızı buradan özelleştirebilirsiniz. Hangi tür çerezlere ve izleme teknolojilerine izin vereceğinizi seçebilirsiniz.',
		title: 'Gizlilik Ayarları',
		vendors: {
			disabledByCategory: 'Satıcıları seçmek için bu kategoriyi açın.',
			privacyPolicy: 'Gizlilik politikası',
			switchLabel: 'İzin ver: {vendor}',
			title: 'Satıcılar ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Bu çerezler, daha iyi bir kullanıcı deneyimi sunmamıza ve yeni özellikleri test etmemize yardımcı olur.',
			title: 'Deneyim',
		},
		functionality: {
			description:
				'Bu çerezler, web sitesinde gelişmiş işlevleri ve kişiselleştirmeyi mümkün kılar.',
			title: 'İşlevsellik',
		},
		marketing: {
			description:
				'Bu çerezler, ilgili reklamları göstermek ve bu reklamların etkinliğini ölçmek için kullanılır.',
			title: 'Pazarlama',
		},
		measurement: {
			description:
				'Bu çerezler, ziyaretçilerin web sitesini nasıl kullandığını anlamamıza ve sitenin performansını iyileştirmemize yardımcı olur.',
			title: 'Analiz',
		},
		necessary: {
			description:
				'Bu çerezler, web sitesinin düzgün çalışması için zorunludur ve devre dışı bırakılamaz.',
			title: 'Zorunlu',
		},
	},
	cookieBanner: {
		description:
			'Bu site, gezinme deneyiminizi iyileştirmek, site trafiğini analiz etmek ve kişiselleştirilmiş içerik göstermek için çerezler kullanır.',
		noticeDescription:
			'Bu siteyi çalıştırmak, trafiği ölçmek ve içerikleri ve reklamları kişiselleştirmek için çerezler ve benzeri teknolojiler kullanıyoruz. Dilediğiniz zaman bunları reddedebilir veya tercihlerinizi yönetebilirsiniz.',
		noticeTitle: 'Gizlilik bildirimi',
		title: 'Gizliliğinize önem veriyoruz',
	},
	iab: {
		app: {
			consentStorage:
				'Seçimleriniz bu cihazda, uygulamanın standart ayar depolama alanında IABTCF anahtarları altında en fazla {days} gün boyunca saklanır. Seçimlerinizi güncellediğinizde saklama süresi yenilenir.',
			description:
				'Biz ve {partnerCount} iş ortağımız, bu uygulama için aşağıdaki amaçlarla cihazınızda bilgi depolarız ve/veya bu bilgilere erişiriz, benzersiz tanımlayıcılar ve gezinme verileri gibi kişisel verileri işleriz:',
			legitimateInterestExplanation:
				'Bazı iş ortakları, rıza istemek yerine meşru menfaatlerine dayanarak benzersiz tanımlayıcılar ve gezinme verileri gibi kişisel verileri işler. Bu yalnızca bu uygulama için geçerlidir. Her amaç ve her iş ortağı için bu işlemeye itiraz etme hakkına sahipsiniz.',
			scopeServiceSpecific:
				'Rızanız yalnızca bu uygulama için geçerlidir ve diğer hizmetleri etkilemez.',
			withdraw:
				'Seçimlerinizi bu uygulamadaki Gizlilik Ayarları bölümünden dilediğiniz zaman değiştirebilir veya rızanızı geri çekebilirsiniz.',
		},
		banner: {
			andMore: 've {count} tane daha...',
			description:
				'Biz ve {partnerCount} iş ortağımız, bu web sitesi için aşağıdaki amaçlarla cihazınızda bilgi depolarız ve/veya bu bilgilere erişiriz, benzersiz tanımlayıcılar ve gezinme verileri gibi kişisel verileri işleriz:',
			legitimateInterestNotice:
				'Bazı iş ortakları, verilerinizi işlemek için meşru menfaatleri olduğunu öne sürmektedir. Bu işlemeye itiraz etme, seçimlerinizi özelleştirme ve rızanızı dilediğiniz zaman geri çekme hakkına sahipsiniz.',
			partnersLink: '{count} iş ortağımız',
			scopeGroup: 'Seçiminiz bu gruptaki tüm web sitelerimiz için geçerlidir.',
			scopeServiceSpecific:
				'Rızanız yalnızca bu web sitesi için geçerlidir ve diğer hizmetleri etkilemez.',
			title: 'Gizlilik Ayarları',
		},
		common: {
			acceptAll: 'Tümünü Kabul Et',
			clearSelection: 'Temizle',
			customPartner: "IAB'ye kayıtlı olmayan özel iş ortağı",
			customize: 'Özelleştir',
			loading: 'Yükleniyor...',
			rejectAll: 'Tümünü Reddet',
			saveSettings: 'Ayarları Kaydet',
			showingSelectedVendor: 'Seçilen satıcı gösteriliyor',
		},
		preferenceCenter: {
			description:
				'Gizlilik ayarlarınızı buradan özelleştirebilirsiniz. Hangi tür çerezlere ve izleme teknolojilerine izin vereceğinizi seçebilirsiniz.',
			features: {
				description:
					'Bu işleme yöntemleri, yalnızca bu bildirimde size seçim hakkı tanınan bir veya birden fazla amaç doğrultusunda kullanılabilir.',
				title: 'Özellikler',
			},
			footer: {
				consentStorage:
					'Rıza tercihleri, "euconsent-v2" adlı bir çerezde 13 ay boyunca saklanır. Tercihlerinizi güncellediğinizde saklama süresi yenilenebilir.',
			},
			purposeItem: {
				examples: 'Örnekler',
				legitimateInterest: 'Meşru Menfaat',
				objectButton: 'İtiraz Et',
				objected: 'İtiraz Edildi',
				partners: '{count} iş ortağı',
				partnersUsingPurpose: 'Bu Amacı Kullanan İş Ortakları',
				rightToObject:
					'Meşru menfaate dayalı işlemeye itiraz etme hakkına sahipsiniz.',
				vendorsUseLegitimateInterest:
					'{count} satıcı meşru menfaat öne sürüyor',
				withYourPermission: 'İzninizle',
			},
			specialPurposes: {
				title: 'Temel İşlevler (Zorunlu)',
				tooltip:
					'Bunlar, sitenin işlevselliği ve güvenliği için gereklidir. IAB TCF uyarınca bu özel amaçlara itiraz edemezsiniz.',
			},
			tabs: {
				purposes: 'Amaçlar',
				vendors: 'Satıcılar',
			},
			title: 'Gizlilik Ayarları',
			vendorList: {
				adTechProvidersHeading: 'Google Reklam Teknolojisi Sağlayıcıları',
				adTechProvidersNotice:
					'Google, bu reklam teknolojisi sağlayıcılarıyla IAB çerçevesinin dışında çalışır. Rızanız bir sağlayıcıya yalnızca o sağlayıcıyı açtığınızda ve ayrıca cihazda depolamaya ve kişiselleştirilmiş reklamlara izin verdiğinizde ulaşır.',
				customVendorsHeading: 'Özel İş Ortakları',
				customVendorsNotice:
					"Bunlar, IAB Şeffaflık ve Rıza Çerçevesi'ne (TCF) kayıtlı olmayan özel iş ortaklarıdır. Verileri rızanıza dayanarak işlerler ve gizlilik uygulamaları IAB'ye kayıtlı satıcılardan farklı olabilir.",
				dataCategories: 'Veri Kategorileri',
				features: 'Özellikler',
				iabVendorsHeading: "IAB'ye Kayıtlı Satıcılar",
				iabVendorsNotice:
					"Bu iş ortakları, rıza yönetimi için bir sektör standardı olan IAB Şeffaflık ve Rıza Çerçevesi'ne (TCF) kayıtlıdır",
				legitimateInterest: 'Meşru Menf.',
				maxAge: 'Maks. süre: {days} gün',
				maxAgeRefreshes: '(yenilenir)',
				noVendorsFound: '"{searchTerm}" ile eşleşen satıcı bulunamadı',
				nonCookieAccess: 'Çerez Dışı Erişim',
				partnerCount: '{count} iş ortağı',
				partnerPlural: 'iş ortağı',
				partnerSingular: 'iş ortağı',
				privacyPolicy: 'Gizlilik Politikası',
				purposes: 'Amaçlar',
				requiredNotice:
					'Sitenin çalışması için gereklidir, devre dışı bırakılamaz',
				retainedDays: 'Saklanan: {days} gün',
				retention: 'Saklama süresi: {days} gün',
				search: 'Satıcı ara...',
				showingCount: 'Satıcılar: {filtered}/{total}',
				specialFeatures: 'Özel Özellikler',
				specialPurposes: 'Özel Amaçlar',
				storageDisclosure: 'Depolama Açıklaması',
				usesCookies: 'Çerez Kullanır',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Çerez Politikası',
		privacyPolicy: 'Gizlilik Politikası',
		termsOfService: 'Hizmet Şartları',
	},
	optOut: {
		action: 'Vazgeç',
		description:
			'Bu site kişisel bilgilerinizi satmaz veya paylaşmaz ve seçiminiz bu tarayıcıda kaydedilir.',
		done: 'Tamam',
		headingAll:
			'Kişisel bilgilerinizin satışı, paylaşımı ve hedefli reklamcılık',
		headingSaleAndShare: 'Kişisel bilgilerinizin satışı ve paylaşımı',
		headingSaleAndTargetedAds:
			'Kişisel bilgilerinizin satışı ve hedefli reklamcılık',
		lockedByAccount:
			'Hesabınız kapsam dışı bırakıldı, oturum açtıktan sonra bunu değiştirebilirsiniz.',
		lockedByGpc:
			'Tarayıcınızın Global Privacy Control sinyali açık olduğundan bu ayar kapalı kalır.',
		notOptedOut: 'Bu tarayıcıda vazgeçmediniz.',
		optInCancel: 'Devre dışı kal',
		optInConfirm: 'Yeniden katıl',
		optInDescription:
			'Onaylamak bu tarayıcıdaki devre dışı bırakma tercihinizi sonlandırır.',
		optInDescriptionWithRights:
			'Onaylamak bu tarayıcıdaki {rights} için devre dışı bırakma tercihinizi sonlandırır.',
		optInLink: 'Yeniden katıl…',
		optInTitle: 'Yeniden katılmak istiyor musunuz?',
		receiptAccount: 'Bu tarayıcıda ve hesabınızda kapsam dışı bırakıldınız.',
		receiptAccountWithRights:
			'Bu tarayıcıda ve hesabınızda {rights} kapsamı dışında bırakıldınız.',
		receiptBrowser: 'Bu tarayıcıda kapsam dışı bırakıldınız.',
		receiptBrowserWithRights:
			'Bu tarayıcıda {rights} kapsamı dışında bırakıldınız.',
		recordedLabel: 'Kaydedildi',
		referenceLabel: 'Referans',
		rightsAll: 'satış, paylaşım ve hedefli reklamcılık',
		rightsSaleAndShare: 'satış ve paylaşım',
		rightsSaleAndTargetedAds: 'satış ve hedefli reklamcılık',
		statusRequest: 'Kapsam dışı bırakma isteği uygulandı',
		statusSignal: 'Kapsam dışı bırakma tercih sinyali uygulandı',
	},
	privacyChoices: {
		acceptAll: 'Tümünü Kabul Et',
		advertisingFollowsSale:
			'Reklamcılık, yukarıdaki seçiminize göre belirlenir.',
		advertisingTitle: 'Reklamcılık',
		allow: 'İzin ver',
		alwaysOn: 'Her zaman açık',
		announceSaved: '{message} Kaydedildi.',
		askAll:
			'kişisel bilgilerinizi, hedefli reklamlar için de olmak üzere, satabilir veya paylaşabilir',
		askSaleAndShare: 'kişisel bilgilerinizi satabilir veya paylaşabilir',
		askSaleAndTargetedAds:
			'kişisel bilgilerinizi satabilir veya hedefli reklamlar için kullanabilir',
		bannerAllowedRightsOff:
			'İsteğe bağlı çerezlere izin verildi. {rights} kapalı kalıyor. Bunu Gizlilik Tercihleriniz bölümünden değiştirebilirsiniz.',
		bannerAllowedRightsOffGpc:
			'İsteğe bağlı çerezlere izin verildi. {rights}, Global Privacy Control sinyaliniz nedeniyle kapalı kalıyor. Bunu Gizlilik Tercihleriniz bölümünden değiştirebilirsiniz.',
		bannerRejected:
			'İsteğe bağlı çerezler reddedildi. Bunu Gizlilik Tercihleriniz bölümünden değiştirebilirsiniz.',
		barDescription:
			'Deneyiminizi iyileştirmek ve trafiği analiz etmek için çerezler kullanıyoruz.',
		businessFallback: 'bu site',
		choiceRecorded: 'Seçim alındı.',
		choicesSaved:
			'Seçimler kaydedildi. Bunları Gizlilik Tercihleriniz bölümünden değiştirebilirsiniz.',
		choose: 'Seç',
		chooseWhatToAllow: 'Nelere izin vereceğinizi seçin',
		close: 'Kapat',
		confirmDescriptionOptIn:
			'{business} {rights}. Bunu istediğiniz zaman değiştirebilirsiniz.',
		confirmDescriptionOptOut:
			'{business} {rights}. İstediğiniz zaman yeniden vazgeçebilirsiniz.',
		confirmKeepOptedOut: 'Vazgeçmeyi sürdür',
		confirmTitleOptIn: 'İzin verilsin mi: {rights}?',
		confirmTitleOptOut: 'Yeniden izin verilsin mi: {rights}?',
		copyFailed: 'Kopyalanamadı. Referansınızı seçip kopyalayın:',
		copyFailedAnnouncement:
			'Kopyalanamadı. Referansınızın tamamı onay kaydında gösteriliyor.',
		copyReference: 'Referansı kopyala',
		dialogIntro: 'Seçimleriniz hemen uygulanır.',
		dialogTitle: 'Gizlilik Tercihleriniz',
		done: 'Tamam',
		dontAllow: 'İzin verme',
		euDialogIntro:
			'{business} tarafından hangi isteğe bağlı çerezlerin kullanılabileceğini seçin. İsteğe bağlı çerezler siz açmadıkça kapalı kalır.',
		euDialogTitle: 'Gizlilik Ayarları',
		gpcNote:
			'Tarayıcınız bir Global Privacy Control sinyali gönderdi; bu nedenle {business}, {scope} {rights}. Sinyal açıkken İzin ver seçeneği kullanılamaz.',
		justNow: 'az önce',
		nestedSheetNote:
			'Değişiklikler, Gizlilik Ayarları bölümünde kaydettiğinizde uygulanır.',
		noticeBarDescription:
			'Bu siteyi çalıştırmak, trafiği ölçmek ve reklamları kişiselleştirmek için çerezler kullanıyoruz. Dilediğiniz zaman vazgeçebilirsiniz.',
		noticeBarDescriptionGpc:
			'Bu siteyi çalıştırmak ve trafiği ölçmek için çerezler kullanıyoruz. Global Privacy Control sinyalinize uyuluyor.',
		noticeGpcHonored:
			'Tarayıcınızın Global Privacy Control sinyaline uyuluyor.',
		noticeRightsAction: 'Verilerimi satma veya paylaşma',
		nudge: 'Önce iki düğmeden birini seçin.',
		optInBarDescription:
			'{business}, isteğe bağlı çerezleri kullanmadan veya {rights} önce size sorar.',
		optInDescription:
			'İzin verirseniz {business}, isteğe bağlı çerezleri site özellikleri ve analiz için kullanabilir ve {rights}. Siz izin vermedikçe hiçbir şey açılmaz.',
		optInTitle: 'Gizlilik tercihleriniz',
		optOutOption: 'Vazgeç',
		panelExpanded: 'Daha fazla seçenek gösteriliyor.',
		policyColumn: 'Gizlilik politikası',
		preferencesClose: 'Tercihleri kapat',
		preferencesOnCount: '{count} açık',
		preferencesSheetIntro: 'Değişiklikler hemen uygulanır.',
		preferencesSummary: 'Site özellikleri ve analiz',
		preferencesTitle: 'Tercihler',
		purposeColumn: 'Amaç',
		receiptAllowed: 'İzin verildi: {rights}',
		receiptDetails: 'Ayrıntılar',
		receiptFromGpc: 'Global Privacy Control sinyalinizden',
		receiptLive:
			'Bu tarayıcıdan gelen Global Privacy Control sinyaline uyuluyor',
		receiptLiveDetail: 'Her ziyarette tarayıcınızdan okunur.',
		receiptOptedOut: 'Vazgeçildi: {rights}',
		receiptRecorded: 'Kaydedildi: {date}',
		receiptReference: 'Referans',
		receiptSavedAccount: 'Hesabınıza kaydedildi · {date}',
		receiptSavedBrowser: 'Bu tarayıcı için kaydedildi · {date}',
		receiptScopeAccount: 'Bu tarayıcı ve {business} hesabınız için geçerlidir.',
		receiptScopeAccountUnnamed: 'Bu tarayıcı ve hesabınız için geçerlidir.',
		receiptScopeBrowser:
			'Bu tarayıcı için geçerlidir. Hesabınıza da uygulamak için oturum açın.',
		receiptViaGpc: 'Global Privacy Control sinyali',
		referenceCopied: 'Referans kopyalandı.',
		refuseAll:
			'kişisel bilgilerinizi satmayacak, paylaşmayacak ve hedefli reklamlar için kullanmayacak',
		refuseSaleAndShare: 'kişisel bilgilerinizi satmayacak ve paylaşmayacak',
		refuseSaleAndTargetedAds:
			'kişisel bilgilerinizi satmayacak ve hedefli reklamlar için kullanmayacak',
		rejectAll: 'Tümünü Reddet',
		rightsAllowed: '{rights} için izin verildi.',
		rightsNotAllowed: '{rights} için izin verilmedi.',
		rightsOptedOut: 'Vazgeçildi: {rights}.',
		saleAllowed: '{business} {rights}.',
		saleGroupOptIn: 'İzin ver: {rights}',
		saleGroupSaleAndTargetedAds:
			'Kişisel verilerimin satışından ve hedefli reklamcılıktan vazgeç',
		saleOffByDefault:
			'Varsayılan olarak kapalı. Siz izin vermedikçe {business} {rights}.',
		saleRefused: '{business}, {scope} {rights}.',
		saveChoices: 'Seçimleri kaydet',
		saveInSettings: 'Seçimlerinizi Gizlilik Ayarları bölümünde kaydedin',
		savedAutomatically: 'Otomatik olarak kaydedilir',
		savedCue: 'Kaydedildi',
		scopeAccount: 'bu tarayıcıda veya {business} hesabınız için',
		scopeAccountUnnamed: 'bu tarayıcıda veya hesabınız için',
		scopeBrowser: 'bu tarayıcıda',
		shortAll: 'verilerinizi reklam için satmadan veya paylaşmadan',
		shortSaleAndShare: 'verilerinizi satmadan veya paylaşmadan',
		shortSaleAndTargetedAds:
			'verilerinizi satmadan veya reklam için kullanmadan',
		stateOff: 'Kapalı',
		stateOn: 'Açık',
		switchColumn: 'Açık',
		switchedOff: '{name} kapalı.',
		switchedOn: '{name} açık.',
		titleAll: 'Satış, paylaşım ve hedefli reklamlar',
		titleSaleAndShare: 'Satış ve paylaşım',
		titleSaleAndTargetedAds: 'Satış ve hedefli reklamlar',
		vendorColumn: 'Satıcı',
		vendorPolicy: '{vendor} gizlilik politikası',
		vendorsClose: '{category} satıcılarını kapat',
		vendorsFor: '{category} için',
		vendorsHide: '{count} satıcıyı gizle',
		vendorsHideOne: '1 satıcıyı gizle',
		vendorsOnCount: '{count} açık',
		vendorsTable: '{category} satıcıları',
		vendorsView: '{count} satıcıyı göster',
		vendorsViewOne: '1 satıcıyı göster',
	},
	rights: {
		californiaPrivacyChoices: 'Kaliforniya Gizlilik Tercihleriniz',
		optOut: 'Verilerimi satma veya paylaşma',
		preferences: 'Tercihleri yönet',
		privacyChoices: 'Gizlilik Tercihleriniz',
	},
};

export default translations;
