import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'قبول الكل',
		acknowledge: 'حسنًا',
		close: 'إغلاق',
		customize: 'تخصيص',
		dismiss: 'تجاهل',
		rejectAll: 'رفض الكل',
		save: 'حفظ الإعدادات',
		securedBy: 'الموافقة عبر',
	},
	consentGate: {
		actionButton: 'تفعيل الموافقة على {category}',
		error: 'تعذّر تحميل هذا المحتوى.',
		loading: 'جارٍ تحميل المحتوى…',
		policyBlocked:
			'هذا المحتوى غير متاح بموجب سياسة الموافقة المعمول بها في منطقتك.',
		title: 'يتطلب عرض هذا المحتوى الموافقة على {category}.',
	},
	consentManagerDialog: {
		description:
			'يمكنك تخصيص إعدادات الخصوصية من هنا، واختيار أنواع ملفات تعريف الارتباط وتقنيات التتبع التي تسمح بها.',
		title: 'إعدادات الخصوصية',
		vendors: {
			disabledByCategory: 'يلزم تفعيل هذه الفئة لاختيار المورّدين.',
			privacyPolicy: 'سياسة الخصوصية',
			switchLabel: 'السماح بالتعامل مع {vendor}',
			title: 'المورّدون ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'تساعدنا ملفات تعريف الارتباط هذه على تقديم تجربة استخدام أفضل واختبار الميزات الجديدة.',
			title: 'التجربة',
		},
		functionality: {
			description:
				'تتيح ملفات تعريف الارتباط هذه وظائف محسّنة وتخصيص الموقع الإلكتروني.',
			title: 'الوظائف',
		},
		marketing: {
			description:
				'تُستخدم ملفات تعريف الارتباط هذه لعرض إعلانات ذات صلة وقياس فعاليتها.',
			title: 'التسويق',
		},
		measurement: {
			description:
				'تساعدنا ملفات تعريف الارتباط هذه على فهم كيفية تفاعل الزوار مع الموقع الإلكتروني وتحسين أدائه.',
			title: 'التحليلات',
		},
		necessary: {
			description:
				'ملفات تعريف الارتباط هذه ضرورية لعمل الموقع الإلكتروني بشكل سليم، ولا يمكن تعطيلها.',
			title: 'ضرورية للغاية',
		},
	},
	cookieBanner: {
		description:
			'يستخدم هذا الموقع ملفات تعريف الارتباط لتحسين تجربة التصفح، وتحليل حركة المرور على الموقع، وعرض محتوى مخصّص.',
		noticeDescription:
			'نستخدم ملفات تعريف الارتباط وتقنيات مشابهة لتشغيل هذا الموقع، وقياس حركة المرور، وتخصيص المحتوى والإعلانات. يمكنك الرفض أو إدارة تفضيلاتك في أي وقت.',
		noticeTitle: 'إشعار الخصوصية',
		title: 'نحن نحترم خصوصيتك',
	},
	iab: {
		app: {
			consentStorage:
				'تُخزَّن خياراتك على هذا الجهاز، في مساحة تخزين الإعدادات القياسية للتطبيق ضمن مفاتيح IABTCF، لمدة تصل إلى {days} يومًا. وتتجدد مدة التخزين عند تحديث خياراتك.',
			description:
				'نقوم نحن و{partnerCount} من الشركاء الذين نتعامل معهم بتخزين المعلومات على جهازك و/أو الوصول إليها، ومعالجة البيانات الشخصية، مثل المعرّفات الفريدة وبيانات التصفح، لهذا التطبيق من أجل:',
			legitimateInterestExplanation:
				'يعالج بعض الشركاء البيانات الشخصية، مثل المعرّفات الفريدة وبيانات التصفح، على أساس مصلحتهم المشروعة بدلًا من طلب موافقتك. ينطبق ذلك على هذا التطبيق فقط. ويحق لك الاعتراض على هذه المعالجة لكل غرض ولكل شريك.',
			scopeServiceSpecific:
				'تنطبق موافقتك على هذا التطبيق فقط، ولن تؤثر في الخدمات الأخرى.',
			withdraw:
				'يمكنك تغيير خياراتك أو سحب موافقتك في أي وقت من إعدادات الخصوصية في هذا التطبيق.',
		},
		banner: {
			andMore: 'و{count} أخرى...',
			description:
				'نقوم نحن و{partnerCount} من الشركاء الذين نتعامل معهم بتخزين المعلومات على جهازك و/أو الوصول إليها، ومعالجة البيانات الشخصية، مثل المعرّفات الفريدة وبيانات التصفح، لهذا الموقع الإلكتروني من أجل:',
			legitimateInterestNotice:
				'يدّعي بعض الشركاء وجود مصلحة مشروعة لمعالجة بياناتك. ويحق لك الاعتراض على هذه المعالجة، وتخصيص خياراتك، وسحب موافقتك في أي وقت.',
			partnersLink: '{count} من الشركاء',
			scopeGroup: 'ينطبق اختيارك على جميع مواقعنا الإلكترونية ضمن هذه المجموعة.',
			scopeServiceSpecific:
				'تنطبق موافقتك على هذا الموقع الإلكتروني فقط، ولن تؤثر في الخدمات الأخرى.',
			title: 'إعدادات الخصوصية',
		},
		common: {
			acceptAll: 'قبول الكل',
			clearSelection: 'مسح',
			customPartner: 'شريك مخصّص غير مسجّل لدى IAB',
			customize: 'تخصيص',
			loading: 'جارٍ التحميل...',
			rejectAll: 'رفض الكل',
			saveSettings: 'حفظ الإعدادات',
			showingSelectedVendor: 'عرض المورّد المحدد',
		},
		preferenceCenter: {
			description:
				'يمكنك تخصيص إعدادات الخصوصية من هنا، واختيار أنواع ملفات تعريف الارتباط وتقنيات التتبع التي تسمح بها.',
			features: {
				description:
					'لا يجوز استخدام وسائل المعالجة هذه إلا لتحقيق غرض واحد أو أكثر من الأغراض التي يُتاح لك الاختيار بشأنها في هذا الإشعار.',
				title: 'الميزات',
			},
			footer: {
				consentStorage:
					'تُخزَّن تفضيلات الموافقة في ملف تعريف ارتباط باسم "euconsent-v2" لمدة 13 شهرًا. وقد تتجدد مدة التخزين عند تحديث تفضيلاتك.',
			},
			purposeItem: {
				examples: 'أمثلة',
				legitimateInterest: 'المصلحة المشروعة',
				objectButton: 'اعتراض',
				objected: 'تم الاعتراض',
				partners: 'الشركاء: {count}',
				partnersUsingPurpose: 'الشركاء الذين يستخدمون هذا الغرض',
				rightToObject:
					'يحق لك الاعتراض على المعالجة القائمة على المصلحة المشروعة.',
				vendorsUseLegitimateInterest:
					'المورّدون الذين يستندون إلى المصلحة المشروعة: {count}',
				withYourPermission: 'بموافقتك',
			},
			specialPurposes: {
				title: 'الوظائف الأساسية (مطلوبة)',
				tooltip:
					'هذه الوظائف مطلوبة لتشغيل الموقع وأمانه. ووفقًا لإطار IAB TCF، لا يمكن الاعتراض على هذه الأغراض الخاصة.',
			},
			tabs: {
				purposes: 'الأغراض',
				vendors: 'المورّدون',
			},
			title: 'إعدادات الخصوصية',
			vendorList: {
				adTechProvidersHeading: 'مزوّدو تقنيات الإعلان لدى Google',
				adTechProvidersNotice:
					'تتعامل Google مع مزوّدي تقنيات الإعلان هؤلاء خارج إطار IAB. ولا تصل موافقتك إلى أي مزوّد إلا إذا فعّلته وسمحت أيضًا بالتخزين على الجهاز والإعلانات المخصّصة.',
				customVendorsHeading: 'الشركاء المخصّصون',
				customVendorsNotice:
					'هؤلاء شركاء مخصّصون غير مسجّلين في إطار الشفافية والموافقة (TCF) التابع لـ IAB. وهم يعالجون البيانات بناءً على موافقتك، وقد تختلف ممارساتهم المتعلقة بالخصوصية عن ممارسات المورّدين المسجّلين لدى IAB.',
				dataCategories: 'فئات البيانات',
				features: 'الميزات',
				iabVendorsHeading: 'المورّدون المسجّلون لدى IAB',
				iabVendorsNotice:
					'هؤلاء الشركاء مسجّلون في إطار الشفافية والموافقة (TCF) التابع لـ IAB، وهو معيار معتمد في القطاع لإدارة الموافقة',
				legitimateInterest: 'مصلحة مشروعة',
				maxAge: 'المدة القصوى (بالأيام): {days}',
				maxAgeRefreshes: '(تتجدد)',
				noVendorsFound: 'لا يوجد مورّدون يطابقون "{searchTerm}"',
				nonCookieAccess: 'وصول لا يعتمد على ملفات تعريف الارتباط',
				partnerCount: 'الشركاء: {count}',
				partnerPlural: 'شركاء',
				partnerSingular: 'شريك',
				privacyPolicy: 'سياسة الخصوصية',
				purposes: 'الأغراض',
				requiredNotice: 'مطلوب لتشغيل الموقع، ولا يمكن تعطيله',
				retainedDays: 'مدة الاحتفاظ (بالأيام): {days}',
				retention: 'مدة الاحتفاظ (بالأيام): {days}',
				search: 'البحث عن المورّدين...',
				showingCount: 'المورّدون المعروضون: {filtered} من {total}',
				specialFeatures: 'الميزات الخاصة',
				specialPurposes: 'الأغراض الخاصة',
				storageDisclosure: 'الإفصاح عن التخزين',
				usesCookies: 'يستخدم ملفات تعريف الارتباط',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'سياسة ملفات تعريف الارتباط',
		privacyPolicy: 'سياسة الخصوصية',
		termsOfService: 'شروط الخدمة',
	},
	optOut: {
		action: 'إلغاء الاشتراك',
		description:
			'لن يبيع هذا الموقع معلوماتك الشخصية أو يشاركها، وقد تم حفظ اختيارك على هذا المتصفح.',
		done: 'تم',
		headingAll: 'بيع ومشاركة معلوماتك الشخصية والإعلانات المستهدفة',
		headingSaleAndShare: 'بيع ومشاركة معلوماتك الشخصية',
		headingSaleAndTargetedAds: 'بيع معلوماتك الشخصية والإعلانات المستهدفة',
		lockedByAccount:
			'اختار حسابك عدم المشاركة، ويمكنك تغيير ذلك بعد تسجيل الدخول.',
		lockedByGpc:
			'إشارة التحكم العالمي في الخصوصية في متصفحك مفعلة، لذا يبقى هذا الخيار متوقفاً.',
		notOptedOut: 'لم تقم بإلغاء الاشتراك في هذا المتصفح.',
		optInCancel: 'الاستمرار في الرفض',
		optInConfirm: 'إعادة الاشتراك',
		optInDescription: 'يؤدي التأكيد إلى إنهاء إلغاء الاشتراك على هذا المتصفح.',
		optInDescriptionWithRights:
			'يؤدي التأكيد إلى إنهاء إلغاء الاشتراك في {rights} على هذا المتصفح.',
		optInLink: 'إعادة الاشتراك…',
		optInTitle: 'هل تريد إعادة الاشتراك؟',
		receiptAccount: 'تم تسجيل إلغاء اشتراكك في هذا المتصفح وحسابك.',
		receiptAccountWithRights:
			'تم تسجيل إلغاء اشتراكك في {rights} في هذا المتصفح وحسابك.',
		receiptBrowser: 'تم تسجيل إلغاء اشتراكك في هذا المتصفح.',
		receiptBrowserWithRights:
			'تم تسجيل إلغاء اشتراكك في {rights} في هذا المتصفح.',
		recordedLabel: 'وقت التسجيل',
		referenceLabel: 'المرجع',
		rightsAll: 'البيع والمشاركة والإعلانات المستهدفة',
		rightsSaleAndShare: 'البيع والمشاركة',
		rightsSaleAndTargetedAds: 'البيع والإعلانات المستهدفة',
		statusRequest: 'تم تنفيذ طلب عدم المشاركة',
		statusSignal: 'تم تنفيذ إشارة تفضيل عدم المشاركة',
	},
	privacyChoices: {
		acceptAll: 'قبول الكل',
		advertisingFollowsSale: 'تتبع الإعلانات اختيارك أعلاه.',
		advertisingTitle: 'الإعلانات',
		allow: 'السماح',
		alwaysOn: 'مفعّلة دائمًا',
		announceSaved: '{message} تم الحفظ.',
		askAll: 'بيع معلوماتك الشخصية أو مشاركتها، بما يشمل الإعلانات المستهدفة',
		askSaleAndShare: 'بيع معلوماتك الشخصية أو مشاركتها',
		askSaleAndTargetedAds:
			'بيع معلوماتك الشخصية أو استخدامها في الإعلانات المستهدفة',
		bannerAllowedRightsOff:
			'تم السماح بملفات تعريف الارتباط الاختيارية. {rights}: ما زالت متوقفة. يمكنك تغيير ذلك من «خيارات الخصوصية الخاصة بك».',
		bannerAllowedRightsOffGpc:
			'تم السماح بملفات تعريف الارتباط الاختيارية. {rights}: ما زالت متوقفة بسبب إشارة Global Privacy Control من متصفحك. يمكنك تغيير ذلك من «خيارات الخصوصية الخاصة بك».',
		bannerRejected:
			'تم رفض ملفات تعريف الارتباط الاختيارية. يمكنك تغيير ذلك من «خيارات الخصوصية الخاصة بك».',
		barDescription:
			'نستخدم ملفات تعريف الارتباط لتحسين تجربتك وتحليل حركة المرور.',
		businessFallback: 'هذا الموقع',
		choiceRecorded: 'تم تسجيل الاختيار.',
		choicesSaved:
			'تم حفظ الاختيارات. يمكنك تغييرها من «خيارات الخصوصية الخاصة بك».',
		choose: 'اختيار',
		chooseWhatToAllow: 'اختيار ما تسمح به',
		close: 'إغلاق',
		confirmDescriptionOptIn:
			'يستطيع {business} {rights}. يمكنك تغيير ذلك في أي وقت.',
		confirmDescriptionOptOut:
			'يستطيع {business} {rights}. يمكنك إلغاء الاشتراك مجددًا في أي وقت.',
		confirmKeepOptedOut: 'الاستمرار في الرفض',
		confirmTitleOptIn: 'هل توافق على {rights}؟',
		confirmTitleOptOut: 'هل توافق مجددًا على {rights}؟',
		copyFailed: 'تعذّر النسخ. حدّد مرجعك وانسخه:',
		copyFailedAnnouncement: 'تعذّر النسخ. مرجعك الكامل معروض في الإيصال.',
		copyReference: 'نسخ المرجع',
		dialogIntro: 'تُطبَّق اختياراتك فورًا.',
		dialogTitle: 'خيارات الخصوصية الخاصة بك',
		done: 'تم',
		dontAllow: 'عدم السماح',
		euDialogIntro:
			'اختر ملفات تعريف الارتباط الاختيارية التي يمكن أن يستخدمها {business}. تبقى ملفات تعريف الارتباط الاختيارية متوقفة ما لم تفعّلها.',
		euDialogTitle: 'إعدادات الخصوصية',
		gpcNote:
			'أرسل متصفحك إشارة Global Privacy Control، لذا فإن {business} {rights} {scope}. خيار «السماح» غير متاح ما دامت الإشارة مفعّلة.',
		justNow: 'الآن',
		nestedSheetNote: 'تُطبَّق التغييرات عند الحفظ في إعدادات الخصوصية.',
		noticeBarDescription:
			'نستخدم ملفات تعريف الارتباط لتشغيل هذا الموقع وقياس حركة المرور وتخصيص الإعلانات. يمكنك إلغاء الاشتراك في أي وقت.',
		noticeBarDescriptionGpc:
			'نستخدم ملفات تعريف الارتباط لتشغيل هذا الموقع وقياس حركة المرور. نلتزم بإشارة Global Privacy Control الخاصة بك.',
		noticeGpcHonored: 'نلتزم بإشارة Global Privacy Control الصادرة من متصفحك.',
		noticeRightsAction: 'عدم بيع بياناتي أو مشاركتها',
		nudge: 'اختر أحد الزرّين أولًا.',
		optInBarDescription:
			'يطلب {business} إذنك قبل استخدام ملفات تعريف الارتباط الاختيارية أو {rights}.',
		optInDescription:
			'بعد إذنك، سيستخدم {business} ملفات تعريف الارتباط الاختيارية لميزات الموقع والتحليلات، وسيستطيع {rights}. لن يُفعَّل أي شيء ما لم تسمح به.',
		optInTitle: 'خيارات الخصوصية الخاصة بك',
		optOutOption: 'إلغاء الاشتراك',
		panelExpanded: 'تم عرض خيارات إضافية.',
		policyColumn: 'سياسة الخصوصية',
		preferencesClose: 'إغلاق التفضيلات',
		preferencesOnCount: 'المفعّلة: {count}',
		preferencesSheetIntro: 'تُطبَّق التغييرات فورًا.',
		preferencesSummary: 'ميزات الموقع والتحليلات',
		preferencesTitle: 'التفضيلات',
		purposeColumn: 'الغرض',
		receiptAllowed: 'تمت الموافقة على {rights}',
		receiptDetails: 'التفاصيل',
		receiptFromGpc: 'بناءً على إشارة Global Privacy Control من متصفحك',
		receiptLive: 'نلتزم بإشارة Global Privacy Control من هذا المتصفح',
		receiptLiveDetail: 'تُقرأ من متصفحك في كل زيارة.',
		receiptOptedOut: 'تم إلغاء الاشتراك في {rights}',
		receiptRecorded: 'وقت التسجيل: {date}',
		receiptReference: 'المرجع',
		receiptSavedAccount: 'محفوظ في حسابك · {date}',
		receiptSavedBrowser: 'محفوظ لهذا المتصفح · {date}',
		receiptScopeAccount: 'يسري على هذا المتصفح وعلى حسابك لدى {business}.',
		receiptScopeAccountUnnamed: 'يسري على هذا المتصفح وعلى حسابك.',
		receiptScopeBrowser:
			'يسري على هذا المتصفح. سجّل الدخول ليسري على حسابك أيضًا.',
		receiptViaGpc: 'إشارة Global Privacy Control',
		referenceCopied: 'تم نسخ المرجع.',
		refuseAll:
			'لن يبيع معلوماتك الشخصية أو يشاركها أو يستخدمها في الإعلانات المستهدفة',
		refuseSaleAndShare: 'لن يبيع معلوماتك الشخصية أو يشاركها',
		refuseSaleAndTargetedAds:
			'لن يبيع معلوماتك الشخصية أو يستخدمها في الإعلانات المستهدفة',
		rejectAll: 'رفض الكل',
		rightsAllowed: '{rights}: مسموح.',
		rightsNotAllowed: '{rights}: غير مسموح.',
		rightsOptedOut: 'تم إلغاء الاشتراك في {rights}.',
		saleAllowed: 'يستطيع {business} {rights}.',
		saleGroupOptIn: 'الموافقة على {rights}',
		saleGroupSaleAndTargetedAds:
			'إلغاء الاشتراك في بيع بياناتي الشخصية وفي الإعلانات المستهدفة',
		saleOffByDefault: 'متوقف افتراضيًا. {business} {rights} ما لم تسمح بذلك.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'حفظ الاختيارات',
		saveInSettings: 'احفظ اختياراتك في إعدادات الخصوصية',
		savedAutomatically: 'يُحفظ تلقائيًا',
		savedCue: 'تم الحفظ',
		scopeAccount: 'على هذا المتصفح أو في حسابك لدى {business}',
		scopeAccountUnnamed: 'على هذا المتصفح أو في حسابك',
		scopeBrowser: 'على هذا المتصفح',
		shortAll: 'بيع بياناتك أو مشاركتها لأغراض الإعلانات',
		shortSaleAndShare: 'بيع بياناتك أو مشاركتها',
		shortSaleAndTargetedAds: 'بيع بياناتك أو استخدامها في الإعلانات',
		stateOff: 'متوقف',
		stateOn: 'مفعّل',
		switchColumn: 'مفعّل',
		switchedOff: 'تم إيقاف {name}.',
		switchedOn: 'تم تفعيل {name}.',
		titleAll: 'البيع والمشاركة والإعلانات المستهدفة',
		titleSaleAndShare: 'البيع والمشاركة',
		titleSaleAndTargetedAds: 'البيع والإعلانات المستهدفة',
		vendorColumn: 'المورّد',
		vendorPolicy: 'سياسة الخصوصية لدى {vendor}',
		vendorsClose: 'إغلاق مورّدي فئة {category}',
		vendorsFor: 'لفئة {category}',
		vendorsHide: 'إخفاء المورّدين ({count})',
		vendorsHideOne: 'إخفاء مورّد واحد',
		vendorsOnCount: 'المفعّلون: {count}',
		vendorsTable: 'مورّدو فئة {category}',
		vendorsView: 'عرض المورّدين ({count})',
		vendorsViewOne: 'عرض مورّد واحد',
	},
	rights: {
		californiaPrivacyChoices: 'خيارات الخصوصية الخاصة بك في كاليفورنيا',
		optOut: 'عدم بيع بياناتي أو مشاركتها',
		preferences: 'إدارة التفضيلات',
		privacyChoices: 'خيارات الخصوصية الخاصة بك',
	},
};

export default translations;
