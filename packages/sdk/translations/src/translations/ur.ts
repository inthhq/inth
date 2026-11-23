import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'سب قبول کریں',
		acknowledge: 'ٹھیک ہے',
		close: 'بند کریں',
		customize: 'حسبِ ضرورت بنائیں',
		dismiss: 'ہٹا دیں',
		rejectAll: 'سب مسترد کریں',
		save: 'ترتیبات محفوظ کریں',
		securedBy: 'رضامندی بذریعہ',
	},
	consentGate: {
		actionButton: '{category} کے لیے رضامندی دیں',
		error: 'یہ مواد لوڈ نہیں ہو سکا۔',
		loading: 'مواد لوڈ ہو رہا ہے…',
		policyBlocked:
			'آپ کے علاقے کی رضامندی کی پالیسی کے تحت یہ مواد دستیاب نہیں ہے۔',
		title: 'یہ مواد دیکھنے کے لیے {category} کے لیے رضامندی دیں۔',
	},
	consentManagerDialog: {
		description:
			'اپنی رازداری کی ترتیبات یہاں حسبِ ضرورت بنائیں۔ آپ منتخب کر سکتے ہیں کہ کن اقسام کی کوکیز اور ٹریکنگ ٹیکنالوجیز کی اجازت دینی ہے۔',
		title: 'رازداری کی ترتیبات',
		vendors: {
			disabledByCategory: 'وینڈرز منتخب کرنے کے لیے یہ زمرہ آن کریں۔',
			privacyPolicy: 'رازداری کی پالیسی',
			switchLabel: '{vendor} کو اجازت دیں',
			title: 'وینڈرز ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'یہ کوکیز ہمیں صارف کا بہتر تجربہ فراہم کرنے اور نئی خصوصیات آزمانے میں مدد دیتی ہیں۔',
			title: 'تجربہ',
		},
		functionality: {
			description:
				'یہ کوکیز ویب سائٹ کی بہتر فعالیت اور ذاتی نوعیت کی سہولیات ممکن بناتی ہیں۔',
			title: 'فعالیت',
		},
		marketing: {
			description:
				'یہ کوکیز متعلقہ اشتہارات دکھانے اور ان کی تاثیر جانچنے کے لیے استعمال ہوتی ہیں۔',
			title: 'مارکیٹنگ',
		},
		measurement: {
			description:
				'یہ کوکیز ہمیں یہ سمجھنے میں مدد دیتی ہیں کہ زائرین ویب سائٹ کو کیسے استعمال کرتے ہیں، تاکہ ہم اس کی کارکردگی بہتر بنا سکیں۔',
			title: 'تجزیات',
		},
		necessary: {
			description:
				'یہ کوکیز ویب سائٹ کے درست طریقے سے کام کرنے کے لیے ضروری ہیں اور انہیں غیر فعال نہیں کیا جا سکتا۔',
			title: 'انتہائی ضروری',
		},
	},
	cookieBanner: {
		description:
			'یہ سائٹ آپ کے براؤزنگ کے تجربے کو بہتر بنانے، سائٹ ٹریفک کا تجزیہ کرنے اور ذاتی نوعیت کا مواد دکھانے کے لیے کوکیز استعمال کرتی ہے۔',
		noticeDescription:
			'ہم یہ سائٹ چلانے، ٹریفک کی پیمائش کرنے اور مواد اور اشتہارات کو آپ کے لیے ذاتی نوعیت کا بنانے کے لیے کوکیز اور اسی طرح کی ٹیکنالوجیز استعمال کرتے ہیں۔ آپ کسی بھی وقت دستبردار ہو سکتے ہیں یا اپنی ترجیحات کا نظم کر سکتے ہیں۔',
		noticeTitle: 'رازداری کا نوٹس',
		title: 'ہم آپ کی رازداری کی قدر کرتے ہیں',
	},
	iab: {
		app: {
			consentStorage:
				'آپ کے انتخاب اس آلے پر، ایپ کے معیاری ترتیبات کے ذخیرے میں IABTCF کلیدوں کے تحت، زیادہ سے زیادہ {days} دن کے لیے محفوظ کیے جاتے ہیں۔ جب آپ اپنے انتخاب اپ ڈیٹ کرتے ہیں تو ذخیرہ کرنے کی مدت دوبارہ شروع ہو جاتی ہے۔',
			description:
				'ہم اور ہمارے {partnerCount} شراکت دار اس ایپ کے لیے آپ کے آلے پر معلومات محفوظ کرتے اور/یا ان تک رسائی حاصل کرتے ہیں، اور ذاتی ڈیٹا، جیسے منفرد شناخت کنندگان اور براؤزنگ ڈیٹا، پر کارروائی کرتے ہیں، درج ذیل مقاصد کے لیے:',
			legitimateInterestExplanation:
				'کچھ شراکت دار رضامندی مانگنے کے بجائے اپنے جائز مفاد کی بنیاد پر ذاتی ڈیٹا، جیسے منفرد شناخت کنندگان اور براؤزنگ ڈیٹا، پر کارروائی کرتے ہیں۔ یہ صرف اس ایپ پر لاگو ہوتا ہے۔ آپ کو ہر مقصد اور ہر شراکت دار کے لیے اس کارروائی پر اعتراض کرنے کا حق حاصل ہے۔',
			scopeServiceSpecific:
				'آپ کی رضامندی صرف اس ایپ پر لاگو ہوتی ہے اور دیگر خدمات کو متاثر نہیں کرے گی۔',
			withdraw:
				'آپ اس ایپ میں رازداری کی ترتیبات سے کسی بھی وقت اپنے انتخاب تبدیل کر سکتے ہیں یا اپنی رضامندی واپس لے سکتے ہیں۔',
		},
		banner: {
			andMore: 'اور {count} مزید...',
			description:
				'ہم اور ہمارے {partnerCount} شراکت دار اس ویب سائٹ کے لیے آپ کے آلے پر معلومات محفوظ کرتے اور/یا ان تک رسائی حاصل کرتے ہیں، اور ذاتی ڈیٹا، جیسے منفرد شناخت کنندگان اور براؤزنگ ڈیٹا، پر کارروائی کرتے ہیں، درج ذیل مقاصد کے لیے:',
			legitimateInterestNotice:
				'کچھ شراکت دار آپ کے ڈیٹا پر کارروائی کے لیے جائز مفاد کا دعویٰ کرتے ہیں۔ آپ کو اس کارروائی پر اعتراض کرنے، اپنے انتخاب حسبِ ضرورت بنانے اور کسی بھی وقت اپنی رضامندی واپس لینے کا حق حاصل ہے۔',
			partnersLink: '{count} شراکت دار',
			scopeGroup:
				'آپ کا انتخاب اس گروپ میں شامل ہماری تمام ویب سائٹس پر لاگو ہوتا ہے۔',
			scopeServiceSpecific:
				'آپ کی رضامندی صرف اس ویب سائٹ پر لاگو ہوتی ہے اور دیگر خدمات کو متاثر نہیں کرے گی۔',
			title: 'رازداری کی ترتیبات',
		},
		common: {
			acceptAll: 'سب قبول کریں',
			clearSelection: 'صاف کریں',
			customPartner: 'حسبِ ضرورت شراکت دار جو IAB کے ساتھ رجسٹرڈ نہیں',
			customize: 'حسبِ ضرورت بنائیں',
			loading: 'لوڈ ہو رہا ہے...',
			rejectAll: 'سب مسترد کریں',
			saveSettings: 'ترتیبات محفوظ کریں',
			showingSelectedVendor: 'منتخب وینڈر دکھایا جا رہا ہے',
		},
		preferenceCenter: {
			description:
				'اپنی رازداری کی ترتیبات یہاں حسبِ ضرورت بنائیں۔ آپ منتخب کر سکتے ہیں کہ کن اقسام کی کوکیز اور ٹریکنگ ٹیکنالوجیز کی اجازت دینی ہے۔',
			features: {
				description:
					'ڈیٹا پر کارروائی کے یہ طریقے صرف ایک یا زیادہ ایسے مقاصد کے حصول کے لیے استعمال کیے جا سکتے ہیں جن کے لیے آپ کو اس نوٹس میں انتخاب دیا گیا ہے۔',
				title: 'خصوصیات',
			},
			footer: {
				consentStorage:
					'رضامندی کی ترجیحات "euconsent-v2" نامی کوکی میں 13 ماہ کے لیے محفوظ کی جاتی ہیں۔ جب آپ اپنی ترجیحات اپ ڈیٹ کرتے ہیں تو ذخیرہ کرنے کی مدت دوبارہ شروع ہو سکتی ہے۔',
			},
			purposeItem: {
				examples: 'مثالیں',
				legitimateInterest: 'جائز مفاد',
				objectButton: 'اعتراض کریں',
				objected: 'اعتراض کیا گیا',
				partners: '{count} شراکت دار',
				partnersUsingPurpose: 'یہ مقصد استعمال کرنے والے شراکت دار',
				rightToObject:
					'آپ کو جائز مفاد کی بنیاد پر کی جانے والی کارروائی پر اعتراض کرنے کا حق حاصل ہے۔',
				vendorsUseLegitimateInterest:
					'جائز مفاد کا دعویٰ کرنے والے وینڈرز کی تعداد: {count}',
				withYourPermission: 'آپ کی اجازت سے',
			},
			specialPurposes: {
				title: 'بنیادی افعال (لازمی)',
				tooltip:
					'یہ سائٹ کی فعالیت اور سیکیورٹی کے لیے ضروری ہیں۔ IAB TCF کے مطابق، آپ ان خصوصی مقاصد پر اعتراض نہیں کر سکتے۔',
			},
			tabs: {
				purposes: 'مقاصد',
				vendors: 'وینڈرز',
			},
			title: 'رازداری کی ترتیبات',
			vendorList: {
				adTechProvidersHeading: 'Google کے اشتہاری ٹیکنالوجی فراہم کنندگان',
				adTechProvidersNotice:
					'Google ان اشتہاری ٹیکنالوجی فراہم کنندگان کے ساتھ IAB فریم ورک سے باہر کام کرتا ہے۔ آپ کی رضامندی کسی فراہم کنندہ تک صرف اسی صورت میں پہنچتی ہے جب آپ اسے آن کریں اور ساتھ ہی آلے پر ذخیرہ کاری اور ذاتی نوعیت کے اشتہارات کی اجازت بھی دیں۔',
				customVendorsHeading: 'حسبِ ضرورت شراکت دار',
				customVendorsNotice:
					'یہ حسبِ ضرورت شراکت دار ہیں جو IAB شفافیت و رضامندی فریم ورک (TCF) کے ساتھ رجسٹرڈ نہیں ہیں۔ یہ آپ کی رضامندی کی بنیاد پر ڈیٹا پر کارروائی کرتے ہیں اور ان کے رازداری کے طریقے IAB میں رجسٹرڈ وینڈرز سے مختلف ہو سکتے ہیں۔',
				dataCategories: 'ڈیٹا کے زمرے',
				features: 'خصوصیات',
				iabVendorsHeading: 'IAB میں رجسٹرڈ وینڈرز',
				iabVendorsNotice:
					'یہ شراکت دار IAB شفافیت و رضامندی فریم ورک (TCF) کے ساتھ رجسٹرڈ ہیں، جو رضامندی کے انتظام کا صنعتی معیار ہے',
				legitimateInterest: 'جائز مفاد',
				maxAge: 'زیادہ سے زیادہ مدت: {days} دن',
				maxAgeRefreshes: '(تجدید ہوتی ہے)',
				noVendorsFound: '"{searchTerm}" سے مماثل کوئی وینڈر نہیں ملا',
				nonCookieAccess: 'کوکی کے بغیر رسائی',
				partnerCount: '{count} شراکت دار',
				partnerPlural: 'شراکت دار',
				partnerSingular: 'شراکت دار',
				privacyPolicy: 'رازداری کی پالیسی',
				purposes: 'مقاصد',
				requiredNotice:
					'سائٹ کی فعالیت کے لیے ضروری، غیر فعال نہیں کیا جا سکتا',
				retainedDays: 'محفوظ رکھا جاتا ہے: {days} دن',
				retention: 'محفوظ رکھنے کی مدت: {days} دن',
				search: 'وینڈرز تلاش کریں...',
				showingCount: 'وینڈرز: کل {total}، دکھائے گئے {filtered}',
				specialFeatures: 'خاص خصوصیات',
				specialPurposes: 'خصوصی مقاصد',
				storageDisclosure: 'ذخیرہ کاری کا انکشاف',
				usesCookies: 'کوکیز استعمال کرتا ہے',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'کوکی پالیسی',
		privacyPolicy: 'رازداری کی پالیسی',
		termsOfService: 'شرائطِ خدمت',
	},
	optOut: {
		action: 'آپٹ آؤٹ کریں',
		description:
			'یہ سائٹ آپ کی ذاتی معلومات فروخت یا شیئر نہیں کرے گی، اور آپ کا انتخاب اس براؤزر میں محفوظ ہے۔',
		done: 'مکمل',
		headingAll: 'آپ کی ذاتی معلومات کی فروخت اور اشتراک اور ہدف بند اشتہارات',
		headingSaleAndShare: 'آپ کی ذاتی معلومات کی فروخت اور اشتراک',
		headingSaleAndTargetedAds:
			'آپ کی ذاتی معلومات کی فروخت اور ہدف بند اشتہارات',
		lockedByAccount:
			'آپ کے اکاؤنٹ نے آپٹ آؤٹ کیا ہے، اور آپ سائن ان کرنے کے بعد اسے تبدیل کر سکتے ہیں۔',
		lockedByGpc:
			'آپ کے براؤزر کا Global Privacy Control سگنل آن ہے، اس لیے یہ بند رہتا ہے۔',
		notOptedOut: 'آپ نے اس براؤزر پر آپٹ آؤٹ نہیں کیا ہے۔',
		optInCancel: 'آپٹ آؤٹ رہیں',
		optInConfirm: 'دوبارہ شامل ہوں',
		optInDescription:
			'تصدیق کرنے سے اس براؤزر پر آپ کا آپٹ آؤٹ ختم ہو جاتا ہے۔',
		optInDescriptionWithRights:
			'تصدیق کرنے سے اس براؤزر پر {rights} سے آپ کا آپٹ آؤٹ ختم ہو جاتا ہے۔',
		optInLink: 'دوبارہ شامل ہوں…',
		optInTitle: 'دوبارہ شامل ہوں؟',
		receiptAccount: 'آپ اس براؤزر اور اپنے اکاؤنٹ میں آپٹ آؤٹ ہو چکے ہیں۔',
		receiptAccountWithRights:
			'آپ اس براؤزر اور اپنے اکاؤنٹ میں {rights} سے آپٹ آؤٹ ہو چکے ہیں۔',
		receiptBrowser: 'آپ اس براؤزر میں آپٹ آؤٹ ہو چکے ہیں۔',
		receiptBrowserWithRights:
			'آپ اس براؤزر میں {rights} سے آپٹ آؤٹ ہو چکے ہیں۔',
		recordedLabel: 'درج کیا گیا',
		referenceLabel: 'حوالہ',
		rightsAll: 'فروخت، اشتراک اور ہدف شدہ اشتہارات',
		rightsSaleAndShare: 'فروخت اور اشتراک',
		rightsSaleAndTargetedAds: 'فروخت اور ہدف شدہ اشتہارات',
		statusRequest: 'آپٹ آؤٹ درخواست پر عمل کر دیا گیا',
		statusSignal: 'آپٹ آؤٹ ترجیحی سگنل پر عمل کر دیا گیا',
	},
	privacyChoices: {
		acceptAll: 'سب قبول کریں',
		advertisingFollowsSale: 'اشتہارات اوپر دیے گئے آپ کے انتخاب کے مطابق ہیں۔',
		advertisingTitle: 'اشتہارات',
		allow: 'اجازت دیں',
		alwaysOn: 'ہمیشہ آن',
		announceSaved: '{message} محفوظ ہو گیا۔',
		askAll:
			'آپ کی ذاتی معلومات فروخت یا شیئر کر سکتی ہے، بشمول ہدف بند اشتہارات کے لیے',
		askSaleAndShare: 'آپ کی ذاتی معلومات فروخت یا شیئر کر سکتی ہے',
		askSaleAndTargetedAds:
			'آپ کی ذاتی معلومات فروخت کر سکتی ہے یا انہیں ہدف بند اشتہارات کے لیے استعمال کر سکتی ہے',
		bannerAllowedRightsOff:
			'اختیاری کوکیز کی اجازت دے دی گئی۔ {rights} بند رہیں گے۔ آپ اسے ”آپ کے رازداری کے انتخابات“ میں تبدیل کر سکتے ہیں۔',
		bannerAllowedRightsOffGpc:
			'اختیاری کوکیز کی اجازت دے دی گئی۔ {rights} آپ کے Global Privacy Control سگنل کی وجہ سے بند رہیں گے۔ آپ اسے ”آپ کے رازداری کے انتخابات“ میں تبدیل کر سکتے ہیں۔',
		bannerRejected:
			'اختیاری کوکیز مسترد کر دی گئیں۔ آپ اسے ”آپ کے رازداری کے انتخابات“ میں تبدیل کر سکتے ہیں۔',
		barDescription:
			'ہم آپ کا تجربہ بہتر بنانے اور ٹریفک کا تجزیہ کرنے کے لیے کوکیز استعمال کرتے ہیں۔',
		businessFallback: 'یہ سائٹ',
		choiceRecorded: 'انتخاب درج کر لیا گیا۔',
		choicesSaved:
			'انتخابات محفوظ ہو گئے۔ آپ انہیں ”آپ کے رازداری کے انتخابات“ میں تبدیل کر سکتے ہیں۔',
		choose: 'منتخب کریں',
		chooseWhatToAllow: 'منتخب کریں کہ کس چیز کی اجازت دینی ہے',
		close: 'بند کریں',
		confirmDescriptionOptIn:
			'{business} {rights}۔ آپ اسے کسی بھی وقت تبدیل کر سکتے ہیں۔',
		confirmDescriptionOptOut:
			'{business} {rights}۔ آپ کسی بھی وقت دوبارہ آپٹ آؤٹ کر سکتے ہیں۔',
		confirmKeepOptedOut: 'آپٹ آؤٹ رہیں',
		confirmTitleOptIn: '{rights} کی اجازت دیں؟',
		confirmTitleOptOut: '{rights} کی دوبارہ اجازت دیں؟',
		copyFailed: 'کاپی نہیں ہو سکا۔ اپنا حوالہ منتخب کر کے کاپی کریں:',
		copyFailedAnnouncement:
			'کاپی نہیں ہو سکا۔ آپ کا مکمل حوالہ رسید میں دکھایا گیا ہے۔',
		copyReference: 'حوالہ کاپی کریں',
		dialogIntro: 'آپ کے انتخابات فوراً لاگو ہوتے ہیں۔',
		dialogTitle: 'آپ کے رازداری کے انتخابات',
		done: 'مکمل',
		dontAllow: 'اجازت نہ دیں',
		euDialogIntro:
			'منتخب کریں کہ {business} کون سی اختیاری کوکیز استعمال کر سکتی ہے۔ جب تک آپ انہیں آن نہ کریں، اختیاری کوکیز بند رہتی ہیں۔',
		euDialogTitle: 'رازداری کی ترتیبات',
		gpcNote:
			'آپ کے براؤزر نے Global Privacy Control سگنل بھیجا ہے، اس لیے {business} {scope} {rights}۔ جب تک سگنل آن ہے، ”اجازت دیں“ کا اختیار دستیاب نہیں۔',
		justNow: 'ابھی ابھی',
		nestedSheetNote:
			'تبدیلیاں تب لاگو ہوں گی جب آپ رازداری کی ترتیبات میں محفوظ کریں گے۔',
		noticeBarDescription:
			'ہم یہ سائٹ چلانے، ٹریفک کی پیمائش کرنے اور اشتہارات کو ذاتی نوعیت کا بنانے کے لیے کوکیز استعمال کرتے ہیں۔ آپ کسی بھی وقت آپٹ آؤٹ کر سکتے ہیں۔',
		noticeBarDescriptionGpc:
			'ہم یہ سائٹ چلانے اور ٹریفک کی پیمائش کرنے کے لیے کوکیز استعمال کرتے ہیں۔ آپ کے Global Privacy Control سگنل پر عمل کیا جا رہا ہے۔',
		noticeGpcHonored:
			'آپ کے براؤزر کے Global Privacy Control سگنل پر عمل کیا جا رہا ہے۔',
		noticeRightsAction: 'میرا ڈیٹا فروخت یا شیئر نہ کریں',
		nudge: 'پہلے دونوں بٹنوں میں سے ایک منتخب کریں۔',
		optInBarDescription:
			'{business} اختیاری کوکیز استعمال کرنے یا {rights} سے پہلے آپ سے پوچھتی ہے۔',
		optInDescription:
			'آپ کی اجازت سے، {business} سائٹ کی خصوصیات اور تجزیات کے لیے اختیاری کوکیز استعمال کرے گی اور {rights}۔ جب تک آپ اجازت نہ دیں، کچھ بھی آن نہیں ہوتا۔',
		optInTitle: 'آپ کے رازداری کے انتخابات',
		optOutOption: 'آپٹ آؤٹ کریں',
		panelExpanded: 'مزید اختیارات دکھائے گئے ہیں۔',
		policyColumn: 'رازداری کی پالیسی',
		preferencesClose: 'ترجیحات بند کریں',
		preferencesOnCount: '{count} آن',
		preferencesSheetIntro: 'تبدیلیاں فوراً لاگو ہوتی ہیں۔',
		preferencesSummary: 'سائٹ کی خصوصیات اور تجزیات',
		preferencesTitle: 'ترجیحات',
		purposeColumn: 'مقصد',
		receiptAllowed: '{rights} کی اجازت دی گئی',
		receiptDetails: 'تفصیلات',
		receiptFromGpc: 'آپ کے Global Privacy Control سگنل سے',
		receiptLive:
			'اس براؤزر کے Global Privacy Control سگنل پر عمل کیا جا رہا ہے',
		receiptLiveDetail: 'ہر وزٹ پر آپ کے براؤزر سے پڑھا جاتا ہے۔',
		receiptOptedOut: '{rights} سے آپٹ آؤٹ کیا گیا',
		receiptRecorded: 'درج کیا گیا: {date}',
		receiptReference: 'حوالہ',
		receiptSavedAccount: 'آپ کے اکاؤنٹ میں محفوظ · {date}',
		receiptSavedBrowser: 'اس براؤزر کے لیے محفوظ · {date}',
		receiptScopeAccount:
			'اس براؤزر اور آپ کے {business} اکاؤنٹ پر لاگو ہوتا ہے۔',
		receiptScopeAccountUnnamed: 'اس براؤزر اور آپ کے اکاؤنٹ پر لاگو ہوتا ہے۔',
		receiptScopeBrowser:
			'اس براؤزر پر لاگو ہوتا ہے۔ اسے اپنے اکاؤنٹ پر بھی لاگو کرنے کے لیے سائن ان کریں۔',
		receiptViaGpc: 'Global Privacy Control سگنل',
		referenceCopied: 'حوالہ کاپی ہو گیا۔',
		refuseAll:
			'آپ کی ذاتی معلومات فروخت یا شیئر نہیں کرے گی اور نہ انہیں ہدف بند اشتہارات کے لیے استعمال کرے گی',
		refuseSaleAndShare: 'آپ کی ذاتی معلومات فروخت یا شیئر نہیں کرے گی',
		refuseSaleAndTargetedAds:
			'آپ کی ذاتی معلومات فروخت نہیں کرے گی اور نہ انہیں ہدف بند اشتہارات کے لیے استعمال کرے گی',
		rejectAll: 'سب مسترد کریں',
		rightsAllowed: '{rights} کی اجازت دے دی گئی۔',
		rightsNotAllowed: '{rights} کی اجازت نہیں دی گئی۔',
		rightsOptedOut: '{rights} سے آپٹ آؤٹ کر دیا گیا۔',
		saleAllowed: '{business} {rights}۔',
		saleGroupOptIn: '{rights} کی اجازت دیں',
		saleGroupSaleAndTargetedAds:
			'میرے ذاتی ڈیٹا کی فروخت اور ہدف بند اشتہارات سے آپٹ آؤٹ کریں',
		saleOffByDefault:
			'بطورِ ڈیفالٹ بند۔ جب تک آپ اجازت نہ دیں، {business} {rights}۔',
		saleRefused: '{business} {scope} {rights}۔',
		saveChoices: 'انتخابات محفوظ کریں',
		saveInSettings: 'اپنے انتخابات رازداری کی ترتیبات میں محفوظ کریں',
		savedAutomatically: 'خودکار طور پر محفوظ',
		savedCue: 'محفوظ ہو گیا',
		scopeAccount: 'اس براؤزر پر یا آپ کے {business} اکاؤنٹ کے لیے',
		scopeAccountUnnamed: 'اس براؤزر پر یا آپ کے اکاؤنٹ کے لیے',
		scopeBrowser: 'اس براؤزر پر',
		shortAll: 'اشتہارات کے لیے آپ کا ڈیٹا فروخت یا شیئر کرنے',
		shortSaleAndShare: 'آپ کا ڈیٹا فروخت یا شیئر کرنے',
		shortSaleAndTargetedAds:
			'آپ کا ڈیٹا فروخت کرنے یا اشتہارات کے لیے استعمال کرنے',
		stateOff: 'بند',
		stateOn: 'آن',
		switchColumn: 'آن',
		switchedOff: '{name} بند۔',
		switchedOn: '{name} آن۔',
		titleAll: 'فروخت، اشتراک اور ہدف بند اشتہارات',
		titleSaleAndShare: 'فروخت اور اشتراک',
		titleSaleAndTargetedAds: 'فروخت اور ہدف بند اشتہارات',
		vendorColumn: 'وینڈر',
		vendorPolicy: '{vendor} کی رازداری کی پالیسی',
		vendorsClose: '{category} کے وینڈرز بند کریں',
		vendorsFor: '{category} کے لیے',
		vendorsHide: '{count} وینڈرز چھپائیں',
		vendorsHideOne: '1 وینڈر چھپائیں',
		vendorsOnCount: '{count} آن',
		vendorsTable: '{category} کے وینڈرز',
		vendorsView: '{count} وینڈرز دیکھیں',
		vendorsViewOne: '1 وینڈر دیکھیں',
	},
	rights: {
		californiaPrivacyChoices: 'کیلیفورنیا میں آپ کے رازداری کے انتخابات',
		optOut: 'میرا ڈیٹا فروخت یا شیئر نہ کریں',
		preferences: 'ترجیحات کا نظم کریں',
		privacyChoices: 'آپ کے رازداری کے انتخابات',
	},
};

export default translations;
