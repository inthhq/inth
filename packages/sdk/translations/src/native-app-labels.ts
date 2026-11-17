/**
 * Labels for the native iOS and Android IAB screens: the preference, partner
 * list and partner pages. Only `scripts/generate-native-iab-copy.ts` reads
 * them. No package entry exports this module, so web bundles, which load
 * every language on some routes, never carry these strings.
 *
 * @internal
 */
export interface NativeAppLabels {
	/** Status of the strictly necessary row, which can't be switched off. */
	alwaysOn: string;
	/** Navigation button that returns to the previous screen. */
	back: string;
	/** Closes Privacy settings without saving. */
	cancel: string;
	/** Accessibility label of the button that closes Privacy settings. */
	close: string;
	/** Accessibility state of a closed Details section. */
	collapsed: string;
	/** Heading for a partner's consent switch. */
	consent: string;
	/** Heading for the data categories a partner collects. */
	dataCollected: string;
	/** A duration in days, two or more. Keep {count}. */
	dayCount: string;
	/** A duration of exactly one day. */
	dayCountOne: string;
	/** Button that reveals a purpose's or feature's legal text and illustrations. */
	details: string;
	/** Heading for how a partner stores information on the device. */
	deviceStorage: string;
	/** Link to a partner's device storage disclosure. */
	deviceStorageDetails: string;
	/** Confirms leaving without saving. */
	discardChanges: string;
	/** Body of the leave-without-saving dialog. */
	discardChangesDetail: string;
	/** Title of the leave-without-saving dialog. */
	discardChangesTitle: string;
	/** Accessibility state of an open Details section. */
	expanded: string;
	/** Button that closes the Details section. */
	hideDetails: string;
	/** Link to the IAB partner list. Keep {count}. */
	iabPartnerCount: string;
	/** Title of the IAB partner list. */
	iabPartners: string;
	/** Stays on the screen to keep editing. */
	keepEditing: string;
	/** When the user last saved. Keep {date}. */
	lastChanged: string;
	/** Link to a partner's statement of its legitimate interest. */
	legitimateInterestStatement: string;
	/** The partner list is too old to save choices against. */
	listOutdated: string;
	/** Button that reloads settings after they changed. */
	loadCurrentSettings: string;
	/** Answer in a partner's device storage table. */
	no: string;
	/** Status of an item the user cannot switch, such as a Feature or Special Purpose. */
	noChoice: string;
	/** A partner stores nothing on the device. */
	noDeviceStorage: string;
	/** Search found nothing. Keep {search}. */
	noPartnersMatch: string;
	/** Purposes the publisher blocks for this partner. Keep {purposes}. */
	notAllowedPurposes: string;
	/** Status: switched off. */
	off: string;
	/** Status: switched on. */
	on: string;
	/** Whether a partner reads the device by means other than stored data. */
	otherDeviceAccess: string;
	/** Status: some of a partner's uses are on. */
	partlyOn: string;
	/** Fallback title for a partner page. */
	partner: string;
	/** Section heading for the partner lists. */
	partners: string;
	/** Introduction at the top of Privacy settings. */
	preferencesIntro: string;
	/** Shown when the partner list hasn't loaded. */
	preferencesUnavailable: string;
	/** Follows the Google ad tech providers notice while the required purposes are off. */
	providersOff: string;
	/** Shows which purpose filters the partner list. Keep {purpose}. */
	purposeFilter: string;
	/** Whether a partner renews what it stores on the device. */
	refreshesStoredInformation: string;
	/** The partner gave no retention period. */
	retentionNotProvided: string;
	/** Heading for a partner's retention periods. */
	retentionTitle: string;
	/** Short Save action in the navigation bar of Privacy settings. */
	save: string;
	/** Search field on the Google ad tech provider list. */
	searchOtherPartners: string;
	/** Search field on the IAB partner list. */
	searchPartners: string;
	/** Stored only until the app closes. */
	sessionOnly: string;
	/** Title shown when settings changed during editing. */
	settingsChanged: string;
	/** Body shown when settings changed during editing. */
	settingsChangedDetail: string;
	/** Note under a Special Feature switch. */
	specialFeatureOptIn: string;
	/** On a partner page: where Special Features are switched. */
	specialFeaturesElsewhere: string;
	/** A partner's default retention period. */
	standardRetention: string;
	/** Label before a partner's maximum storage duration. */
	storedForUpTo: string;
	/** Section heading for the app's own data uses. */
	thisApp: string;
	/** Retries loading the partner list or saving. */
	tryAgain: string;
	/** Under a legitimate interest switch. */
	turnOffToObject: string;
	/** Row summary in the partner list. Keep both placeholders. */
	vendorPurposeSummary: string;
	/** Opens the partners that use a purpose. */
	viewPartners: string;
	/** Answer in a partner's device storage table. */
	yes: string;
	/** Heading for a partner's switches. */
	yourChoices: string;
}

/** Native IAB screen labels by language code. */
export const nativeAppLabels: Record<string, NativeAppLabels> = {
	ar: {
		alwaysOn: 'مُفعَّل دائمًا',
		back: 'رجوع',
		cancel: 'إلغاء',
		close: 'إغلاق',
		collapsed: 'مطويّ',
		consent: 'الموافقة',
		dataCollected: 'البيانات التي تُجمع',
		dayCount: '{count} يومًا',
		dayCountOne: 'يوم واحد',
		details: 'التفاصيل',
		deviceStorage: 'التخزين على الجهاز',
		deviceStorageDetails: 'تفاصيل التخزين على الجهاز',
		discardChanges: 'تجاهل التغييرات',
		discardChangesDetail: 'لن تُحفظ تغييراتك.',
		discardChangesTitle: 'هل تريد تجاهل التغييرات؟',
		expanded: 'موسَّع',
		hideDetails: 'إخفاء التفاصيل',
		iabPartnerCount: '{count} من شركاء IAB',
		iabPartners: 'شركاء IAB',
		keepEditing: 'متابعة التعديل',
		lastChanged: 'آخر تغيير: {date}',
		legitimateInterestStatement: 'بيان المصلحة المشروعة',
		listOutdated:
			'قائمة شركائنا قديمة. حاول تحميلها مرة أخرى، أو ارفض الاستخدام الاختياري للبيانات.',
		loadCurrentSettings: 'تحميل الإعدادات الحالية',
		no: 'لا',
		noChoice: 'بلا خيار',
		noDeviceStorage: 'لا يخزّن أي معلومات على جهازك.',
		noPartnersMatch: 'لا يوجد شركاء يطابقون "{search}".',
		notAllowedPurposes: 'لا يسمح هذا التطبيق لهذا الشريك بما يلي: {purposes}',
		off: 'مُعطَّل',
		on: 'مُفعَّل',
		otherDeviceAccess: 'طرق أخرى للوصول إلى جهازك',
		partlyOn: 'مُفعَّل جزئيًا',
		partner: 'شريك',
		partners: 'الشركاء',
		preferencesIntro:
			'نقوم نحن وشركاؤنا بتخزين المعلومات على جهازك والوصول إليها، ومعالجة البيانات الشخصية للأغراض الموضحة أدناه. ويعتمد بعض الشركاء على المصلحة المشروعة بدلًا من الموافقة. يمكنك الاعتراض على ذلك وتغيير خياراتك في أي وقت من إعدادات الخصوصية.',
		preferencesUnavailable:
			'إعدادات الخصوصية غير متاحة بعد. اتصل بالإنترنت وحاول مرة أخرى.',
		providersOff:
			'هذه الأغراض مُعطَّلة حاليًا، لذا يبقى هؤلاء الشركاء مُعطَّلين حتى تفعّلها من قسم الأغراض.',
		purposeFilter: 'الغرض: {purpose}',
		refreshesStoredInformation: 'يجدّد المعلومات المخزّنة',
		retentionNotProvided: 'لم يحدّده هذا الشريك.',
		retentionTitle: 'مدة الاحتفاظ بالبيانات',
		save: 'حفظ',
		searchOtherPartners: 'البحث عن شركاء آخرين',
		searchPartners: 'البحث عن الشركاء',
		sessionOnly: 'لهذه الجلسة فقط',
		settingsChanged: 'تغيّرت الإعدادات أثناء تعديلك لها',
		settingsChangedDetail:
			'لم تُحفظ خياراتك. حمّل الإعدادات الحالية، ثم اختر مرة أخرى.',
		specialFeatureOptIn: 'لا يفعل الشركاء ذلك إلا إذا فعّلته.',
		specialFeaturesElsewhere: 'يُضبط من قسم الميزات الخاصة في إعدادات الخصوصية.',
		standardRetention: 'مدة الاحتفاظ القياسية',
		storedForUpTo: 'يُخزَّن لمدة تصل إلى',
		thisApp: 'هذا التطبيق',
		tryAgain: 'إعادة المحاولة',
		turnOffToObject: 'عطّله للاعتراض.',
		vendorPurposeSummary:
			'{purposes} من الأغراض · {legitimateInterest} على أساس المصلحة المشروعة',
		viewPartners: 'عرض الشركاء',
		yes: 'نعم',
		yourChoices: 'خياراتك',
	},
	bg: {
		alwaysOn: 'Винаги включено',
		back: 'Назад',
		cancel: 'Отказ',
		close: 'Затвори',
		collapsed: 'Свито',
		consent: 'Съгласие',
		dataCollected: 'Събирани данни',
		dayCount: '{count} дни',
		dayCountOne: '1 ден',
		details: 'Подробности',
		deviceStorage: 'Съхранение на устройството',
		deviceStorageDetails: 'Подробности за съхранението на устройството',
		discardChanges: 'Отхвърли промените',
		discardChangesDetail: 'Промените ви няма да бъдат запазени.',
		discardChangesTitle: 'Да се отхвърлят ли промените?',
		expanded: 'Разгънато',
		hideDetails: 'Скрий подробностите',
		iabPartnerCount: '{count} партньори на IAB',
		iabPartners: 'Партньори на IAB',
		keepEditing: 'Продължи редактирането',
		lastChanged: 'Последна промяна: {date}',
		legitimateInterestStatement: 'Декларация за законен интерес',
		listOutdated:
			'Списъкът ни с партньори е остарял. Опитайте да го заредите отново или откажете незадължителното използване на данни.',
		loadCurrentSettings: 'Зареди текущите настройки',
		no: 'Не',
		noChoice: 'Без избор',
		noDeviceStorage: 'Не съхранява информация на вашето устройство.',
		noPartnersMatch: 'Няма партньори, отговарящи на „{search}“.',
		notAllowedPurposes:
			'Това приложение не разрешава на този партньор следното: {purposes}',
		off: 'Изключено',
		on: 'Включено',
		otherDeviceAccess: 'Други начини за достъп до вашето устройство',
		partlyOn: 'Частично включено',
		partner: 'Партньор',
		partners: 'Партньори',
		preferencesIntro:
			'Ние и нашите партньори съхраняваме и осъществяваме достъп до информация на вашето устройство и обработваме лични данни за целите по-долу. Някои партньори разчитат на законен интерес вместо на съгласие. Можете да възразите срещу това и да промените избора си по всяко време от Настройки за поверителност.',
		preferencesUnavailable:
			'Настройките за поверителност още не са налични. Свържете се с интернет и опитайте отново.',
		providersOff:
			'Тези цели в момента са изключени, затова тези партньори остават изключени, докато не ги включите в раздела Цели.',
		purposeFilter: 'Цел: {purpose}',
		refreshesStoredInformation: 'Подновява съхранената информация',
		retentionNotProvided: 'Не е посочено от този партньор.',
		retentionTitle: 'Колко дълго се пазят данните',
		save: 'Запази',
		searchOtherPartners: 'Търсене на други партньори',
		searchPartners: 'Търсене на партньори',
		sessionOnly: 'Само за тази сесия',
		settingsChanged: 'Настройките се промениха, докато ги редактирахте',
		settingsChangedDetail:
			'Изборът ви не беше запазен. Заредете текущите настройки и изберете отново.',
		specialFeatureOptIn: 'Партньорите правят това само ако го включите.',
		specialFeaturesElsewhere:
			'Задава се в Специални функции в Настройки за поверителност.',
		standardRetention: 'Стандартен срок на съхранение',
		storedForUpTo: 'Съхранява се до',
		thisApp: 'Това приложение',
		tryAgain: 'Опитай отново',
		turnOffToObject: 'Изключете, за да възразите.',
		vendorPurposeSummary:
			'{purposes} цели · {legitimateInterest} на основание законен интерес',
		viewPartners: 'Покажи партньорите',
		yes: 'Да',
		yourChoices: 'Вашият избор',
	},
	bn: {
		alwaysOn: 'সবসময় চালু',
		back: 'ফিরে যান',
		cancel: 'বাতিল করুন',
		close: 'বন্ধ করুন',
		collapsed: 'সংকুচিত',
		consent: 'সম্মতি',
		dataCollected: 'সংগৃহীত ডেটা',
		dayCount: '{count} দিন',
		dayCountOne: '1 দিন',
		details: 'বিস্তারিত',
		deviceStorage: 'ডিভাইসে সংরক্ষণ',
		deviceStorageDetails: 'ডিভাইসে সংরক্ষণের বিস্তারিত',
		discardChanges: 'পরিবর্তনগুলো বাতিল করুন',
		discardChangesDetail: 'আপনার পরিবর্তনগুলো সংরক্ষণ করা হবে না।',
		discardChangesTitle: 'পরিবর্তনগুলো বাতিল করবেন?',
		expanded: 'প্রসারিত',
		hideDetails: 'বিস্তারিত লুকান',
		iabPartnerCount: '{count}টি IAB অংশীদার',
		iabPartners: 'IAB অংশীদার',
		keepEditing: 'সম্পাদনা চালিয়ে যান',
		lastChanged: 'সর্বশেষ পরিবর্তন: {date}',
		legitimateInterestStatement: 'বৈধ স্বার্থ সংক্রান্ত বিবৃতি',
		listOutdated:
			'আমাদের অংশীদার তালিকা পুরোনো হয়ে গেছে। তালিকাটি আবার লোড করার চেষ্টা করুন, অথবা ঐচ্ছিক ডেটা ব্যবহার প্রত্যাখ্যান করুন।',
		loadCurrentSettings: 'বর্তমান সেটিংস লোড করুন',
		no: 'না',
		noChoice: 'বেছে নেওয়ার সুযোগ নেই',
		noDeviceStorage: 'আপনার ডিভাইসে কোনো তথ্য সংরক্ষণ করে না।',
		noPartnersMatch: '"{search}"-এর সঙ্গে মেলে এমন কোনো অংশীদার নেই।',
		notAllowedPurposes: 'এই অ্যাপ এই অংশীদারকে এগুলোর অনুমতি দেয় না: {purposes}',
		off: 'বন্ধ',
		on: 'চালু',
		otherDeviceAccess: 'আপনার ডিভাইস অ্যাক্সেসের অন্যান্য উপায়',
		partlyOn: 'আংশিক চালু',
		partner: 'অংশীদার',
		partners: 'অংশীদার',
		preferencesIntro:
			'আমরা এবং আমাদের অংশীদাররা নিচের উদ্দেশ্যগুলোর জন্য আপনার ডিভাইসে তথ্য সংরক্ষণ ও অ্যাক্সেস করি এবং ব্যক্তিগত ডেটা প্রক্রিয়া করি। কিছু অংশীদার সম্মতির পরিবর্তে বৈধ স্বার্থের ওপর নির্ভর করে। আপনি যেকোনো সময় গোপনীয়তা সেটিংসে এতে আপত্তি জানাতে এবং আপনার পছন্দ পরিবর্তন করতে পারেন।',
		preferencesUnavailable:
			'গোপনীয়তা সেটিংস এখনো উপলব্ধ নয়। ইন্টারনেটে সংযোগ করে আবার চেষ্টা করুন।',
		providersOff:
			'ওই উদ্দেশ্যগুলো এখন বন্ধ আছে, তাই উদ্দেশ্য বিভাগে আপনি সেগুলো চালু না করা পর্যন্ত এই অংশীদাররা বন্ধ থাকবে।',
		purposeFilter: 'উদ্দেশ্য: {purpose}',
		refreshesStoredInformation: 'সংরক্ষিত তথ্য নবায়ন করে',
		retentionNotProvided: 'এই অংশীদার তা জানায়নি।',
		retentionTitle: 'ডেটা কত দিন রাখা হয়',
		save: 'সংরক্ষণ',
		searchOtherPartners: 'অন্যান্য অংশীদার খুঁজুন',
		searchPartners: 'অংশীদার খুঁজুন',
		sessionOnly: 'শুধু এই সেশনে',
		settingsChanged: 'আপনি সম্পাদনা করার সময় সেটিংস পরিবর্তিত হয়েছে',
		settingsChangedDetail:
			'আপনার পছন্দগুলো সংরক্ষণ করা হয়নি। বর্তমান সেটিংস লোড করুন, তারপর আবার বেছে নিন।',
		specialFeatureOptIn: 'আপনি এটি চালু করলেই কেবল অংশীদাররা এটি করে।',
		specialFeaturesElsewhere:
			'গোপনীয়তা সেটিংসের বিশেষ বৈশিষ্ট্য অংশে নির্ধারণ করা হয়।',
		standardRetention: 'সাধারণ সংরক্ষণের মেয়াদ',
		storedForUpTo: 'সর্বোচ্চ সংরক্ষণের মেয়াদ',
		thisApp: 'এই অ্যাপ',
		tryAgain: 'আবার চেষ্টা করুন',
		turnOffToObject: 'আপত্তি জানাতে বন্ধ করুন।',
		vendorPurposeSummary:
			'{purposes}টি উদ্দেশ্য · {legitimateInterest}টি বৈধ স্বার্থের ভিত্তিতে',
		viewPartners: 'অংশীদারদের দেখুন',
		yes: 'হ্যাঁ',
		yourChoices: 'আপনার পছন্দ',
	},
	cs: {
		alwaysOn: 'Vždy zapnuto',
		back: 'Zpět',
		cancel: 'Zrušit',
		close: 'Zavřít',
		collapsed: 'Sbaleno',
		consent: 'Souhlas',
		dataCollected: 'Shromažďované údaje',
		dayCount: '{count} dní',
		dayCountOne: '1 den',
		details: 'Podrobnosti',
		deviceStorage: 'Ukládání v zařízení',
		deviceStorageDetails: 'Podrobnosti o ukládání v zařízení',
		discardChanges: 'Zahodit změny',
		discardChangesDetail: 'Vaše změny nebudou uloženy.',
		discardChangesTitle: 'Zahodit změny?',
		expanded: 'Rozbaleno',
		hideDetails: 'Skrýt podrobnosti',
		iabPartnerCount: 'Partneři IAB: {count}',
		iabPartners: 'Partneři IAB',
		keepEditing: 'Pokračovat v úpravách',
		lastChanged: 'Naposledy změněno {date}',
		legitimateInterestStatement: 'Prohlášení o oprávněném zájmu',
		listOutdated:
			'Náš seznam partnerů je zastaralý. Zkuste ho načíst znovu, nebo volitelné použití údajů odmítněte.',
		loadCurrentSettings: 'Načíst aktuální nastavení',
		no: 'Ne',
		noChoice: 'Bez možnosti volby',
		noDeviceStorage: 'Neukládá ve vašem zařízení žádné informace.',
		noPartnersMatch: 'Hledání „{search}“ neodpovídá žádný partner.',
		notAllowedPurposes:
			'Tato aplikace tomuto partnerovi nepovoluje: {purposes}',
		off: 'Vypnuto',
		on: 'Zapnuto',
		otherDeviceAccess: 'Jiné způsoby přístupu k vašemu zařízení',
		partlyOn: 'Částečně zapnuto',
		partner: 'Partner',
		partners: 'Partneři',
		preferencesIntro:
			'My a naši partneři ukládáme informace ve vašem zařízení a přistupujeme k nim a zpracováváme osobní údaje pro níže uvedené účely. Někteří partneři se místo souhlasu opírají o oprávněný zájem. Proti tomu můžete vznést námitku a své volby kdykoli změnit v Nastavení soukromí.',
		preferencesUnavailable:
			'Nastavení soukromí zatím není k dispozici. Připojte se k internetu a zkuste to znovu.',
		providersOff:
			'Tyto účely jsou teď vypnuté, takže tito partneři zůstanou vypnutí, dokud účely nezapnete v sekci Účely.',
		purposeFilter: 'Účel: {purpose}',
		refreshesStoredInformation: 'Obnovuje uložené informace',
		retentionNotProvided: 'Partner tento údaj neuvedl.',
		retentionTitle: 'Jak dlouho se údaje uchovávají',
		save: 'Uložit',
		searchOtherPartners: 'Hledat další partnery',
		searchPartners: 'Hledat partnery',
		sessionOnly: 'Pouze pro tuto relaci',
		settingsChanged: 'Nastavení se během úprav změnilo',
		settingsChangedDetail:
			'Vaše volby nebyly uloženy. Načtěte aktuální nastavení a vyberte znovu.',
		specialFeatureOptIn: 'Partneři to dělají, jen pokud to zapnete.',
		specialFeaturesElsewhere:
			'Nastavuje se v sekci Zvláštní funkce v Nastavení soukromí.',
		standardRetention: 'Standardní doba uchovávání',
		storedForUpTo: 'Uloženo nejvýše po dobu',
		thisApp: 'Tato aplikace',
		tryAgain: 'Zkusit znovu',
		turnOffToObject: 'Vypnutím vznesete námitku.',
		vendorPurposeSummary:
			'Účely: {purposes} · oprávněný zájem: {legitimateInterest}',
		viewPartners: 'Zobrazit partnery',
		yes: 'Ano',
		yourChoices: 'Vaše volby',
	},
	cy: {
		alwaysOn: 'Ymlaen bob amser',
		back: 'Yn ôl',
		cancel: 'Canslo',
		close: 'Cau',
		collapsed: 'Wedi’i gau',
		consent: 'Cydsyniad',
		dataCollected: 'Data a gesglir',
		dayCount: '{count} diwrnod',
		dayCountOne: '1 diwrnod',
		details: 'Manylion',
		deviceStorage: 'Storio ar y ddyfais',
		deviceStorageDetails: 'Manylion storio ar y ddyfais',
		discardChanges: 'Gwaredu’r newidiadau',
		discardChangesDetail: 'Ni fydd eich newidiadau’n cael eu cadw.',
		discardChangesTitle: 'Gwaredu’r newidiadau?',
		expanded: 'Wedi’i agor',
		hideDetails: 'Cuddio’r manylion',
		iabPartnerCount: '{count} partner IAB',
		iabPartners: 'Partneriaid IAB',
		keepEditing: 'Parhau i olygu',
		lastChanged: 'Newidiwyd ddiwethaf {date}',
		legitimateInterestStatement: 'Datganiad buddiant cyfreithlon',
		listOutdated:
			'Mae ein rhestr partneriaid wedi dyddio. Rhowch gynnig arall ar ei llwytho, neu gwrthodwch ddefnydd dewisol o ddata.',
		loadCurrentSettings: 'Llwytho’r gosodiadau presennol',
		no: 'Na',
		noChoice: 'Dim dewis',
		noDeviceStorage: 'Nid yw’n storio gwybodaeth ar eich dyfais.',
		noPartnersMatch: 'Dim partneriaid yn cyfateb i “{search}”.',
		notAllowedPurposes:
			'Nid yw’r ap hwn yn caniatáu i’r partner hwn: {purposes}',
		off: 'I ffwrdd',
		on: 'Ymlaen',
		otherDeviceAccess: 'Ffyrdd eraill o gyrchu eich dyfais',
		partlyOn: 'Ymlaen yn rhannol',
		partner: 'Partner',
		partners: 'Partneriaid',
		preferencesIntro:
			'Rydym ni a’n partneriaid yn storio ac yn cyrchu gwybodaeth ar eich dyfais ac yn prosesu data personol at y dibenion isod. Mae rhai partneriaid yn dibynnu ar fuddiant cyfreithlon yn hytrach na chydsyniad. Gallwch wrthwynebu hynny a newid eich dewisiadau unrhyw bryd yn Gosodiadau preifatrwydd.',
		preferencesUnavailable:
			'Nid yw Gosodiadau preifatrwydd ar gael eto. Cysylltwch â’r rhyngrwyd a rhowch gynnig arall arni.',
		providersOff:
			'Mae’r dibenion hynny i ffwrdd ar hyn o bryd, felly bydd y partneriaid hyn yn aros i ffwrdd nes i chi eu troi ymlaen o dan Dibenion.',
		purposeFilter: 'Diben: {purpose}',
		refreshesStoredInformation: 'Yn adnewyddu gwybodaeth sydd wedi’i storio',
		retentionNotProvided: 'Heb ei nodi gan y partner hwn.',
		retentionTitle: 'Am ba hyd y cedwir data',
		save: 'Cadw',
		searchOtherPartners: 'Chwilio partneriaid eraill',
		searchPartners: 'Chwilio partneriaid',
		sessionOnly: 'Y sesiwn hon yn unig',
		settingsChanged: 'Newidiodd y gosodiadau tra oeddech yn golygu',
		settingsChangedDetail:
			'Ni chafodd eich dewisiadau eu cadw. Llwythwch y gosodiadau presennol, yna dewiswch eto.',
		specialFeatureOptIn:
			'Dim ond os byddwch yn troi hyn ymlaen y bydd partneriaid yn gwneud hyn.',
		specialFeaturesElsewhere:
			'Caiff ei osod o dan Nodweddion Arbennig yn Gosodiadau preifatrwydd.',
		standardRetention: 'Cyfnod cadw safonol',
		storedForUpTo: 'Caiff ei storio am hyd at',
		thisApp: 'Yr ap hwn',
		tryAgain: 'Rhoi cynnig arall',
		turnOffToObject: 'Trowch i ffwrdd i wrthwynebu.',
		vendorPurposeSummary:
			'{purposes} diben · {legitimateInterest} ar sail buddiant cyfreithlon',
		viewPartners: 'Gweld partneriaid',
		yes: 'Ie',
		yourChoices: 'Eich dewisiadau',
	},
	da: {
		alwaysOn: 'Altid til',
		back: 'Tilbage',
		cancel: 'Annuller',
		close: 'Luk',
		collapsed: 'Skjult',
		consent: 'Samtykke',
		dataCollected: 'Indsamlede data',
		dayCount: '{count} dage',
		dayCountOne: '1 dag',
		details: 'Detaljer',
		deviceStorage: 'Lagring på enheden',
		deviceStorageDetails: 'Detaljer om lagring på enheden',
		discardChanges: 'Kassér ændringer',
		discardChangesDetail: 'Dine ændringer bliver ikke gemt.',
		discardChangesTitle: 'Vil du kassere ændringerne?',
		expanded: 'Udvidet',
		hideDetails: 'Skjul detaljer',
		iabPartnerCount: '{count} IAB-partnere',
		iabPartners: 'IAB-partnere',
		keepEditing: 'Fortsæt med at redigere',
		lastChanged: 'Senest ændret {date}',
		legitimateInterestStatement: 'Erklæring om legitim interesse',
		listOutdated:
			'Vores partnerliste er forældet. Prøv at indlæse den igen, eller afvis valgfri brug af data.',
		loadCurrentSettings: 'Indlæs aktuelle indstillinger',
		no: 'Nej',
		noChoice: 'Intet valg',
		noDeviceStorage: 'Gemmer ikke oplysninger på din enhed.',
		noPartnersMatch: 'Ingen partnere matcher "{search}".',
		notAllowedPurposes: 'Denne app tillader ikke denne partner at: {purposes}',
		off: 'Fra',
		on: 'Til',
		otherDeviceAccess: 'Andre måder at få adgang til din enhed på',
		partlyOn: 'Delvist til',
		partner: 'Partner',
		partners: 'Partnere',
		preferencesIntro:
			'Vi og vores partnere gemmer og får adgang til oplysninger på din enhed og behandler personoplysninger til formålene nedenfor. Nogle partnere bruger legitim interesse i stedet for samtykke. Du kan gøre indsigelse mod det og ændre dine valg når som helst under Privatlivsindstillinger.',
		preferencesUnavailable:
			'Privatlivsindstillinger er ikke tilgængelige endnu. Opret forbindelse til internettet, og prøv igen.',
		providersOff:
			'Disse formål er slået fra lige nu, så disse partnere forbliver slået fra, indtil du slår formålene til under Formål.',
		purposeFilter: 'Formål: {purpose}',
		refreshesStoredInformation: 'Fornyer gemte oplysninger',
		retentionNotProvided: 'Ikke oplyst af denne partner.',
		retentionTitle: 'Hvor længe data opbevares',
		save: 'Gem',
		searchOtherPartners: 'Søg i andre partnere',
		searchPartners: 'Søg i partnere',
		sessionOnly: 'Kun denne session',
		settingsChanged: 'Indstillingerne blev ændret, mens du redigerede',
		settingsChangedDetail:
			'Dine valg blev ikke gemt. Indlæs de aktuelle indstillinger, og vælg igen.',
		specialFeatureOptIn: 'Partnere gør kun dette, hvis du slår det til.',
		specialFeaturesElsewhere:
			'Indstilles under Særlige funktioner i Privatlivsindstillinger.',
		standardRetention: 'Standardopbevaring',
		storedForUpTo: 'Gemmes i op til',
		thisApp: 'Denne app',
		tryAgain: 'Prøv igen',
		turnOffToObject: 'Slå fra for at gøre indsigelse.',
		vendorPurposeSummary:
			'{purposes} formål · {legitimateInterest} med legitim interesse',
		viewPartners: 'Se partnere',
		yes: 'Ja',
		yourChoices: 'Dine valg',
	},
	de: {
		alwaysOn: 'Immer an',
		back: 'Zurück',
		cancel: 'Abbrechen',
		close: 'Schließen',
		collapsed: 'Eingeklappt',
		consent: 'Einwilligung',
		dataCollected: 'Erhobene Daten',
		dayCount: '{count} Tage',
		dayCountOne: '1 Tag',
		details: 'Details',
		deviceStorage: 'Speicherung auf dem Gerät',
		deviceStorageDetails: 'Details zur Speicherung auf dem Gerät',
		discardChanges: 'Änderungen verwerfen',
		discardChangesDetail: 'Deine Änderungen werden nicht gespeichert.',
		discardChangesTitle: 'Änderungen verwerfen?',
		expanded: 'Ausgeklappt',
		hideDetails: 'Details ausblenden',
		iabPartnerCount: '{count} IAB-Partner',
		iabPartners: 'IAB-Partner',
		keepEditing: 'Weiter bearbeiten',
		lastChanged: 'Zuletzt geändert: {date}',
		legitimateInterestStatement: 'Erklärung zum berechtigten Interesse',
		listOutdated:
			'Unsere Partnerliste ist veraltet. Versuche erneut, sie zu laden, oder lehne die optionale Datennutzung ab.',
		loadCurrentSettings: 'Aktuelle Einstellungen laden',
		no: 'Nein',
		noChoice: 'Keine Auswahlmöglichkeit',
		noDeviceStorage: 'Speichert keine Informationen auf deinem Gerät.',
		noPartnersMatch: 'Keine Partner passen zu „{search}“.',
		notAllowedPurposes:
			'Diese App erlaubt diesem Partner Folgendes nicht: {purposes}',
		off: 'Aus',
		on: 'An',
		otherDeviceAccess: 'Andere Zugriffe auf dein Gerät',
		partlyOn: 'Teilweise an',
		partner: 'Partner',
		partners: 'Partner',
		preferencesIntro:
			'Wir und unsere Partner speichern und greifen auf Informationen auf deinem Gerät zu und verarbeiten personenbezogene Daten für die unten genannten Zwecke. Einige Partner stützen sich auf ein berechtigtes Interesse statt auf deine Einwilligung. Du kannst dem widersprechen und deine Auswahl jederzeit in den Datenschutz-Einstellungen ändern.',
		preferencesUnavailable:
			'Die Datenschutz-Einstellungen sind noch nicht verfügbar. Verbinde dich mit dem Internet und versuche es erneut.',
		providersOff:
			'Diese Zwecke sind gerade ausgeschaltet. Deshalb bleiben diese Partner aus, bis du die Zwecke unter Zwecke einschaltest.',
		purposeFilter: 'Zweck: {purpose}',
		refreshesStoredInformation: 'Erneuert gespeicherte Informationen',
		retentionNotProvided: 'Von diesem Partner nicht angegeben.',
		retentionTitle: 'Wie lange Daten gespeichert werden',
		save: 'Speichern',
		searchOtherPartners: 'Weitere Partner suchen',
		searchPartners: 'Partner suchen',
		sessionOnly: 'Nur für diese Sitzung',
		settingsChanged:
			'Die Einstellungen wurden während deiner Bearbeitung geändert',
		settingsChangedDetail:
			'Deine Auswahl wurde nicht gespeichert. Lade die aktuellen Einstellungen und triff deine Auswahl erneut.',
		specialFeatureOptIn: 'Partner tun das nur, wenn du es einschaltest.',
		specialFeaturesElsewhere:
			'Wird unter Besondere Merkmale in den Datenschutz-Einstellungen festgelegt.',
		standardRetention: 'Standard-Speicherdauer',
		storedForUpTo: 'Gespeichert für bis zu',
		thisApp: 'Diese App',
		tryAgain: 'Erneut versuchen',
		turnOffToObject: 'Zum Widersprechen ausschalten.',
		vendorPurposeSummary:
			'{purposes} Zwecke · {legitimateInterest} auf Basis berechtigten Interesses',
		viewPartners: 'Partner anzeigen',
		yes: 'Ja',
		yourChoices: 'Deine Auswahl',
	},
	el: {
		alwaysOn: 'Πάντα ενεργό',
		back: 'Πίσω',
		cancel: 'Ακύρωση',
		close: 'Κλείσιμο',
		collapsed: 'Συμπτυγμένο',
		consent: 'Συγκατάθεση',
		dataCollected: 'Δεδομένα που συλλέγονται',
		dayCount: '{count} ημέρες',
		dayCountOne: '1 ημέρα',
		details: 'Λεπτομέρειες',
		deviceStorage: 'Αποθήκευση στη συσκευή',
		deviceStorageDetails: 'Λεπτομέρειες αποθήκευσης στη συσκευή',
		discardChanges: 'Απόρριψη αλλαγών',
		discardChangesDetail: 'Οι αλλαγές σας δεν θα αποθηκευτούν.',
		discardChangesTitle: 'Απόρριψη αλλαγών;',
		expanded: 'Αναπτυγμένο',
		hideDetails: 'Απόκρυψη λεπτομερειών',
		iabPartnerCount: '{count} συνεργάτες IAB',
		iabPartners: 'Συνεργάτες IAB',
		keepEditing: 'Συνέχεια επεξεργασίας',
		lastChanged: 'Τελευταία αλλαγή: {date}',
		legitimateInterestStatement: 'Δήλωση έννομου συμφέροντος',
		listOutdated:
			'Η λίστα συνεργατών μας δεν είναι ενημερωμένη. Δοκιμάστε να τη φορτώσετε ξανά ή απορρίψτε την προαιρετική χρήση δεδομένων.',
		loadCurrentSettings: 'Φόρτωση τρεχουσών ρυθμίσεων',
		no: 'Όχι',
		noChoice: 'Χωρίς επιλογή',
		noDeviceStorage: 'Δεν αποθηκεύει πληροφορίες στη συσκευή σας.',
		noPartnersMatch: 'Κανένας συνεργάτης δεν ταιριάζει με «{search}».',
		notAllowedPurposes:
			'Αυτή η εφαρμογή δεν επιτρέπει σε αυτόν τον συνεργάτη τα εξής: {purposes}',
		off: 'Ανενεργό',
		on: 'Ενεργό',
		otherDeviceAccess: 'Άλλοι τρόποι πρόσβασης στη συσκευή σας',
		partlyOn: 'Μερικώς ενεργό',
		partner: 'Συνεργάτης',
		partners: 'Συνεργάτες',
		preferencesIntro:
			'Εμείς και οι συνεργάτες μας αποθηκεύουμε και έχουμε πρόσβαση σε πληροφορίες στη συσκευή σας και επεξεργαζόμαστε προσωπικά δεδομένα για τους παρακάτω σκοπούς. Ορισμένοι συνεργάτες βασίζονται σε έννομο συμφέρον αντί για συγκατάθεση. Μπορείτε να αντιταχθείτε σε αυτό και να αλλάξετε τις επιλογές σας ανά πάσα στιγμή από τις Ρυθμίσεις απορρήτου.',
		preferencesUnavailable:
			'Οι Ρυθμίσεις απορρήτου δεν είναι ακόμη διαθέσιμες. Συνδεθείτε στο διαδίκτυο και δοκιμάστε ξανά.',
		providersOff:
			'Αυτοί οι σκοποί είναι προς το παρόν ανενεργοί, οπότε αυτοί οι συνεργάτες παραμένουν ανενεργοί μέχρι να ενεργοποιήσετε τους σκοπούς στην ενότητα Σκοποί.',
		purposeFilter: 'Σκοπός: {purpose}',
		refreshesStoredInformation: 'Ανανεώνει τις αποθηκευμένες πληροφορίες',
		retentionNotProvided: 'Δεν έχει δηλωθεί από αυτόν τον συνεργάτη.',
		retentionTitle: 'Πόσο διατηρούνται τα δεδομένα',
		save: 'Αποθήκευση',
		searchOtherPartners: 'Αναζήτηση άλλων συνεργατών',
		searchPartners: 'Αναζήτηση συνεργατών',
		sessionOnly: 'Μόνο για αυτήν την περίοδο λειτουργίας',
		settingsChanged: 'Οι ρυθμίσεις άλλαξαν ενώ τις επεξεργαζόσασταν',
		settingsChangedDetail:
			'Οι επιλογές σας δεν αποθηκεύτηκαν. Φορτώστε τις τρέχουσες ρυθμίσεις και επιλέξτε ξανά.',
		specialFeatureOptIn: 'Οι συνεργάτες το κάνουν μόνο αν το ενεργοποιήσετε.',
		specialFeaturesElsewhere:
			'Ορίζεται στα Ειδικά χαρακτηριστικά, στις Ρυθμίσεις απορρήτου.',
		standardRetention: 'Τυπική διατήρηση',
		storedForUpTo: 'Αποθηκεύεται για έως',
		thisApp: 'Αυτή η εφαρμογή',
		tryAgain: 'Δοκιμή ξανά',
		turnOffToObject: 'Απενεργοποιήστε για να αντιταχθείτε.',
		vendorPurposeSummary:
			'{purposes} σκοποί · {legitimateInterest} με έννομο συμφέρον',
		viewPartners: 'Προβολή συνεργατών',
		yes: 'Ναι',
		yourChoices: 'Οι επιλογές σας',
	},
	en: {
		alwaysOn: 'Always on',
		back: 'Back',
		cancel: 'Cancel',
		close: 'Close',
		collapsed: 'Collapsed',
		consent: 'Consent',
		dataCollected: 'Data collected',
		dayCount: '{count} days',
		dayCountOne: '1 day',
		details: 'Details',
		deviceStorage: 'Device storage',
		deviceStorageDetails: 'Device storage details',
		discardChanges: 'Discard changes',
		discardChangesDetail: "Your changes won't be saved.",
		discardChangesTitle: 'Discard changes?',
		expanded: 'Expanded',
		hideDetails: 'Hide details',
		iabPartnerCount: '{count} IAB partners',
		iabPartners: 'IAB partners',
		keepEditing: 'Keep editing',
		lastChanged: 'Last changed {date}',
		legitimateInterestStatement: 'Legitimate interest statement',
		listOutdated:
			'Our partner list is out of date. Try again to load it, or reject optional data use.',
		loadCurrentSettings: 'Load current settings',
		no: 'No',
		noChoice: 'No choice',
		noDeviceStorage: "Doesn't store information on your device.",
		noPartnersMatch: 'No partners match "{search}".',
		notAllowedPurposes: "This app doesn't allow this partner to: {purposes}",
		off: 'Off',
		on: 'On',
		otherDeviceAccess: 'Other ways to access your device',
		partlyOn: 'Partly on',
		partner: 'Partner',
		partners: 'Partners',
		preferencesIntro:
			'We and our partners store and access information on your device and process personal data for the purposes below. Some partners rely on legitimate interest instead of consent. You can object to that and change your choices at any time in Privacy settings.',
		preferencesUnavailable:
			"Privacy settings aren't available yet. Connect to the internet and try again.",
		providersOff:
			'Those purposes are off right now, so these partners stay off until you turn them on under Purposes.',
		purposeFilter: 'Purpose: {purpose}',
		refreshesStoredInformation: 'Refreshes stored information',
		retentionNotProvided: 'Not provided by this partner.',
		retentionTitle: 'How long data is kept',
		save: 'Save',
		searchOtherPartners: 'Search other partners',
		searchPartners: 'Search partners',
		sessionOnly: 'This session only',
		settingsChanged: 'Settings changed while you were editing',
		settingsChangedDetail:
			"Your choices weren't saved. Load the current settings, then choose again.",
		specialFeatureOptIn: 'Partners only do this if you turn it on.',
		specialFeaturesElsewhere: 'Set under Special features in Privacy settings.',
		standardRetention: 'Standard retention',
		storedForUpTo: 'Stored for up to',
		thisApp: 'This app',
		tryAgain: 'Try again',
		turnOffToObject: 'Turn off to object.',
		vendorPurposeSummary:
			'{purposes} purposes · {legitimateInterest} on legitimate interest',
		viewPartners: 'View partners',
		yes: 'Yes',
		yourChoices: 'Your choices',
	},
	es: {
		alwaysOn: 'Siempre activado',
		back: 'Atrás',
		cancel: 'Cancelar',
		close: 'Cerrar',
		collapsed: 'Contraído',
		consent: 'Consentimiento',
		dataCollected: 'Datos recopilados',
		dayCount: '{count} días',
		dayCountOne: '1 día',
		details: 'Detalles',
		deviceStorage: 'Almacenamiento en el dispositivo',
		deviceStorageDetails: 'Detalles del almacenamiento en el dispositivo',
		discardChanges: 'Descartar cambios',
		discardChangesDetail: 'Tus cambios no se guardarán.',
		discardChangesTitle: '¿Descartar los cambios?',
		expanded: 'Expandido',
		hideDetails: 'Ocultar detalles',
		iabPartnerCount: '{count} socios de IAB',
		iabPartners: 'Socios de IAB',
		keepEditing: 'Seguir editando',
		lastChanged: 'Último cambio: {date}',
		legitimateInterestStatement: 'Declaración de interés legítimo',
		listOutdated:
			'Nuestra lista de socios está desactualizada. Vuelve a intentar cargarla o rechaza el uso opcional de datos.',
		loadCurrentSettings: 'Cargar configuración actual',
		no: 'No',
		noChoice: 'Sin opción',
		noDeviceStorage: 'No almacena información en tu dispositivo.',
		noPartnersMatch: 'Ningún socio coincide con "{search}".',
		notAllowedPurposes: 'Esta aplicación no permite a este socio: {purposes}',
		off: 'Desactivado',
		on: 'Activado',
		otherDeviceAccess: 'Otras formas de acceder a tu dispositivo',
		partlyOn: 'Activado en parte',
		partner: 'Socio',
		partners: 'Socios',
		preferencesIntro:
			'Nosotros y nuestros socios almacenamos información en tu dispositivo y accedemos a ella, y procesamos datos personales para las finalidades que se indican abajo. Algunos socios se basan en el interés legítimo en lugar del consentimiento. Puedes oponerte a ello y cambiar tus opciones en cualquier momento en Configuración de privacidad.',
		preferencesUnavailable:
			'La Configuración de privacidad aún no está disponible. Conéctate a internet y vuelve a intentarlo.',
		providersOff:
			'Esas finalidades están desactivadas ahora, así que estos socios seguirán desactivados hasta que las actives en Finalidades.',
		purposeFilter: 'Finalidad: {purpose}',
		refreshesStoredInformation: 'Renueva la información almacenada',
		retentionNotProvided: 'Este socio no lo ha indicado.',
		retentionTitle: 'Cuánto tiempo se conservan los datos',
		save: 'Guardar',
		searchOtherPartners: 'Buscar otros socios',
		searchPartners: 'Buscar socios',
		sessionOnly: 'Solo esta sesión',
		settingsChanged: 'La configuración cambió mientras la editabas',
		settingsChangedDetail:
			'Tus opciones no se guardaron. Carga la configuración actual y vuelve a elegir.',
		specialFeatureOptIn: 'Los socios solo hacen esto si lo activas.',
		specialFeaturesElsewhere:
			'Se configura en Características especiales, dentro de Configuración de privacidad.',
		standardRetention: 'Conservación estándar',
		storedForUpTo: 'Se almacena hasta',
		thisApp: 'Esta aplicación',
		tryAgain: 'Reintentar',
		turnOffToObject: 'Desactívalo para oponerte.',
		vendorPurposeSummary:
			'{purposes} finalidades · {legitimateInterest} por interés legítimo',
		viewPartners: 'Ver socios',
		yes: 'Sí',
		yourChoices: 'Tus opciones',
	},
	et: {
		alwaysOn: 'Alati sees',
		back: 'Tagasi',
		cancel: 'Tühista',
		close: 'Sulge',
		collapsed: 'Ahendatud',
		consent: 'Nõusolek',
		dataCollected: 'Kogutavad andmed',
		dayCount: '{count} päeva',
		dayCountOne: '1 päev',
		details: 'Üksikasjad',
		deviceStorage: 'Salvestamine seadmes',
		deviceStorageDetails: 'Seadmes salvestamise üksikasjad',
		discardChanges: 'Loobu muudatustest',
		discardChangesDetail: 'Teie muudatusi ei salvestata.',
		discardChangesTitle: 'Kas loobuda muudatustest?',
		expanded: 'Laiendatud',
		hideDetails: 'Peida üksikasjad',
		iabPartnerCount: '{count} IAB partnerit',
		iabPartners: 'IAB partnerid',
		keepEditing: 'Jätka muutmist',
		lastChanged: 'Viimati muudetud {date}',
		legitimateInterestStatement: 'Õigustatud huvi selgitus',
		listOutdated:
			'Meie partnerite loend on aegunud. Proovige see uuesti laadida või keelduge andmete valikulisest kasutamisest.',
		loadCurrentSettings: 'Laadi praegused seaded',
		no: 'Ei',
		noChoice: 'Valik puudub',
		noDeviceStorage: 'Ei salvesta teie seadmesse teavet.',
		noPartnersMatch: 'Otsingule „{search}“ ei vasta ükski partner.',
		notAllowedPurposes: 'See rakendus ei luba sellel partneril: {purposes}',
		off: 'Väljas',
		on: 'Sees',
		otherDeviceAccess: 'Muud viisid teie seadmele juurdepääsuks',
		partlyOn: 'Osaliselt sees',
		partner: 'Partner',
		partners: 'Partnerid',
		preferencesIntro:
			'Meie ja meie partnerid salvestame teie seadmesse teavet ja pääseme sellele ligi ning töötleme isikuandmeid allpool toodud eesmärkidel. Mõned partnerid tuginevad nõusoleku asemel õigustatud huvile. Saate sellele vastu vaielda ja oma valikuid igal ajal muuta jaotises Privaatsusseaded.',
		preferencesUnavailable:
			'Privaatsusseaded pole veel saadaval. Looge internetiühendus ja proovige uuesti.',
		providersOff:
			'Need eesmärgid on praegu välja lülitatud, seega jäävad need partnerid välja lülitatuks, kuni lülitate eesmärgid sisse jaotises Eesmärgid.',
		purposeFilter: 'Eesmärk: {purpose}',
		refreshesStoredInformation: 'Uuendab salvestatud teavet',
		retentionNotProvided: 'Partner pole seda esitanud.',
		retentionTitle: 'Kui kaua andmeid säilitatakse',
		save: 'Salvesta',
		searchOtherPartners: 'Otsi teisi partnereid',
		searchPartners: 'Otsi partnereid',
		sessionOnly: 'Ainult selle seansi ajal',
		settingsChanged: 'Seaded muutusid redigeerimise ajal',
		settingsChangedDetail:
			'Teie valikuid ei salvestatud. Laadige praegused seaded ja valige uuesti.',
		specialFeatureOptIn:
			'Partnerid teevad seda ainult siis, kui selle sisse lülitate.',
		specialFeaturesElsewhere:
			'Seadistatakse privaatsusseadete jaotises Eriomadused.',
		standardRetention: 'Tavapärane säilitusaeg',
		storedForUpTo: 'Salvestatakse kuni',
		thisApp: 'See rakendus',
		tryAgain: 'Proovi uuesti',
		turnOffToObject: 'Vastuvaidlemiseks lülitage välja.',
		vendorPurposeSummary:
			'Eesmärgid: {purposes} · õigustatud huvi alusel: {legitimateInterest}',
		viewPartners: 'Kuva partnerid',
		yes: 'Jah',
		yourChoices: 'Teie valikud',
	},
	fi: {
		alwaysOn: 'Aina päällä',
		back: 'Takaisin',
		cancel: 'Peruuta',
		close: 'Sulje',
		collapsed: 'Tiivistetty',
		consent: 'Suostumus',
		dataCollected: 'Kerättävät tiedot',
		dayCount: '{count} päivää',
		dayCountOne: '1 päivä',
		details: 'Lisätiedot',
		deviceStorage: 'Tallennus laitteelle',
		deviceStorageDetails: 'Laitteelle tallentamisen tiedot',
		discardChanges: 'Hylkää muutokset',
		discardChangesDetail: 'Muutoksiasi ei tallenneta.',
		discardChangesTitle: 'Hylätäänkö muutokset?',
		expanded: 'Laajennettu',
		hideDetails: 'Piilota lisätiedot',
		iabPartnerCount: '{count} IAB-kumppania',
		iabPartners: 'IAB-kumppanit',
		keepEditing: 'Jatka muokkaamista',
		lastChanged: 'Muutettu viimeksi {date}',
		legitimateInterestStatement: 'Selvitys oikeutetusta edusta',
		listOutdated:
			'Kumppaniluettelomme on vanhentunut. Yritä ladata se uudelleen tai hylkää valinnainen tietojen käyttö.',
		loadCurrentSettings: 'Lataa nykyiset asetukset',
		no: 'Ei',
		noChoice: 'Ei valintaa',
		noDeviceStorage: 'Ei tallenna tietoja laitteellesi.',
		noPartnersMatch: 'Haulla ”{search}” ei löytynyt kumppaneita.',
		notAllowedPurposes:
			'Tämä sovellus ei salli tälle kumppanille seuraavaa: {purposes}',
		off: 'Pois päältä',
		on: 'Päällä',
		otherDeviceAccess: 'Muut tavat käyttää laitettasi',
		partlyOn: 'Osittain päällä',
		partner: 'Kumppani',
		partners: 'Kumppanit',
		preferencesIntro:
			'Me ja kumppanimme tallennamme tietoja laitteellesi ja käytämme niitä sekä käsittelemme henkilötietoja alla kerrottuihin käyttötarkoituksiin. Jotkut kumppanit vetoavat suostumuksen sijaan oikeutettuun etuun. Voit vastustaa tätä ja muuttaa valintojasi milloin tahansa Tietosuoja-asetuksissa.',
		preferencesUnavailable:
			'Tietosuoja-asetukset eivät ole vielä käytettävissä. Muodosta internetyhteys ja yritä uudelleen.',
		providersOff:
			'Nämä käyttötarkoitukset ovat nyt pois päältä, joten nämä kumppanit pysyvät pois päältä, kunnes otat käyttötarkoitukset käyttöön kohdassa Käyttötarkoitukset.',
		purposeFilter: 'Käyttötarkoitus: {purpose}',
		refreshesStoredInformation: 'Uusii tallennetut tiedot',
		retentionNotProvided: 'Kumppani ei ole ilmoittanut tätä.',
		retentionTitle: 'Kuinka kauan tietoja säilytetään',
		save: 'Tallenna',
		searchOtherPartners: 'Hae muita kumppaneita',
		searchPartners: 'Hae kumppaneita',
		sessionOnly: 'Vain tämän istunnon ajan',
		settingsChanged: 'Asetukset muuttuivat muokkauksen aikana',
		settingsChangedDetail:
			'Valintojasi ei tallennettu. Lataa nykyiset asetukset ja valitse uudelleen.',
		specialFeatureOptIn: 'Kumppanit tekevät tätä vain, jos otat sen käyttöön.',
		specialFeaturesElsewhere:
			'Asetetaan Tietosuoja-asetusten kohdassa Erikoisominaisuudet.',
		standardRetention: 'Tavallinen säilytysaika',
		storedForUpTo: 'Tallennetaan enintään',
		thisApp: 'Tämä sovellus',
		tryAgain: 'Yritä uudelleen',
		turnOffToObject: 'Vastusta kytkemällä pois päältä.',
		vendorPurposeSummary:
			'{purposes} käyttötarkoitusta · {legitimateInterest} oikeutetun edun perusteella',
		viewPartners: 'Näytä kumppanit',
		yes: 'Kyllä',
		yourChoices: 'Valintasi',
	},
	fr: {
		alwaysOn: 'Toujours activé',
		back: 'Retour',
		cancel: 'Annuler',
		close: 'Fermer',
		collapsed: 'Réduit',
		consent: 'Consentement',
		dataCollected: 'Données collectées',
		dayCount: '{count} jours',
		dayCountOne: '1 jour',
		details: 'Détails',
		deviceStorage: "Stockage sur l'appareil",
		deviceStorageDetails: "Détails du stockage sur l'appareil",
		discardChanges: 'Abandonner les modifications',
		discardChangesDetail: 'Vos modifications ne seront pas enregistrées.',
		discardChangesTitle: 'Abandonner les modifications ?',
		expanded: 'Développé',
		hideDetails: 'Masquer les détails',
		iabPartnerCount: '{count} partenaires IAB',
		iabPartners: 'Partenaires IAB',
		keepEditing: 'Continuer à modifier',
		lastChanged: 'Dernière modification : {date}',
		legitimateInterestStatement: "Déclaration d'intérêt légitime",
		listOutdated:
			"Notre liste de partenaires n'est plus à jour. Réessayez de la charger ou refusez l'utilisation facultative des données.",
		loadCurrentSettings: 'Charger les paramètres actuels',
		no: 'Non',
		noChoice: 'Aucun choix',
		noDeviceStorage: 'Ne stocke aucune information sur votre appareil.',
		noPartnersMatch: 'Aucun partenaire ne correspond à « {search} ».',
		notAllowedPurposes:
			"Cette application n'autorise pas ce partenaire à : {purposes}",
		off: 'Désactivé',
		on: 'Activé',
		otherDeviceAccess: "Autres moyens d'accéder à votre appareil",
		partlyOn: 'Partiellement activé',
		partner: 'Partenaire',
		partners: 'Partenaires',
		preferencesIntro:
			"Nous et nos partenaires stockons des informations sur votre appareil et y accédons, et traitons des données personnelles pour les finalités ci-dessous. Certains partenaires s'appuient sur l'intérêt légitime plutôt que sur le consentement. Vous pouvez vous y opposer et modifier vos choix à tout moment dans les Paramètres de confidentialité.",
		preferencesUnavailable:
			'Les Paramètres de confidentialité ne sont pas encore disponibles. Connectez-vous à Internet et réessayez.',
		providersOff:
			"Ces finalités sont désactivées pour le moment. Ces partenaires restent donc désactivés tant que vous n'activez pas ces finalités dans Finalités.",
		purposeFilter: 'Finalité : {purpose}',
		refreshesStoredInformation: 'Renouvelle les informations stockées',
		retentionNotProvided: 'Non précisé par ce partenaire.',
		retentionTitle: 'Durée de conservation des données',
		save: 'Enregistrer',
		searchOtherPartners: "Rechercher d'autres partenaires",
		searchPartners: 'Rechercher des partenaires',
		sessionOnly: 'Cette session uniquement',
		settingsChanged: 'Les paramètres ont changé pendant votre modification',
		settingsChangedDetail:
			"Vos choix n'ont pas été enregistrés. Chargez les paramètres actuels, puis refaites vos choix.",
		specialFeatureOptIn: "Les partenaires ne le font que si vous l'activez.",
		specialFeaturesElsewhere:
			'Se règle dans Fonctionnalités spéciales, dans les Paramètres de confidentialité.',
		standardRetention: 'Conservation standard',
		storedForUpTo: "Stocké jusqu'à",
		thisApp: 'Cette application',
		tryAgain: 'Réessayer',
		turnOffToObject: 'Désactivez pour vous opposer.',
		vendorPurposeSummary:
			"{purposes} finalités · {legitimateInterest} sur la base de l'intérêt légitime",
		viewPartners: 'Voir les partenaires',
		yes: 'Oui',
		yourChoices: 'Vos choix',
	},
	ga: {
		alwaysOn: 'Ar siúl i gcónaí',
		back: 'Siar',
		cancel: 'Cealaigh',
		close: 'Dún',
		collapsed: 'Laghdaithe',
		consent: 'Toiliú',
		dataCollected: 'Sonraí a bhailítear',
		dayCount: '{count} lá',
		dayCountOne: '1 lá',
		details: 'Mionsonraí',
		deviceStorage: 'Stóráil ar an ngléas',
		deviceStorageDetails: 'Mionsonraí stórála ar an ngléas',
		discardChanges: 'Cuileáil na hathruithe',
		discardChangesDetail: "Ní shábhálfar d'athruithe.",
		discardChangesTitle: 'Cuileáil na hathruithe?',
		expanded: 'Leathnaithe',
		hideDetails: 'Folaigh mionsonraí',
		iabPartnerCount: '{count} comhpháirtí IAB',
		iabPartners: 'Comhpháirtithe IAB',
		keepEditing: 'Lean ort ag eagarthóireacht',
		lastChanged: 'Athraithe go deireanach {date}',
		legitimateInterestStatement: 'Ráiteas leasa dhlisteanaigh',
		listOutdated:
			"Tá ár liosta comhpháirtithe as dáta. Bain triail eile as é a lódáil, nó diúltaigh d'úsáid roghnach sonraí.",
		loadCurrentSettings: 'Lódáil na socruithe reatha',
		no: 'Níl',
		noChoice: 'Gan rogha',
		noDeviceStorage: 'Ní stórálann sé faisnéis ar do ghléas.',
		noPartnersMatch: 'Níl aon chomhpháirtí ag teacht le "{search}".',
		notAllowedPurposes:
			'Ní cheadaíonn an aip seo don chomhpháirtí seo: {purposes}',
		off: 'Múchta',
		on: 'Ar siúl',
		otherDeviceAccess: 'Bealaí eile chun rochtain a fháil ar do ghléas',
		partlyOn: 'Ar siúl i bpáirt',
		partner: 'Comhpháirtí',
		partners: 'Comhpháirtithe',
		preferencesIntro:
			'Stórálaimid féin agus ár gcomhpháirtithe faisnéis ar do ghléas agus faighimid rochtain uirthi, agus próiseálaimid sonraí pearsanta chun na gcuspóirí thíos. Braitheann roinnt comhpháirtithe ar leas dlisteanach in ionad toilithe. Is féidir leat cur ina aghaidh sin agus do roghanna a athrú am ar bith i Socruithe príobháideachais.',
		preferencesUnavailable:
			'Níl Socruithe príobháideachais ar fáil fós. Ceangail leis an idirlíon agus bain triail eile as.',
		providersOff:
			'Tá na cuspóirí sin múchta faoi láthair, mar sin fanfaidh na comhpháirtithe seo múchta go dtí go gcuireann tú na cuspóirí ar siúl faoi Cuspóirí.',
		purposeFilter: 'Cuspóir: {purpose}',
		refreshesStoredInformation: 'Athnuann sé faisnéis stóráilte',
		retentionNotProvided: 'Níor thug an comhpháirtí seo é.',
		retentionTitle: 'Cé chomh fada a choinnítear sonraí',
		save: 'Sábháil',
		searchOtherPartners: 'Cuardaigh comhpháirtithe eile',
		searchPartners: 'Cuardaigh comhpháirtithe',
		sessionOnly: 'An seisiún seo amháin',
		settingsChanged: 'Athraíodh na socruithe agus tú á gcur in eagar',
		settingsChangedDetail:
			'Níor sábháladh do roghanna. Lódáil na socruithe reatha, ansin roghnaigh arís.',
		specialFeatureOptIn:
			'Ní dhéanann comhpháirtithe é seo ach amháin má chuireann tú ar siúl é.',
		specialFeaturesElsewhere:
			'Socraítear é faoi Gnéithe speisialta i Socruithe príobháideachais.',
		standardRetention: 'Tréimhse choinneála chaighdeánach',
		storedForUpTo: 'Stóráilte ar feadh suas le',
		thisApp: 'An aip seo',
		tryAgain: 'Bain triail eile as',
		turnOffToObject: 'Múch é chun cur ina aghaidh.',
		vendorPurposeSummary:
			'{purposes} cuspóir · {legitimateInterest} ar bhonn leasa dhlisteanaigh',
		viewPartners: 'Féach ar chomhpháirtithe',
		yes: 'Tá',
		yourChoices: 'Do roghanna',
	},
	gu: {
		alwaysOn: 'હંમેશાં ચાલુ',
		back: 'પાછા જાઓ',
		cancel: 'રદ કરો',
		close: 'બંધ કરો',
		collapsed: 'સંકુચિત',
		consent: 'સંમતિ',
		dataCollected: 'એકત્રિત ડેટા',
		dayCount: '{count} દિવસ',
		dayCountOne: '1 દિવસ',
		details: 'વિગતો',
		deviceStorage: 'ડિવાઇસ સ્ટોરેજ',
		deviceStorageDetails: 'ડિવાઇસ સ્ટોરેજની વિગતો',
		discardChanges: 'ફેરફારો કાઢી નાખો',
		discardChangesDetail: 'તમારા ફેરફારો સાચવવામાં આવશે નહીં.',
		discardChangesTitle: 'ફેરફારો કાઢી નાખીએ?',
		expanded: 'વિસ્તૃત',
		hideDetails: 'વિગતો છુપાવો',
		iabPartnerCount: '{count} IAB ભાગીદારો',
		iabPartners: 'IAB ભાગીદારો',
		keepEditing: 'ફેરફાર કરવાનું ચાલુ રાખો',
		lastChanged: 'છેલ્લે બદલાયું: {date}',
		legitimateInterestStatement: 'કાયદેસર હિતનું નિવેદન',
		listOutdated:
			'અમારી ભાગીદારોની યાદી જૂની થઈ ગઈ છે. તેને લોડ કરવા ફરી પ્રયાસ કરો, અથવા વૈકલ્પિક ડેટા ઉપયોગ નકારો.',
		loadCurrentSettings: 'વર્તમાન સેટિંગ્સ લોડ કરો',
		no: 'ના',
		noChoice: 'કોઈ વિકલ્પ નથી',
		noDeviceStorage: 'તમારા ડિવાઇસ પર માહિતી સંગ્રહિત કરતું નથી.',
		noPartnersMatch: '"{search}" સાથે મેળ ખાતો કોઈ ભાગીદાર નથી.',
		notAllowedPurposes: 'આ એપ આ ભાગીદારને આની મંજૂરી આપતી નથી: {purposes}',
		off: 'બંધ',
		on: 'ચાલુ',
		otherDeviceAccess: 'તમારા ડિવાઇસને ઍક્સેસ કરવાની અન્ય રીતો',
		partlyOn: 'આંશિક રીતે ચાલુ',
		partner: 'ભાગીદાર',
		partners: 'ભાગીદારો',
		preferencesIntro:
			'અમે અને અમારા ભાગીદારો નીચેના હેતુઓ માટે તમારા ડિવાઇસ પર માહિતી સંગ્રહિત અને ઍક્સેસ કરીએ છીએ અને વ્યક્તિગત ડેટા પર પ્રક્રિયા કરીએ છીએ. કેટલાક ભાગીદારો સંમતિને બદલે કાયદેસર હિત પર આધાર રાખે છે. તમે તેની સામે વાંધો ઉઠાવી શકો છો અને ગોપનીયતા સેટિંગ્સમાં કોઈપણ સમયે તમારી પસંદગીઓ બદલી શકો છો.',
		preferencesUnavailable:
			'ગોપનીયતા સેટિંગ્સ હજી ઉપલબ્ધ નથી. ઇન્ટરનેટ સાથે કનેક્ટ કરો અને ફરી પ્રયાસ કરો.',
		providersOff:
			'તે હેતુઓ અત્યારે બંધ છે, તેથી જ્યાં સુધી તમે તેમને હેતુઓ હેઠળ ચાલુ ન કરો ત્યાં સુધી આ ભાગીદારો બંધ રહેશે.',
		purposeFilter: 'હેતુ: {purpose}',
		refreshesStoredInformation: 'સંગ્રહિત માહિતી તાજી કરે છે',
		retentionNotProvided: 'આ ભાગીદારે આ માહિતી આપી નથી.',
		retentionTitle: 'ડેટા કેટલો સમય રાખવામાં આવે છે',
		save: 'સાચવો',
		searchOtherPartners: 'અન્ય ભાગીદારો શોધો',
		searchPartners: 'ભાગીદારો શોધો',
		sessionOnly: 'ફક્ત આ સત્ર માટે',
		settingsChanged: 'તમે ફેરફાર કરી રહ્યા હતા ત્યારે સેટિંગ્સ બદલાઈ ગઈ',
		settingsChangedDetail:
			'તમારી પસંદગીઓ સાચવવામાં આવી નથી. વર્તમાન સેટિંગ્સ લોડ કરો, પછી ફરીથી પસંદ કરો.',
		specialFeatureOptIn: 'તમે તેને ચાલુ કરો તો જ ભાગીદારો આ કરે છે.',
		specialFeaturesElsewhere: 'ગોપનીયતા સેટિંગ્સમાં ખાસ સુવિધાઓ હેઠળ સેટ થાય છે.',
		standardRetention: 'માનક જાળવણી',
		storedForUpTo: 'મહત્તમ સંગ્રહ અવધિ',
		thisApp: 'આ એપ',
		tryAgain: 'ફરી પ્રયાસ કરો',
		turnOffToObject: 'વાંધો ઉઠાવવા માટે બંધ કરો.',
		vendorPurposeSummary: '{purposes} હેતુઓ · {legitimateInterest} કાયદેસર હિત પર',
		viewPartners: 'ભાગીદારો જુઓ',
		yes: 'હા',
		yourChoices: 'તમારી પસંદગીઓ',
	},
	he: {
		alwaysOn: 'מופעל תמיד',
		back: 'חזרה',
		cancel: 'ביטול',
		close: 'סגירה',
		collapsed: 'מכווץ',
		consent: 'הסכמה',
		dataCollected: 'נתונים שנאספים',
		dayCount: '{count} ימים',
		dayCountOne: 'יום אחד',
		details: 'פרטים',
		deviceStorage: 'אחסון במכשיר',
		deviceStorageDetails: 'פרטי אחסון במכשיר',
		discardChanges: 'מחיקת השינויים',
		discardChangesDetail: 'השינויים שלך לא יישמרו.',
		discardChangesTitle: 'למחוק את השינויים?',
		expanded: 'מורחב',
		hideDetails: 'הסתרת הפרטים',
		iabPartnerCount: '{count} שותפי IAB',
		iabPartners: 'שותפי IAB',
		keepEditing: 'המשך עריכה',
		lastChanged: 'שונה לאחרונה ב-{date}',
		legitimateInterestStatement: 'הצהרת אינטרס לגיטימי',
		listOutdated:
			'רשימת השותפים שלנו אינה עדכנית. אפשר לנסות לטעון אותה שוב, או לדחות שימוש אופציונלי בנתונים.',
		loadCurrentSettings: 'טעינת ההגדרות הנוכחיות',
		no: 'לא',
		noChoice: 'אין אפשרות בחירה',
		noDeviceStorage: 'לא מאחסן מידע במכשיר שלך.',
		noPartnersMatch: 'אין שותפים התואמים ל-"{search}".',
		notAllowedPurposes: 'האפליקציה הזו לא מתירה לשותף הזה: {purposes}',
		off: 'כבוי',
		on: 'מופעל',
		otherDeviceAccess: 'דרכים אחרות לגישה למכשיר שלך',
		partlyOn: 'מופעל חלקית',
		partner: 'שותף',
		partners: 'שותפים',
		preferencesIntro:
			'אנחנו והשותפים שלנו מאחסנים מידע במכשיר שלך וניגשים אליו, ומעבדים נתונים אישיים למטרות שלהלן. חלק מהשותפים מסתמכים על אינטרס לגיטימי במקום על הסכמה. אפשר להתנגד לכך ולשנות את הבחירות שלך בכל עת בהגדרות פרטיות.',
		preferencesUnavailable:
			'הגדרות פרטיות עדיין לא זמינות. יש להתחבר לאינטרנט ולנסות שוב.',
		providersOff:
			'המטרות האלה כבויות כרגע, ולכן השותפים האלה יישארו כבויים עד שהמטרות יופעלו בקטע מטרות.',
		purposeFilter: 'מטרה: {purpose}',
		refreshesStoredInformation: 'מרענן מידע שמאוחסן',
		retentionNotProvided: 'השותף הזה לא מסר מידע.',
		retentionTitle: 'כמה זמן הנתונים נשמרים',
		save: 'שמירה',
		searchOtherPartners: 'חיפוש שותפים אחרים',
		searchPartners: 'חיפוש שותפים',
		sessionOnly: 'לסשן הנוכחי בלבד',
		settingsChanged: 'ההגדרות השתנו במהלך העריכה',
		settingsChangedDetail:
			'הבחירות שלך לא נשמרו. יש לטעון את ההגדרות הנוכחיות ולבחור שוב.',
		specialFeatureOptIn: 'שותפים עושים זאת רק אם הפעלת את האפשרות.',
		specialFeaturesElsewhere: 'מוגדר בקטע תכונות מיוחדות בהגדרות פרטיות.',
		standardRetention: 'משך שמירה רגיל',
		storedForUpTo: 'משך שמירה מרבי',
		thisApp: 'האפליקציה הזו',
		tryAgain: 'ניסיון חוזר',
		turnOffToObject: 'יש לכבות כדי להתנגד.',
		vendorPurposeSummary:
			'{purposes} מטרות · {legitimateInterest} על בסיס אינטרס לגיטימי',
		viewPartners: 'הצגת השותפים',
		yes: 'כן',
		yourChoices: 'הבחירות שלך',
	},
	hi: {
		alwaysOn: 'हमेशा चालू',
		back: 'वापस जाएं',
		cancel: 'रद्द करें',
		close: 'बंद करें',
		collapsed: 'छोटा किया गया',
		consent: 'सहमति',
		dataCollected: 'एकत्र किया गया डेटा',
		dayCount: '{count} दिन',
		dayCountOne: '1 दिन',
		details: 'विवरण',
		deviceStorage: 'डिवाइस स्टोरेज',
		deviceStorageDetails: 'डिवाइस स्टोरेज का विवरण',
		discardChanges: 'बदलाव खारिज करें',
		discardChangesDetail: 'आपके बदलाव सहेजे नहीं जाएंगे।',
		discardChangesTitle: 'बदलाव खारिज करें?',
		expanded: 'बड़ा किया गया',
		hideDetails: 'विवरण छिपाएं',
		iabPartnerCount: '{count} IAB साझेदार',
		iabPartners: 'IAB साझेदार',
		keepEditing: 'बदलाव करना जारी रखें',
		lastChanged: 'पिछली बार बदला गया: {date}',
		legitimateInterestStatement: 'वैध हित का वक्तव्य',
		listOutdated:
			'हमारी साझेदार सूची पुरानी हो गई है। इसे लोड करने के लिए फिर से कोशिश करें, या डेटा के वैकल्पिक उपयोग को अस्वीकार करें।',
		loadCurrentSettings: 'मौजूदा सेटिंग्स लोड करें',
		no: 'नहीं',
		noChoice: 'कोई विकल्प नहीं',
		noDeviceStorage: 'आपके डिवाइस पर कोई जानकारी संग्रहीत नहीं करता।',
		noPartnersMatch: '"{search}" से मेल खाने वाला कोई साझेदार नहीं है।',
		notAllowedPurposes: 'यह ऐप इस साझेदार को इनकी अनुमति नहीं देता: {purposes}',
		off: 'बंद',
		on: 'चालू',
		otherDeviceAccess: 'आपके डिवाइस को एक्सेस करने के अन्य तरीके',
		partlyOn: 'आंशिक रूप से चालू',
		partner: 'साझेदार',
		partners: 'साझेदार',
		preferencesIntro:
			'हम और हमारे साझेदार नीचे दिए गए उद्देश्यों के लिए आपके डिवाइस पर जानकारी संग्रहीत और एक्सेस करते हैं तथा व्यक्तिगत डेटा संसाधित करते हैं। कुछ साझेदार सहमति के बजाय वैध हित पर निर्भर करते हैं। आप इस पर आपत्ति कर सकते हैं और गोपनीयता सेटिंग्स में किसी भी समय अपनी पसंद बदल सकते हैं।',
		preferencesUnavailable:
			'गोपनीयता सेटिंग्स अभी उपलब्ध नहीं हैं। इंटरनेट से कनेक्ट करें और फिर से कोशिश करें।',
		providersOff:
			'वे उद्देश्य अभी बंद हैं, इसलिए ये साझेदार तब तक बंद रहेंगे जब तक आप उन्हें उद्देश्य में चालू नहीं करते।',
		purposeFilter: 'उद्देश्य: {purpose}',
		refreshesStoredInformation: 'संग्रहीत जानकारी रीफ्रेश करता है',
		retentionNotProvided: 'इस साझेदार ने यह जानकारी नहीं दी है।',
		retentionTitle: 'डेटा कितने समय तक रखा जाता है',
		save: 'सहेजें',
		searchOtherPartners: 'अन्य साझेदार खोजें',
		searchPartners: 'साझेदार खोजें',
		sessionOnly: 'केवल इस सत्र के लिए',
		settingsChanged: 'आपके संपादन के दौरान सेटिंग्स बदल गईं',
		settingsChangedDetail:
			'आपकी पसंद सहेजी नहीं गई। मौजूदा सेटिंग्स लोड करें, फिर दोबारा चुनें।',
		specialFeatureOptIn: 'साझेदार ऐसा तभी करते हैं जब आप इसे चालू करते हैं।',
		specialFeaturesElsewhere:
			'गोपनीयता सेटिंग्स में विशेष विशेषताएं के अंतर्गत सेट किया जाता है।',
		standardRetention: 'मानक प्रतिधारण',
		storedForUpTo: 'अधिकतम संग्रहण अवधि',
		thisApp: 'यह ऐप',
		tryAgain: 'फिर से कोशिश करें',
		turnOffToObject: 'आपत्ति करने के लिए बंद करें।',
		vendorPurposeSummary: '{purposes} उद्देश्य · {legitimateInterest} वैध हित पर',
		viewPartners: 'साझेदार देखें',
		yes: 'हां',
		yourChoices: 'आपकी पसंद',
	},
	hr: {
		alwaysOn: 'Uvijek uključeno',
		back: 'Natrag',
		cancel: 'Odustani',
		close: 'Zatvori',
		collapsed: 'Sažeto',
		consent: 'Privola',
		dataCollected: 'Prikupljeni podaci',
		dayCount: '{count} dana',
		dayCountOne: '1 dan',
		details: 'Pojedinosti',
		deviceStorage: 'Pohrana na uređaju',
		deviceStorageDetails: 'Pojedinosti o pohrani na uređaju',
		discardChanges: 'Odbaci promjene',
		discardChangesDetail: 'Vaše promjene neće biti spremljene.',
		discardChangesTitle: 'Odbaciti promjene?',
		expanded: 'Prošireno',
		hideDetails: 'Sakrij pojedinosti',
		iabPartnerCount: '{count} IAB partnera',
		iabPartners: 'IAB partneri',
		keepEditing: 'Nastavi uređivati',
		lastChanged: 'Zadnja promjena: {date}',
		legitimateInterestStatement: 'Izjava o legitimnom interesu',
		listOutdated:
			'Naš popis partnera je zastario. Pokušajte ga ponovno učitati ili odbijte neobavezno korištenje podataka.',
		loadCurrentSettings: 'Učitaj trenutačne postavke',
		no: 'Ne',
		noChoice: 'Bez izbora',
		noDeviceStorage: 'Ne pohranjuje informacije na vašem uređaju.',
		noPartnersMatch: 'Nijedan partner ne odgovara upitu „{search}”.',
		notAllowedPurposes: 'Ova aplikacija ovom partneru ne dopušta: {purposes}',
		off: 'Isključeno',
		on: 'Uključeno',
		otherDeviceAccess: 'Drugi načini pristupa vašem uređaju',
		partlyOn: 'Djelomično uključeno',
		partner: 'Partner',
		partners: 'Partneri',
		preferencesIntro:
			'Mi i naši partneri pohranjujemo informacije na vašem uređaju i pristupamo im te obrađujemo osobne podatke u dolje navedene svrhe. Neki partneri oslanjaju se na legitimni interes umjesto na privolu. Tome možete prigovoriti i u bilo kojem trenutku promijeniti svoje izbore u Postavkama privatnosti.',
		preferencesUnavailable:
			'Postavke privatnosti još nisu dostupne. Povežite se s internetom i pokušajte ponovno.',
		providersOff:
			'Te su svrhe trenutačno isključene, pa ovi partneri ostaju isključeni dok ih ne uključite u odjeljku Svrhe.',
		purposeFilter: 'Svrha: {purpose}',
		refreshesStoredInformation: 'Obnavlja pohranjene informacije',
		retentionNotProvided: 'Ovaj partner to nije naveo.',
		retentionTitle: 'Koliko se dugo podaci čuvaju',
		save: 'Spremi',
		searchOtherPartners: 'Pretraži ostale partnere',
		searchPartners: 'Pretraži partnere',
		sessionOnly: 'Samo ova sesija',
		settingsChanged: 'Postavke su se promijenile dok ste ih uređivali',
		settingsChangedDetail:
			'Vaši izbori nisu spremljeni. Učitajte trenutačne postavke, a zatim ponovno odaberite.',
		specialFeatureOptIn: 'Partneri to rade samo ako to uključite.',
		specialFeaturesElsewhere:
			'Postavlja se u odjeljku Posebne značajke u Postavkama privatnosti.',
		standardRetention: 'Standardno zadržavanje',
		storedForUpTo: 'Pohranjuje se najdulje',
		thisApp: 'Ova aplikacija',
		tryAgain: 'Pokušaj ponovno',
		turnOffToObject: 'Isključite za prigovor.',
		vendorPurposeSummary:
			'Svrhe: {purposes} · legitimni interes: {legitimateInterest}',
		viewPartners: 'Prikaži partnere',
		yes: 'Da',
		yourChoices: 'Vaši izbori',
	},
	ht: {
		alwaysOn: 'Toujou limen',
		back: 'Retounen',
		cancel: 'Anile',
		close: 'Fèmen',
		collapsed: 'Fèmen',
		consent: 'Konsantman',
		dataCollected: 'Done ki kolekte',
		dayCount: '{count} jou',
		dayCountOne: '1 jou',
		details: 'Detay',
		deviceStorage: 'Estokaj sou aparèy',
		deviceStorageDetails: 'Detay sou estokaj sou aparèy',
		discardChanges: 'Abandone chanjman yo',
		discardChangesDetail: 'Chanjman ou yo p ap anrejistre.',
		discardChangesTitle: 'Abandone chanjman yo?',
		expanded: 'Louvri',
		hideDetails: 'Kache detay yo',
		iabPartnerCount: '{count} patnè IAB',
		iabPartners: 'Patnè IAB',
		keepEditing: 'Kontinye modifye',
		lastChanged: 'Dènye chanjman: {date}',
		legitimateInterestStatement: 'Deklarasyon sou enterè lejitim',
		listOutdated:
			'Lis patnè nou an pa ajou. Eseye chaje l ankò, oswa refize itilizasyon done ki opsyonèl.',
		loadCurrentSettings: 'Chaje paramèt aktyèl yo',
		no: 'Non',
		noChoice: 'Pa gen chwa',
		noDeviceStorage: 'Li pa estoke enfòmasyon sou aparèy ou.',
		noPartnersMatch: 'Pa gen patnè ki koresponn ak "{search}".',
		notAllowedPurposes: 'Aplikasyon sa a pa pèmèt patnè sa a: {purposes}',
		off: 'Etenn',
		on: 'Limen',
		otherDeviceAccess: 'Lòt fason pou jwenn aksè ak aparèy ou',
		partlyOn: 'Limen an pati',
		partner: 'Patnè',
		partners: 'Patnè',
		preferencesIntro:
			'Nou menm ak patnè nou yo estoke enfòmasyon sou aparèy ou epi jwenn aksè ak li, epi nou trete done pèsonèl pou objektif ki anba yo. Kèk patnè baze sou enterè lejitim olye konsantman. Ou ka opoze ou ak sa epi chanje chwa ou yo nenpòt ki lè nan Paramèt konfidansyalite.',
		preferencesUnavailable:
			'Paramèt konfidansyalite poko disponib. Konekte ak entènèt la epi eseye ankò.',
		providersOff:
			'Objektif sa yo etenn kounye a, kidonk patnè sa yo ap rete etenn jiskaske ou limen yo nan Objektif.',
		purposeFilter: 'Objektif: {purpose}',
		refreshesStoredInformation: 'Renouvle enfòmasyon ki estoke',
		retentionNotProvided: 'Patnè sa a pa bay enfòmasyon sa a.',
		retentionTitle: 'Konbyen tan yo kenbe done yo',
		save: 'Anrejistre',
		searchOtherPartners: 'Chèche lòt patnè',
		searchPartners: 'Chèche patnè',
		sessionOnly: 'Sesyon sa a sèlman',
		settingsChanged: 'Paramèt yo chanje pandan ou t ap modifye yo',
		settingsChangedDetail:
			'Chwa ou yo pa t anrejistre. Chaje paramèt aktyèl yo, epi chwazi ankò.',
		specialFeatureOptIn: 'Patnè yo fè sa sèlman si ou limen l.',
		specialFeaturesElsewhere:
			'Ou regle sa nan Karakteristik espesyal, nan Paramèt konfidansyalite.',
		standardRetention: 'Dire konsèvasyon estanda',
		storedForUpTo: 'Estoke pou jiska',
		thisApp: 'Aplikasyon sa a',
		tryAgain: 'Eseye ankò',
		turnOffToObject: 'Etenn li pou opoze.',
		vendorPurposeSummary:
			'{purposes} objektif · {legitimateInterest} sou enterè lejitim',
		viewPartners: 'Wè patnè yo',
		yes: 'Wi',
		yourChoices: 'Chwa ou yo',
	},
	hu: {
		alwaysOn: 'Mindig bekapcsolva',
		back: 'Vissza',
		cancel: 'Mégse',
		close: 'Bezárás',
		collapsed: 'Összecsukva',
		consent: 'Hozzájárulás',
		dataCollected: 'Gyűjtött adatok',
		dayCount: '{count} nap',
		dayCountOne: '1 nap',
		details: 'Részletek',
		deviceStorage: 'Tárolás az eszközön',
		deviceStorageDetails: 'Az eszközön történő tárolás részletei',
		discardChanges: 'Módosítások elvetése',
		discardChangesDetail: 'A módosításait nem mentjük.',
		discardChangesTitle: 'Elveti a módosításokat?',
		expanded: 'Kibontva',
		hideDetails: 'Részletek elrejtése',
		iabPartnerCount: '{count} IAB-partner',
		iabPartners: 'IAB-partnerek',
		keepEditing: 'Szerkesztés folytatása',
		lastChanged: 'Utoljára módosítva: {date}',
		legitimateInterestStatement: 'Nyilatkozat a jogos érdekről',
		listOutdated:
			'A partnerlistánk elavult. Próbálja meg újra betölteni, vagy utasítsa el az adatok nem kötelező felhasználását.',
		loadCurrentSettings: 'Aktuális beállítások betöltése',
		no: 'Nem',
		noChoice: 'Nincs választási lehetőség',
		noDeviceStorage: 'Nem tárol információt az Ön eszközén.',
		noPartnersMatch: 'Nincs a(z) „{search}” keresésnek megfelelő partner.',
		notAllowedPurposes:
			'Ez az alkalmazás nem engedélyezi ennek a partnernek a következőket: {purposes}',
		off: 'Kikapcsolva',
		on: 'Bekapcsolva',
		otherDeviceAccess: 'Az eszköz elérésének egyéb módjai',
		partlyOn: 'Részben bekapcsolva',
		partner: 'Partner',
		partners: 'Partnerek',
		preferencesIntro:
			'Mi és partnereink információkat tárolunk az Ön eszközén és érünk el azon, valamint személyes adatokat kezelünk az alábbi célokból. Egyes partnerek hozzájárulás helyett jogos érdekre hivatkoznak. Ez ellen tiltakozhat, és választásait bármikor módosíthatja az Adatvédelmi beállításokban.',
		preferencesUnavailable:
			'Az Adatvédelmi beállítások még nem érhetők el. Csatlakozzon az internethez, és próbálja újra.',
		providersOff:
			'Ezek a célok jelenleg ki vannak kapcsolva, ezért ezek a partnerek is kikapcsolva maradnak, amíg be nem kapcsolja őket a Célok alatt.',
		purposeFilter: 'Cél: {purpose}',
		refreshesStoredInformation: 'Megújítja a tárolt információkat',
		retentionNotProvided: 'A partner nem adta meg.',
		retentionTitle: 'Az adatok megőrzési ideje',
		save: 'Mentés',
		searchOtherPartners: 'Egyéb partnerek keresése',
		searchPartners: 'Partnerek keresése',
		sessionOnly: 'Csak erre a munkamenetre',
		settingsChanged: 'A beállítások szerkesztés közben megváltoztak',
		settingsChangedDetail:
			'A választásait nem mentettük. Töltse be az aktuális beállításokat, majd válasszon újra.',
		specialFeatureOptIn:
			'A partnerek csak akkor teszik ezt, ha Ön bekapcsolja.',
		specialFeaturesElsewhere:
			'Az Adatvédelmi beállítások Különleges funkciók részében állítható be.',
		standardRetention: 'Szokásos megőrzés',
		storedForUpTo: 'Legfeljebb ennyi ideig tárolja',
		thisApp: 'Ez az alkalmazás',
		tryAgain: 'Újrapróbálás',
		turnOffToObject: 'Kapcsolja ki a tiltakozáshoz.',
		vendorPurposeSummary:
			'{purposes} cél · {legitimateInterest} jogos érdek alapján',
		viewPartners: 'Partnerek megtekintése',
		yes: 'Igen',
		yourChoices: 'Az Ön választásai',
	},
	id: {
		alwaysOn: 'Selalu Aktif',
		back: 'Kembali',
		cancel: 'Batal',
		close: 'Tutup',
		collapsed: 'Diciutkan',
		consent: 'Persetujuan',
		dataCollected: 'Data yang Dikumpulkan',
		dayCount: '{count} hari',
		dayCountOne: '1 hari',
		details: 'Detail',
		deviceStorage: 'Penyimpanan Perangkat',
		deviceStorageDetails: 'Detail Penyimpanan Perangkat',
		discardChanges: 'Buang Perubahan',
		discardChangesDetail: 'Perubahan Anda tidak akan disimpan.',
		discardChangesTitle: 'Buang perubahan?',
		expanded: 'Diluaskan',
		hideDetails: 'Sembunyikan Detail',
		iabPartnerCount: '{count} mitra IAB',
		iabPartners: 'Mitra IAB',
		keepEditing: 'Lanjutkan Mengedit',
		lastChanged: 'Terakhir diubah {date}',
		legitimateInterestStatement: 'Pernyataan Kepentingan Sah',
		listOutdated:
			'Daftar mitra kami sudah usang. Coba muat lagi, atau tolak penggunaan data opsional.',
		loadCurrentSettings: 'Muat Pengaturan Saat Ini',
		no: 'Tidak',
		noChoice: 'Tidak Ada Pilihan',
		noDeviceStorage: 'Tidak menyimpan informasi di perangkat Anda.',
		noPartnersMatch: 'Tidak ada mitra yang cocok dengan "{search}".',
		notAllowedPurposes:
			'Aplikasi ini tidak mengizinkan mitra ini untuk: {purposes}',
		off: 'Nonaktif',
		on: 'Aktif',
		otherDeviceAccess: 'Cara Lain Mengakses Perangkat Anda',
		partlyOn: 'Aktif Sebagian',
		partner: 'Mitra',
		partners: 'Mitra',
		preferencesIntro:
			'Kami dan mitra kami menyimpan dan mengakses informasi di perangkat Anda serta memproses data pribadi untuk tujuan di bawah ini. Beberapa mitra mengandalkan kepentingan sah, bukan persetujuan. Anda dapat menolaknya dan mengubah pilihan Anda kapan saja di Pengaturan Privasi.',
		preferencesUnavailable:
			'Pengaturan Privasi belum tersedia. Sambungkan ke internet, lalu coba lagi.',
		providersOff:
			'Tujuan tersebut saat ini nonaktif, jadi mitra ini tetap nonaktif sampai Anda mengaktifkannya di bagian Tujuan.',
		purposeFilter: 'Tujuan: {purpose}',
		refreshesStoredInformation: 'Memperbarui Informasi Tersimpan',
		retentionNotProvided: 'Tidak diberikan oleh mitra ini.',
		retentionTitle: 'Berapa Lama Data Disimpan',
		save: 'Simpan',
		searchOtherPartners: 'Cari mitra lain',
		searchPartners: 'Cari mitra',
		sessionOnly: 'Hanya sesi ini',
		settingsChanged: 'Pengaturan berubah saat Anda mengedit',
		settingsChangedDetail:
			'Pilihan Anda tidak disimpan. Muat pengaturan saat ini, lalu pilih lagi.',
		specialFeatureOptIn: 'Mitra hanya melakukan ini jika Anda mengaktifkannya.',
		specialFeaturesElsewhere:
			'Diatur di bagian Fitur Khusus dalam Pengaturan Privasi.',
		standardRetention: 'Retensi Standar',
		storedForUpTo: 'Disimpan hingga',
		thisApp: 'Aplikasi Ini',
		tryAgain: 'Coba Lagi',
		turnOffToObject: 'Nonaktifkan untuk menolak.',
		vendorPurposeSummary:
			'{purposes} tujuan · {legitimateInterest} berdasarkan kepentingan sah',
		viewPartners: 'Lihat Mitra',
		yes: 'Ya',
		yourChoices: 'Pilihan Anda',
	},
	is: {
		alwaysOn: 'Alltaf kveikt',
		back: 'Til baka',
		cancel: 'Hætta við',
		close: 'Loka',
		collapsed: 'Fellt saman',
		consent: 'Samþykki',
		dataCollected: 'Gögn sem er safnað',
		dayCount: '{count} dagar',
		dayCountOne: '1 dagur',
		details: 'Nánar',
		deviceStorage: 'Geymsla á tæki',
		deviceStorageDetails: 'Nánar um geymslu á tæki',
		discardChanges: 'Henda breytingum',
		discardChangesDetail: 'Breytingarnar þínar verða ekki vistaðar.',
		discardChangesTitle: 'Henda breytingum?',
		expanded: 'Fellt út',
		hideDetails: 'Fela nánari upplýsingar',
		iabPartnerCount: '{count} IAB-samstarfsaðilar',
		iabPartners: 'IAB-samstarfsaðilar',
		keepEditing: 'Halda áfram að breyta',
		lastChanged: 'Síðast breytt {date}',
		legitimateInterestStatement: 'Yfirlýsing um lögmæta hagsmuni',
		listOutdated:
			'Listinn yfir samstarfsaðila okkar er úreltur. Reyndu að hlaða honum aftur eða hafnaðu valfrjálsri gagnanotkun.',
		loadCurrentSettings: 'Hlaða núverandi stillingum',
		no: 'Nei',
		noChoice: 'Ekkert val',
		noDeviceStorage: 'Geymir engar upplýsingar á tækinu þínu.',
		noPartnersMatch: 'Engir samstarfsaðilar passa við „{search}“.',
		notAllowedPurposes:
			'Þetta forrit leyfir þessum samstarfsaðila ekki eftirfarandi: {purposes}',
		off: 'Slökkt',
		on: 'Kveikt',
		otherDeviceAccess: 'Aðrar leiðir til að fá aðgang að tækinu þínu',
		partlyOn: 'Kveikt að hluta',
		partner: 'Samstarfsaðili',
		partners: 'Samstarfsaðilar',
		preferencesIntro:
			'Við og samstarfsaðilar okkar geymum og opnum upplýsingar á tækinu þínu og vinnum persónuupplýsingar í þeim tilgangi sem talinn er upp hér að neðan. Sumir samstarfsaðilar byggja á lögmætum hagsmunum í stað samþykkis. Þú getur andmælt því og breytt vali þínu hvenær sem er í Persónuverndastillingum.',
		preferencesUnavailable:
			'Persónuverndastillingar eru ekki tiltækar enn. Tengstu netinu og reyndu aftur.',
		providersOff:
			'Slökkt er á þessum tilgangi eins og er, svo þessir samstarfsaðilar verða óvirkir þar til þú kveikir á honum undir Tilgangur.',
		purposeFilter: 'Tilgangur: {purpose}',
		refreshesStoredInformation: 'Endurnýjar geymdar upplýsingar',
		retentionNotProvided: 'Samstarfsaðilinn gaf þetta ekki upp.',
		retentionTitle: 'Hversu lengi gögn eru geymd',
		save: 'Vista',
		searchOtherPartners: 'Leita að öðrum samstarfsaðilum',
		searchPartners: 'Leita að samstarfsaðilum',
		sessionOnly: 'Aðeins þessa lotu',
		settingsChanged: 'Stillingar breyttust á meðan þú varst að breyta',
		settingsChangedDetail:
			'Val þitt var ekki vistað. Hladdu núverandi stillingum og veldu svo aftur.',
		specialFeatureOptIn:
			'Samstarfsaðilar gera þetta aðeins ef þú kveikir á því.',
		specialFeaturesElsewhere:
			'Stillt undir Sérstakir eiginleikar í Persónuverndastillingum.',
		standardRetention: 'Hefðbundin varðveisla',
		storedForUpTo: 'Geymt í allt að',
		thisApp: 'Þetta forrit',
		tryAgain: 'Reyna aftur',
		turnOffToObject: 'Slökktu til að andmæla.',
		vendorPurposeSummary:
			'Tilgangur: {purposes} · lögmætir hagsmunir: {legitimateInterest}',
		viewPartners: 'Skoða samstarfsaðila',
		yes: 'Já',
		yourChoices: 'Val þitt',
	},
	it: {
		alwaysOn: 'Sempre attivato',
		back: 'Indietro',
		cancel: 'Annulla',
		close: 'Chiudi',
		collapsed: 'Compresso',
		consent: 'Consenso',
		dataCollected: 'Dati raccolti',
		dayCount: '{count} giorni',
		dayCountOne: '1 giorno',
		details: 'Dettagli',
		deviceStorage: 'Archiviazione sul dispositivo',
		deviceStorageDetails: "Dettagli sull'archiviazione sul dispositivo",
		discardChanges: 'Scarta modifiche',
		discardChangesDetail: 'Le tue modifiche non verranno salvate.',
		discardChangesTitle: 'Scartare le modifiche?',
		expanded: 'Espanso',
		hideDetails: 'Nascondi dettagli',
		iabPartnerCount: '{count} partner IAB',
		iabPartners: 'Partner IAB',
		keepEditing: 'Continua a modificare',
		lastChanged: 'Ultima modifica: {date}',
		legitimateInterestStatement: "Dichiarazione sull'interesse legittimo",
		listOutdated:
			"Il nostro elenco dei partner non è aggiornato. Riprova a caricarlo oppure rifiuta l'uso facoltativo dei dati.",
		loadCurrentSettings: 'Carica le impostazioni attuali',
		no: 'No',
		noChoice: 'Nessuna scelta',
		noDeviceStorage: 'Non archivia informazioni sul tuo dispositivo.',
		noPartnersMatch: 'Nessun partner corrisponde a “{search}”.',
		notAllowedPurposes:
			'Questa app non consente a questo partner di: {purposes}',
		off: 'Disattivato',
		on: 'Attivato',
		otherDeviceAccess: 'Altri modi di accedere al tuo dispositivo',
		partlyOn: 'Parzialmente attivato',
		partner: 'Partner',
		partners: 'Partner',
		preferencesIntro:
			"Noi e i nostri partner archiviamo e accediamo a informazioni sul tuo dispositivo e trattiamo dati personali per le finalità indicate di seguito. Alcuni partner si basano sull'interesse legittimo invece che sul consenso. Puoi opporti e modificare le tue scelte in qualsiasi momento in Impostazioni di privacy.",
		preferencesUnavailable:
			'Le Impostazioni di privacy non sono ancora disponibili. Connettiti a internet e riprova.',
		providersOff:
			'Queste finalità sono disattivate al momento, quindi questi partner restano disattivati finché non le attivi in Finalità.',
		purposeFilter: 'Finalità: {purpose}',
		refreshesStoredInformation: 'Rinnova le informazioni archiviate',
		retentionNotProvided: 'Non indicato da questo partner.',
		retentionTitle: 'Per quanto tempo vengono conservati i dati',
		save: 'Salva',
		searchOtherPartners: 'Cerca altri partner',
		searchPartners: 'Cerca partner',
		sessionOnly: 'Solo questa sessione',
		settingsChanged: 'Le impostazioni sono cambiate durante la modifica',
		settingsChangedDetail:
			'Le tue scelte non sono state salvate. Carica le impostazioni attuali, poi scegli di nuovo.',
		specialFeatureOptIn: 'I partner lo fanno solo se lo attivi.',
		specialFeaturesElsewhere:
			'Si imposta in Funzionalità speciali, nelle Impostazioni di privacy.',
		standardRetention: 'Conservazione standard',
		storedForUpTo: 'Conservato fino a',
		thisApp: 'Questa app',
		tryAgain: 'Riprova',
		turnOffToObject: 'Disattiva per opporti.',
		vendorPurposeSummary:
			'{purposes} finalità · {legitimateInterest} per interesse legittimo',
		viewPartners: 'Visualizza partner',
		yes: 'Sì',
		yourChoices: 'Le tue scelte',
	},
	ja: {
		alwaysOn: '常にオン',
		back: '戻る',
		cancel: 'キャンセル',
		close: '閉じる',
		collapsed: '折りたたまれています',
		consent: '同意',
		dataCollected: '収集されるデータ',
		dayCount: '{count}日',
		dayCountOne: '1日',
		details: '詳細',
		deviceStorage: '端末への保存',
		deviceStorageDetails: '端末への保存の詳細',
		discardChanges: '変更を破棄',
		discardChangesDetail: '変更内容は保存されません。',
		discardChangesTitle: '変更を破棄しますか？',
		expanded: '展開されています',
		hideDetails: '詳細を非表示',
		iabPartnerCount: '{count}社のIABパートナー',
		iabPartners: 'IABパートナー',
		keepEditing: '編集を続ける',
		lastChanged: '最終変更日：{date}',
		legitimateInterestStatement: '正当な利益に関する声明',
		listOutdated:
			'パートナーリストが古くなっています。もう一度読み込むか、任意のデータ利用を拒否してください。',
		loadCurrentSettings: '現在の設定を読み込む',
		no: 'いいえ',
		noChoice: '選択不可',
		noDeviceStorage: 'お客様の端末に情報を保存しません。',
		noPartnersMatch: '「{search}」に一致するパートナーはありません。',
		notAllowedPurposes:
			'このアプリは、このパートナーに次の目的を許可していません：{purposes}',
		off: 'オフ',
		on: 'オン',
		otherDeviceAccess: '端末へのその他のアクセス方法',
		partlyOn: '一部オン',
		partner: 'パートナー',
		partners: 'パートナー',
		preferencesIntro:
			'当社およびパートナーは、以下の目的のために、お客様の端末への情報の保存や端末上の情報へのアクセスを行い、個人データを処理します。一部のパートナーは、同意ではなく正当な利益に基づいて処理を行います。お客様はこれに異議を申し立てることができ、プライバシー設定でいつでも選択内容を変更できます。',
		preferencesUnavailable:
			'プライバシー設定はまだ利用できません。インターネットに接続して、もう一度お試しください。',
		providersOff:
			'これらの目的は現在オフになっているため、「目的」でオンにするまで、これらのパートナーはオフのままです。',
		purposeFilter: '目的：{purpose}',
		refreshesStoredInformation: '保存した情報の更新',
		retentionNotProvided: 'このパートナーからは提供されていません。',
		retentionTitle: 'データの保存期間',
		save: '保存',
		searchOtherPartners: 'その他のパートナーを検索',
		searchPartners: 'パートナーを検索',
		sessionOnly: 'このセッションのみ',
		settingsChanged: '編集中に設定が変更されました',
		settingsChangedDetail:
			'選択内容は保存されていません。現在の設定を読み込んでから、もう一度選択してください。',
		specialFeatureOptIn:
			'お客様がオンにした場合にのみ、パートナーはこれを行います。',
		specialFeaturesElsewhere: 'プライバシー設定の「特別な特徴」で設定します。',
		standardRetention: '標準の保存期間',
		storedForUpTo: '最長保存期間',
		thisApp: 'このアプリ',
		tryAgain: '再試行',
		turnOffToObject: '異議を申し立てるにはオフにしてください。',
		vendorPurposeSummary:
			'目的 {purposes}件 · 正当な利益 {legitimateInterest}件',
		viewPartners: 'パートナーを表示',
		yes: 'はい',
		yourChoices: 'お客様の選択',
	},
	kn: {
		alwaysOn: 'ಯಾವಾಗಲೂ ಆನ್',
		back: 'ಹಿಂದಕ್ಕೆ',
		cancel: 'ರದ್ದುಮಾಡಿ',
		close: 'ಮುಚ್ಚಿ',
		collapsed: 'ಕುಗ್ಗಿಸಲಾಗಿದೆ',
		consent: 'ಸಮ್ಮತಿ',
		dataCollected: 'ಸಂಗ್ರಹಿಸಲಾದ ಡೇಟಾ',
		dayCount: '{count} ದಿನಗಳು',
		dayCountOne: '1 ದಿನ',
		details: 'ವಿವರಗಳು',
		deviceStorage: 'ಸಾಧನದ ಸಂಗ್ರಹಣೆ',
		deviceStorageDetails: 'ಸಾಧನದ ಸಂಗ್ರಹಣೆಯ ವಿವರಗಳು',
		discardChanges: 'ಬದಲಾವಣೆಗಳನ್ನು ತ್ಯಜಿಸಿ',
		discardChangesDetail: 'ನಿಮ್ಮ ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಲಾಗುವುದಿಲ್ಲ.',
		discardChangesTitle: 'ಬದಲಾವಣೆಗಳನ್ನು ತ್ಯಜಿಸಬೇಕೇ?',
		expanded: 'ವಿಸ್ತರಿಸಲಾಗಿದೆ',
		hideDetails: 'ವಿವರಗಳನ್ನು ಮರೆಮಾಡಿ',
		iabPartnerCount: 'IAB ಪಾಲುದಾರರು: {count}',
		iabPartners: 'IAB ಪಾಲುದಾರರು',
		keepEditing: 'ಎಡಿಟ್ ಮಾಡುವುದನ್ನು ಮುಂದುವರಿಸಿ',
		lastChanged: 'ಕೊನೆಯದಾಗಿ ಬದಲಾಯಿಸಿದ್ದು: {date}',
		legitimateInterestStatement: 'ನ್ಯಾಯಸಮ್ಮತ ಹಿತಾಸಕ್ತಿಯ ಹೇಳಿಕೆ',
		listOutdated:
			'ನಮ್ಮ ಪಾಲುದಾರರ ಪಟ್ಟಿ ಹಳೆಯದಾಗಿದೆ. ಅದನ್ನು ಲೋಡ್ ಮಾಡಲು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಐಚ್ಛಿಕ ಡೇಟಾ ಬಳಕೆಯನ್ನು ತಿರಸ್ಕರಿಸಿ.',
		loadCurrentSettings: 'ಪ್ರಸ್ತುತ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಿ',
		no: 'ಇಲ್ಲ',
		noChoice: 'ಆಯ್ಕೆ ಇಲ್ಲ',
		noDeviceStorage: 'ನಿಮ್ಮ ಸಾಧನದಲ್ಲಿ ಮಾಹಿತಿಯನ್ನು ಸಂಗ್ರಹಿಸುವುದಿಲ್ಲ.',
		noPartnersMatch: '"{search}" ಗೆ ಹೊಂದುವ ಯಾವುದೇ ಪಾಲುದಾರರಿಲ್ಲ.',
		notAllowedPurposes: 'ಈ ಆ್ಯಪ್ ಈ ಪಾಲುದಾರರಿಗೆ ಇವುಗಳನ್ನು ಅನುಮತಿಸುವುದಿಲ್ಲ: {purposes}',
		off: 'ಆಫ್',
		on: 'ಆನ್',
		otherDeviceAccess: 'ನಿಮ್ಮ ಸಾಧನವನ್ನು ಪ್ರವೇಶಿಸುವ ಇತರ ವಿಧಾನಗಳು',
		partlyOn: 'ಭಾಗಶಃ ಆನ್',
		partner: 'ಪಾಲುದಾರ',
		partners: 'ಪಾಲುದಾರರು',
		preferencesIntro:
			'ನಾವು ಮತ್ತು ನಮ್ಮ ಪಾಲುದಾರರು ಕೆಳಗಿನ ಉದ್ದೇಶಗಳಿಗಾಗಿ ನಿಮ್ಮ ಸಾಧನದಲ್ಲಿ ಮಾಹಿತಿಯನ್ನು ಸಂಗ್ರಹಿಸುತ್ತೇವೆ ಮತ್ತು ಪ್ರವೇಶಿಸುತ್ತೇವೆ, ಹಾಗೂ ವೈಯಕ್ತಿಕ ಡೇಟಾವನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸುತ್ತೇವೆ. ಕೆಲವು ಪಾಲುದಾರರು ಸಮ್ಮತಿಯ ಬದಲು ನ್ಯಾಯಸಮ್ಮತ ಹಿತಾಸಕ್ತಿಯನ್ನು ಅವಲಂಬಿಸುತ್ತಾರೆ. ನೀವು ಅದಕ್ಕೆ ಆಕ್ಷೇಪಿಸಬಹುದು ಮತ್ತು ಗೌಪ್ಯತಾ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಯಾವಾಗ ಬೇಕಾದರೂ ನಿಮ್ಮ ಆಯ್ಕೆಗಳನ್ನು ಬದಲಾಯಿಸಬಹುದು.',
		preferencesUnavailable:
			'ಗೌಪ್ಯತಾ ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ. ಇಂಟರ್ನೆಟ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ ಮತ್ತು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
		providersOff:
			'ಆ ಉದ್ದೇಶಗಳು ಈಗ ಆಫ್ ಆಗಿವೆ, ಆದ್ದರಿಂದ ನೀವು ಅವುಗಳನ್ನು ಉದ್ದೇಶಗಳು ವಿಭಾಗದಲ್ಲಿ ಆನ್ ಮಾಡುವವರೆಗೆ ಈ ಪಾಲುದಾರರು ಆಫ್ ಆಗಿಯೇ ಇರುತ್ತಾರೆ.',
		purposeFilter: 'ಉದ್ದೇಶ: {purpose}',
		refreshesStoredInformation: 'ಸಂಗ್ರಹಿಸಿದ ಮಾಹಿತಿಯನ್ನು ನವೀಕರಿಸುತ್ತದೆ',
		retentionNotProvided: 'ಈ ಪಾಲುದಾರರು ಇದನ್ನು ಒದಗಿಸಿಲ್ಲ.',
		retentionTitle: 'ಡೇಟಾವನ್ನು ಎಷ್ಟು ಕಾಲ ಇರಿಸಲಾಗುತ್ತದೆ',
		save: 'ಉಳಿಸಿ',
		searchOtherPartners: 'ಇತರ ಪಾಲುದಾರರನ್ನು ಹುಡುಕಿ',
		searchPartners: 'ಪಾಲುದಾರರನ್ನು ಹುಡುಕಿ',
		sessionOnly: 'ಈ ಸೆಷನ್‌ಗೆ ಮಾತ್ರ',
		settingsChanged: 'ನೀವು ಎಡಿಟ್ ಮಾಡುತ್ತಿದ್ದಾಗ ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಬದಲಾಗಿವೆ',
		settingsChangedDetail:
			'ನಿಮ್ಮ ಆಯ್ಕೆಗಳನ್ನು ಉಳಿಸಲಾಗಿಲ್ಲ. ಪ್ರಸ್ತುತ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಿ, ನಂತರ ಮತ್ತೆ ಆಯ್ಕೆಮಾಡಿ.',
		specialFeatureOptIn: 'ನೀವು ಇದನ್ನು ಆನ್ ಮಾಡಿದರೆ ಮಾತ್ರ ಪಾಲುದಾರರು ಇದನ್ನು ಮಾಡುತ್ತಾರೆ.',
		specialFeaturesElsewhere:
			'ಗೌಪ್ಯತಾ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿನ ವಿಶೇಷ ವೈಶಿಷ್ಟ್ಯಗಳು ವಿಭಾಗದಲ್ಲಿ ಹೊಂದಿಸಲಾಗುತ್ತದೆ.',
		standardRetention: 'ಪ್ರಮಾಣಿತ ಧಾರಣ ಅವಧಿ',
		storedForUpTo: 'ಗರಿಷ್ಠ ಸಂಗ್ರಹಣೆ ಅವಧಿ',
		thisApp: 'ಈ ಆ್ಯಪ್',
		tryAgain: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
		turnOffToObject: 'ಆಕ್ಷೇಪಿಸಲು ಆಫ್ ಮಾಡಿ.',
		vendorPurposeSummary:
			'ಉದ್ದೇಶಗಳು: {purposes} · ನ್ಯಾಯಸಮ್ಮತ ಹಿತಾಸಕ್ತಿ: {legitimateInterest}',
		viewPartners: 'ಪಾಲುದಾರರನ್ನು ವೀಕ್ಷಿಸಿ',
		yes: 'ಹೌದು',
		yourChoices: 'ನಿಮ್ಮ ಆಯ್ಕೆಗಳು',
	},
	ko: {
		alwaysOn: '항상 켬',
		back: '뒤로',
		cancel: '취소',
		close: '닫기',
		collapsed: '접힘',
		consent: '동의',
		dataCollected: '수집하는 데이터',
		dayCount: '{count}일',
		dayCountOne: '1일',
		details: '세부정보',
		deviceStorage: '기기 저장',
		deviceStorageDetails: '기기 저장 세부정보',
		discardChanges: '변경사항 삭제',
		discardChangesDetail: '변경사항이 저장되지 않습니다.',
		discardChangesTitle: '변경사항을 삭제하시겠습니까?',
		expanded: '펼쳐짐',
		hideDetails: '세부정보 숨기기',
		iabPartnerCount: '{count}개 IAB 파트너',
		iabPartners: 'IAB 파트너',
		keepEditing: '계속 편집',
		lastChanged: '마지막 변경: {date}',
		legitimateInterestStatement: '정당한 이익에 관한 설명',
		listOutdated:
			'파트너 목록이 오래되었습니다. 다시 불러오거나 선택적 데이터 사용을 거부하세요.',
		loadCurrentSettings: '현재 설정 불러오기',
		no: '아니요',
		noChoice: '선택 불가',
		noDeviceStorage: '귀하의 기기에 정보를 저장하지 않습니다.',
		noPartnersMatch: '"{search}"와(과) 일치하는 파트너가 없습니다.',
		notAllowedPurposes:
			'이 앱은 이 파트너에게 다음을 허용하지 않습니다: {purposes}',
		off: '끔',
		on: '켬',
		otherDeviceAccess: '기기에 액세스하는 기타 방법',
		partlyOn: '일부 켬',
		partner: '파트너',
		partners: '파트너',
		preferencesIntro:
			'당사와 파트너는 아래 목적을 위해 귀하의 기기에 정보를 저장하거나 액세스하고 개인정보를 처리합니다. 일부 파트너는 동의 대신 정당한 이익에 근거합니다. 귀하는 이에 이의를 제기할 수 있으며, 개인정보 보호 설정에서 언제든지 선택 사항을 변경할 수 있습니다.',
		preferencesUnavailable:
			'개인정보 보호 설정을 아직 사용할 수 없습니다. 인터넷에 연결한 후 다시 시도하세요.',
		providersOff:
			'해당 목적이 현재 꺼져 있으므로, 목적에서 켜기 전까지 이 파트너들은 꺼진 상태로 유지됩니다.',
		purposeFilter: '목적: {purpose}',
		refreshesStoredInformation: '저장된 정보 갱신',
		retentionNotProvided: '이 파트너가 제공하지 않았습니다.',
		retentionTitle: '데이터 보존 기간',
		save: '저장',
		searchOtherPartners: '다른 파트너 검색',
		searchPartners: '파트너 검색',
		sessionOnly: '이번 세션만',
		settingsChanged: '편집하는 동안 설정이 변경되었습니다',
		settingsChangedDetail:
			'선택 사항이 저장되지 않았습니다. 현재 설정을 불러온 후 다시 선택하세요.',
		specialFeatureOptIn: '귀하가 켠 경우에만 파트너가 이 작업을 수행합니다.',
		specialFeaturesElsewhere: '개인정보 보호 설정의 특별 기능에서 설정합니다.',
		standardRetention: '기본 보존 기간',
		storedForUpTo: '최대 저장 기간',
		thisApp: '이 앱',
		tryAgain: '다시 시도',
		turnOffToObject: '이의를 제기하려면 끄세요.',
		vendorPurposeSummary:
			'목적 {purposes}개 · 정당한 이익 {legitimateInterest}개',
		viewPartners: '파트너 보기',
		yes: '예',
		yourChoices: '귀하의 선택',
	},
	lb: {
		alwaysOn: 'Ëmmer un',
		back: 'Zréck',
		cancel: 'Ofbriechen',
		close: 'Zoumaachen',
		collapsed: 'Zougeklappt',
		consent: 'Zoustëmmung',
		dataCollected: 'Gesammelt Daten',
		dayCount: '{count} Deeg',
		dayCountOne: '1 Dag',
		details: 'Detailer',
		deviceStorage: 'Späicheren um Apparat',
		deviceStorageDetails: 'Detailer zum Späicheren um Apparat',
		discardChanges: 'Ännerunge verwerfen',
		discardChangesDetail: 'Är Ännerunge ginn net gespäichert.',
		discardChangesTitle: 'Ännerunge verwerfen?',
		expanded: 'Opgeklappt',
		hideDetails: 'Detailer verstoppen',
		iabPartnerCount: '{count} IAB-Partner',
		iabPartners: 'IAB-Partner',
		keepEditing: 'Weider beaarbechten',
		lastChanged: 'Fir d’lescht geännert: {date}',
		legitimateInterestStatement: 'Erklärung zum berechtegten Interessi',
		listOutdated:
			'Eis Partnerlëscht ass net méi aktuell. Probéiert se nach eng Kéier ze lueden, oder refuséiert déi fakultativ Notzung vun Daten.',
		loadCurrentSettings: 'Aktuell Astellunge lueden',
		no: 'Neen',
		noChoice: 'Keng Wiel',
		noDeviceStorage: 'Späichert keng Informatiounen op Ärem Apparat.',
		noPartnersMatch: 'Kee Partner passt op „{search}“.',
		notAllowedPurposes: 'Dës App erlaabt dësem Partner net: {purposes}',
		off: 'Aus',
		on: 'Un',
		otherDeviceAccess: 'Aner Weeër, fir op Ären Apparat zouzegräifen',
		partlyOn: 'Deelweis un',
		partner: 'Partner',
		partners: 'Partner',
		preferencesIntro:
			'Mir an eis Partner späicheren Informatiounen op Ärem Apparat a gräifen drop zou, a veraarbechten perséinlech Daten fir déi Zwecker hei ënnen. E puer Partner baséieren sech op berechtegten Interessi amplaz op Zoustëmmung. Dir kënnt dogéint protestéieren an Är Wiel zu all Moment an de Privatsphär Astellungen änneren.',
		preferencesUnavailable:
			'D’Privatsphär Astellunge sinn nach net disponibel. Verbannt Iech mam Internet a probéiert nach eng Kéier.',
		providersOff:
			'Dës Zwecker sinn elo aus, dofir bleiwen dës Partner aus, bis Dir se ënner Zwecker aschalt.',
		purposeFilter: 'Zweck: {purpose}',
		refreshesStoredInformation: 'Erneiert gespäichert Informatiounen',
		retentionNotProvided: 'Net vun dësem Partner uginn.',
		retentionTitle: 'Wéi laang Daten opgehale ginn',
		save: 'Späicheren',
		searchOtherPartners: 'Aner Partner sichen',
		searchPartners: 'Partner sichen',
		sessionOnly: 'Nëmmen dës Sessioun',
		settingsChanged:
			'D’Astellunge goufen geännert, während Dir se beaarbecht hutt',
		settingsChangedDetail:
			'Är Wiel gouf net gespäichert. Luet déi aktuell Astellungen, a wielt dann nach eng Kéier.',
		specialFeatureOptIn: 'Partner maachen dat nëmmen, wann Dir et aschalt.',
		specialFeaturesElsewhere:
			'Gëtt ënner Speziell Fonctiounen an de Privatsphär Astellungen agestallt.',
		standardRetention: 'Standard-Bewaardauer',
		storedForUpTo: 'Gespäichert fir maximal',
		thisApp: 'Dës App',
		tryAgain: 'Nach eng Kéier probéieren',
		turnOffToObject: 'Ausschalten, fir ze protestéieren.',
		vendorPurposeSummary:
			'{purposes} Zwecker · {legitimateInterest} op Basis vu berechtegtem Interessi',
		viewPartners: 'Partner weisen',
		yes: 'Jo',
		yourChoices: 'Är Wiel',
	},
	lt: {
		alwaysOn: 'Visada įjungta',
		back: 'Atgal',
		cancel: 'Atšaukti',
		close: 'Uždaryti',
		collapsed: 'Suskleista',
		consent: 'Sutikimas',
		dataCollected: 'Renkami duomenys',
		dayCount: '{count} d.',
		dayCountOne: '1 diena',
		details: 'Išsamiau',
		deviceStorage: 'Saugojimas įrenginyje',
		deviceStorageDetails: 'Išsami informacija apie saugojimą įrenginyje',
		discardChanges: 'Atmesti pakeitimus',
		discardChangesDetail: 'Jūsų pakeitimai nebus išsaugoti.',
		discardChangesTitle: 'Atmesti pakeitimus?',
		expanded: 'Išskleista',
		hideDetails: 'Slėpti informaciją',
		iabPartnerCount: 'IAB partneriai: {count}',
		iabPartners: 'IAB partneriai',
		keepEditing: 'Tęsti redagavimą',
		lastChanged: 'Paskutinį kartą pakeista {date}',
		legitimateInterestStatement: 'Teisėto intereso pareiškimas',
		listOutdated:
			'Mūsų partnerių sąrašas pasenęs. Pabandykite įkelti jį dar kartą arba atmeskite neprivalomą duomenų naudojimą.',
		loadCurrentSettings: 'Įkelti dabartinius nustatymus',
		no: 'Ne',
		noChoice: 'Pasirinkti negalima',
		noDeviceStorage: 'Informacijos jūsų įrenginyje nesaugo.',
		noPartnersMatch: 'Nėra partnerių, atitinkančių „{search}“.',
		notAllowedPurposes: 'Ši programėlė neleidžia šiam partneriui: {purposes}',
		off: 'Išjungta',
		on: 'Įjungta',
		otherDeviceAccess: 'Kiti prieigos prie jūsų įrenginio būdai',
		partlyOn: 'Iš dalies įjungta',
		partner: 'Partneris',
		partners: 'Partneriai',
		preferencesIntro:
			'Mes ir mūsų partneriai saugome ir pasiekiame informaciją jūsų įrenginyje ir tvarkome asmens duomenis toliau nurodytais tikslais. Kai kurie partneriai remiasi teisėtu interesu, o ne sutikimu. Galite su tuo nesutikti ir bet kada pakeisti savo pasirinkimus skiltyje Privatumo nustatymai.',
		preferencesUnavailable:
			'Privatumo nustatymai dar nepasiekiami. Prisijunkite prie interneto ir bandykite dar kartą.',
		providersOff:
			'Šie tikslai šiuo metu išjungti, todėl šie partneriai liks išjungti, kol neįjungsite tikslų skiltyje Tikslai.',
		purposeFilter: 'Tikslas: {purpose}',
		refreshesStoredInformation: 'Atnaujina saugomą informaciją',
		retentionNotProvided: 'Šis partneris šios informacijos nepateikė.',
		retentionTitle: 'Kiek laiko saugomi duomenys',
		save: 'Išsaugoti',
		searchOtherPartners: 'Ieškoti kitų partnerių',
		searchPartners: 'Ieškoti partnerių',
		sessionOnly: 'Tik šią sesiją',
		settingsChanged: 'Kol redagavote, nustatymai pasikeitė',
		settingsChangedDetail:
			'Jūsų pasirinkimai neišsaugoti. Įkelkite dabartinius nustatymus ir pasirinkite iš naujo.',
		specialFeatureOptIn: 'Partneriai tai daro tik tada, jei tai įjungiate.',
		specialFeaturesElsewhere:
			'Nustatoma Privatumo nustatymų skiltyje Specialios funkcijos.',
		standardRetention: 'Standartinis saugojimo laikotarpis',
		storedForUpTo: 'Saugoma iki',
		thisApp: 'Ši programėlė',
		tryAgain: 'Bandyti dar kartą',
		turnOffToObject: 'Išjunkite, jei nesutinkate.',
		vendorPurposeSummary:
			'Tikslai: {purposes} · teisėtas interesas: {legitimateInterest}',
		viewPartners: 'Peržiūrėti partnerius',
		yes: 'Taip',
		yourChoices: 'Jūsų pasirinkimai',
	},
	lv: {
		alwaysOn: 'Vienmēr ieslēgts',
		back: 'Atpakaļ',
		cancel: 'Atcelt',
		close: 'Aizvērt',
		collapsed: 'Sakļauts',
		consent: 'Piekrišana',
		dataCollected: 'Vāktie dati',
		dayCount: '{count} dienas',
		dayCountOne: '1 diena',
		details: 'Sīkāk',
		deviceStorage: 'Glabāšana ierīcē',
		deviceStorageDetails: 'Sīkāka informācija par glabāšanu ierīcē',
		discardChanges: 'Atmest izmaiņas',
		discardChangesDetail: 'Jūsu izmaiņas netiks saglabātas.',
		discardChangesTitle: 'Vai atmest izmaiņas?',
		expanded: 'Izvērsts',
		hideDetails: 'Paslēpt informāciju',
		iabPartnerCount: '{count} IAB partneri',
		iabPartners: 'IAB partneri',
		keepEditing: 'Turpināt rediģēšanu',
		lastChanged: 'Pēdējoreiz mainīts {date}',
		legitimateInterestStatement: 'Paziņojums par leģitīmajām interesēm',
		listOutdated:
			'Mūsu partneru saraksts ir novecojis. Mēģiniet to ielādēt vēlreiz vai noraidiet neobligāto datu izmantošanu.',
		loadCurrentSettings: 'Ielādēt pašreizējos iestatījumus',
		no: 'Nē',
		noChoice: 'Bez izvēles',
		noDeviceStorage: 'Neglabā informāciju jūsu ierīcē.',
		noPartnersMatch: 'Neviens partneris neatbilst "{search}".',
		notAllowedPurposes: 'Šī lietotne neļauj šim partnerim: {purposes}',
		off: 'Izslēgts',
		on: 'Ieslēgts',
		otherDeviceAccess: 'Citi veidi, kā piekļūt jūsu ierīcei',
		partlyOn: 'Daļēji ieslēgts',
		partner: 'Partneris',
		partners: 'Partneri',
		preferencesIntro:
			'Mēs un mūsu partneri uzglabājam informāciju jūsu ierīcē un piekļūstam tai, kā arī apstrādājam personas datus tālāk norādītajiem mērķiem. Daži partneri paļaujas uz leģitīmajām interesēm, nevis piekrišanu. Jūs varat pret to iebilst un jebkurā laikā mainīt savu izvēli sadaļā Privātuma iestatījumi.',
		preferencesUnavailable:
			'Privātuma iestatījumi vēl nav pieejami. Izveidojiet savienojumu ar internetu un mēģiniet vēlreiz.',
		providersOff:
			'Šie mērķi pašlaik ir izslēgti, tāpēc arī šie partneri paliek izslēgti, līdz jūs ieslēgsiet mērķus sadaļā Mērķi.',
		purposeFilter: 'Mērķis: {purpose}',
		refreshesStoredInformation: 'Atjauno saglabāto informāciju',
		retentionNotProvided: 'Šis partneris to nav norādījis.',
		retentionTitle: 'Cik ilgi dati tiek glabāti',
		save: 'Saglabāt',
		searchOtherPartners: 'Meklēt citus partnerus',
		searchPartners: 'Meklēt partnerus',
		sessionOnly: 'Tikai šajā sesijā',
		settingsChanged: 'Rediģēšanas laikā iestatījumi mainījās',
		settingsChangedDetail:
			'Jūsu izvēle netika saglabāta. Ielādējiet pašreizējos iestatījumus un izvēlieties vēlreiz.',
		specialFeatureOptIn: 'Partneri to dara tikai tad, ja jūs to ieslēdzat.',
		specialFeaturesElsewhere:
			'Iestatāms Privātuma iestatījumu sadaļā Īpašās funkcijas.',
		standardRetention: 'Standarta glabāšanas laiks',
		storedForUpTo: 'Glabā līdz',
		thisApp: 'Šī lietotne',
		tryAgain: 'Mēģināt vēlreiz',
		turnOffToObject: 'Izslēdziet, lai iebilstu.',
		vendorPurposeSummary:
			'Mērķi: {purposes} · leģitīmās intereses: {legitimateInterest}',
		viewPartners: 'Skatīt partnerus',
		yes: 'Jā',
		yourChoices: 'Jūsu izvēle',
	},
	ml: {
		alwaysOn: 'എപ്പോഴും ഓൺ',
		back: 'മടങ്ങുക',
		cancel: 'റദ്ദാക്കുക',
		close: 'അടയ്ക്കുക',
		collapsed: 'ചുരുക്കി',
		consent: 'സമ്മതം',
		dataCollected: 'ശേഖരിക്കുന്ന ഡാറ്റ',
		dayCount: '{count} ദിവസം',
		dayCountOne: '1 ദിവസം',
		details: 'വിശദാംശങ്ങൾ',
		deviceStorage: 'ഉപകരണ സംഭരണം',
		deviceStorageDetails: 'ഉപകരണ സംഭരണ വിശദാംശങ്ങൾ',
		discardChanges: 'മാറ്റങ്ങൾ നിരസിക്കുക',
		discardChangesDetail: 'നിങ്ങളുടെ മാറ്റങ്ങൾ സംരക്ഷിക്കില്ല.',
		discardChangesTitle: 'മാറ്റങ്ങൾ നിരസിക്കണോ?',
		expanded: 'വികസിപ്പിച്ചു',
		hideDetails: 'വിശദാംശങ്ങൾ മറയ്ക്കുക',
		iabPartnerCount: 'IAB പങ്കാളികൾ: {count}',
		iabPartners: 'IAB പങ്കാളികൾ',
		keepEditing: 'എഡിറ്റ് ചെയ്യുന്നത് തുടരുക',
		lastChanged: 'അവസാനം മാറ്റിയത്: {date}',
		legitimateInterestStatement: 'നിയമാനുസൃത താൽപ്പര്യ പ്രസ്താവന',
		listOutdated:
			'ഞങ്ങളുടെ പങ്കാളി ലിസ്റ്റ് കാലഹരണപ്പെട്ടതാണ്. ഇത് വീണ്ടും ലോഡ് ചെയ്യാൻ ശ്രമിക്കുക, അല്ലെങ്കിൽ ഐച്ഛിക ഡാറ്റ ഉപയോഗം നിരസിക്കുക.',
		loadCurrentSettings: 'നിലവിലെ ക്രമീകരണങ്ങൾ ലോഡ് ചെയ്യുക',
		no: 'ഇല്ല',
		noChoice: 'തിരഞ്ഞെടുക്കാനാവില്ല',
		noDeviceStorage: 'നിങ്ങളുടെ ഉപകരണത്തിൽ വിവരങ്ങൾ സംഭരിക്കുന്നില്ല.',
		noPartnersMatch: '"{search}" എന്നതുമായി പൊരുത്തപ്പെടുന്ന പങ്കാളികളില്ല.',
		notAllowedPurposes:
			'ഇനിപ്പറയുന്നവ ചെയ്യാൻ ഈ ആപ്പ് ഈ പങ്കാളിയെ അനുവദിക്കുന്നില്ല: {purposes}',
		off: 'ഓഫ്',
		on: 'ഓൺ',
		otherDeviceAccess: 'നിങ്ങളുടെ ഉപകരണം ആക്സസ് ചെയ്യാനുള്ള മറ്റ് മാർഗങ്ങൾ',
		partlyOn: 'ഭാഗികമായി ഓൺ',
		partner: 'പങ്കാളി',
		partners: 'പങ്കാളികൾ',
		preferencesIntro:
			'ഞങ്ങളും ഞങ്ങളുടെ പങ്കാളികളും താഴെയുള്ള ഉദ്ദേശ്യങ്ങൾക്കായി നിങ്ങളുടെ ഉപകരണത്തിൽ വിവരങ്ങൾ സംഭരിക്കുകയും ആക്സസ് ചെയ്യുകയും വ്യക്തിഗത ഡാറ്റ പ്രോസസ്സ് ചെയ്യുകയും ചെയ്യുന്നു. ചില പങ്കാളികൾ സമ്മതത്തിന് പകരം നിയമാനുസൃത താൽപ്പര്യത്തെ ആശ്രയിക്കുന്നു. നിങ്ങൾക്ക് ഇതിനെ എതിർക്കാനും സ്വകാര്യതാ ക്രമീകരണങ്ങളിൽ എപ്പോൾ വേണമെങ്കിലും നിങ്ങളുടെ തിരഞ്ഞെടുപ്പുകൾ മാറ്റാനും കഴിയും.',
		preferencesUnavailable:
			'സ്വകാര്യതാ ക്രമീകരണങ്ങൾ ഇതുവരെ ലഭ്യമല്ല. ഇന്റർനെറ്റുമായി കണക്റ്റ് ചെയ്ത് വീണ്ടും ശ്രമിക്കുക.',
		providersOff:
			'ആ ഉദ്ദേശ്യങ്ങൾ ഇപ്പോൾ ഓഫാണ്, അതിനാൽ ഉദ്ദേശ്യങ്ങൾ എന്നതിന് കീഴിൽ നിങ്ങൾ അവ ഓണാക്കുന്നത് വരെ ഈ പങ്കാളികൾ ഓഫായി തുടരും.',
		purposeFilter: 'ഉദ്ദേശ്യം: {purpose}',
		refreshesStoredInformation: 'സംഭരിച്ച വിവരങ്ങൾ പുതുക്കുന്നു',
		retentionNotProvided: 'ഈ പങ്കാളി ഇത് നൽകിയിട്ടില്ല.',
		retentionTitle: 'ഡാറ്റ എത്ര കാലം സൂക്ഷിക്കുന്നു',
		save: 'സംരക്ഷിക്കുക',
		searchOtherPartners: 'മറ്റ് പങ്കാളികളെ തിരയുക',
		searchPartners: 'പങ്കാളികളെ തിരയുക',
		sessionOnly: 'ഈ സെഷനിൽ മാത്രം',
		settingsChanged: 'നിങ്ങൾ എഡിറ്റ് ചെയ്യുന്നതിനിടെ ക്രമീകരണങ്ങൾ മാറി',
		settingsChangedDetail:
			'നിങ്ങളുടെ തിരഞ്ഞെടുപ്പുകൾ സംരക്ഷിച്ചില്ല. നിലവിലെ ക്രമീകരണങ്ങൾ ലോഡ് ചെയ്ത ശേഷം വീണ്ടും തിരഞ്ഞെടുക്കുക.',
		specialFeatureOptIn: 'നിങ്ങൾ ഇത് ഓണാക്കിയാൽ മാത്രമേ പങ്കാളികൾ ഇത് ചെയ്യൂ.',
		specialFeaturesElsewhere:
			'സ്വകാര്യതാ ക്രമീകരണങ്ങളിലെ പ്രത്യേക സവിശേഷതകൾ എന്നതിന് കീഴിൽ സജ്ജമാക്കുക.',
		standardRetention: 'സാധാരണ സൂക്ഷിക്കൽ കാലാവധി',
		storedForUpTo: 'പരമാവധി സൂക്ഷിക്കുന്നത്',
		thisApp: 'ഈ ആപ്പ്',
		tryAgain: 'വീണ്ടും ശ്രമിക്കുക',
		turnOffToObject: 'എതിർക്കാൻ ഓഫാക്കുക.',
		vendorPurposeSummary:
			'ഉദ്ദേശ്യങ്ങൾ: {purposes} · നിയമാനുസൃത താൽപ്പര്യം: {legitimateInterest}',
		viewPartners: 'പങ്കാളികളെ കാണുക',
		yes: 'അതെ',
		yourChoices: 'നിങ്ങളുടെ തിരഞ്ഞെടുപ്പുകൾ',
	},
	mr: {
		alwaysOn: 'नेहमी सुरू',
		back: 'मागे जा',
		cancel: 'रद्द करा',
		close: 'बंद करा',
		collapsed: 'संकुचित',
		consent: 'संमती',
		dataCollected: 'गोळा केला जाणारा डेटा',
		dayCount: '{count} दिवस',
		dayCountOne: '1 दिवस',
		details: 'तपशील',
		deviceStorage: 'डिव्हाइसवरील साठवण',
		deviceStorageDetails: 'डिव्हाइसवरील साठवणुकीचा तपशील',
		discardChanges: 'बदल टाकून द्या',
		discardChangesDetail: 'आपले बदल जतन केले जाणार नाहीत.',
		discardChangesTitle: 'बदल टाकून द्यायचे?',
		expanded: 'विस्तारित',
		hideDetails: 'तपशील लपवा',
		iabPartnerCount: '{count} IAB भागीदार',
		iabPartners: 'IAB भागीदार',
		keepEditing: 'संपादन सुरू ठेवा',
		lastChanged: 'शेवटचा बदल: {date}',
		legitimateInterestStatement: 'कायदेशीर हिताचे निवेदन',
		listOutdated:
			'आमची भागीदार सूची जुनी झाली आहे. ती पुन्हा लोड करून पाहा किंवा ऐच्छिक डेटा वापर नाकारा.',
		loadCurrentSettings: 'सध्याची सेटिंग्ज लोड करा',
		no: 'नाही',
		noChoice: 'निवड नाही',
		noDeviceStorage: 'आपल्या डिव्हाइसवर माहिती साठवत नाही.',
		noPartnersMatch: '"{search}" शी जुळणारे कोणतेही भागीदार नाहीत.',
		notAllowedPurposes:
			'हे ॲप या भागीदाराला पुढील गोष्टींची परवानगी देत नाही: {purposes}',
		off: 'बंद',
		on: 'सुरू',
		otherDeviceAccess: 'आपल्या डिव्हाइसला ॲक्सेस करण्याचे इतर मार्ग',
		partlyOn: 'अंशतः सुरू',
		partner: 'भागीदार',
		partners: 'भागीदार',
		preferencesIntro:
			'आम्ही आणि आमचे भागीदार खालील उद्देशांसाठी आपल्या डिव्हाइसवर माहिती साठवतो आणि ॲक्सेस करतो, तसेच वैयक्तिक डेटावर प्रक्रिया करतो. काही भागीदार संमतीऐवजी कायदेशीर हितावर अवलंबून असतात. आपण याला आक्षेप घेऊ शकता आणि गोपनीयता सेटिंग्जमध्ये कधीही आपल्या निवडी बदलू शकता.',
		preferencesUnavailable:
			'गोपनीयता सेटिंग्ज अद्याप उपलब्ध नाहीत. इंटरनेटशी कनेक्ट करा आणि पुन्हा प्रयत्न करा.',
		providersOff:
			'ते उद्देश सध्या बंद आहेत, त्यामुळे आपण उद्देश विभागात ते सुरू करेपर्यंत हे भागीदार बंदच राहतील.',
		purposeFilter: 'उद्देश: {purpose}',
		refreshesStoredInformation: 'साठवलेल्या माहितीचे नूतनीकरण करते',
		retentionNotProvided: 'या भागीदाराने दिलेले नाही.',
		retentionTitle: 'डेटा किती काळ ठेवला जातो',
		save: 'जतन करा',
		searchOtherPartners: 'इतर भागीदार शोधा',
		searchPartners: 'भागीदार शोधा',
		sessionOnly: 'फक्त हे सत्र',
		settingsChanged: 'आपण संपादन करत असताना सेटिंग्ज बदलली',
		settingsChangedDetail:
			'आपल्या निवडी जतन झाल्या नाहीत. सध्याची सेटिंग्ज लोड करा आणि पुन्हा निवडा.',
		specialFeatureOptIn: 'आपण हे सुरू केले तरच भागीदार हे करतात.',
		specialFeaturesElsewhere: 'गोपनीयता सेटिंग्जमधील विशेष वैशिष्ट्ये विभागात सेट करा.',
		standardRetention: 'मानक साठवण कालावधी',
		storedForUpTo: 'जास्तीत जास्त साठवण',
		thisApp: 'हे ॲप',
		tryAgain: 'पुन्हा प्रयत्न करा',
		turnOffToObject: 'आक्षेप घेण्यासाठी बंद करा.',
		vendorPurposeSummary:
			'{purposes} उद्देश · {legitimateInterest} कायदेशीर हितावर',
		viewPartners: 'भागीदार पाहा',
		yes: 'होय',
		yourChoices: 'आपल्या निवडी',
	},
	ms: {
		alwaysOn: 'Sentiasa hidup',
		back: 'Kembali',
		cancel: 'Batal',
		close: 'Tutup',
		collapsed: 'Dikuncupkan',
		consent: 'Persetujuan',
		dataCollected: 'Data yang dikumpul',
		dayCount: '{count} hari',
		dayCountOne: '1 hari',
		details: 'Butiran',
		deviceStorage: 'Storan peranti',
		deviceStorageDetails: 'Butiran storan peranti',
		discardChanges: 'Buang perubahan',
		discardChangesDetail: 'Perubahan anda tidak akan disimpan.',
		discardChangesTitle: 'Buang perubahan?',
		expanded: 'Dikembangkan',
		hideDetails: 'Sembunyikan butiran',
		iabPartnerCount: '{count} rakan kongsi IAB',
		iabPartners: 'Rakan kongsi IAB',
		keepEditing: 'Teruskan mengedit',
		lastChanged: 'Kali terakhir ditukar {date}',
		legitimateInterestStatement: 'Kenyataan kepentingan sah',
		listOutdated:
			'Senarai rakan kongsi kami sudah lapuk. Cuba muatkan semula, atau tolak penggunaan data pilihan.',
		loadCurrentSettings: 'Muatkan tetapan semasa',
		no: 'Tidak',
		noChoice: 'Tiada pilihan',
		noDeviceStorage: 'Tidak menyimpan maklumat pada peranti anda.',
		noPartnersMatch: 'Tiada rakan kongsi yang sepadan dengan "{search}".',
		notAllowedPurposes:
			'Aplikasi ini tidak membenarkan rakan kongsi ini untuk: {purposes}',
		off: 'Mati',
		on: 'Hidup',
		otherDeviceAccess: 'Cara lain untuk mengakses peranti anda',
		partlyOn: 'Hidup sebahagian',
		partner: 'Rakan kongsi',
		partners: 'Rakan kongsi',
		preferencesIntro:
			'Kami dan rakan kongsi kami menyimpan dan mengakses maklumat pada peranti anda serta memproses data peribadi bagi tujuan di bawah. Sesetengah rakan kongsi bergantung pada kepentingan sah dan bukannya persetujuan. Anda boleh membantahnya dan menukar pilihan anda pada bila-bila masa dalam Tetapan Privasi.',
		preferencesUnavailable:
			'Tetapan Privasi belum tersedia. Sambung ke internet dan cuba lagi.',
		providersOff:
			'Tujuan tersebut dimatikan sekarang, jadi rakan kongsi ini kekal mati sehingga anda menghidupkannya di bawah Tujuan.',
		purposeFilter: 'Tujuan: {purpose}',
		refreshesStoredInformation: 'Memperbaharui maklumat yang disimpan',
		retentionNotProvided: 'Tidak diberikan oleh rakan kongsi ini.',
		retentionTitle: 'Tempoh data disimpan',
		save: 'Simpan',
		searchOtherPartners: 'Cari rakan kongsi lain',
		searchPartners: 'Cari rakan kongsi',
		sessionOnly: 'Sesi ini sahaja',
		settingsChanged: 'Tetapan berubah semasa anda mengedit',
		settingsChangedDetail:
			'Pilihan anda tidak disimpan. Muatkan tetapan semasa, kemudian pilih semula.',
		specialFeatureOptIn:
			'Rakan kongsi hanya melakukan ini jika anda menghidupkannya.',
		specialFeaturesElsewhere:
			'Ditetapkan di bawah Ciri Khas dalam Tetapan Privasi.',
		standardRetention: 'Tempoh penyimpanan standard',
		storedForUpTo: 'Disimpan sehingga',
		thisApp: 'Aplikasi ini',
		tryAgain: 'Cuba lagi',
		turnOffToObject: 'Matikan untuk membantah.',
		vendorPurposeSummary:
			'{purposes} tujuan · {legitimateInterest} atas kepentingan sah',
		viewPartners: 'Lihat rakan kongsi',
		yes: 'Ya',
		yourChoices: 'Pilihan anda',
	},
	mt: {
		alwaysOn: 'Dejjem mixgħul',
		back: 'Lura',
		cancel: 'Ikkanċella',
		close: 'Agħlaq',
		collapsed: 'Magħluq',
		consent: 'Kunsens',
		dataCollected: 'Data miġbura',
		dayCount: '{count} jum',
		dayCountOne: 'Jum wieħed',
		details: 'Dettalji',
		deviceStorage: 'Ħażna fuq l-apparat',
		deviceStorageDetails: 'Dettalji tal-ħażna fuq l-apparat',
		discardChanges: 'Armi l-bidliet',
		discardChangesDetail: 'Il-bidliet tiegħek mhux se jiġu salvati.',
		discardChangesTitle: 'Tarmi l-bidliet?',
		expanded: 'Miftuħ',
		hideDetails: 'Aħbi d-dettalji',
		iabPartnerCount: '{count} sieħeb tal-IAB',
		iabPartners: 'Sħab tal-IAB',
		keepEditing: 'Kompli l-editjar',
		lastChanged: 'L-aħħar bidla: {date}',
		legitimateInterestStatement: 'Dikjarazzjoni tal-interess leġittimu',
		listOutdated:
			'Il-lista tas-sħab tagħna mhix aġġornata. Erġa’ pprova tgħabbiha, jew irrifjuta l-użu fakultattiv tad-data.',
		loadCurrentSettings: 'Għabbi s-settings attwali',
		no: 'Le',
		noChoice: 'L-ebda għażla',
		noDeviceStorage: 'Ma jaħżen l-ebda informazzjoni fuq l-apparat tiegħek.',
		noPartnersMatch: 'L-ebda sieħeb ma jaqbel ma’ "{search}".',
		notAllowedPurposes: 'Din l-app ma tħallix lil dan is-sieħeb: {purposes}',
		off: 'Mitfi',
		on: 'Mixgħul',
		otherDeviceAccess: 'Modi oħra ta’ aċċess għall-apparat tiegħek',
		partlyOn: 'Parzjalment mixgħul',
		partner: 'Sieħeb',
		partners: 'Sħab',
		preferencesIntro:
			'Aħna u s-sħab tagħna naħżnu u naċċessaw informazzjoni fuq l-apparat tiegħek u nipproċessaw data personali għall-għanijiet hawn taħt. Xi sħab jibbażaw ruħhom fuq interess leġittimu minflok il-kunsens. Tista’ toġġezzjona għal dan u tibdel l-għażliet tiegħek fi kwalunkwe ħin minn Settings tal-privatezza.',
		preferencesUnavailable:
			'Is-Settings tal-privatezza għadhom mhumiex disponibbli. Qabbad mal-internet u erġa’ pprova.',
		providersOff:
			'Dawk l-għanijiet huma mitfija bħalissa, għalhekk dawn is-sħab jibqgħu mitfija sakemm tixgħelhom taħt Għanijiet.',
		purposeFilter: 'Għan: {purpose}',
		refreshesStoredInformation: 'Iġedded l-informazzjoni maħżuna',
		retentionNotProvided: 'Dan is-sieħeb ma pprovdiex din l-informazzjoni.',
		retentionTitle: 'Għal kemm żmien tinżamm id-data',
		save: 'Issejvja',
		searchOtherPartners: 'Fittex sħab oħra',
		searchPartners: 'Fittex sħab',
		sessionOnly: 'Din is-sessjoni biss',
		settingsChanged: 'Is-settings inbidlu waqt li kont qed teditja',
		settingsChangedDetail:
			'L-għażliet tiegħek ma ġewx salvati. Għabbi s-settings attwali, imbagħad erġa’ agħżel.',
		specialFeatureOptIn: 'Is-sħab jagħmlu dan biss jekk tixgħlu.',
		specialFeaturesElsewhere:
			'Issettjat taħt Karatteristiċi Speċjali f’Settings tal-privatezza.',
		standardRetention: 'Żamma standard',
		storedForUpTo: 'Maħżun sa',
		thisApp: 'Din l-app',
		tryAgain: "Erġa' pprova",
		turnOffToObject: 'Itfi biex toġġezzjona.',
		vendorPurposeSummary:
			'Għanijiet: {purposes} · interess leġittimu: {legitimateInterest}',
		viewPartners: 'Ara s-sħab',
		yes: 'Iva',
		yourChoices: 'L-għażliet tiegħek',
	},
	nb: {
		alwaysOn: 'Alltid på',
		back: 'Tilbake',
		cancel: 'Avbryt',
		close: 'Lukk',
		collapsed: 'Skjult',
		consent: 'Samtykke',
		dataCollected: 'Data som samles inn',
		dayCount: '{count} dager',
		dayCountOne: '1 dag',
		details: 'Detaljer',
		deviceStorage: 'Lagring på enheten',
		deviceStorageDetails: 'Detaljer om lagring på enheten',
		discardChanges: 'Forkast endringene',
		discardChangesDetail: 'Endringene dine blir ikke lagret.',
		discardChangesTitle: 'Vil du forkaste endringene?',
		expanded: 'Utvidet',
		hideDetails: 'Skjul detaljer',
		iabPartnerCount: '{count} IAB-partnere',
		iabPartners: 'IAB-partnere',
		keepEditing: 'Fortsett å redigere',
		lastChanged: 'Sist endret {date}',
		legitimateInterestStatement: 'Erklæring om legitim interesse',
		listOutdated:
			'Partnerlisten vår er utdatert. Prøv å laste den inn på nytt, eller avvis valgfri bruk av data.',
		loadCurrentSettings: 'Last inn gjeldende innstillinger',
		no: 'Nei',
		noChoice: 'Ingen valg',
		noDeviceStorage: 'Lagrer ikke informasjon på enheten din.',
		noPartnersMatch: 'Ingen partnere samsvarer med «{search}».',
		notAllowedPurposes:
			'Denne appen tillater ikke denne partneren å: {purposes}',
		off: 'Av',
		on: 'På',
		otherDeviceAccess: 'Andre måter å få tilgang til enheten din på',
		partlyOn: 'Delvis på',
		partner: 'Partner',
		partners: 'Partnere',
		preferencesIntro:
			'Vi og partnerne våre lagrer og har tilgang til informasjon på enheten din og behandler personopplysninger for formålene nedenfor. Noen partnere bruker legitim interesse i stedet for samtykke. Du kan protestere mot dette og endre valgene dine når som helst under Personverninnstillinger.',
		preferencesUnavailable:
			'Personverninnstillinger er ikke tilgjengelige ennå. Koble til internett og prøv igjen.',
		providersOff:
			'Disse formålene er slått av nå, så disse partnerne forblir av til du slår formålene på under Formål.',
		purposeFilter: 'Formål: {purpose}',
		refreshesStoredInformation: 'Fornyer lagret informasjon',
		retentionNotProvided: 'Ikke oppgitt av denne partneren.',
		retentionTitle: 'Hvor lenge data lagres',
		save: 'Lagre',
		searchOtherPartners: 'Søk i andre partnere',
		searchPartners: 'Søk i partnere',
		sessionOnly: 'Bare denne økten',
		settingsChanged: 'Innstillingene ble endret mens du redigerte',
		settingsChangedDetail:
			'Valgene dine ble ikke lagret. Last inn gjeldende innstillinger, og velg på nytt.',
		specialFeatureOptIn: 'Partnere gjør dette bare hvis du slår det på.',
		specialFeaturesElsewhere:
			'Angis under Spesielle funksjoner i Personverninnstillinger.',
		standardRetention: 'Standard lagringstid',
		storedForUpTo: 'Lagres i opptil',
		thisApp: 'Denne appen',
		tryAgain: 'Prøv igjen',
		turnOffToObject: 'Slå av for å protestere.',
		vendorPurposeSummary:
			'{purposes} formål · {legitimateInterest} på legitim interesse',
		viewPartners: 'Se partnere',
		yes: 'Ja',
		yourChoices: 'Valgene dine',
	},
	nl: {
		alwaysOn: 'Altijd aan',
		back: 'Terug',
		cancel: 'Annuleren',
		close: 'Sluiten',
		collapsed: 'Samengevouwen',
		consent: 'Toestemming',
		dataCollected: 'Verzamelde gegevens',
		dayCount: '{count} dagen',
		dayCountOne: '1 dag',
		details: 'Details',
		deviceStorage: 'Opslag op apparaat',
		deviceStorageDetails: 'Details over opslag op apparaat',
		discardChanges: 'Wijzigingen negeren',
		discardChangesDetail: 'Uw wijzigingen worden niet opgeslagen.',
		discardChangesTitle: 'Wijzigingen negeren?',
		expanded: 'Uitgevouwen',
		hideDetails: 'Details verbergen',
		iabPartnerCount: '{count} IAB-partners',
		iabPartners: 'IAB-partners',
		keepEditing: 'Verder bewerken',
		lastChanged: 'Laatst gewijzigd op {date}',
		legitimateInterestStatement: 'Verklaring over gerechtvaardigd belang',
		listOutdated:
			'Onze partnerlijst is verouderd. Probeer deze opnieuw te laden of weiger optioneel gegevensgebruik.',
		loadCurrentSettings: 'Huidige instellingen laden',
		no: 'Nee',
		noChoice: 'Geen keuze',
		noDeviceStorage: 'Slaat geen informatie op uw apparaat op.',
		noPartnersMatch: 'Geen partners gevonden voor "{search}".',
		notAllowedPurposes: 'Deze app staat deze partner niet toe om: {purposes}',
		off: 'Uit',
		on: 'Aan',
		otherDeviceAccess: 'Andere manieren van toegang tot uw apparaat',
		partlyOn: 'Deels aan',
		partner: 'Partner',
		partners: 'Partners',
		preferencesIntro:
			'Wij en onze partners slaan informatie op uw apparaat op en openen deze, en verwerken persoonlijke gegevens voor de onderstaande doeleinden. Sommige partners baseren zich op gerechtvaardigd belang in plaats van toestemming. U kunt daartegen bezwaar maken en uw keuzes op elk moment wijzigen in Privacy-instellingen.',
		preferencesUnavailable:
			'Privacy-instellingen zijn nog niet beschikbaar. Maak verbinding met internet en probeer het opnieuw.',
		providersOff:
			'Die doeleinden staan nu uit, dus deze partners blijven uit totdat u de doeleinden inschakelt onder Doeleinden.',
		purposeFilter: 'Doel: {purpose}',
		refreshesStoredInformation: 'Vernieuwt opgeslagen informatie',
		retentionNotProvided: 'Niet opgegeven door deze partner.',
		retentionTitle: 'Hoelang gegevens worden bewaard',
		save: 'Opslaan',
		searchOtherPartners: 'Andere partners zoeken',
		searchPartners: 'Partners zoeken',
		sessionOnly: 'Alleen deze sessie',
		settingsChanged: 'Instellingen gewijzigd tijdens het bewerken',
		settingsChangedDetail:
			'Uw keuzes zijn niet opgeslagen. Laad de huidige instellingen en kies opnieuw.',
		specialFeatureOptIn: 'Partners doen dit alleen als u het inschakelt.',
		specialFeaturesElsewhere:
			'In te stellen onder Speciale functies in Privacy-instellingen.',
		standardRetention: 'Standaardbewaartermijn',
		storedForUpTo: 'Bewaard voor maximaal',
		thisApp: 'Deze app',
		tryAgain: 'Opnieuw proberen',
		turnOffToObject: 'Schakel uit om bezwaar te maken.',
		vendorPurposeSummary:
			'{purposes} doeleinden · {legitimateInterest} op basis van gerechtvaardigd belang',
		viewPartners: 'Partners bekijken',
		yes: 'Ja',
		yourChoices: 'Uw keuzes',
	},
	nn: {
		alwaysOn: 'Alltid på',
		back: 'Tilbake',
		cancel: 'Avbryt',
		close: 'Lukk',
		collapsed: 'Skjult',
		consent: 'Samtykke',
		dataCollected: 'Data som blir samla inn',
		dayCount: '{count} dagar',
		dayCountOne: '1 dag',
		details: 'Detaljar',
		deviceStorage: 'Lagring på eininga',
		deviceStorageDetails: 'Detaljar om lagring på eininga',
		discardChanges: 'Forkast endringane',
		discardChangesDetail: 'Endringane dine blir ikkje lagra.',
		discardChangesTitle: 'Vil du forkaste endringane?',
		expanded: 'Utvida',
		hideDetails: 'Skjul detaljar',
		iabPartnerCount: '{count} IAB-partnarar',
		iabPartners: 'IAB-partnarar',
		keepEditing: 'Hald fram med å redigere',
		lastChanged: 'Sist endra {date}',
		legitimateInterestStatement: 'Erklæring om legitim interesse',
		listOutdated:
			'Partnarlista vår er utdatert. Prøv å laste ho inn på nytt, eller avvis valfri bruk av data.',
		loadCurrentSettings: 'Last inn gjeldande innstillingar',
		no: 'Nei',
		noChoice: 'Ingen val',
		noDeviceStorage: 'Lagrar ikkje informasjon på eininga di.',
		noPartnersMatch: 'Ingen partnarar samsvarer med «{search}».',
		notAllowedPurposes:
			'Denne appen tillèt ikkje denne partnaren å: {purposes}',
		off: 'Av',
		on: 'På',
		otherDeviceAccess: 'Andre måtar å få tilgang til eininga di på',
		partlyOn: 'Delvis på',
		partner: 'Partnar',
		partners: 'Partnarar',
		preferencesIntro:
			'Vi og partnarane våre lagrar og har tilgang til informasjon på eininga di og behandlar personopplysningar for føremåla nedanfor. Nokre partnarar brukar legitim interesse i staden for samtykke. Du kan protestere mot dette og endre vala dine når som helst under Personverninnstillingar.',
		preferencesUnavailable:
			'Personverninnstillingar er ikkje tilgjengelege enno. Kople til internett og prøv igjen.',
		providersOff:
			'Desse føremåla er slått av no, så desse partnarane blir verande av til du slår føremåla på under Føremål.',
		purposeFilter: 'Føremål: {purpose}',
		refreshesStoredInformation: 'Fornyar lagra informasjon',
		retentionNotProvided: 'Ikkje oppgitt av denne partnaren.',
		retentionTitle: 'Kor lenge data blir lagra',
		save: 'Lagre',
		searchOtherPartners: 'Søk i andre partnarar',
		searchPartners: 'Søk i partnarar',
		sessionOnly: 'Berre denne økta',
		settingsChanged: 'Innstillingane vart endra medan du redigerte',
		settingsChangedDetail:
			'Vala dine vart ikkje lagra. Last inn gjeldande innstillingar, og vel på nytt.',
		specialFeatureOptIn: 'Partnarar gjer dette berre viss du slår det på.',
		specialFeaturesElsewhere:
			'Blir sett under Spesielle funksjonar i Personverninnstillingar.',
		standardRetention: 'Standard lagringstid',
		storedForUpTo: 'Blir lagra i opptil',
		thisApp: 'Denne appen',
		tryAgain: 'Prøv igjen',
		turnOffToObject: 'Slå av for å protestere.',
		vendorPurposeSummary:
			'{purposes} føremål · {legitimateInterest} på legitim interesse',
		viewPartners: 'Sjå partnarar',
		yes: 'Ja',
		yourChoices: 'Vala dine',
	},
	pa: {
		alwaysOn: 'ਹਮੇਸ਼ਾ ਚਾਲੂ',
		back: 'ਪਿੱਛੇ ਜਾਓ',
		cancel: 'ਰੱਦ ਕਰੋ',
		close: 'ਬੰਦ ਕਰੋ',
		collapsed: 'ਸਮੇਟਿਆ ਗਿਆ',
		consent: 'ਸਹਿਮਤੀ',
		dataCollected: 'ਇਕੱਠਾ ਕੀਤਾ ਜਾਂਦਾ ਡਾਟਾ',
		dayCount: '{count} ਦਿਨ',
		dayCountOne: '1 ਦਿਨ',
		details: 'ਵੇਰਵੇ',
		deviceStorage: 'ਡਿਵਾਈਸ ਸਟੋਰੇਜ',
		deviceStorageDetails: 'ਡਿਵਾਈਸ ਸਟੋਰੇਜ ਦੇ ਵੇਰਵੇ',
		discardChanges: 'ਤਬਦੀਲੀਆਂ ਰੱਦ ਕਰੋ',
		discardChangesDetail: 'ਤੁਹਾਡੀਆਂ ਤਬਦੀਲੀਆਂ ਰੱਖਿਅਤ ਨਹੀਂ ਕੀਤੀਆਂ ਜਾਣਗੀਆਂ।',
		discardChangesTitle: 'ਕੀ ਤਬਦੀਲੀਆਂ ਰੱਦ ਕਰਨੀਆਂ ਹਨ?',
		expanded: 'ਫੈਲਾਇਆ ਗਿਆ',
		hideDetails: 'ਵੇਰਵੇ ਲੁਕਾਓ',
		iabPartnerCount: '{count} IAB ਭਾਈਵਾਲ',
		iabPartners: 'IAB ਭਾਈਵਾਲ',
		keepEditing: 'ਸੰਪਾਦਨ ਜਾਰੀ ਰੱਖੋ',
		lastChanged: 'ਆਖਰੀ ਵਾਰ ਬਦਲਿਆ: {date}',
		legitimateInterestStatement: 'ਜਾਇਜ਼ ਹਿੱਤ ਦਾ ਬਿਆਨ',
		listOutdated:
			'ਸਾਡੀ ਭਾਈਵਾਲ ਸੂਚੀ ਪੁਰਾਣੀ ਹੋ ਗਈ ਹੈ। ਇਸਨੂੰ ਦੁਬਾਰਾ ਲੋਡ ਕਰਕੇ ਦੇਖੋ, ਜਾਂ ਵਿਕਲਪਿਕ ਡਾਟਾ ਵਰਤੋਂ ਨੂੰ ਅਸਵੀਕਾਰ ਕਰੋ।',
		loadCurrentSettings: 'ਮੌਜੂਦਾ ਸੈਟਿੰਗਾਂ ਲੋਡ ਕਰੋ',
		no: 'ਨਹੀਂ',
		noChoice: 'ਕੋਈ ਚੋਣ ਨਹੀਂ',
		noDeviceStorage: 'ਤੁਹਾਡੇ ਡਿਵਾਈਸ ਉੱਤੇ ਜਾਣਕਾਰੀ ਸਟੋਰ ਨਹੀਂ ਕਰਦਾ।',
		noPartnersMatch: '"{search}" ਨਾਲ ਮੇਲ ਖਾਂਦਾ ਕੋਈ ਭਾਈਵਾਲ ਨਹੀਂ ਮਿਲਿਆ।',
		notAllowedPurposes: 'ਇਹ ਐਪ ਇਸ ਭਾਈਵਾਲ ਨੂੰ ਇਹਨਾਂ ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਦਿੰਦੀ: {purposes}',
		off: 'ਬੰਦ',
		on: 'ਚਾਲੂ',
		otherDeviceAccess: 'ਤੁਹਾਡੇ ਡਿਵਾਈਸ ਤੱਕ ਪਹੁੰਚ ਦੇ ਹੋਰ ਤਰੀਕੇ',
		partlyOn: 'ਅੰਸ਼ਕ ਤੌਰ ਉੱਤੇ ਚਾਲੂ',
		partner: 'ਭਾਈਵਾਲ',
		partners: 'ਭਾਈਵਾਲ',
		preferencesIntro:
			'ਅਸੀਂ ਅਤੇ ਸਾਡੇ ਭਾਈਵਾਲ ਹੇਠਾਂ ਦਿੱਤੇ ਮਕਸਦਾਂ ਲਈ ਤੁਹਾਡੇ ਡਿਵਾਈਸ ਉੱਤੇ ਜਾਣਕਾਰੀ ਸਟੋਰ ਕਰਦੇ ਹਾਂ ਅਤੇ ਉਸ ਤੱਕ ਪਹੁੰਚ ਕਰਦੇ ਹਾਂ, ਅਤੇ ਨਿੱਜੀ ਡਾਟੇ ਉੱਤੇ ਕਾਰਵਾਈ ਕਰਦੇ ਹਾਂ। ਕੁਝ ਭਾਈਵਾਲ ਸਹਿਮਤੀ ਦੀ ਬਜਾਏ ਜਾਇਜ਼ ਹਿੱਤ ਉੱਤੇ ਨਿਰਭਰ ਕਰਦੇ ਹਨ। ਤੁਸੀਂ ਇਸ ਉੱਤੇ ਇਤਰਾਜ਼ ਕਰ ਸਕਦੇ ਹੋ ਅਤੇ ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਵਿੱਚ ਕਿਸੇ ਵੀ ਸਮੇਂ ਆਪਣੀਆਂ ਚੋਣਾਂ ਬਦਲ ਸਕਦੇ ਹੋ।',
		preferencesUnavailable:
			'ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਹਾਲੇ ਉਪਲਬਧ ਨਹੀਂ ਹਨ। ਇੰਟਰਨੈੱਟ ਨਾਲ ਕਨੈਕਟ ਕਰੋ ਅਤੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
		providersOff:
			'ਉਹ ਮਕਸਦ ਇਸ ਵੇਲੇ ਬੰਦ ਹਨ, ਇਸ ਲਈ ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਉਹਨਾਂ ਨੂੰ ਮਕਸਦ ਹੇਠ ਚਾਲੂ ਨਹੀਂ ਕਰਦੇ, ਇਹ ਭਾਈਵਾਲ ਬੰਦ ਰਹਿਣਗੇ।',
		purposeFilter: 'ਮਕਸਦ: {purpose}',
		refreshesStoredInformation: 'ਸਟੋਰ ਕੀਤੀ ਜਾਣਕਾਰੀ ਨੂੰ ਨਵਿਆਉਂਦਾ ਹੈ',
		retentionNotProvided: 'ਇਸ ਭਾਈਵਾਲ ਨੇ ਨਹੀਂ ਦੱਸਿਆ।',
		retentionTitle: 'ਡਾਟਾ ਕਿੰਨੇ ਸਮੇਂ ਲਈ ਰੱਖਿਆ ਜਾਂਦਾ ਹੈ',
		save: 'ਸੰਭਾਲੋ',
		searchOtherPartners: 'ਹੋਰ ਭਾਈਵਾਲ ਖੋਜੋ',
		searchPartners: 'ਭਾਈਵਾਲ ਖੋਜੋ',
		sessionOnly: 'ਸਿਰਫ਼ ਇਹ ਸੈਸ਼ਨ',
		settingsChanged: 'ਤੁਹਾਡੇ ਸੰਪਾਦਨ ਕਰਦੇ ਸਮੇਂ ਸੈਟਿੰਗਾਂ ਬਦਲ ਗਈਆਂ',
		settingsChangedDetail:
			'ਤੁਹਾਡੀਆਂ ਚੋਣਾਂ ਰੱਖਿਅਤ ਨਹੀਂ ਹੋਈਆਂ। ਮੌਜੂਦਾ ਸੈਟਿੰਗਾਂ ਲੋਡ ਕਰੋ, ਫਿਰ ਦੁਬਾਰਾ ਚੁਣੋ।',
		specialFeatureOptIn: 'ਭਾਈਵਾਲ ਇਹ ਸਿਰਫ਼ ਤਾਂ ਹੀ ਕਰਦੇ ਹਨ ਜੇ ਤੁਸੀਂ ਇਸਨੂੰ ਚਾਲੂ ਕਰਦੇ ਹੋ।',
		specialFeaturesElsewhere: 'ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਵਿੱਚ ਖ਼ਾਸ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਹੇਠ ਸੈੱਟ ਕਰੋ।',
		standardRetention: 'ਮਿਆਰੀ ਸੰਭਾਲ ਮਿਆਦ',
		storedForUpTo: 'ਵੱਧ ਤੋਂ ਵੱਧ ਸਟੋਰ ਕਰਨ ਦੀ ਮਿਆਦ',
		thisApp: 'ਇਹ ਐਪ',
		tryAgain: 'ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ',
		turnOffToObject: 'ਇਤਰਾਜ਼ ਕਰਨ ਲਈ ਬੰਦ ਕਰੋ।',
		vendorPurposeSummary: '{purposes} ਮਕਸਦ · {legitimateInterest} ਜਾਇਜ਼ ਹਿੱਤ ਉੱਤੇ',
		viewPartners: 'ਭਾਈਵਾਲ ਦੇਖੋ',
		yes: 'ਹਾਂ',
		yourChoices: 'ਤੁਹਾਡੀਆਂ ਚੋਣਾਂ',
	},
	pl: {
		alwaysOn: 'Zawsze włączone',
		back: 'Wstecz',
		cancel: 'Anuluj',
		close: 'Zamknij',
		collapsed: 'Zwinięte',
		consent: 'Zgoda',
		dataCollected: 'Zbierane dane',
		dayCount: '{count} dni',
		dayCountOne: '1 dzień',
		details: 'Szczegóły',
		deviceStorage: 'Przechowywanie na urządzeniu',
		deviceStorageDetails: 'Szczegóły przechowywania na urządzeniu',
		discardChanges: 'Odrzuć zmiany',
		discardChangesDetail: 'Twoje zmiany nie zostaną zapisane.',
		discardChangesTitle: 'Odrzucić zmiany?',
		expanded: 'Rozwinięte',
		hideDetails: 'Ukryj szczegóły',
		iabPartnerCount: '{count} partnerów IAB',
		iabPartners: 'Partnerzy IAB',
		keepEditing: 'Kontynuuj edycję',
		lastChanged: 'Ostatnia zmiana: {date}',
		legitimateInterestStatement: 'Oświadczenie o uzasadnionym interesie',
		listOutdated:
			'Nasza lista partnerów jest nieaktualna. Spróbuj wczytać ją ponownie albo odrzuć opcjonalne użycie danych.',
		loadCurrentSettings: 'Wczytaj bieżące ustawienia',
		no: 'Nie',
		noChoice: 'Bez wyboru',
		noDeviceStorage: 'Nie przechowuje informacji na Twoim urządzeniu.',
		noPartnersMatch: 'Brak partnerów pasujących do „{search}”.',
		notAllowedPurposes:
			'Ta aplikacja nie zezwala temu partnerowi na te cele: {purposes}',
		off: 'Wyłączone',
		on: 'Włączone',
		otherDeviceAccess: 'Inne sposoby dostępu do Twojego urządzenia',
		partlyOn: 'Częściowo włączone',
		partner: 'Partner',
		partners: 'Partnerzy',
		preferencesIntro:
			'My i nasi partnerzy przechowujemy informacje na Twoim urządzeniu i uzyskujemy do nich dostęp oraz przetwarzamy dane osobowe w celach wymienionych poniżej. Niektórzy partnerzy opierają się na uzasadnionym interesie zamiast na zgodzie. Możesz się temu sprzeciwić i w każdej chwili zmienić swoje wybory w Ustawieniach prywatności.',
		preferencesUnavailable:
			'Ustawienia prywatności nie są jeszcze dostępne. Połącz się z internetem i spróbuj ponownie.',
		providersOff:
			'Te cele są teraz wyłączone, więc ci partnerzy pozostaną wyłączeni, dopóki nie włączysz celów w sekcji Cele.',
		purposeFilter: 'Cel: {purpose}',
		refreshesStoredInformation: 'Odświeża przechowywane informacje',
		retentionNotProvided: 'Ten partner nie podał tej informacji.',
		retentionTitle: 'Jak długo dane są przechowywane',
		save: 'Zapisz',
		searchOtherPartners: 'Szukaj innych partnerów',
		searchPartners: 'Szukaj partnerów',
		sessionOnly: 'Tylko ta sesja',
		settingsChanged: 'Ustawienia zmieniły się podczas edycji',
		settingsChangedDetail:
			'Twoje wybory nie zostały zapisane. Wczytaj bieżące ustawienia i wybierz ponownie.',
		specialFeatureOptIn: 'Partnerzy robią to tylko wtedy, gdy to włączysz.',
		specialFeaturesElsewhere:
			'Ustawiane w sekcji Funkcje specjalne w Ustawieniach prywatności.',
		standardRetention: 'Standardowy okres przechowywania',
		storedForUpTo: 'Przechowywane maksymalnie przez',
		thisApp: 'Ta aplikacja',
		tryAgain: 'Spróbuj ponownie',
		turnOffToObject: 'Wyłącz, aby się sprzeciwić.',
		vendorPurposeSummary:
			'Cele: {purposes} · uzasadniony interes: {legitimateInterest}',
		viewPartners: 'Zobacz partnerów',
		yes: 'Tak',
		yourChoices: 'Twoje wybory',
	},
	pt: {
		alwaysOn: 'Sempre ativado',
		back: 'Voltar',
		cancel: 'Cancelar',
		close: 'Fechar',
		collapsed: 'Recolhido',
		consent: 'Consentimento',
		dataCollected: 'Dados recolhidos',
		dayCount: '{count} dias',
		dayCountOne: '1 dia',
		details: 'Detalhes',
		deviceStorage: 'Armazenamento no dispositivo',
		deviceStorageDetails: 'Detalhes do armazenamento no dispositivo',
		discardChanges: 'Descartar alterações',
		discardChangesDetail: 'As suas alterações não serão guardadas.',
		discardChangesTitle: 'Descartar as alterações?',
		expanded: 'Expandido',
		hideDetails: 'Ocultar detalhes',
		iabPartnerCount: '{count} parceiros IAB',
		iabPartners: 'Parceiros IAB',
		keepEditing: 'Continuar a editar',
		lastChanged: 'Última alteração: {date}',
		legitimateInterestStatement: 'Declaração de interesse legítimo',
		listOutdated:
			'A nossa lista de parceiros está desatualizada. Tente carregá-la novamente ou rejeite a utilização opcional de dados.',
		loadCurrentSettings: 'Carregar configurações atuais',
		no: 'Não',
		noChoice: 'Sem escolha',
		noDeviceStorage: 'Não armazena informações no seu dispositivo.',
		noPartnersMatch: 'Nenhum parceiro corresponde a "{search}".',
		notAllowedPurposes:
			'Esta aplicação não permite a este parceiro: {purposes}',
		off: 'Desativado',
		on: 'Ativado',
		otherDeviceAccess: 'Outras formas de aceder ao seu dispositivo',
		partlyOn: 'Parcialmente ativado',
		partner: 'Parceiro',
		partners: 'Parceiros',
		preferencesIntro:
			'Nós e os nossos parceiros armazenamos e acedemos a informações no seu dispositivo e processamos dados pessoais para as finalidades abaixo. Alguns parceiros baseiam-se no interesse legítimo em vez do consentimento. Pode opor-se a isso e alterar as suas escolhas a qualquer momento nas Configurações de privacidade.',
		preferencesUnavailable:
			'As Configurações de privacidade ainda não estão disponíveis. Ligue-se à internet e tente novamente.',
		providersOff:
			'Essas finalidades estão desativadas neste momento, por isso estes parceiros ficam desativados até as ativar em Finalidades.',
		purposeFilter: 'Finalidade: {purpose}',
		refreshesStoredInformation: 'Renova as informações armazenadas',
		retentionNotProvided: 'Não indicado por este parceiro.',
		retentionTitle: 'Durante quanto tempo os dados são mantidos',
		save: 'Guardar',
		searchOtherPartners: 'Procurar outros parceiros',
		searchPartners: 'Procurar parceiros',
		sessionOnly: 'Apenas esta sessão',
		settingsChanged: 'As configurações mudaram enquanto editava',
		settingsChangedDetail:
			'As suas escolhas não foram guardadas. Carregue as configurações atuais e escolha novamente.',
		specialFeatureOptIn: 'Os parceiros só fazem isto se o ativar.',
		specialFeaturesElsewhere:
			'Definido em Funcionalidades especiais, nas Configurações de privacidade.',
		standardRetention: 'Retenção padrão',
		storedForUpTo: 'Armazenado durante um máximo de',
		thisApp: 'Esta aplicação',
		tryAgain: 'Tentar novamente',
		turnOffToObject: 'Desative para se opor.',
		vendorPurposeSummary:
			'{purposes} finalidades · {legitimateInterest} com base no interesse legítimo',
		viewPartners: 'Ver parceiros',
		yes: 'Sim',
		yourChoices: 'As suas escolhas',
	},
	rm: {
		alwaysOn: 'Adina activà',
		back: 'Enavos',
		cancel: 'Interrumper',
		close: 'Serrar',
		collapsed: 'Serrà',
		consent: 'Consentiment',
		dataCollected: 'Datas rimnadas',
		dayCount: '{count} dis',
		dayCountOne: '1 di',
		details: 'Detagls',
		deviceStorage: 'Memorisaziun sin l’apparat',
		deviceStorageDetails: 'Detagls davart la memorisaziun sin l’apparat',
		discardChanges: 'Rinunziar a las midadas',
		discardChangesDetail: 'Vossas midadas na vegnan betg memorisadas.',
		discardChangesTitle: 'Rinunziar a las midadas?',
		expanded: 'Avert',
		hideDetails: 'Zuppentar ils detagls',
		iabPartnerCount: '{count} partunaris IAB',
		iabPartners: 'Partunaris IAB',
		keepEditing: 'Cuntinuar a modifitgar',
		lastChanged: 'Ultima midada: {date}',
		legitimateInterestStatement: 'Declaraziun davart l’interess legitim',
		listOutdated:
			'Nossa glista da partunaris n’è betg actuala. Empruvai da la chargiar danovamain u refusai l’utilisaziun facultativa da datas.',
		loadCurrentSettings: 'Chargiar las configuraziuns actualas',
		no: 'Na',
		noChoice: 'Nagina tscherna',
		noDeviceStorage: 'Na memorisescha naginas infurmaziuns sin voss apparat.',
		noPartnersMatch: 'Nagins partunaris na correspundan a «{search}».',
		notAllowedPurposes:
			'Questa app na permetta betg a quest partunari da: {purposes}',
		off: 'Deactivà',
		on: 'Activà',
		otherDeviceAccess: 'Autras modas d’acceder a voss apparat',
		partlyOn: 'Parzialmain activà',
		partner: 'Partunari',
		partners: 'Partunaris',
		preferencesIntro:
			'Nus e noss partunaris memorisain infurmaziuns sin voss apparat, accessain ad ellas e processain datas persunalas per las finamiras sutvart. Intgins partunaris sa basan sin l’interess legitim empè dal consentiment. Vus pudais far opposiziun cunter quai e midar vossas tschernas en mintga mument en las Configuraziuns da la sfera privata.',
		preferencesUnavailable:
			'Las Configuraziuns da la sfera privata n’èn anc betg disponiblas. Connectai cun l’internet ed empruvai anc ina giada.',
		providersOff:
			'Questas finamiras èn deactivadas per il mument, perquai restan quests partunaris deactivads fin che vus activais las finamiras sut Finamiras.',
		purposeFilter: 'Finamira: {purpose}',
		refreshesStoredInformation: 'Renovescha las infurmaziuns memorisadas',
		retentionNotProvided: 'Betg indicà da quest partunari.',
		retentionTitle: 'Quant ditg che las datas vegnan memorisadas',
		save: 'Memorisar',
		searchOtherPartners: 'Tscherchar auters partunaris',
		searchPartners: 'Tscherchar partunaris',
		sessionOnly: 'Be questa sesida',
		settingsChanged:
			'Las configuraziuns èn vegnidas midadas durant l’elavuraziun',
		settingsChangedDetail:
			'Vossas tschernas n’èn betg vegnidas memorisadas. Chargiai las configuraziuns actualas e faschai danovamain vossa tscherna.',
		specialFeatureOptIn: 'Ils partunaris fan quai be, sche vus l’activais.',
		specialFeaturesElsewhere:
			'Vegn definì sut Funcziuns spezialas en las Configuraziuns da la sfera privata.',
		standardRetention: 'Durada da memorisaziun standard',
		storedForUpTo: 'Memorisà maximalmain',
		thisApp: 'Questa app',
		tryAgain: 'Empruvar anc ina giada',
		turnOffToObject: 'Deactivai per far opposiziun.',
		vendorPurposeSummary:
			'{purposes} finamiras · {legitimateInterest} sin basa da l’interess legitim',
		viewPartners: 'Mussar ils partunaris',
		yes: 'Gea',
		yourChoices: 'Vossas tschernas',
	},
	ro: {
		alwaysOn: 'Întotdeauna activat',
		back: 'Înapoi',
		cancel: 'Anulează',
		close: 'Închide',
		collapsed: 'Restrâns',
		consent: 'Consimțământ',
		dataCollected: 'Date colectate',
		dayCount: '{count} zile',
		dayCountOne: '1 zi',
		details: 'Detalii',
		deviceStorage: 'Stocare pe dispozitiv',
		deviceStorageDetails: 'Detalii despre stocarea pe dispozitiv',
		discardChanges: 'Renunță la modificări',
		discardChangesDetail: 'Modificările tale nu vor fi salvate.',
		discardChangesTitle: 'Renunți la modificări?',
		expanded: 'Extins',
		hideDetails: 'Ascunde detaliile',
		iabPartnerCount: '{count} parteneri IAB',
		iabPartners: 'Parteneri IAB',
		keepEditing: 'Continuă editarea',
		lastChanged: 'Modificat ultima dată pe {date}',
		legitimateInterestStatement: 'Declarație privind interesul legitim',
		listOutdated:
			'Lista noastră de parteneri nu este actualizată. Încearcă din nou să o încarci sau respinge utilizarea opțională a datelor.',
		loadCurrentSettings: 'Încarcă setările actuale',
		no: 'Nu',
		noChoice: 'Fără opțiune',
		noDeviceStorage: 'Nu stochează informații pe dispozitivul tău.',
		noPartnersMatch: 'Niciun partener nu corespunde căutării „{search}”.',
		notAllowedPurposes:
			'Această aplicație nu îi permite acestui partener: {purposes}',
		off: 'Dezactivat',
		on: 'Activat',
		otherDeviceAccess: 'Alte moduri de a accesa dispozitivul tău',
		partlyOn: 'Parțial activat',
		partner: 'Partener',
		partners: 'Parteneri',
		preferencesIntro:
			'Noi și partenerii noștri stocăm și accesăm informații pe dispozitivul tău și procesăm date personale în scopurile de mai jos. Unii parteneri se bazează pe interesul legitim în loc de consimțământ. Te poți opune acestui lucru și îți poți modifica alegerile oricând din Setări de confidențialitate.',
		preferencesUnavailable:
			'Setările de confidențialitate nu sunt încă disponibile. Conectează-te la internet și încearcă din nou.',
		providersOff:
			'Aceste scopuri sunt dezactivate acum, așa că acești parteneri rămân dezactivați până când activezi scopurile din secțiunea Scopuri.',
		purposeFilter: 'Scop: {purpose}',
		refreshesStoredInformation: 'Reînnoiește informațiile stocate',
		retentionNotProvided: 'Partenerul nu a furnizat această informație.',
		retentionTitle: 'Cât timp sunt păstrate datele',
		save: 'Salvează',
		searchOtherPartners: 'Caută alți parteneri',
		searchPartners: 'Caută parteneri',
		sessionOnly: 'Doar în această sesiune',
		settingsChanged: 'Setările s-au modificat în timp ce le editai',
		settingsChangedDetail:
			'Alegerile tale nu au fost salvate. Încarcă setările actuale, apoi alege din nou.',
		specialFeatureOptIn: 'Partenerii fac acest lucru doar dacă îl activezi.',
		specialFeaturesElsewhere:
			'Se setează din Funcționalități speciale, în Setări de confidențialitate.',
		standardRetention: 'Perioadă standard de păstrare',
		storedForUpTo: 'Stocat timp de cel mult',
		thisApp: 'Această aplicație',
		tryAgain: 'Încearcă din nou',
		turnOffToObject: 'Dezactivează pentru a te opune.',
		vendorPurposeSummary:
			'{purposes} scopuri · {legitimateInterest} pe bază de interes legitim',
		viewPartners: 'Vezi partenerii',
		yes: 'Da',
		yourChoices: 'Alegerile tale',
	},
	ru: {
		alwaysOn: 'Всегда включено',
		back: 'Назад',
		cancel: 'Отмена',
		close: 'Закрыть',
		collapsed: 'Свёрнуто',
		consent: 'Согласие',
		dataCollected: 'Собираемые данные',
		dayCount: '{count} дн.',
		dayCountOne: '1 день',
		details: 'Подробнее',
		deviceStorage: 'Хранение на устройстве',
		deviceStorageDetails: 'Сведения о хранении на устройстве',
		discardChanges: 'Отменить изменения',
		discardChangesDetail: 'Ваши изменения не будут сохранены.',
		discardChangesTitle: 'Отменить изменения?',
		expanded: 'Развёрнуто',
		hideDetails: 'Скрыть подробности',
		iabPartnerCount: 'Партнёры IAB: {count}',
		iabPartners: 'Партнёры IAB',
		keepEditing: 'Продолжить редактирование',
		lastChanged: 'Последнее изменение: {date}',
		legitimateInterestStatement: 'Заявление о законном интересе',
		listOutdated:
			'Наш список партнёров устарел. Попробуйте загрузить его снова или откажитесь от необязательного использования данных.',
		loadCurrentSettings: 'Загрузить текущие настройки',
		no: 'Нет',
		noChoice: 'Не настраивается',
		noDeviceStorage: 'Не хранит информацию на вашем устройстве.',
		noPartnersMatch: 'По запросу «{search}» партнёры не найдены.',
		notAllowedPurposes:
			'Это приложение не разрешает этому партнёру: {purposes}',
		off: 'Выключено',
		on: 'Включено',
		otherDeviceAccess: 'Другие способы доступа к вашему устройству',
		partlyOn: 'Частично включено',
		partner: 'Партнёр',
		partners: 'Партнёры',
		preferencesIntro:
			'Мы и наши партнёры храним информацию на вашем устройстве и получаем к ней доступ, а также обрабатываем персональные данные для указанных ниже целей. Некоторые партнёры опираются на законный интерес вместо согласия. Вы можете возразить против этого и в любой момент изменить свой выбор в разделе «Настройки конфиденциальности».',
		preferencesUnavailable:
			'Настройки конфиденциальности пока недоступны. Подключитесь к интернету и попробуйте снова.',
		providersOff:
			'Сейчас эти цели выключены, поэтому эти партнёры останутся выключенными, пока вы не включите цели в разделе «Цели».',
		purposeFilter: 'Цель: {purpose}',
		refreshesStoredInformation: 'Обновляет сохранённую информацию',
		retentionNotProvided: 'Партнёр не указал срок.',
		retentionTitle: 'Срок хранения данных',
		save: 'Сохранить',
		searchOtherPartners: 'Поиск других партнёров',
		searchPartners: 'Поиск партнёров',
		sessionOnly: 'Только на этот сеанс',
		settingsChanged: 'Настройки изменились во время редактирования',
		settingsChangedDetail:
			'Ваш выбор не сохранён. Загрузите текущие настройки и выберите снова.',
		specialFeatureOptIn: 'Партнёры делают это, только если вы это включите.',
		specialFeaturesElsewhere:
			'Настраивается в разделе «Особые функции» в настройках конфиденциальности.',
		standardRetention: 'Стандартный срок хранения',
		storedForUpTo: 'Хранится до',
		thisApp: 'Это приложение',
		tryAgain: 'Повторить',
		turnOffToObject: 'Выключите, чтобы возразить.',
		vendorPurposeSummary:
			'Цели: {purposes} · законный интерес: {legitimateInterest}',
		viewPartners: 'Показать партнёров',
		yes: 'Да',
		yourChoices: 'Ваш выбор',
	},
	sk: {
		alwaysOn: 'Vždy zapnuté',
		back: 'Späť',
		cancel: 'Zrušiť',
		close: 'Zavrieť',
		collapsed: 'Zbalené',
		consent: 'Súhlas',
		dataCollected: 'Zhromažďované údaje',
		dayCount: '{count} dní',
		dayCountOne: '1 deň',
		details: 'Podrobnosti',
		deviceStorage: 'Ukladanie v zariadení',
		deviceStorageDetails: 'Podrobnosti o ukladaní v zariadení',
		discardChanges: 'Zahodiť zmeny',
		discardChangesDetail: 'Vaše zmeny sa neuložia.',
		discardChangesTitle: 'Zahodiť zmeny?',
		expanded: 'Rozbalené',
		hideDetails: 'Skryť podrobnosti',
		iabPartnerCount: 'Partneri IAB: {count}',
		iabPartners: 'Partneri IAB',
		keepEditing: 'Pokračovať v úpravách',
		lastChanged: 'Naposledy zmenené {date}',
		legitimateInterestStatement: 'Vyhlásenie o oprávnenom záujme',
		listOutdated:
			'Náš zoznam partnerov je zastaraný. Skúste ho načítať znova alebo odmietnite voliteľné používanie údajov.',
		loadCurrentSettings: 'Načítať aktuálne nastavenia',
		no: 'Nie',
		noChoice: 'Bez voľby',
		noDeviceStorage: 'Neukladá informácie vo vašom zariadení.',
		noPartnersMatch: 'Výrazu „{search}“ nezodpovedajú žiadni partneri.',
		notAllowedPurposes:
			'Táto aplikácia tomuto partnerovi nepovoľuje: {purposes}',
		off: 'Vypnuté',
		on: 'Zapnuté',
		otherDeviceAccess: 'Iné spôsoby prístupu k vášmu zariadeniu',
		partlyOn: 'Čiastočne zapnuté',
		partner: 'Partner',
		partners: 'Partneri',
		preferencesIntro:
			'My a naši partneri ukladáme a pristupujeme k informáciám vo vašom zariadení a spracúvame osobné údaje na účely uvedené nižšie. Niektorí partneri sa namiesto súhlasu opierajú o oprávnený záujem. Proti tomu môžete vzniesť námietku a svoje voľby kedykoľvek zmeniť v Nastaveniach súkromia.',
		preferencesUnavailable:
			'Nastavenia súkromia zatiaľ nie sú k dispozícii. Pripojte sa na internet a skúste to znova.',
		providersOff:
			'Tieto účely sú teraz vypnuté, takže títo partneri zostanú vypnutí, kým tieto účely nezapnete v časti Účely.',
		purposeFilter: 'Účel: {purpose}',
		refreshesStoredInformation: 'Obnovuje uložené informácie',
		retentionNotProvided: 'Tento partner to neuviedol.',
		retentionTitle: 'Ako dlho sa údaje uchovávajú',
		save: 'Uložiť',
		searchOtherPartners: 'Hľadať ďalších partnerov',
		searchPartners: 'Hľadať partnerov',
		sessionOnly: 'Len počas tejto relácie',
		settingsChanged: 'Nastavenia sa počas úprav zmenili',
		settingsChangedDetail:
			'Vaše voľby sa neuložili. Načítajte aktuálne nastavenia a vyberte znova.',
		specialFeatureOptIn: 'Partneri to robia, len ak to zapnete.',
		specialFeaturesElsewhere:
			'Nastavuje sa v časti Osobitné funkcie v Nastaveniach súkromia.',
		standardRetention: 'Štandardná doba uchovávania',
		storedForUpTo: 'Uložené najviac',
		thisApp: 'Táto aplikácia',
		tryAgain: 'Skúsiť znova',
		turnOffToObject: 'Vypnutím vznesiete námietku.',
		vendorPurposeSummary:
			'Účely: {purposes} · oprávnený záujem: {legitimateInterest}',
		viewPartners: 'Zobraziť partnerov',
		yes: 'Áno',
		yourChoices: 'Vaše voľby',
	},
	sl: {
		alwaysOn: 'Vedno vklopljeno',
		back: 'Nazaj',
		cancel: 'Prekliči',
		close: 'Zapri',
		collapsed: 'Strnjeno',
		consent: 'Soglasje',
		dataCollected: 'Zbrani podatki',
		dayCount: '{count} dni',
		dayCountOne: '1 dan',
		details: 'Podrobnosti',
		deviceStorage: 'Shranjevanje v napravi',
		deviceStorageDetails: 'Podrobnosti o shranjevanju v napravi',
		discardChanges: 'Zavrzi spremembe',
		discardChangesDetail: 'Vaše spremembe ne bodo shranjene.',
		discardChangesTitle: 'Želite zavreči spremembe?',
		expanded: 'Razširjeno',
		hideDetails: 'Skrij podrobnosti',
		iabPartnerCount: 'Partnerji IAB: {count}',
		iabPartners: 'Partnerji IAB',
		keepEditing: 'Nadaljuj z urejanjem',
		lastChanged: 'Nazadnje spremenjeno {date}',
		legitimateInterestStatement: 'Izjava o zakonitem interesu',
		listOutdated:
			'Naš seznam partnerjev je zastarel. Poskusite ga znova naložiti ali zavrnite neobvezno uporabo podatkov.',
		loadCurrentSettings: 'Naloži trenutne nastavitve',
		no: 'Ne',
		noChoice: 'Brez izbire',
		noDeviceStorage: 'Ne shranjuje informacij v vaši napravi.',
		noPartnersMatch: 'Noben partner se ne ujema z iskanjem „{search}“.',
		notAllowedPurposes: 'Ta aplikacija temu partnerju ne dovoli: {purposes}',
		off: 'Izklopljeno',
		on: 'Vklopljeno',
		otherDeviceAccess: 'Drugi načini dostopa do vaše naprave',
		partlyOn: 'Delno vklopljeno',
		partner: 'Partner',
		partners: 'Partnerji',
		preferencesIntro:
			'Mi in naši partnerji shranjujemo informacije v vaši napravi in dostopamo do njih ter obdelujemo osebne podatke za spodaj navedene namene. Nekateri partnerji se namesto na soglasje opirajo na zakoniti interes. Temu lahko ugovarjate in svoje izbire kadar koli spremenite v Nastavitvah zasebnosti.',
		preferencesUnavailable:
			'Nastavitve zasebnosti še niso na voljo. Povežite se z internetom in poskusite znova.',
		providersOff:
			'Ti nameni so trenutno izklopljeni, zato ti partnerji ostanejo izklopljeni, dokler namenov ne vklopite v razdelku Nameni.',
		purposeFilter: 'Namen: {purpose}',
		refreshesStoredInformation: 'Osvežuje shranjene informacije',
		retentionNotProvided: 'Partner tega ni navedel.',
		retentionTitle: 'Kako dolgo se hranijo podatki',
		save: 'Shrani',
		searchOtherPartners: 'Išči druge partnerje',
		searchPartners: 'Išči partnerje',
		sessionOnly: 'Samo v tej seji',
		settingsChanged: 'Nastavitve so se med urejanjem spremenile',
		settingsChangedDetail:
			'Vaše izbire niso bile shranjene. Naložite trenutne nastavitve in nato izberite znova.',
		specialFeatureOptIn: 'Partnerji to počnejo samo, če to vklopite.',
		specialFeaturesElsewhere:
			'Nastavite v razdelku Posebne funkcije v Nastavitvah zasebnosti.',
		standardRetention: 'Standardna hramba',
		storedForUpTo: 'Shranjeno največ',
		thisApp: 'Ta aplikacija',
		tryAgain: 'Poskusi znova',
		turnOffToObject: 'Izklopite za ugovor.',
		vendorPurposeSummary:
			'Nameni: {purposes} · zakoniti interes: {legitimateInterest}',
		viewPartners: 'Prikaži partnerje',
		yes: 'Da',
		yourChoices: 'Vaše izbire',
	},
	sv: {
		alwaysOn: 'Alltid på',
		back: 'Tillbaka',
		cancel: 'Avbryt',
		close: 'Stäng',
		collapsed: 'Hopfälld',
		consent: 'Samtycke',
		dataCollected: 'Insamlad data',
		dayCount: '{count} dagar',
		dayCountOne: '1 dag',
		details: 'Detaljer',
		deviceStorage: 'Lagring på enheten',
		deviceStorageDetails: 'Information om lagring på enheten',
		discardChanges: 'Släng ändringar',
		discardChangesDetail: 'Dina ändringar sparas inte.',
		discardChangesTitle: 'Vill du slänga ändringarna?',
		expanded: 'Utfälld',
		hideDetails: 'Dölj detaljer',
		iabPartnerCount: '{count} IAB-partner',
		iabPartners: 'IAB-partner',
		keepEditing: 'Fortsätt redigera',
		lastChanged: 'Senast ändrad {date}',
		legitimateInterestStatement: 'Redogörelse för berättigat intresse',
		listOutdated:
			'Vår partnerlista är inaktuell. Försök läsa in den igen eller avvisa valfri dataanvändning.',
		loadCurrentSettings: 'Läs in aktuella inställningar',
		no: 'Nej',
		noChoice: 'Inget val',
		noDeviceStorage: 'Lagrar ingen information på din enhet.',
		noPartnersMatch: 'Inga partner matchar ”{search}”.',
		notAllowedPurposes:
			'Den här appen tillåter inte den här partnern följande: {purposes}',
		off: 'Av',
		on: 'På',
		otherDeviceAccess: 'Andra sätt att komma åt din enhet',
		partlyOn: 'Delvis på',
		partner: 'Partner',
		partners: 'Partner',
		preferencesIntro:
			'Vi och våra partner lagrar och får tillgång till information på din enhet och behandlar personuppgifter för ändamålen nedan. Vissa partner stöder sig på berättigat intresse i stället för samtycke. Du kan invända mot det och ändra dina val när som helst under Integritetsinställningar.',
		preferencesUnavailable:
			'Integritetsinställningarna är inte tillgängliga än. Anslut till internet och försök igen.',
		providersOff:
			'De ändamålen är avstängda just nu, så de här partnerna förblir avstängda tills du slår på ändamålen under Ändamål.',
		purposeFilter: 'Ändamål: {purpose}',
		refreshesStoredInformation: 'Förnyar lagrad information',
		retentionNotProvided: 'Har inte angetts av partnern.',
		retentionTitle: 'Hur länge data sparas',
		save: 'Spara',
		searchOtherPartners: 'Sök bland andra partner',
		searchPartners: 'Sök partner',
		sessionOnly: 'Endast den här sessionen',
		settingsChanged: 'Inställningarna ändrades medan du redigerade',
		settingsChangedDetail:
			'Dina val sparades inte. Läs in de aktuella inställningarna och välj igen.',
		specialFeatureOptIn: 'Partner gör bara detta om du slår på det.',
		specialFeaturesElsewhere:
			'Ställs in under Speciella funktioner i Integritetsinställningar.',
		standardRetention: 'Standardlagringstid',
		storedForUpTo: 'Lagras i upp till',
		thisApp: 'Den här appen',
		tryAgain: 'Försök igen',
		turnOffToObject: 'Stäng av för att invända.',
		vendorPurposeSummary:
			'{purposes} ändamål · {legitimateInterest} med berättigat intresse',
		viewPartners: 'Visa partner',
		yes: 'Ja',
		yourChoices: 'Dina val',
	},
	ta: {
		alwaysOn: 'எப்போதும் ஆன்',
		back: 'பின்செல்லவும்',
		cancel: 'ரத்துசெய்யவும்',
		close: 'மூடவும்',
		collapsed: 'சுருக்கப்பட்டது',
		consent: 'ஒப்புதல்',
		dataCollected: 'சேகரிக்கப்படும் தரவு',
		dayCount: '{count} நாட்கள்',
		dayCountOne: '1 நாள்',
		details: 'விவரங்கள்',
		deviceStorage: 'சாதனச் சேமிப்பகம்',
		deviceStorageDetails: 'சாதனச் சேமிப்பக விவரங்கள்',
		discardChanges: 'மாற்றங்களை நிராகரிக்கவும்',
		discardChangesDetail: 'உங்கள் மாற்றங்கள் சேமிக்கப்படாது.',
		discardChangesTitle: 'மாற்றங்களை நிராகரிக்கவா?',
		expanded: 'விரிவாக்கப்பட்டது',
		hideDetails: 'விவரங்களை மறைக்கவும்',
		iabPartnerCount: 'IAB கூட்டாளர்கள்: {count}',
		iabPartners: 'IAB கூட்டாளர்கள்',
		keepEditing: 'தொடர்ந்து திருத்தவும்',
		lastChanged: 'கடைசியாக மாற்றியது: {date}',
		legitimateInterestStatement: 'நியாயமான நலன் அறிக்கை',
		listOutdated:
			'எங்கள் கூட்டாளர் பட்டியல் காலாவதியாகிவிட்டது. அதை ஏற்ற மீண்டும் முயலவும் அல்லது விருப்பத் தரவுப் பயன்பாட்டை நிராகரிக்கவும்.',
		loadCurrentSettings: 'தற்போதைய அமைப்புகளை ஏற்றவும்',
		no: 'இல்லை',
		noChoice: 'தேர்வு இல்லை',
		noDeviceStorage: 'உங்கள் சாதனத்தில் தகவல்களைச் சேமிப்பதில்லை.',
		noPartnersMatch: '"{search}" உடன் பொருந்தும் கூட்டாளர்கள் எவரும் இல்லை.',
		notAllowedPurposes:
			'இந்தச் செயலி இந்தக் கூட்டாளரை இவற்றுக்கு அனுமதிப்பதில்லை: {purposes}',
		off: 'ஆஃப்',
		on: 'ஆன்',
		otherDeviceAccess: 'உங்கள் சாதனத்தை அணுகும் பிற வழிகள்',
		partlyOn: 'பகுதியளவு ஆன்',
		partner: 'கூட்டாளர்',
		partners: 'கூட்டாளர்கள்',
		preferencesIntro:
			'நாங்களும் எங்கள் கூட்டாளர்களும் உங்கள் சாதனத்தில் தகவல்களைச் சேமித்து அணுகுகிறோம், மேலும் கீழே உள்ள நோக்கங்களுக்காகத் தனிப்பட்ட தரவைச் செயலாக்குகிறோம். சில கூட்டாளர்கள் ஒப்புதலுக்குப் பதிலாக நியாயமான நலனைச் சார்ந்துள்ளனர். நீங்கள் அதை எதிர்க்கலாம், மேலும் தனியுரிமை அமைப்புகளில் எப்போது வேண்டுமானாலும் உங்கள் தேர்வுகளை மாற்றலாம்.',
		preferencesUnavailable:
			'தனியுரிமை அமைப்புகள் இன்னும் கிடைக்கவில்லை. இணையத்துடன் இணைத்து மீண்டும் முயலவும்.',
		providersOff:
			'அந்த நோக்கங்கள் இப்போது ஆஃப் நிலையில் உள்ளன. நோக்கங்கள் பிரிவில் அவற்றை நீங்கள் ஆன் செய்யும் வரை இந்தக் கூட்டாளர்களும் ஆஃப் நிலையிலேயே இருப்பார்கள்.',
		purposeFilter: 'நோக்கம்: {purpose}',
		refreshesStoredInformation: 'சேமித்த தகவல்களைப் புதுப்பிக்கிறது',
		retentionNotProvided: 'இந்தக் கூட்டாளர் வழங்கவில்லை.',
		retentionTitle: 'தரவு எவ்வளவு காலம் வைத்திருக்கப்படும்',
		save: 'சேமி',
		searchOtherPartners: 'பிற கூட்டாளர்களைத் தேடுங்கள்',
		searchPartners: 'கூட்டாளர்களைத் தேடுங்கள்',
		sessionOnly: 'இந்த அமர்வுக்கு மட்டும்',
		settingsChanged: 'நீங்கள் திருத்திக்கொண்டிருந்தபோது அமைப்புகள் மாறிவிட்டன',
		settingsChangedDetail:
			'உங்கள் தேர்வுகள் சேமிக்கப்படவில்லை. தற்போதைய அமைப்புகளை ஏற்றி, மீண்டும் தேர்வுசெய்யவும்.',
		specialFeatureOptIn: 'நீங்கள் இதை ஆன் செய்தால் மட்டுமே கூட்டாளர்கள் இதைச் செய்வார்கள்.',
		specialFeaturesElsewhere:
			'தனியுரிமை அமைப்புகளில் உள்ள சிறப்பு அம்சங்கள் பிரிவில் அமைக்கலாம்.',
		standardRetention: 'நிலையான தக்கவைப்புக் காலம்',
		storedForUpTo: 'அதிகபட்சச் சேமிப்புக் காலம்',
		thisApp: 'இந்தச் செயலி',
		tryAgain: 'மீண்டும் முயலவும்',
		turnOffToObject: 'எதிர்க்க ஆஃப் செய்யவும்.',
		vendorPurposeSummary:
			'நோக்கங்கள்: {purposes} · நியாயமான நலன்: {legitimateInterest}',
		viewPartners: 'கூட்டாளர்களைப் பார்க்கவும்',
		yes: 'ஆம்',
		yourChoices: 'உங்கள் தேர்வுகள்',
	},
	te: {
		alwaysOn: 'ఎల్లప్పుడూ ఆన్',
		back: 'వెనుకకు',
		cancel: 'రద్దు చేయండి',
		close: 'మూసివేయండి',
		collapsed: 'కుదించబడింది',
		consent: 'సమ్మతి',
		dataCollected: 'సేకరించే డేటా',
		dayCount: '{count} రోజులు',
		dayCountOne: '1 రోజు',
		details: 'వివరాలు',
		deviceStorage: 'పరికర నిల్వ',
		deviceStorageDetails: 'పరికర నిల్వ వివరాలు',
		discardChanges: 'మార్పులను విస్మరించండి',
		discardChangesDetail: 'మీ మార్పులు సేవ్ చేయబడవు.',
		discardChangesTitle: 'మార్పులను విస్మరించాలా?',
		expanded: 'విస్తరించబడింది',
		hideDetails: 'వివరాలను దాచండి',
		iabPartnerCount: 'IAB భాగస్వాములు: {count}',
		iabPartners: 'IAB భాగస్వాములు',
		keepEditing: 'ఎడిట్ చేయడం కొనసాగించండి',
		lastChanged: 'చివరిగా మార్చినది: {date}',
		legitimateInterestStatement: 'చట్టబద్ధమైన ప్రయోజన ప్రకటన',
		listOutdated:
			'మా భాగస్వాముల జాబితా పాతబడింది. దాన్ని లోడ్ చేయడానికి మళ్లీ ప్రయత్నించండి, లేదా ఐచ్ఛిక డేటా వినియోగాన్ని తిరస్కరించండి.',
		loadCurrentSettings: 'ప్రస్తుత సెట్టింగ్‌లను లోడ్ చేయండి',
		no: 'లేదు',
		noChoice: 'ఎంపిక లేదు',
		noDeviceStorage: 'మీ పరికరంలో సమాచారాన్ని నిల్వ చేయదు.',
		noPartnersMatch: '"{search}" కు సరిపోలే భాగస్వాములు ఎవరూ లేరు.',
		notAllowedPurposes: 'ఈ యాప్ ఈ భాగస్వామిని వీటికి అనుమతించదు: {purposes}',
		off: 'ఆఫ్',
		on: 'ఆన్',
		otherDeviceAccess: 'మీ పరికరాన్ని యాక్సెస్ చేసే ఇతర మార్గాలు',
		partlyOn: 'పాక్షికంగా ఆన్',
		partner: 'భాగస్వామి',
		partners: 'భాగస్వాములు',
		preferencesIntro:
			'మేము మరియు మా భాగస్వాములు మీ పరికరంలో సమాచారాన్ని నిల్వ చేస్తాము, యాక్సెస్ చేస్తాము, అలాగే దిగువ ఉద్దేశ్యాల కోసం వ్యక్తిగత డేటాను ప్రాసెస్ చేస్తాము. కొంతమంది భాగస్వాములు సమ్మతికి బదులుగా చట్టబద్ధమైన ప్రయోజనంపై ఆధారపడతారు. మీరు దానిపై అభ్యంతరం తెలపవచ్చు, గోప్యతా సెట్టింగ్‌లలో ఎప్పుడైనా మీ ఎంపికలను మార్చవచ్చు.',
		preferencesUnavailable:
			'గోప్యతా సెట్టింగ్‌లు ఇంకా అందుబాటులో లేవు. ఇంటర్నెట్‌కు కనెక్ట్ చేసి, మళ్లీ ప్రయత్నించండి.',
		providersOff:
			'ఆ ఉద్దేశ్యాలు ప్రస్తుతం ఆఫ్‌లో ఉన్నాయి, కాబట్టి మీరు ఉద్దేశ్యాలు విభాగంలో వాటిని ఆన్ చేసే వరకు ఈ భాగస్వాములు ఆఫ్‌లోనే ఉంటారు.',
		purposeFilter: 'ఉద్దేశ్యం: {purpose}',
		refreshesStoredInformation: 'నిల్వ చేసిన సమాచారాన్ని పునరుద్ధరిస్తుంది',
		retentionNotProvided: 'ఈ భాగస్వామి అందించలేదు.',
		retentionTitle: 'డేటాను ఎంతకాలం ఉంచుతారు',
		save: 'సేవ్ చేయి',
		searchOtherPartners: 'ఇతర భాగస్వాములను శోధించండి',
		searchPartners: 'భాగస్వాములను శోధించండి',
		sessionOnly: 'ఈ సెషన్‌కు మాత్రమే',
		settingsChanged: 'మీరు ఎడిట్ చేస్తున్నప్పుడు సెట్టింగ్‌లు మారాయి',
		settingsChangedDetail:
			'మీ ఎంపికలు సేవ్ కాలేదు. ప్రస్తుత సెట్టింగ్‌లను లోడ్ చేసి, మళ్లీ ఎంచుకోండి.',
		specialFeatureOptIn: 'మీరు దీన్ని ఆన్ చేస్తేనే భాగస్వాములు దీన్ని చేస్తారు.',
		specialFeaturesElsewhere: 'గోప్యతా సెట్టింగ్‌లలోని ప్రత్యేక ఫీచర్‌లు విభాగంలో సెట్ చేయండి.',
		standardRetention: 'ప్రామాణిక నిలుపుదల వ్యవధి',
		storedForUpTo: 'గరిష్ఠ నిల్వ వ్యవధి',
		thisApp: 'ఈ యాప్',
		tryAgain: 'మళ్లీ ప్రయత్నించండి',
		turnOffToObject: 'అభ్యంతరం తెలపడానికి ఆఫ్ చేయండి.',
		vendorPurposeSummary:
			'ఉద్దేశ్యాలు: {purposes} · చట్టబద్ధమైన ప్రయోజనం: {legitimateInterest}',
		viewPartners: 'భాగస్వాములను చూడండి',
		yes: 'అవును',
		yourChoices: 'మీ ఎంపికలు',
	},
	th: {
		alwaysOn: 'เปิดตลอดเวลา',
		back: 'กลับ',
		cancel: 'ยกเลิก',
		close: 'ปิด',
		collapsed: 'ยุบแล้ว',
		consent: 'ความยินยอม',
		dataCollected: 'ข้อมูลที่เก็บรวบรวม',
		dayCount: '{count} วัน',
		dayCountOne: '1 วัน',
		details: 'รายละเอียด',
		deviceStorage: 'การจัดเก็บบนอุปกรณ์',
		deviceStorageDetails: 'รายละเอียดการจัดเก็บบนอุปกรณ์',
		discardChanges: 'ละทิ้งการเปลี่ยนแปลง',
		discardChangesDetail: 'การเปลี่ยนแปลงของคุณจะไม่ได้รับการบันทึก',
		discardChangesTitle: 'ต้องการละทิ้งการเปลี่ยนแปลงหรือไม่',
		expanded: 'ขยายแล้ว',
		hideDetails: 'ซ่อนรายละเอียด',
		iabPartnerCount: 'พันธมิตร IAB {count} ราย',
		iabPartners: 'พันธมิตร IAB',
		keepEditing: 'แก้ไขต่อ',
		lastChanged: 'เปลี่ยนแปลงล่าสุดเมื่อ {date}',
		legitimateInterestStatement: 'คำชี้แจงเกี่ยวกับประโยชน์โดยชอบด้วยกฎหมาย',
		listOutdated:
			'รายชื่อพันธมิตรของเราไม่เป็นปัจจุบัน โปรดลองโหลดอีกครั้ง หรือปฏิเสธการใช้ข้อมูลที่ไม่จำเป็น',
		loadCurrentSettings: 'โหลดการตั้งค่าปัจจุบัน',
		no: 'ไม่',
		noChoice: 'ไม่มีตัวเลือก',
		noDeviceStorage: 'ไม่จัดเก็บข้อมูลบนอุปกรณ์ของคุณ',
		noPartnersMatch: 'ไม่พบพันธมิตรที่ตรงกับ "{search}"',
		notAllowedPurposes: 'แอปนี้ไม่อนุญาตให้พันธมิตรรายนี้: {purposes}',
		off: 'ปิด',
		on: 'เปิด',
		otherDeviceAccess: 'วิธีอื่นในการเข้าถึงอุปกรณ์ของคุณ',
		partlyOn: 'เปิดบางส่วน',
		partner: 'พันธมิตร',
		partners: 'พันธมิตร',
		preferencesIntro:
			'เราและพันธมิตรของเราจัดเก็บและเข้าถึงข้อมูลบนอุปกรณ์ของคุณ และประมวลผลข้อมูลส่วนบุคคลเพื่อวัตถุประสงค์ด้านล่าง พันธมิตรบางรายอาศัยประโยชน์โดยชอบด้วยกฎหมายแทนความยินยอม คุณสามารถคัดค้านและเปลี่ยนตัวเลือกได้ตลอดเวลาในการตั้งค่าความเป็นส่วนตัว',
		preferencesUnavailable:
			'การตั้งค่าความเป็นส่วนตัวยังไม่พร้อมใช้งาน โปรดเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง',
		providersOff:
			'ขณะนี้วัตถุประสงค์เหล่านั้นปิดอยู่ พันธมิตรเหล่านี้จึงยังคงปิดอยู่จนกว่าคุณจะเปิดวัตถุประสงค์ดังกล่าวในส่วนวัตถุประสงค์',
		purposeFilter: 'วัตถุประสงค์: {purpose}',
		refreshesStoredInformation: 'รีเฟรชข้อมูลที่จัดเก็บไว้',
		retentionNotProvided: 'พันธมิตรรายนี้ไม่ได้ระบุไว้',
		retentionTitle: 'ระยะเวลาเก็บรักษาข้อมูล',
		save: 'บันทึก',
		searchOtherPartners: 'ค้นหาพันธมิตรอื่น',
		searchPartners: 'ค้นหาพันธมิตร',
		sessionOnly: 'เฉพาะเซสชันนี้',
		settingsChanged: 'การตั้งค่ามีการเปลี่ยนแปลงระหว่างที่คุณแก้ไข',
		settingsChangedDetail:
			'ตัวเลือกของคุณยังไม่ได้บันทึก โปรดโหลดการตั้งค่าปัจจุบัน แล้วเลือกอีกครั้ง',
		specialFeatureOptIn: 'พันธมิตรจะทำสิ่งนี้ก็ต่อเมื่อคุณเปิดใช้งานเท่านั้น',
		specialFeaturesElsewhere: 'ตั้งค่าได้ในส่วนคุณลักษณะพิเศษของการตั้งค่าความเป็นส่วนตัว',
		standardRetention: 'ระยะเวลาเก็บรักษามาตรฐาน',
		storedForUpTo: 'จัดเก็บนานสูงสุด',
		thisApp: 'แอปนี้',
		tryAgain: 'ลองอีกครั้ง',
		turnOffToObject: 'ปิดเพื่อคัดค้าน',
		vendorPurposeSummary:
			'วัตถุประสงค์ {purposes} รายการ · ประโยชน์โดยชอบด้วยกฎหมาย {legitimateInterest} รายการ',
		viewPartners: 'ดูพันธมิตร',
		yes: 'ใช่',
		yourChoices: 'ตัวเลือกของคุณ',
	},
	tr: {
		alwaysOn: 'Her zaman açık',
		back: 'Geri',
		cancel: 'İptal',
		close: 'Kapat',
		collapsed: 'Daraltıldı',
		consent: 'Rıza',
		dataCollected: 'Toplanan veriler',
		dayCount: '{count} gün',
		dayCountOne: '1 gün',
		details: 'Ayrıntılar',
		deviceStorage: 'Cihazda depolama',
		deviceStorageDetails: 'Cihazda depolama ayrıntıları',
		discardChanges: 'Değişikliklerden vazgeç',
		discardChangesDetail: 'Değişiklikleriniz kaydedilmeyecek.',
		discardChangesTitle: 'Değişikliklerden vazgeçilsin mi?',
		expanded: 'Genişletildi',
		hideDetails: 'Ayrıntıları gizle',
		iabPartnerCount: '{count} IAB iş ortağı',
		iabPartners: 'IAB iş ortakları',
		keepEditing: 'Düzenlemeye devam et',
		lastChanged: 'Son değişiklik: {date}',
		legitimateInterestStatement: 'Meşru menfaat beyanı',
		listOutdated:
			'İş ortağı listemiz güncel değil. Listeyi yeniden yüklemeyi deneyin veya isteğe bağlı veri kullanımını reddedin.',
		loadCurrentSettings: 'Güncel ayarları yükle',
		no: 'Hayır',
		noChoice: 'Seçim yok',
		noDeviceStorage: 'Cihazınızda bilgi depolamaz.',
		noPartnersMatch: '"{search}" ile eşleşen iş ortağı yok.',
		notAllowedPurposes:
			'Bu uygulama, bu iş ortağına şunlar için izin vermez: {purposes}',
		off: 'Kapalı',
		on: 'Açık',
		otherDeviceAccess: 'Cihazınıza erişmenin diğer yolları',
		partlyOn: 'Kısmen açık',
		partner: 'İş ortağı',
		partners: 'İş ortakları',
		preferencesIntro:
			'Biz ve iş ortaklarımız, aşağıdaki amaçlarla cihazınızda bilgi depolar ve bu bilgilere erişir, kişisel verileri işleriz. Bazı iş ortakları rıza yerine meşru menfaate dayanır. Buna itiraz edebilir ve seçimlerinizi Gizlilik Ayarları bölümünden dilediğiniz zaman değiştirebilirsiniz.',
		preferencesUnavailable:
			'Gizlilik Ayarları henüz kullanılamıyor. İnternete bağlanıp tekrar deneyin.',
		providersOff:
			'Bu amaçlar şu anda kapalı. Bu nedenle bu iş ortakları, siz Amaçlar bölümünden bu amaçları açana kadar kapalı kalır.',
		purposeFilter: 'Amaç: {purpose}',
		refreshesStoredInformation: 'Depolanan bilgileri yeniler',
		retentionNotProvided: 'Bu iş ortağı belirtmemiş.',
		retentionTitle: 'Verilerin saklanma süresi',
		save: 'Kaydet',
		searchOtherPartners: 'Diğer iş ortaklarını ara',
		searchPartners: 'İş ortaklarını ara',
		sessionOnly: 'Yalnızca bu oturum',
		settingsChanged: 'Siz düzenlerken ayarlar değişti',
		settingsChangedDetail:
			'Seçimleriniz kaydedilmedi. Güncel ayarları yükleyip yeniden seçin.',
		specialFeatureOptIn: 'İş ortakları bunu yalnızca siz açarsanız yapar.',
		specialFeaturesElsewhere:
			'Gizlilik Ayarları içindeki Özel Özellikler bölümünden ayarlanır.',
		standardRetention: 'Standart saklama süresi',
		storedForUpTo: 'En fazla saklama süresi',
		thisApp: 'Bu uygulama',
		tryAgain: 'Tekrar dene',
		turnOffToObject: 'İtiraz etmek için kapatın.',
		vendorPurposeSummary:
			'{purposes} amaç · {legitimateInterest} meşru menfaate dayalı',
		viewPartners: 'İş ortaklarını görüntüle',
		yes: 'Evet',
		yourChoices: 'Seçimleriniz',
	},
	ur: {
		alwaysOn: 'ہمیشہ آن',
		back: 'واپس',
		cancel: 'منسوخ کریں',
		close: 'بند کریں',
		collapsed: 'سمٹا ہوا',
		consent: 'رضامندی',
		dataCollected: 'جمع کیا جانے والا ڈیٹا',
		dayCount: '{count} دن',
		dayCountOne: '1 دن',
		details: 'تفصیلات',
		deviceStorage: 'آلے پر ذخیرہ',
		deviceStorageDetails: 'آلے پر ذخیرے کی تفصیلات',
		discardChanges: 'تبدیلیاں رد کریں',
		discardChangesDetail: 'آپ کی تبدیلیاں محفوظ نہیں ہوں گی۔',
		discardChangesTitle: 'تبدیلیاں رد کریں؟',
		expanded: 'پھیلا ہوا',
		hideDetails: 'تفصیلات چھپائیں',
		iabPartnerCount: '{count} IAB شراکت دار',
		iabPartners: 'IAB شراکت دار',
		keepEditing: 'ترمیم جاری رکھیں',
		lastChanged: 'آخری تبدیلی: {date}',
		legitimateInterestStatement: 'جائز مفاد کا بیان',
		listOutdated:
			'ہماری شراکت داروں کی فہرست پرانی ہو چکی ہے۔ اسے دوبارہ لوڈ کرنے کی کوشش کریں، یا ڈیٹا کے اختیاری استعمال کو مسترد کریں۔',
		loadCurrentSettings: 'موجودہ ترتیبات لوڈ کریں',
		no: 'نہیں',
		noChoice: 'کوئی انتخاب نہیں',
		noDeviceStorage: 'آپ کے آلے پر معلومات محفوظ نہیں کرتا۔',
		noPartnersMatch: '"{search}" سے مماثل کوئی شراکت دار نہیں ملا۔',
		notAllowedPurposes:
			'یہ ایپ اس شراکت دار کو ان کاموں کی اجازت نہیں دیتی: {purposes}',
		off: 'آف',
		on: 'آن',
		otherDeviceAccess: 'آپ کے آلے تک رسائی کے دیگر طریقے',
		partlyOn: 'جزوی طور پر آن',
		partner: 'شراکت دار',
		partners: 'شراکت دار',
		preferencesIntro:
			'ہم اور ہمارے شراکت دار آپ کے آلے پر معلومات محفوظ کرتے اور ان تک رسائی حاصل کرتے ہیں، اور نیچے دیے گئے مقاصد کے لیے ذاتی ڈیٹا پر کارروائی کرتے ہیں۔ کچھ شراکت دار رضامندی کے بجائے جائز مفاد پر انحصار کرتے ہیں۔ آپ اس پر اعتراض کر سکتے ہیں اور رازداری کی ترتیبات میں کسی بھی وقت اپنے انتخاب تبدیل کر سکتے ہیں۔',
		preferencesUnavailable:
			'رازداری کی ترتیبات ابھی دستیاب نہیں ہیں۔ انٹرنیٹ سے جڑیں اور دوبارہ کوشش کریں۔',
		providersOff:
			'یہ مقاصد اس وقت آف ہیں، اس لیے جب تک آپ انہیں مقاصد کے تحت آن نہیں کرتے، یہ شراکت دار آف رہیں گے۔',
		purposeFilter: 'مقصد: {purpose}',
		refreshesStoredInformation: 'محفوظ معلومات کی تجدید کرتا ہے',
		retentionNotProvided: 'اس شراکت دار نے فراہم نہیں کیا۔',
		retentionTitle: 'ڈیٹا کتنی دیر تک رکھا جاتا ہے',
		save: 'محفوظ کریں',
		searchOtherPartners: 'دیگر شراکت دار تلاش کریں',
		searchPartners: 'شراکت دار تلاش کریں',
		sessionOnly: 'صرف اس سیشن کے لیے',
		settingsChanged: 'آپ کی ترمیم کے دوران ترتیبات تبدیل ہو گئیں',
		settingsChangedDetail:
			'آپ کے انتخاب محفوظ نہیں ہوئے۔ موجودہ ترتیبات لوڈ کریں، پھر دوبارہ انتخاب کریں۔',
		specialFeatureOptIn:
			'شراکت دار یہ صرف اسی صورت میں کرتے ہیں جب آپ اسے آن کریں۔',
		specialFeaturesElsewhere:
			'رازداری کی ترتیبات میں خاص خصوصیات کے تحت سیٹ کریں۔',
		standardRetention: 'محفوظ رکھنے کی معیاری مدت',
		storedForUpTo: 'زیادہ سے زیادہ محفوظ رکھنے کی مدت',
		thisApp: 'یہ ایپ',
		tryAgain: 'دوبارہ کوشش کریں',
		turnOffToObject: 'اعتراض کرنے کے لیے آف کریں۔',
		vendorPurposeSummary:
			'{purposes} مقاصد · {legitimateInterest} جائز مفاد پر',
		viewPartners: 'شراکت دار دیکھیں',
		yes: 'ہاں',
		yourChoices: 'آپ کے انتخاب',
	},
	vi: {
		alwaysOn: 'Luôn bật',
		back: 'Quay lại',
		cancel: 'Hủy',
		close: 'Đóng',
		collapsed: 'Đã thu gọn',
		consent: 'Sự đồng ý',
		dataCollected: 'Dữ liệu thu thập',
		dayCount: '{count} ngày',
		dayCountOne: '1 ngày',
		details: 'Chi tiết',
		deviceStorage: 'Lưu trữ trên thiết bị',
		deviceStorageDetails: 'Chi tiết lưu trữ trên thiết bị',
		discardChanges: 'Bỏ thay đổi',
		discardChangesDetail: 'Các thay đổi của bạn sẽ không được lưu.',
		discardChangesTitle: 'Bỏ các thay đổi?',
		expanded: 'Đã mở rộng',
		hideDetails: 'Ẩn chi tiết',
		iabPartnerCount: '{count} đối tác IAB',
		iabPartners: 'Đối tác IAB',
		keepEditing: 'Tiếp tục chỉnh sửa',
		lastChanged: 'Thay đổi lần cuối: {date}',
		legitimateInterestStatement: 'Tuyên bố về lợi ích hợp pháp',
		listOutdated:
			'Danh sách đối tác của chúng tôi đã cũ. Hãy thử tải lại hoặc từ chối việc sử dụng dữ liệu không bắt buộc.',
		loadCurrentSettings: 'Tải cài đặt hiện tại',
		no: 'Không',
		noChoice: 'Không có lựa chọn',
		noDeviceStorage: 'Không lưu trữ thông tin trên thiết bị của bạn.',
		noPartnersMatch: 'Không có đối tác nào khớp với "{search}".',
		notAllowedPurposes: 'Ứng dụng này không cho phép đối tác này: {purposes}',
		off: 'Tắt',
		on: 'Bật',
		otherDeviceAccess: 'Các cách khác để truy cập thiết bị của bạn',
		partlyOn: 'Bật một phần',
		partner: 'Đối tác',
		partners: 'Đối tác',
		preferencesIntro:
			'Chúng tôi và các đối tác lưu trữ, truy cập thông tin trên thiết bị của bạn và xử lý dữ liệu cá nhân cho các mục đích dưới đây. Một số đối tác dựa vào lợi ích hợp pháp thay vì sự đồng ý. Bạn có thể phản đối điều đó và thay đổi lựa chọn bất cứ lúc nào trong Cài đặt quyền riêng tư.',
		preferencesUnavailable:
			'Cài đặt quyền riêng tư chưa khả dụng. Hãy kết nối Internet rồi thử lại.',
		providersOff:
			'Các mục đích đó hiện đang tắt, nên các đối tác này sẽ vẫn tắt cho đến khi bạn bật các mục đích đó trong phần Mục đích.',
		purposeFilter: 'Mục đích: {purpose}',
		refreshesStoredInformation: 'Làm mới thông tin đã lưu',
		retentionNotProvided: 'Đối tác này không cung cấp.',
		retentionTitle: 'Thời gian lưu giữ dữ liệu',
		save: 'Lưu',
		searchOtherPartners: 'Tìm kiếm đối tác khác',
		searchPartners: 'Tìm kiếm đối tác',
		sessionOnly: 'Chỉ trong phiên này',
		settingsChanged: 'Cài đặt đã thay đổi trong lúc bạn chỉnh sửa',
		settingsChangedDetail:
			'Lựa chọn của bạn chưa được lưu. Hãy tải cài đặt hiện tại rồi chọn lại.',
		specialFeatureOptIn: 'Đối tác chỉ làm việc này nếu bạn bật.',
		specialFeaturesElsewhere:
			'Thiết lập trong mục Tính năng đặc biệt của Cài đặt quyền riêng tư.',
		standardRetention: 'Thời gian lưu giữ tiêu chuẩn',
		storedForUpTo: 'Lưu trữ tối đa',
		thisApp: 'Ứng dụng này',
		tryAgain: 'Thử lại',
		turnOffToObject: 'Tắt để phản đối.',
		vendorPurposeSummary:
			'{purposes} mục đích · {legitimateInterest} dựa trên lợi ích hợp pháp',
		viewPartners: 'Xem đối tác',
		yes: 'Có',
		yourChoices: 'Lựa chọn của bạn',
	},
	yi: {
		alwaysOn: 'שטענדיק אײַנגעשאַלטן',
		back: 'צוריק',
		cancel: 'באַטל מאַכן',
		close: 'פֿאַרמאַכן',
		collapsed: 'פֿאַרמאַכט',
		consent: 'הסכּמה',
		dataCollected: 'געזאַמלטע דאַטן',
		dayCount: '{count} טעג',
		dayCountOne: '1 טאָג',
		details: 'פּרטים',
		deviceStorage: 'אױפֿהיטן אױפֿן מכשיר',
		deviceStorageDetails: 'פּרטים װעגן אױפֿהיטן אױפֿן מכשיר',
		discardChanges: 'אַװעקװאַרפֿן די ענדערונגען',
		discardChangesDetail: 'אײַערע ענדערונגען װעלן נישט אױפֿגעהיט װערן.',
		discardChangesTitle: 'אַװעקװאַרפֿן די ענדערונגען?',
		expanded: 'אָפֿן',
		hideDetails: 'באַהאַלטן די פּרטים',
		iabPartnerCount: 'IAB־שותּפֿים: {count}',
		iabPartners: 'IAB־שותּפֿים',
		keepEditing: 'װײַטער רעדאַקטירן',
		lastChanged: 'לעצטנס געענדערט: {date}',
		legitimateInterestStatement: 'דערקלערונג װעגן לעגיטימען אינטערעס',
		listOutdated:
			'אונדזער רשימה פֿון שותּפֿים איז פֿאַרעלטערט. פּרוּװט זי װידער אָנלאָדן, אָדער װאַרפֿט אָפּ דעם נישט־נײטיקן באַנוץ פֿון דאַטן.',
		loadCurrentSettings: 'אָנלאָדן די איצטיקע אײַנשטעלונגען',
		no: 'נײן',
		noChoice: 'קײן ברירה',
		noDeviceStorage: 'היט נישט אױף קײן אינפֿאָרמאַציע אױף אײַער מכשיר.',
		noPartnersMatch: 'קײן שותּפֿים שטימען נישט מיט "{search}".',
		notAllowedPurposes: 'די אַפּ דערלױבט נישט דעם שותּף: {purposes}',
		off: 'אױסגעשאַלטן',
		on: 'אײַנגעשאַלטן',
		otherDeviceAccess: 'אַנדערע װעגן צוצוטרעטן צו אײַער מכשיר',
		partlyOn: 'טײלװײַז אײַנגעשאַלטן',
		partner: 'שותּף',
		partners: 'שותּפֿים',
		preferencesIntro:
			'מיר און אונדזערע שותּפֿים היטן אױף און לײענען אינפֿאָרמאַציע אױף אײַער מכשיר, און באַאַרבעטן פּערזענלעכע דאַטן פֿאַר די צװעקן אונטן. טײל שותּפֿים פֿאַרלאָזן זיך אױף לעגיטימען אינטערעס אַנשטאָט הסכּמה. איר קענט זיך דערקעגן שטעלן און צו יעדער צײַט ענדערן אײַערע ברירות אין די פּריװאַטקײט־אײַנשטעלונגען.',
		preferencesUnavailable:
			'די פּריװאַטקײט־אײַנשטעלונגען זײַנען נאָך נישט פֿאַראַן. פֿאַרבינדט זיך מיטן אינטערנעט און פּרוּװט װידער.',
		providersOff:
			'די צװעקן זײַנען איצט אױסגעשאַלטן, דערפֿאַר בלײַבן די שותּפֿים אױסגעשאַלטן ביז איר שאַלט אײַן די צװעקן אונטער צװעקן.',
		purposeFilter: 'צװעק: {purpose}',
		refreshesStoredInformation: 'באַנײַט די אױפֿגעהיטענע אינפֿאָרמאַציע',
		retentionNotProvided: 'דער שותּף האָט עס נישט אָנגעגעבן.',
		retentionTitle: 'װי לאַנג מע האַלט די דאַטן',
		save: 'אויפהיטן',
		searchOtherPartners: 'זוכן אַנדערע שותּפֿים',
		searchPartners: 'זוכן שותּפֿים',
		sessionOnly: 'נאָר די דאָזיקע סעסיע',
		settingsChanged: 'די אײַנשטעלונגען האָבן זיך געענדערט בשעת איר האָט רעדאַקטירט',
		settingsChangedDetail:
			'אײַערע ברירות זײַנען נישט אױפֿגעהיט געװאָרן. לאָדט אָן די איצטיקע אײַנשטעלונגען און קלײַבט װידער.',
		specialFeatureOptIn: 'שותּפֿים טוען דאָס נאָר אױב איר שאַלט עס אײַן.',
		specialFeaturesElsewhere:
			'מע שטעלט עס אײַן אונטער ספּעציעלע אײגנשאַפֿטן אין די פּריװאַטקײט־אײַנשטעלונגען.',
		standardRetention: 'נאָרמאַלע אױפֿהיט־צײַט',
		storedForUpTo: 'אױפֿגעהיט ביז',
		thisApp: 'די אַפּ',
		tryAgain: 'פּרוּוון נאָך אַ מאָל',
		turnOffToObject: 'שאַלט אױס כּדי זיך קעגנצושטעלן.',
		vendorPurposeSummary:
			'צװעקן: {purposes} · לעגיטימער אינטערעס: {legitimateInterest}',
		viewPartners: 'װײַזן שותּפֿים',
		yes: 'יאָ',
		yourChoices: 'אײַערע ברירות',
	},
	zh: {
		alwaysOn: '始终开启',
		back: '返回',
		cancel: '取消',
		close: '关闭',
		collapsed: '已收起',
		consent: '同意',
		dataCollected: '收集的数据',
		dayCount: '{count} 天',
		dayCountOne: '1 天',
		details: '详情',
		deviceStorage: '设备存储',
		deviceStorageDetails: '设备存储详情',
		discardChanges: '放弃更改',
		discardChangesDetail: '您的更改将不会保存。',
		discardChangesTitle: '要放弃更改吗？',
		expanded: '已展开',
		hideDetails: '隐藏详情',
		iabPartnerCount: '{count} 个 IAB 合作伙伴',
		iabPartners: 'IAB 合作伙伴',
		keepEditing: '继续编辑',
		lastChanged: '上次更改：{date}',
		legitimateInterestStatement: '正当利益声明',
		listOutdated:
			'我们的合作伙伴列表已过期。请重新加载，或拒绝可选的数据使用。',
		loadCurrentSettings: '加载当前设置',
		no: '否',
		noChoice: '不可选择',
		noDeviceStorage: '不会在您的设备上存储信息。',
		noPartnersMatch: '没有与“{search}”匹配的合作伙伴。',
		notAllowedPurposes: '本应用不允许此合作伙伴：{purposes}',
		off: '关闭',
		on: '开启',
		otherDeviceAccess: '访问您设备的其他方式',
		partlyOn: '部分开启',
		partner: '合作伙伴',
		partners: '合作伙伴',
		preferencesIntro:
			'我们和我们的合作伙伴会在您的设备上存储和访问信息，并为以下目的处理个人数据。某些合作伙伴依据正当利益而非同意。您可以对此提出反对，并随时在隐私设置中更改您的选择。',
		preferencesUnavailable: '隐私设置暂不可用。请连接互联网后重试。',
		providersOff:
			'这些目的目前已关闭，因此在您于“目的”中开启它们之前，这些合作伙伴将保持关闭。',
		purposeFilter: '目的：{purpose}',
		refreshesStoredInformation: '会刷新已存储的信息',
		retentionNotProvided: '该合作伙伴未提供。',
		retentionTitle: '数据保留期限',
		save: '保存',
		searchOtherPartners: '搜索其他合作伙伴',
		searchPartners: '搜索合作伙伴',
		sessionOnly: '仅限本次会话',
		settingsChanged: '设置在您编辑期间已更改',
		settingsChangedDetail: '您的选择未保存。请加载当前设置，然后重新选择。',
		specialFeatureOptIn: '只有在您开启后，合作伙伴才会这样做。',
		specialFeaturesElsewhere: '请在隐私设置的“特殊功能”中设置。',
		standardRetention: '标准保留期限',
		storedForUpTo: '最长存储',
		thisApp: '本应用',
		tryAgain: '重试',
		turnOffToObject: '关闭即表示反对。',
		vendorPurposeSummary:
			'{purposes} 个目的 · {legitimateInterest} 个基于正当利益',
		viewPartners: '查看合作伙伴',
		yes: '是',
		yourChoices: '您的选择',
	},
};

/**
 * Category-mode labels for the native iOS and Android screens that the web
 * copy doesn't cover: sentences about an app rather than a website, status
 * notes, accessibility announcements and save errors. Buttons, headings and
 * category names reuse web keys instead. Only
 * `scripts/generate-native-iab-copy.ts` reads them.
 *
 * @internal
 */
export interface NativeConsentLabels {
	/** Save error when the device clock looks wrong. */
	actionTimeInvalid: string;
	/** Placeholder brand name until the app sets its own. */
	brandPlaceholder: string;
	/** Shown above the first layer when an earlier choice expired. */
	choiceExpired: string;
	/** Accessibility announcement after choices are saved. */
	choicesSaved: string;
	/** Error when dismissing the notice fails. */
	dismissFailed: string;
	/** What the experience category covers in an app. */
	experienceDescription: string;
	/** Second sentence of the first layer, under the introduction. */
	firstLayerDescription: string;
	/** What the functionality category covers in an app. */
	functionalityDescription: string;
	/** Default sentence under the first-layer headline. */
	introduction: string;
	/** What the marketing category covers in an app. */
	marketingDescription: string;
	/** What the measurement category covers in an app. */
	measurementDescription: string;
	/** What the strictly necessary category covers in an app. */
	necessaryDescription: string;
	/** Note under a category the policy doesn't offer in this region. */
	notOffered: string;
	/** Accessibility announcement after the notice is acknowledged. */
	noticeAcknowledged: string;
	/** Body of the privacy notice. */
	noticeDescription: string;
	/** Shown above the first layer when the policy changed. */
	policyChanged: string;
	/** Introduction at the top of category-mode Privacy Settings. */
	preferencesDescription: string;
	/** Note under a category that Global Privacy Control turned off. */
	restrictedByGpc: string;
	/** Error when saving choices fails. */
	saveFailed: string;
	/** Accessibility state of a button while choices are saving. */
	saving: string;
}

/** Native category-mode labels by language code. */
export const nativeConsentLabels: Record<string, NativeConsentLabels> = {
	ar: {
		actionTimeInvalid:
			'تعذّر الحفظ لأن تاريخ هذا الجهاز ووقته يبدوان غير صحيحين. صحّحهما في الإعدادات أولًا.',
		brandPlaceholder: 'علامتك التجارية هنا',
		choiceExpired: 'انتهت صلاحية اختيارك السابق، لذا نسألك مرة أخرى.',
		choicesSaved: 'تم حفظ خيارات الخصوصية',
		dismissFailed: 'تعذّر إغلاق هذا الإشعار. لم يتغير شيء على هذا الجهاز.',
		experienceDescription: 'تكييف التطبيق مع طريقة استخدامك له.',
		firstLayerDescription:
			'أنت تقرر الاستخدامات التي تسمح بها، ويمكنك تغيير رأيك في أي وقت من إعدادات الخصوصية.',
		functionalityDescription: 'تذكّر إعداداتك واختياراتك.',
		introduction:
			'نستخدم البيانات لتحسين تجربتك وقياس كيفية استخدام التطبيق وعرض إعلانات ملائمة.',
		marketingDescription: 'عرض إعلانات ملائمة لك.',
		measurementDescription: 'مساعدتنا على فهم كيفية استخدام التطبيق.',
		necessaryDescription: 'مطلوبة لكي يعمل التطبيق.',
		notOffered: 'غير متاح في منطقتك.',
		noticeAcknowledged: 'تم الاطلاع على إشعار الخصوصية',
		noticeDescription:
			'يمكنك مراجعة ذلك أو تغييره في أي وقت من إعدادات الخصوصية.',
		policyChanged:
			'تغيّرت طريقة استخدام هذا التطبيق للبيانات منذ اختيارك الأخير، لذا نسألك مرة أخرى.',
		preferencesDescription:
			'اختر أنواع استخدام البيانات التي تسمح بها. تُطبَّق التغييرات على هذا الجهاز بمجرد الحفظ.',
		restrictedByGpc: 'مُعطَّل لأن جهازك يرسل إشارة Global Privacy Control.',
		saveFailed: 'تعذّر حفظ خياراتك. لم يتغير شيء على هذا الجهاز.',
		saving: 'جارٍ حفظ الخيارات',
	},
	bg: {
		actionTimeInvalid:
			'Не можа да се запази, защото датата и часът на това устройство изглеждат грешни. Първо ги поправете в Настройки.',
		brandPlaceholder: 'Вашата марка тук',
		choiceExpired: 'Предишният ви избор е изтекъл, затова питаме отново.',
		choicesSaved: 'Изборът за поверителност е запазен',
		dismissFailed:
			'Това известие не можа да бъде затворено. Нищо не е променено на това устройство.',
		experienceDescription:
			'Приспособява приложението към начина, по който го използвате.',
		firstLayerDescription:
			'Вие решавате кои употреби да разрешите и можете да промените решението си по всяко време от Настройки за поверителност.',
		functionalityDescription: 'Запомня вашите настройки и избор.',
		introduction:
			'Използваме данни, за да подобрим вашето изживяване, да измерваме как се използва приложението и да показваме подходяща реклама.',
		marketingDescription: 'Показва реклама, подходяща за вас.',
		measurementDescription:
			'Помага ни да разберем как се използва приложението.',
		necessaryDescription: 'Необходими за работата на приложението.',
		notOffered: 'Не се предлага във вашия регион.',
		noticeAcknowledged: 'Известието за поверителност е прието',
		noticeDescription:
			'Можете да прегледате или промените това по всяко време от Настройки за поверителност.',
		policyChanged:
			'Начинът, по който това приложение използва данни, се промени след последния ви избор, затова питаме отново.',
		preferencesDescription:
			'Изберете кои видове използване на данни разрешавате. Промените важат на това устройство веднага щом запазите.',
		restrictedByGpc:
			'Изключено, защото устройството ви изпраща сигнал Global Privacy Control.',
		saveFailed:
			'Изборът ви не можа да бъде запазен. Нищо не е променено на това устройство.',
		saving: 'Изборът се запазва',
	},
	bn: {
		actionTimeInvalid:
			'সংরক্ষণ করা যায়নি, কারণ এই ডিভাইসের তারিখ ও সময় ভুল মনে হচ্ছে। আগে সেটিংসে সেগুলো ঠিক করুন।',
		brandPlaceholder: 'আপনার ব্র্যান্ড এখানে',
		choiceExpired:
			'আপনার আগের পছন্দের মেয়াদ শেষ হয়ে গেছে, তাই আমরা আবার জিজ্ঞেস করছি।',
		choicesSaved: 'গোপনীয়তার পছন্দ সংরক্ষিত হয়েছে',
		dismissFailed: 'এই বিজ্ঞপ্তিটি বন্ধ করা যায়নি। এই ডিভাইসে কিছুই পরিবর্তন হয়নি।',
		experienceDescription:
			'আপনি যেভাবে অ্যাপটি ব্যবহার করেন, সেভাবে এটিকে মানিয়ে নেয়।',
		firstLayerDescription:
			'কোন কোন ব্যবহারের অনুমতি দেবেন তা আপনিই ঠিক করেন, এবং গোপনীয়তা সেটিংসে যেকোনো সময় মত বদলাতে পারেন।',
		functionalityDescription: 'আপনার সেটিংস ও পছন্দ মনে রাখে।',
		introduction:
			'আপনার অভিজ্ঞতা উন্নত করতে, অ্যাপটি কীভাবে ব্যবহার হয় তা পরিমাপ করতে এবং প্রাসঙ্গিক বিজ্ঞাপন দেখাতে আমরা ডেটা ব্যবহার করি।',
		marketingDescription: 'আপনার জন্য প্রাসঙ্গিক বিজ্ঞাপন দেখায়।',
		measurementDescription: 'অ্যাপটি কীভাবে ব্যবহার হয় তা বুঝতে আমাদের সাহায্য করে।',
		necessaryDescription: 'অ্যাপটি চালানোর জন্য প্রয়োজনীয়।',
		notOffered: 'আপনার অঞ্চলে দেওয়া হয় না।',
		noticeAcknowledged: 'গোপনীয়তা বিজ্ঞপ্তি স্বীকার করা হয়েছে',
		noticeDescription:
			'গোপনীয়তা সেটিংসে যেকোনো সময় আপনি এটি দেখতে বা পরিবর্তন করতে পারেন।',
		policyChanged:
			'আপনার শেষ পছন্দের পর এই অ্যাপ ডেটা যেভাবে ব্যবহার করে তা বদলেছে, তাই আমরা আবার জিজ্ঞেস করছি।',
		preferencesDescription:
			'কোন ধরনের ডেটা ব্যবহারের অনুমতি দেবেন তা বেছে নিন। সংরক্ষণ করার সঙ্গে সঙ্গে এই ডিভাইসে পরিবর্তন কার্যকর হয়।',
		restrictedByGpc:
			'বন্ধ, কারণ আপনার ডিভাইস একটি Global Privacy Control সংকেত পাঠায়।',
		saveFailed: 'আপনার পছন্দ সংরক্ষণ করা যায়নি। এই ডিভাইসে কিছুই পরিবর্তন হয়নি।',
		saving: 'পছন্দ সংরক্ষণ করা হচ্ছে',
	},
	cs: {
		actionTimeInvalid:
			'Uložení se nezdařilo, protože datum a čas tohoto zařízení vypadají chybně. Nejdřív je opravte v Nastavení.',
		brandPlaceholder: 'Vaše značka',
		choiceExpired:
			'Platnost vaší dřívější volby vypršela, proto se ptáme znovu.',
		choicesSaved: 'Volby soukromí uloženy',
		dismissFailed:
			'Toto oznámení se nepodařilo zavřít. V tomto zařízení se nic nezměnilo.',
		experienceDescription: 'Přizpůsobuje aplikaci tomu, jak ji používáte.',
		firstLayerDescription:
			'Sami rozhodujete, která použití povolíte, a svůj názor můžete kdykoli změnit v Nastavení soukromí.',
		functionalityDescription: 'Pamatuje si vaše nastavení a volby.',
		introduction:
			'Údaje používáme ke zlepšení vašeho zážitku, k měření toho, jak se aplikace používá, a k zobrazování relevantní reklamy.',
		marketingDescription: 'Zobrazuje reklamu, která je pro vás relevantní.',
		measurementDescription: 'Pomáhá nám pochopit, jak se aplikace používá.',
		necessaryDescription: 'Nutné pro fungování aplikace.',
		notOffered: 'Ve vaší oblasti není k dispozici.',
		noticeAcknowledged: 'Oznámení o ochraně soukromí potvrzeno',
		noticeDescription:
			'Toto nastavení můžete kdykoli zkontrolovat nebo změnit v Nastavení soukromí.',
		policyChanged:
			'Způsob, jakým tato aplikace používá údaje, se od vaší poslední volby změnil, proto se ptáme znovu.',
		preferencesDescription:
			'Vyberte, jaké druhy použití údajů povolíte. Změny platí v tomto zařízení hned po uložení.',
		restrictedByGpc:
			'Vypnuto, protože vaše zařízení odesílá signál Global Privacy Control.',
		saveFailed:
			'Vaše volby se nepodařilo uložit. V tomto zařízení se nic nezměnilo.',
		saving: 'Ukládání voleb',
	},
	cy: {
		actionTimeInvalid:
			'Methwyd cadw oherwydd bod dyddiad ac amser y ddyfais hon yn edrych yn anghywir. Cywirwch nhw yn y Gosodiadau yn gyntaf.',
		brandPlaceholder: 'Eich brand yma',
		choiceExpired:
			'Mae eich dewis blaenorol wedi dod i ben, felly rydym yn gofyn eto.',
		choicesSaved: 'Dewisiadau preifatrwydd wedi’u cadw',
		dismissFailed:
			'Methwyd cau’r hysbysiad hwn. Does dim wedi newid ar y ddyfais hon.',
		experienceDescription: 'Addasu’r ap i’r ffordd rydych chi’n ei ddefnyddio.',
		firstLayerDescription:
			'Chi sy’n penderfynu pa ddefnyddiau i’w caniatáu, a gallwch newid eich meddwl unrhyw bryd yn Gosodiadau preifatrwydd.',
		functionalityDescription: 'Cofio eich gosodiadau a’ch dewisiadau.',
		introduction:
			'Rydym yn defnyddio data i wella eich profiad, mesur sut mae’r ap yn cael ei ddefnyddio a dangos hysbysebion perthnasol.',
		marketingDescription: 'Dangos hysbysebion sy’n berthnasol i chi.',
		measurementDescription:
			'Ein helpu i ddeall sut mae’r ap yn cael ei ddefnyddio.',
		necessaryDescription: 'Yn ofynnol er mwyn i’r ap weithio.',
		notOffered: 'Ddim ar gael lle rydych chi.',
		noticeAcknowledged: 'Hysbysiad preifatrwydd wedi’i gydnabod',
		noticeDescription:
			'Gallwch adolygu neu newid hyn unrhyw bryd yn Gosodiadau preifatrwydd.',
		policyChanged:
			'Mae’r ffordd mae’r ap hwn yn defnyddio data wedi newid ers eich dewis diwethaf, felly rydym yn gofyn eto.',
		preferencesDescription:
			'Dewiswch pa fathau o ddefnydd data rydych chi’n eu caniatáu. Mae newidiadau’n dod i rym ar y ddyfais hon cyn gynted ag y byddwch yn cadw.',
		restrictedByGpc:
			'I ffwrdd oherwydd bod eich dyfais yn anfon signal Global Privacy Control.',
		saveFailed:
			'Methwyd cadw eich dewisiadau. Does dim wedi newid ar y ddyfais hon.',
		saving: 'Wrthi’n cadw dewisiadau',
	},
	da: {
		actionTimeInvalid:
			'Kunne ikke gemme, fordi enhedens dato og klokkeslæt ser forkerte ud. Ret dem først under Indstillinger.',
		brandPlaceholder: 'Dit brand her',
		choiceExpired: 'Dit tidligere valg er udløbet, så vi spørger igen.',
		choicesSaved: 'Privatlivsvalg gemt',
		dismissFailed:
			'Meddelelsen kunne ikke lukkes. Intet er ændret på denne enhed.',
		experienceDescription: 'Tilpasser appen til, hvordan du bruger den.',
		firstLayerDescription:
			'Du bestemmer, hvilke former for brug du tillader, og du kan ændre mening når som helst under Privatlivsindstillinger.',
		functionalityDescription: 'Husker dine indstillinger og valg.',
		introduction:
			'Vi bruger data til at forbedre din oplevelse, måle hvordan appen bruges og vise relevante annoncer.',
		marketingDescription: 'Viser annoncer, der er relevante for dig.',
		measurementDescription: 'Hjælper os med at forstå, hvordan appen bruges.',
		necessaryDescription: 'Nødvendige for, at appen virker.',
		notOffered: 'Tilbydes ikke, hvor du er.',
		noticeAcknowledged: 'Privatlivsmeddelelse bekræftet',
		noticeDescription:
			'Du kan se eller ændre dette når som helst under Privatlivsindstillinger.',
		policyChanged:
			'Måden, denne app bruger data på, er ændret siden dit sidste valg, så vi spørger igen.',
		preferencesDescription:
			'Vælg, hvilke former for databrug du tillader. Ændringer gælder på denne enhed, så snart du gemmer.',
		restrictedByGpc:
			'Slået fra, fordi din enhed sender et Global Privacy Control-signal.',
		saveFailed: 'Dine valg kunne ikke gemmes. Intet er ændret på denne enhed.',
		saving: 'Gemmer valg',
	},
	de: {
		actionTimeInvalid:
			'Speichern nicht möglich, weil Datum und Uhrzeit dieses Geräts falsch zu sein scheinen. Korrigiere sie zuerst in den Einstellungen des Geräts.',
		brandPlaceholder: 'Deine Marke hier',
		choiceExpired:
			'Deine frühere Auswahl ist abgelaufen, deshalb fragen wir erneut.',
		choicesSaved: 'Datenschutz-Auswahl gespeichert',
		dismissFailed:
			'Dieser Hinweis konnte nicht geschlossen werden. Auf diesem Gerät wurde nichts geändert.',
		experienceDescription: 'Passt die App daran an, wie du sie nutzt.',
		firstLayerDescription:
			'Du entscheidest, welche Nutzungen du erlaubst, und kannst deine Meinung jederzeit in den Einstellungen ändern.',
		functionalityDescription:
			'Merkt sich deine Einstellungen und deine Auswahl.',
		introduction:
			'Wir nutzen Daten, um dein Erlebnis zu verbessern, die Nutzung der App zu messen und relevante Werbung zu zeigen.',
		marketingDescription: 'Zeigt dir Werbung, die für dich relevant ist.',
		measurementDescription: 'Hilft uns zu verstehen, wie die App genutzt wird.',
		necessaryDescription: 'Erforderlich, damit die App funktioniert.',
		notOffered: 'In deiner Region nicht angeboten.',
		noticeAcknowledged: 'Datenschutzhinweis bestätigt',
		noticeDescription:
			'Du kannst das jederzeit in den Einstellungen prüfen oder ändern.',
		policyChanged:
			'Seit deiner letzten Auswahl hat sich geändert, wie diese App Daten nutzt, deshalb fragen wir erneut.',
		preferencesDescription:
			'Wähle aus, welche Arten der Datennutzung du erlaubst. Änderungen gelten auf diesem Gerät, sobald du speicherst.',
		restrictedByGpc:
			'Aus, weil dein Gerät ein Global-Privacy-Control-Signal sendet.',
		saveFailed:
			'Deine Auswahl konnte nicht gespeichert werden. Auf diesem Gerät wurde nichts geändert.',
		saving: 'Auswahl wird gespeichert',
	},
	el: {
		actionTimeInvalid:
			'Η αποθήκευση δεν ήταν δυνατή, επειδή η ημερομηνία και η ώρα της συσκευής φαίνονται λανθασμένες. Διορθώστε τες πρώτα στις Ρυθμίσεις.',
		brandPlaceholder: 'Η επωνυμία σας εδώ',
		choiceExpired:
			'Η προηγούμενη επιλογή σας έχει λήξει, γι’ αυτό σας ρωτάμε ξανά.',
		choicesSaved: 'Οι επιλογές απορρήτου αποθηκεύτηκαν',
		dismissFailed:
			'Δεν ήταν δυνατό να κλείσει αυτή η ειδοποίηση. Δεν άλλαξε τίποτα σε αυτή τη συσκευή.',
		experienceDescription:
			'Προσαρμόζει την εφαρμογή στον τρόπο που τη χρησιμοποιείτε.',
		firstLayerDescription:
			'Εσείς αποφασίζετε ποιες χρήσεις επιτρέπετε και μπορείτε να αλλάξετε γνώμη ανά πάσα στιγμή από τις Ρυθμίσεις απορρήτου.',
		functionalityDescription: 'Θυμάται τις ρυθμίσεις και τις επιλογές σας.',
		introduction:
			'Χρησιμοποιούμε δεδομένα για να βελτιώσουμε την εμπειρία σας, να μετράμε πώς χρησιμοποιείται η εφαρμογή και να προβάλλουμε σχετικές διαφημίσεις.',
		marketingDescription: 'Προβάλλει διαφημίσεις σχετικές με εσάς.',
		measurementDescription:
			'Μας βοηθά να καταλάβουμε πώς χρησιμοποιείται η εφαρμογή.',
		necessaryDescription: 'Απαιτούνται για να λειτουργεί η εφαρμογή.',
		notOffered: 'Δεν προσφέρεται στην περιοχή σας.',
		noticeAcknowledged: 'Η ειδοποίηση απορρήτου επιβεβαιώθηκε',
		noticeDescription:
			'Μπορείτε να το ελέγξετε ή να το αλλάξετε ανά πάσα στιγμή από τις Ρυθμίσεις απορρήτου.',
		policyChanged:
			'Ο τρόπος που αυτή η εφαρμογή χρησιμοποιεί δεδομένα άλλαξε από την τελευταία σας επιλογή, γι’ αυτό σας ρωτάμε ξανά.',
		preferencesDescription:
			'Επιλέξτε ποια είδη χρήσης δεδομένων επιτρέπετε. Οι αλλαγές ισχύουν σε αυτή τη συσκευή μόλις τις αποθηκεύσετε.',
		restrictedByGpc:
			'Ανενεργό, επειδή η συσκευή σας στέλνει σήμα Global Privacy Control.',
		saveFailed:
			'Δεν ήταν δυνατή η αποθήκευση των επιλογών σας. Δεν άλλαξε τίποτα σε αυτή τη συσκευή.',
		saving: 'Αποθήκευση επιλογών',
	},
	en: {
		actionTimeInvalid:
			"Couldn't save because this device's date and time look wrong. Fix them in Settings first.",
		brandPlaceholder: 'Your brand here',
		choiceExpired: "Your earlier choice has expired, so we're asking again.",
		choicesSaved: 'Privacy choices saved',
		dismissFailed:
			"Couldn't dismiss this notice. Nothing changed on this device.",
		experienceDescription: 'Adapt the app to how you use it.',
		firstLayerDescription:
			'You decide which uses to allow, and you can change your mind at any time in Privacy Settings.',
		functionalityDescription: 'Remember your settings and choices.',
		introduction:
			'We use data to improve your experience, measure how the app is used and show relevant advertising.',
		marketingDescription: 'Show advertising relevant to you.',
		measurementDescription: 'Help us understand how the app is used.',
		necessaryDescription: 'Required for the app to work.',
		notOffered: 'Not offered where you are.',
		noticeAcknowledged: 'Privacy notice acknowledged',
		noticeDescription:
			'You can review or change this at any time in Privacy Settings.',
		policyChanged:
			"How this app uses data has changed since your last choice, so we're asking again.",
		preferencesDescription:
			'Choose which kinds of data use you allow. Changes apply on this device as soon as you save.',
		restrictedByGpc:
			'Off because your device sends a Global Privacy Control signal.',
		saveFailed: "Couldn't save your choices. Nothing changed on this device.",
		saving: 'Saving choices',
	},
	es: {
		actionTimeInvalid:
			'No se ha podido guardar porque la fecha y la hora de este dispositivo parecen incorrectas. Corrígelas primero en Ajustes.',
		brandPlaceholder: 'Tu marca aquí',
		choiceExpired:
			'Tu elección anterior ha caducado, así que volvemos a preguntarte.',
		choicesSaved: 'Opciones de privacidad guardadas',
		dismissFailed:
			'No se ha podido cerrar este aviso. No ha cambiado nada en este dispositivo.',
		experienceDescription: 'Adapta la aplicación a cómo la usas.',
		firstLayerDescription:
			'Tú decides qué usos permites y puedes cambiar de opinión en cualquier momento en Configuración de privacidad.',
		functionalityDescription: 'Recuerda tus ajustes y tus opciones.',
		introduction:
			'Usamos datos para mejorar tu experiencia, medir cómo se usa la aplicación y mostrar publicidad relevante.',
		marketingDescription: 'Muestra publicidad relevante para ti.',
		measurementDescription: 'Nos ayuda a entender cómo se usa la aplicación.',
		necessaryDescription: 'Necesarias para que la aplicación funcione.',
		notOffered: 'No disponible en tu región.',
		noticeAcknowledged: 'Aviso de privacidad aceptado',
		noticeDescription:
			'Puedes revisarlo o cambiarlo en cualquier momento en Configuración de privacidad.',
		policyChanged:
			'La forma en que esta aplicación usa los datos ha cambiado desde tu última elección, así que volvemos a preguntarte.',
		preferencesDescription:
			'Elige qué tipos de uso de datos permites. Los cambios se aplican en este dispositivo en cuanto guardas.',
		restrictedByGpc:
			'Desactivado porque tu dispositivo envía una señal de Global Privacy Control.',
		saveFailed:
			'No se han podido guardar tus opciones. No ha cambiado nada en este dispositivo.',
		saving: 'Guardando opciones',
	},
	et: {
		actionTimeInvalid:
			'Salvestamine ebaõnnestus, sest selle seadme kuupäev ja kellaaeg tunduvad valed. Parandage need esmalt seadetes.',
		brandPlaceholder: 'Teie bränd siia',
		choiceExpired: 'Teie varasem valik on aegunud, seega küsime uuesti.',
		choicesSaved: 'Privaatsusvalikud salvestatud',
		dismissFailed:
			'Seda teadet ei õnnestunud sulgeda. Selles seadmes ei muutunud midagi.',
		experienceDescription:
			'Kohandab rakendust selle järgi, kuidas te seda kasutate.',
		firstLayerDescription:
			'Teie otsustate, milliseid kasutusviise lubate, ja saate meelt muuta igal ajal privaatsusseadetes.',
		functionalityDescription: 'Jätab meelde teie seaded ja valikud.',
		introduction:
			'Kasutame andmeid, et parandada teie kogemust, mõõta rakenduse kasutamist ja näidata asjakohast reklaami.',
		marketingDescription: 'Näitab teile asjakohast reklaami.',
		measurementDescription: 'Aitab meil mõista, kuidas rakendust kasutatakse.',
		necessaryDescription: 'Vajalikud rakenduse toimimiseks.',
		notOffered: 'Teie piirkonnas ei pakuta.',
		noticeAcknowledged: 'Privaatsusteade kinnitatud',
		noticeDescription:
			'Saate seda igal ajal privaatsusseadetes vaadata või muuta.',
		policyChanged:
			'See, kuidas rakendus andmeid kasutab, on pärast teie viimast valikut muutunud, seega küsime uuesti.',
		preferencesDescription:
			'Valige, milliseid andmekasutuse liike lubate. Muudatused kehtivad selles seadmes kohe pärast salvestamist.',
		restrictedByGpc:
			'Väljas, sest teie seade saadab Global Privacy Controli signaali.',
		saveFailed:
			'Teie valikuid ei õnnestunud salvestada. Selles seadmes ei muutunud midagi.',
		saving: 'Valikute salvestamine',
	},
	fi: {
		actionTimeInvalid:
			'Tallennus epäonnistui, koska tämän laitteen päivämäärä ja kellonaika näyttävät väärältä. Korjaa ne ensin Asetuksissa.',
		brandPlaceholder: 'Brändisi tähän',
		choiceExpired: 'Aiempi valintasi on vanhentunut, joten kysymme uudelleen.',
		choicesSaved: 'Tietosuojavalinnat tallennettu',
		dismissFailed:
			'Ilmoitusta ei voitu sulkea. Tässä laitteessa ei muuttunut mitään.',
		experienceDescription: 'Mukauttaa sovelluksen siihen, miten käytät sitä.',
		firstLayerDescription:
			'Sinä päätät, mitkä käyttötavat sallit, ja voit muuttaa mieltäsi milloin tahansa Tietosuoja-asetuksissa.',
		functionalityDescription: 'Muistaa asetuksesi ja valintasi.',
		introduction:
			'Käytämme tietoja parantaaksemme käyttökokemustasi, mitataksemme sovelluksen käyttöä ja näyttääksemme osuvaa mainontaa.',
		marketingDescription: 'Näyttää sinulle osuvaa mainontaa.',
		measurementDescription:
			'Auttaa meitä ymmärtämään, miten sovellusta käytetään.',
		necessaryDescription: 'Välttämättömiä sovelluksen toiminnalle.',
		notOffered: 'Ei tarjolla alueellasi.',
		noticeAcknowledged: 'Tietosuojailmoitus kuitattu',
		noticeDescription:
			'Voit tarkistaa tai muuttaa tämän milloin tahansa Tietosuoja-asetuksissa.',
		policyChanged:
			'Tapa, jolla tämä sovellus käyttää tietoja, on muuttunut viimeisen valintasi jälkeen, joten kysymme uudelleen.',
		preferencesDescription:
			'Valitse, millaisen tietojen käytön sallit. Muutokset tulevat voimaan tässä laitteessa heti tallennuksen jälkeen.',
		restrictedByGpc:
			'Pois päältä, koska laitteesi lähettää Global Privacy Control -signaalin.',
		saveFailed:
			'Valintojasi ei voitu tallentaa. Tässä laitteessa ei muuttunut mitään.',
		saving: 'Tallennetaan valintoja',
	},
	fr: {
		actionTimeInvalid:
			"Enregistrement impossible : la date et l'heure de cet appareil semblent incorrectes. Corrigez-les d'abord dans Réglages.",
		brandPlaceholder: 'Votre marque ici',
		choiceExpired:
			'Votre choix précédent a expiré, nous vous demandons donc à nouveau.',
		choicesSaved: 'Choix de confidentialité enregistrés',
		dismissFailed:
			"Impossible de fermer cet avis. Rien n'a changé sur cet appareil.",
		experienceDescription: "Adapte l'application à votre façon de l'utiliser.",
		firstLayerDescription:
			"Vous décidez des utilisations que vous autorisez et pouvez changer d'avis à tout moment dans Paramètres de confidentialité.",
		functionalityDescription: 'Mémorise vos réglages et vos choix.',
		introduction:
			"Nous utilisons des données pour améliorer votre expérience, mesurer l'utilisation de l'application et afficher des publicités pertinentes.",
		marketingDescription: 'Affiche des publicités pertinentes pour vous.',
		measurementDescription:
			"Nous aide à comprendre comment l'application est utilisée.",
		necessaryDescription: "Nécessaires au fonctionnement de l'application.",
		notOffered: 'Non proposé dans votre région.',
		noticeAcknowledged: 'Avis de confidentialité pris en compte',
		noticeDescription:
			'Vous pouvez le consulter ou le modifier à tout moment dans Paramètres de confidentialité.',
		policyChanged:
			'La façon dont cette application utilise les données a changé depuis votre dernier choix, nous vous demandons donc à nouveau.',
		preferencesDescription:
			"Choisissez les types d'utilisation des données que vous autorisez. Les modifications s'appliquent sur cet appareil dès l'enregistrement.",
		restrictedByGpc:
			'Désactivé, car votre appareil envoie un signal Global Privacy Control.',
		saveFailed:
			"Impossible d'enregistrer vos choix. Rien n'a changé sur cet appareil.",
		saving: 'Enregistrement des choix',
	},
	ga: {
		actionTimeInvalid:
			'Níorbh fhéidir sábháil mar is cosúil go bhfuil dáta agus am an ghléis seo mícheart. Ceartaigh iad sna Socruithe ar dtús.',
		brandPlaceholder: 'Do bhranda anseo',
		choiceExpired:
			'Tá do rogha roimhe seo imithe in éag, mar sin táimid ag fiafraí arís.',
		choicesSaved: 'Roghanna príobháideachais sábháilte',
		dismissFailed:
			'Níorbh fhéidir an fógra seo a dhúnadh. Níor athraíodh aon rud ar an ngléas seo.',
		experienceDescription:
			'Cuireann sé an aip in oiriúint don chaoi a n-úsáideann tú í.',
		firstLayerDescription:
			'Is tusa a shocraíonn cé na húsáidí a cheadaíonn tú, agus is féidir leat d’intinn a athrú am ar bith i Socruithe Príobháideachais.',
		functionalityDescription:
			'Cuimhníonn sé ar do shocruithe agus do roghanna.',
		introduction:
			'Úsáidimid sonraí chun d’eispéireas a fheabhsú, chun úsáid na haipe a thomhas agus chun fógraíocht ábhartha a thaispeáint.',
		marketingDescription: 'Taispeánann sé fógraíocht atá ábhartha duit.',
		measurementDescription:
			'Cabhraíonn sé linn tuiscint a fháil ar an gcaoi a n-úsáidtear an aip.',
		necessaryDescription: 'Riachtanach chun go n-oibreoidh an aip.',
		notOffered: 'Níl sé ar fáil i do cheantar.',
		noticeAcknowledged: 'Fógra príobháideachais admhaithe',
		noticeDescription:
			'Is féidir leat é seo a athbhreithniú nó a athrú am ar bith i Socruithe Príobháideachais.',
		policyChanged:
			'Tá athrú tagtha ar an gcaoi a n-úsáideann an aip seo sonraí ó rinne tú do rogha dheireanach, mar sin táimid ag fiafraí arís.',
		preferencesDescription:
			'Roghnaigh na cineálacha úsáide sonraí a cheadaíonn tú. Bíonn feidhm ag athruithe ar an ngléas seo chomh luath agus a shábhálann tú.',
		restrictedByGpc:
			'As, mar go seolann do ghléas comhartha Global Privacy Control.',
		saveFailed:
			'Níorbh fhéidir do roghanna a shábháil. Níor athraíodh aon rud ar an ngléas seo.',
		saving: 'Roghanna á sábháil',
	},
	gu: {
		actionTimeInvalid:
			'સાચવી શકાયું નહીં, કારણ કે આ ઉપકરણની તારીખ અને સમય ખોટાં લાગે છે. પહેલાં તેને સેટિંગ્સમાં સુધારો.',
		brandPlaceholder: 'તમારી બ્રાન્ડ અહીં',
		choiceExpired:
			'તમારી અગાઉની પસંદગીની મુદત પૂરી થઈ ગઈ છે, તેથી અમે ફરી પૂછી રહ્યા છીએ.',
		choicesSaved: 'ગોપનીયતા પસંદગીઓ સાચવી',
		dismissFailed: 'આ સૂચના બંધ કરી શકાઈ નહીં. આ ઉપકરણ પર કંઈ બદલાયું નથી.',
		experienceDescription: 'તમે ઍપનો જે રીતે ઉપયોગ કરો છો તે મુજબ તેને અનુકૂળ બનાવે છે.',
		firstLayerDescription:
			'કયા ઉપયોગોને મંજૂરી આપવી તે તમે નક્કી કરો છો, અને ગોપનીયતા સેટિંગ્સમાં ગમે ત્યારે તમારો વિચાર બદલી શકો છો.',
		functionalityDescription: 'તમારી સેટિંગ્સ અને પસંદગીઓ યાદ રાખે છે.',
		introduction:
			'તમારો અનુભવ સુધારવા, ઍપનો ઉપયોગ કેવી રીતે થાય છે તે માપવા અને સંબંધિત જાહેરાતો બતાવવા માટે અમે ડેટાનો ઉપયોગ કરીએ છીએ.',
		marketingDescription: 'તમારા માટે સંબંધિત જાહેરાતો બતાવે છે.',
		measurementDescription: 'ઍપનો ઉપયોગ કેવી રીતે થાય છે તે સમજવામાં અમને મદદ કરે છે.',
		necessaryDescription: 'ઍપ ચાલવા માટે જરૂરી.',
		notOffered: 'તમારા પ્રદેશમાં ઉપલબ્ધ નથી.',
		noticeAcknowledged: 'ગોપનીયતા સૂચના સ્વીકારી',
		noticeDescription:
			'તમે ગોપનીયતા સેટિંગ્સમાં ગમે ત્યારે આની સમીક્ષા કરી શકો છો અથવા તેને બદલી શકો છો.',
		policyChanged:
			'તમારી છેલ્લી પસંદગી પછી આ ઍપ ડેટાનો ઉપયોગ કેવી રીતે કરે છે તે બદલાયું છે, તેથી અમે ફરી પૂછી રહ્યા છીએ.',
		preferencesDescription:
			'તમે કયા પ્રકારના ડેટા ઉપયોગને મંજૂરી આપો છો તે પસંદ કરો. તમે સાચવો કે તરત જ ફેરફારો આ ઉપકરણ પર લાગુ થાય છે.',
		restrictedByGpc:
			'બંધ, કારણ કે તમારું ઉપકરણ Global Privacy Control સિગ્નલ મોકલે છે.',
		saveFailed: 'તમારી પસંદગીઓ સાચવી શકાઈ નહીં. આ ઉપકરણ પર કંઈ બદલાયું નથી.',
		saving: 'પસંદગીઓ સાચવી રહ્યા છીએ',
	},
	he: {
		actionTimeInvalid:
			'לא ניתן היה לשמור כי התאריך והשעה במכשיר נראים שגויים. יש לתקן אותם קודם בהגדרות.',
		brandPlaceholder: 'המותג שלך כאן',
		choiceExpired: 'תוקף הבחירה הקודמת שלך פג, ולכן אנחנו שואלים שוב.',
		choicesSaved: 'בחירות הפרטיות נשמרו',
		dismissFailed: 'לא ניתן היה לסגור את ההודעה. דבר לא השתנה במכשיר הזה.',
		experienceDescription: 'התאמת האפליקציה לאופן השימוש שלך בה.',
		firstLayerDescription:
			'ההחלטה אילו שימושים לאשר היא שלך, ואפשר לשנות אותה בכל עת בהגדרות פרטיות.',
		functionalityDescription: 'שמירת ההגדרות והבחירות שלך.',
		introduction:
			'אנחנו משתמשים בנתונים כדי לשפר את החוויה שלך, למדוד את השימוש באפליקציה ולהציג פרסום רלוונטי.',
		marketingDescription: 'הצגת פרסום רלוונטי עבורך.',
		measurementDescription: 'עוזרות לנו להבין איך משתמשים באפליקציה.',
		necessaryDescription: 'נדרשות כדי שהאפליקציה תפעל.',
		notOffered: 'לא זמין באזור שלך.',
		noticeAcknowledged: 'הודעת הפרטיות אושרה',
		noticeDescription: 'אפשר לעיין בזה או לשנות זאת בכל עת בהגדרות פרטיות.',
		policyChanged:
			'האופן שבו האפליקציה משתמשת בנתונים השתנה מאז הבחירה האחרונה שלך, ולכן אנחנו שואלים שוב.',
		preferencesDescription:
			'בחירת סוגי השימוש בנתונים שמותרים. השינויים חלים במכשיר הזה מיד עם השמירה.',
		restrictedByGpc: 'כבוי כי המכשיר שלך שולח אות Global Privacy Control.',
		saveFailed: 'לא ניתן היה לשמור את הבחירות שלך. דבר לא השתנה במכשיר הזה.',
		saving: 'הבחירות נשמרות',
	},
	hi: {
		actionTimeInvalid:
			'सेव नहीं हो सका, क्योंकि इस डिवाइस की तारीख और समय गलत लग रहे हैं. पहले उन्हें सेटिंग्स में ठीक करें.',
		brandPlaceholder: 'आपका ब्रांड यहां',
		choiceExpired:
			'आपकी पिछली पसंद की अवधि खत्म हो गई है, इसलिए हम फिर से पूछ रहे हैं.',
		choicesSaved: 'गोपनीयता विकल्प सेव हो गए',
		dismissFailed: 'यह सूचना बंद नहीं हो सकी. इस डिवाइस पर कुछ नहीं बदला.',
		experienceDescription: 'ऐप को आपके इस्तेमाल के तरीके के मुताबिक ढालता है.',
		firstLayerDescription:
			'किन इस्तेमालों की अनुमति देनी है, यह आप तय करते हैं, और गोपनीयता सेटिंग्स में कभी भी अपना फैसला बदल सकते हैं.',
		functionalityDescription: 'आपकी सेटिंग्स और विकल्प याद रखता है.',
		introduction:
			'हम आपके अनुभव को बेहतर बनाने, ऐप के इस्तेमाल को मापने और काम के विज्ञापन दिखाने के लिए डेटा का इस्तेमाल करते हैं.',
		marketingDescription: 'आपके काम के विज्ञापन दिखाता है.',
		measurementDescription:
			'यह समझने में हमारी मदद करता है कि ऐप का इस्तेमाल कैसे होता है.',
		necessaryDescription: 'ऐप के काम करने के लिए ज़रूरी.',
		notOffered: 'आपके क्षेत्र में उपलब्ध नहीं है.',
		noticeAcknowledged: 'गोपनीयता सूचना स्वीकार की गई',
		noticeDescription:
			'आप गोपनीयता सेटिंग्स में कभी भी इसकी समीक्षा कर सकते हैं या इसे बदल सकते हैं.',
		policyChanged:
			'आपकी पिछली पसंद के बाद से यह ऐप डेटा का इस्तेमाल जिस तरह करता है, वह बदल गया है, इसलिए हम फिर से पूछ रहे हैं.',
		preferencesDescription:
			'चुनें कि आप किस तरह के डेटा इस्तेमाल की अनुमति देते हैं. सेव करते ही बदलाव इस डिवाइस पर लागू हो जाते हैं.',
		restrictedByGpc:
			'बंद है, क्योंकि आपका डिवाइस Global Privacy Control सिग्नल भेजता है.',
		saveFailed: 'आपके विकल्प सेव नहीं हो सके. इस डिवाइस पर कुछ नहीं बदला.',
		saving: 'विकल्प सेव हो रहे हैं',
	},
	hr: {
		actionTimeInvalid:
			'Spremanje nije uspjelo jer datum i vrijeme na ovom uređaju izgledaju pogrešno. Najprije ih ispravite u Postavkama.',
		brandPlaceholder: 'Vaš brend ovdje',
		choiceExpired: 'Vaš raniji izbor je istekao pa vas ponovno pitamo.',
		choicesSaved: 'Izbori privatnosti spremljeni',
		dismissFailed:
			'Ovu obavijest nije moguće zatvoriti. Na ovom uređaju ništa se nije promijenilo.',
		experienceDescription:
			'Prilagođava aplikaciju načinu na koji je koristite.',
		firstLayerDescription:
			'Vi odlučujete koje upotrebe dopuštate i možete se predomisliti u bilo kojem trenutku u Postavkama privatnosti.',
		functionalityDescription: 'Pamti vaše postavke i izbore.',
		introduction:
			'Podatke koristimo kako bismo poboljšali vaše iskustvo, mjerili kako se aplikacija koristi i prikazivali relevantne oglase.',
		marketingDescription: 'Prikazuje oglase relevantne za vas.',
		measurementDescription: 'Pomaže nam razumjeti kako se aplikacija koristi.',
		necessaryDescription: 'Potrebni za rad aplikacije.',
		notOffered: 'Nije dostupno u vašoj regiji.',
		noticeAcknowledged: 'Obavijest o privatnosti potvrđena',
		noticeDescription:
			'To možete pregledati ili promijeniti u bilo kojem trenutku u Postavkama privatnosti.',
		policyChanged:
			'Način na koji ova aplikacija koristi podatke promijenio se od vašeg posljednjeg izbora pa vas ponovno pitamo.',
		preferencesDescription:
			'Odaberite koje vrste korištenja podataka dopuštate. Promjene vrijede na ovom uređaju čim spremite.',
		restrictedByGpc:
			'Isključeno jer vaš uređaj šalje signal Global Privacy Control.',
		saveFailed:
			'Vaše izbore nije moguće spremiti. Na ovom uređaju ništa se nije promijenilo.',
		saving: 'Spremanje izbora',
	},
	ht: {
		actionTimeInvalid:
			'Nou pa t ka anrejistre paske dat ak lè aparèy sa a sanble pa bon. Korije yo nan Paramèt yo anvan.',
		brandPlaceholder: 'Mak ou isit la',
		choiceExpired:
			'Chwa ou te fè anvan an ekspire, se pou sa n ap mande ou ankò.',
		choicesSaved: 'Chwa konfidansyalite yo anrejistre',
		dismissFailed:
			'Nou pa t ka fèmen avi sa a. Anyen pa chanje sou aparèy sa a.',
		experienceDescription: 'Adapte aplikasyon an ak fason ou itilize l.',
		firstLayerDescription:
			'Se ou ki deside ki itilizasyon ou otorize, epi ou ka chanje lide nenpòt ki lè nan Paramèt konfidansyalite.',
		functionalityDescription: 'Sonje paramèt ak chwa ou yo.',
		introduction:
			'Nou itilize done pou amelyore eksperyans ou, mezire jan moun itilize aplikasyon an epi montre piblisite ki enpòtan pou ou.',
		marketingDescription: 'Montre piblisite ki enpòtan pou ou.',
		measurementDescription: 'Ede nou konprann jan moun itilize aplikasyon an.',
		necessaryDescription: 'Nesesè pou aplikasyon an mache.',
		notOffered: 'Pa disponib kote ou ye a.',
		noticeAcknowledged: 'Avi konfidansyalite a resevwa',
		noticeDescription:
			'Ou ka revize oswa chanje sa nenpòt ki lè nan Paramèt konfidansyalite.',
		policyChanged:
			'Fason aplikasyon sa a itilize done chanje depi dènye chwa ou, se pou sa n ap mande ou ankò.',
		preferencesDescription:
			'Chwazi ki kalite itilizasyon done ou otorize. Chanjman yo aplike sou aparèy sa a depi ou anrejistre.',
		restrictedByGpc:
			'Fèmen paske aparèy ou voye yon siyal Global Privacy Control.',
		saveFailed:
			'Nou pa t ka anrejistre chwa ou yo. Anyen pa chanje sou aparèy sa a.',
		saving: 'N ap anrejistre chwa yo',
	},
	hu: {
		actionTimeInvalid:
			'A mentés nem sikerült, mert az eszköz dátuma és ideje hibásnak tűnik. Először javítsa ki őket a Beállításokban.',
		brandPlaceholder: 'Az Ön márkája itt',
		choiceExpired: 'Korábbi választása lejárt, ezért újra megkérdezzük.',
		choicesSaved: 'Adatvédelmi választások mentve',
		dismissFailed:
			'Ezt az értesítést nem sikerült bezárni. Ezen az eszközön semmi sem változott.',
		experienceDescription:
			'Az alkalmazást ahhoz igazítja, ahogyan Ön használja.',
		firstLayerDescription:
			'Ön dönti el, mely felhasználásokat engedélyezi, és bármikor meggondolhatja magát az Adatvédelmi beállításokban.',
		functionalityDescription: 'Megjegyzi a beállításait és választásait.',
		introduction:
			'Adatokat használunk az élmény javítására, az alkalmazás használatának mérésére és releváns hirdetések megjelenítésére.',
		marketingDescription: 'Önnek releváns hirdetéseket jelenít meg.',
		measurementDescription:
			'Segít megérteni, hogyan használják az alkalmazást.',
		necessaryDescription: 'Az alkalmazás működéséhez szükségesek.',
		notOffered: 'Az Ön régiójában nem érhető el.',
		noticeAcknowledged: 'Adatvédelmi tájékoztató tudomásul véve',
		noticeDescription:
			'Ezt bármikor áttekintheti vagy módosíthatja az Adatvédelmi beállításokban.',
		policyChanged:
			'Legutóbbi választása óta megváltozott, hogyan használja ez az alkalmazás az adatokat, ezért újra megkérdezzük.',
		preferencesDescription:
			'Válassza ki, milyen adatfelhasználást engedélyez. A módosítások a mentés után azonnal érvényesek ezen az eszközön.',
		restrictedByGpc:
			'Kikapcsolva, mert az eszköze Global Privacy Control jelzést küld.',
		saveFailed:
			'Választásait nem sikerült menteni. Ezen az eszközön semmi sem változott.',
		saving: 'Választások mentése',
	},
	id: {
		actionTimeInvalid:
			'Tidak dapat menyimpan karena tanggal dan waktu perangkat ini tampak salah. Perbaiki dulu di Pengaturan.',
		brandPlaceholder: 'Merek Anda di sini',
		choiceExpired:
			'Pilihan Anda sebelumnya sudah kedaluwarsa, jadi kami bertanya lagi.',
		choicesSaved: 'Pilihan privasi disimpan',
		dismissFailed:
			'Pemberitahuan ini tidak dapat ditutup. Tidak ada yang berubah di perangkat ini.',
		experienceDescription:
			'Menyesuaikan aplikasi dengan cara Anda menggunakannya.',
		firstLayerDescription:
			'Anda yang menentukan penggunaan mana yang diizinkan, dan Anda dapat berubah pikiran kapan saja di Pengaturan Privasi.',
		functionalityDescription: 'Mengingat pengaturan dan pilihan Anda.',
		introduction:
			'Kami menggunakan data untuk meningkatkan pengalaman Anda, mengukur cara aplikasi digunakan, dan menampilkan iklan yang relevan.',
		marketingDescription: 'Menampilkan iklan yang relevan bagi Anda.',
		measurementDescription: 'Membantu kami memahami cara aplikasi digunakan.',
		necessaryDescription: 'Diperlukan agar aplikasi berfungsi.',
		notOffered: 'Tidak tersedia di wilayah Anda.',
		noticeAcknowledged: 'Pemberitahuan privasi diterima',
		noticeDescription:
			'Anda dapat meninjau atau mengubahnya kapan saja di Pengaturan Privasi.',
		policyChanged:
			'Cara aplikasi ini menggunakan data telah berubah sejak pilihan terakhir Anda, jadi kami bertanya lagi.',
		preferencesDescription:
			'Pilih jenis penggunaan data yang Anda izinkan. Perubahan berlaku di perangkat ini segera setelah Anda menyimpan.',
		restrictedByGpc:
			'Nonaktif karena perangkat Anda mengirim sinyal Global Privacy Control.',
		saveFailed:
			'Pilihan Anda tidak dapat disimpan. Tidak ada yang berubah di perangkat ini.',
		saving: 'Menyimpan pilihan',
	},
	is: {
		actionTimeInvalid:
			'Ekki tókst að vista því dagsetning og tími tækisins virðast röng. Lagaðu þau fyrst í Stillingum.',
		brandPlaceholder: 'Vörumerkið þitt hér',
		choiceExpired: 'Fyrra val þitt er útrunnið, svo við spyrjum aftur.',
		choicesSaved: 'Persónuverndarval vistað',
		dismissFailed:
			'Ekki tókst að loka þessari tilkynningu. Ekkert breyttist í þessu tæki.',
		experienceDescription: 'Lagar forritið að því hvernig þú notar það.',
		firstLayerDescription:
			'Þú ákveður hvaða notkun þú leyfir og getur skipt um skoðun hvenær sem er í Persónuverndastillingum.',
		functionalityDescription: 'Man stillingar þínar og val.',
		introduction:
			'Við notum gögn til að bæta upplifun þína, mæla hvernig forritið er notað og sýna viðeigandi auglýsingar.',
		marketingDescription: 'Sýnir þér viðeigandi auglýsingar.',
		measurementDescription:
			'Hjálpar okkur að skilja hvernig forritið er notað.',
		necessaryDescription: 'Nauðsynlegar til að forritið virki.',
		notOffered: 'Ekki í boði þar sem þú ert.',
		noticeAcknowledged: 'Persónuverndartilkynning staðfest',
		noticeDescription:
			'Þú getur skoðað þetta eða breytt því hvenær sem er í Persónuverndastillingum.',
		policyChanged:
			'Hvernig þetta forrit notar gögn hefur breyst frá síðasta vali þínu, svo við spyrjum aftur.',
		preferencesDescription:
			'Veldu hvers konar gagnanotkun þú leyfir. Breytingar taka gildi í þessu tæki um leið og þú vistar.',
		restrictedByGpc:
			'Slökkt því tækið þitt sendir Global Privacy Control-merki.',
		saveFailed:
			'Ekki tókst að vista valið þitt. Ekkert breyttist í þessu tæki.',
		saving: 'Vistar val',
	},
	it: {
		actionTimeInvalid:
			"Impossibile salvare perché la data e l'ora di questo dispositivo sembrano errate. Correggile prima in Impostazioni.",
		brandPlaceholder: 'Il tuo marchio qui',
		choiceExpired:
			'La tua scelta precedente è scaduta, quindi te lo chiediamo di nuovo.',
		choicesSaved: 'Scelte sulla privacy salvate',
		dismissFailed:
			'Impossibile chiudere questo avviso. Su questo dispositivo non è cambiato nulla.',
		experienceDescription: "Adatta l'app al modo in cui la usi.",
		firstLayerDescription:
			'Decidi tu quali usi consentire e puoi cambiare idea in qualsiasi momento in Impostazioni di privacy.',
		functionalityDescription: 'Ricorda le tue impostazioni e le tue scelte.',
		introduction:
			"Usiamo i dati per migliorare la tua esperienza, misurare come viene usata l'app e mostrare pubblicità pertinente.",
		marketingDescription: 'Mostra pubblicità pertinente per te.',
		measurementDescription: "Ci aiuta a capire come viene usata l'app.",
		necessaryDescription: "Necessari per il funzionamento dell'app.",
		notOffered: 'Non disponibile nella tua zona.',
		noticeAcknowledged: 'Informativa sulla privacy confermata',
		noticeDescription:
			'Puoi rivedere o modificare questa scelta in qualsiasi momento in Impostazioni di privacy.',
		policyChanged:
			'Il modo in cui questa app usa i dati è cambiato dalla tua ultima scelta, quindi te lo chiediamo di nuovo.',
		preferencesDescription:
			'Scegli quali tipi di uso dei dati consenti. Le modifiche si applicano su questo dispositivo non appena salvi.',
		restrictedByGpc:
			'Disattivato perché il tuo dispositivo invia un segnale Global Privacy Control.',
		saveFailed:
			'Impossibile salvare le tue scelte. Su questo dispositivo non è cambiato nulla.',
		saving: 'Salvataggio delle scelte',
	},
	ja: {
		actionTimeInvalid:
			'このデバイスの日付と時刻が正しくないため、保存できませんでした。先に設定で修正してください。',
		brandPlaceholder: 'ブランド名',
		choiceExpired:
			'以前の選択の有効期限が切れたため、もう一度お尋ねしています。',
		choicesSaved: 'プライバシーの選択を保存しました',
		dismissFailed:
			'このお知らせを閉じられませんでした。このデバイスでは何も変更されていません。',
		experienceDescription: 'ご利用方法に合わせてアプリを調整します。',
		firstLayerDescription:
			'どの利用を許可するかはお客様が決められます。プライバシー設定でいつでも変更できます。',
		functionalityDescription: '設定や選択内容を記憶します。',
		introduction:
			'データは、体験の向上、アプリの利用状況の測定、関連性の高い広告の表示に使用します。',
		marketingDescription: 'お客様に関連性の高い広告を表示します。',
		measurementDescription: 'アプリの利用状況を把握するのに役立ちます。',
		necessaryDescription: 'アプリの動作に必要です。',
		notOffered: 'お住まいの地域では提供されていません。',
		noticeAcknowledged: 'プライバシーに関するお知らせを確認しました',
		noticeDescription: 'プライバシー設定でいつでも確認や変更ができます。',
		policyChanged:
			'前回の選択以降、このアプリのデータの使い方が変わったため、もう一度お尋ねしています。',
		preferencesDescription:
			'許可するデータ利用の種類を選んでください。変更は保存するとすぐにこのデバイスに適用されます。',
		restrictedByGpc:
			'お使いのデバイスが Global Privacy Control 信号を送信しているため、オフになっています。',
		saveFailed:
			'選択内容を保存できませんでした。このデバイスでは何も変更されていません。',
		saving: '選択内容を保存しています',
	},
	kn: {
		actionTimeInvalid:
			'ಈ ಸಾಧನದ ದಿನಾಂಕ ಮತ್ತು ಸಮಯ ತಪ್ಪಾಗಿರುವಂತೆ ಕಾಣುವುದರಿಂದ ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮೊದಲು ಅವುಗಳನ್ನು ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಸರಿಪಡಿಸಿ.',
		brandPlaceholder: 'ನಿಮ್ಮ ಬ್ರ್ಯಾಂಡ್ ಇಲ್ಲಿ',
		choiceExpired: 'ನಿಮ್ಮ ಹಿಂದಿನ ಆಯ್ಕೆಯ ಅವಧಿ ಮುಗಿದಿದೆ, ಆದ್ದರಿಂದ ನಾವು ಮತ್ತೆ ಕೇಳುತ್ತಿದ್ದೇವೆ.',
		choicesSaved: 'ಗೌಪ್ಯತಾ ಆಯ್ಕೆಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ',
		dismissFailed: 'ಈ ಸೂಚನೆಯನ್ನು ಮುಚ್ಚಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಈ ಸಾಧನದಲ್ಲಿ ಏನೂ ಬದಲಾಗಿಲ್ಲ.',
		experienceDescription: 'ನೀವು ಆ್ಯಪ್ ಬಳಸುವ ರೀತಿಗೆ ಅದನ್ನು ಹೊಂದಿಸುತ್ತದೆ.',
		firstLayerDescription:
			'ಯಾವ ಬಳಕೆಗಳಿಗೆ ಅನುಮತಿ ನೀಡಬೇಕೆಂದು ನೀವೇ ನಿರ್ಧರಿಸುತ್ತೀರಿ, ಮತ್ತು ಗೌಪ್ಯತಾ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಯಾವಾಗ ಬೇಕಾದರೂ ನಿಮ್ಮ ನಿರ್ಧಾರ ಬದಲಿಸಬಹುದು.',
		functionalityDescription: 'ನಿಮ್ಮ ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಮತ್ತು ಆಯ್ಕೆಗಳನ್ನು ನೆನಪಿಡುತ್ತದೆ.',
		introduction:
			'ನಿಮ್ಮ ಅನುಭವವನ್ನು ಸುಧಾರಿಸಲು, ಆ್ಯಪ್ ಹೇಗೆ ಬಳಕೆಯಾಗುತ್ತದೆ ಎಂಬುದನ್ನು ಅಳೆಯಲು ಮತ್ತು ಸಂಬಂಧಿತ ಜಾಹೀರಾತುಗಳನ್ನು ತೋರಿಸಲು ನಾವು ಡೇಟಾವನ್ನು ಬಳಸುತ್ತೇವೆ.',
		marketingDescription: 'ನಿಮಗೆ ಸಂಬಂಧಿತ ಜಾಹೀರಾತುಗಳನ್ನು ತೋರಿಸುತ್ತದೆ.',
		measurementDescription:
			'ಆ್ಯಪ್ ಹೇಗೆ ಬಳಕೆಯಾಗುತ್ತದೆ ಎಂಬುದನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ನಮಗೆ ಸಹಾಯ ಮಾಡುತ್ತದೆ.',
		necessaryDescription: 'ಆ್ಯಪ್ ಕೆಲಸ ಮಾಡಲು ಅಗತ್ಯ.',
		notOffered: 'ನಿಮ್ಮ ಪ್ರದೇಶದಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ.',
		noticeAcknowledged: 'ಗೌಪ್ಯತಾ ಸೂಚನೆಯನ್ನು ಸ್ವೀಕರಿಸಲಾಗಿದೆ',
		noticeDescription:
			'ಗೌಪ್ಯತಾ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ನೀವು ಇದನ್ನು ಯಾವಾಗ ಬೇಕಾದರೂ ಪರಿಶೀಲಿಸಬಹುದು ಅಥವಾ ಬದಲಿಸಬಹುದು.',
		policyChanged:
			'ನಿಮ್ಮ ಕೊನೆಯ ಆಯ್ಕೆಯ ನಂತರ ಈ ಆ್ಯಪ್ ಡೇಟಾವನ್ನು ಬಳಸುವ ರೀತಿ ಬದಲಾಗಿದೆ, ಆದ್ದರಿಂದ ನಾವು ಮತ್ತೆ ಕೇಳುತ್ತಿದ್ದೇವೆ.',
		preferencesDescription:
			'ಯಾವ ರೀತಿಯ ಡೇಟಾ ಬಳಕೆಗೆ ಅನುಮತಿ ನೀಡುತ್ತೀರಿ ಎಂಬುದನ್ನು ಆಯ್ಕೆಮಾಡಿ. ನೀವು ಉಳಿಸಿದ ತಕ್ಷಣ ಬದಲಾವಣೆಗಳು ಈ ಸಾಧನದಲ್ಲಿ ಅನ್ವಯವಾಗುತ್ತವೆ.',
		restrictedByGpc:
			'ಆಫ್ ಆಗಿದೆ, ಏಕೆಂದರೆ ನಿಮ್ಮ ಸಾಧನ Global Privacy Control ಸಂಕೇತವನ್ನು ಕಳುಹಿಸುತ್ತದೆ.',
		saveFailed: 'ನಿಮ್ಮ ಆಯ್ಕೆಗಳನ್ನು ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಈ ಸಾಧನದಲ್ಲಿ ಏನೂ ಬದಲಾಗಿಲ್ಲ.',
		saving: 'ಆಯ್ಕೆಗಳನ್ನು ಉಳಿಸಲಾಗುತ್ತಿದೆ',
	},
	ko: {
		actionTimeInvalid:
			'이 기기의 날짜와 시간이 잘못된 것 같아 저장하지 못했습니다. 먼저 설정에서 수정하세요.',
		brandPlaceholder: '브랜드 이름',
		choiceExpired: '이전 선택이 만료되어 다시 여쭙니다.',
		choicesSaved: '개인정보 보호 선택이 저장되었습니다',
		dismissFailed:
			'이 안내를 닫지 못했습니다. 이 기기에서는 아무것도 변경되지 않았습니다.',
		experienceDescription: '사용 방식에 맞게 앱을 조정합니다.',
		firstLayerDescription:
			'어떤 용도를 허용할지는 직접 결정하며, 개인정보 보호 설정에서 언제든지 변경할 수 있습니다.',
		functionalityDescription: '설정과 선택 사항을 기억합니다.',
		introduction:
			'저희는 사용 경험을 개선하고, 앱 사용 방식을 측정하고, 관련성 높은 광고를 보여 주기 위해 데이터를 사용합니다.',
		marketingDescription: '관련성 높은 광고를 보여 줍니다.',
		measurementDescription: '앱이 어떻게 사용되는지 파악하는 데 도움이 됩니다.',
		necessaryDescription: '앱이 작동하는 데 필요합니다.',
		notOffered: '현재 지역에서는 제공되지 않습니다.',
		noticeAcknowledged: '개인정보 보호 안내를 확인했습니다',
		noticeDescription:
			'개인정보 보호 설정에서 언제든지 확인하거나 변경할 수 있습니다.',
		policyChanged:
			'마지막으로 선택한 이후 이 앱의 데이터 사용 방식이 바뀌어 다시 여쭙니다.',
		preferencesDescription:
			'허용할 데이터 사용 유형을 선택하세요. 변경 사항은 저장하는 즉시 이 기기에 적용됩니다.',
		restrictedByGpc:
			'기기가 Global Privacy Control 신호를 보내므로 꺼져 있습니다.',
		saveFailed:
			'선택 사항을 저장하지 못했습니다. 이 기기에서는 아무것도 변경되지 않았습니다.',
		saving: '선택 사항 저장 중',
	},
	lb: {
		actionTimeInvalid:
			'Konnt net gespäichert ginn, well Datum an Zäit vun dësem Apparat falsch schéngen. Korrigéiert se fir d’éischt an den Astellungen.',
		brandPlaceholder: 'Är Mark hei',
		choiceExpired: 'Är fréier Wiel ass ofgelaf, dofir froe mir nach eng Kéier.',
		choicesSaved: 'Privatsphär-Wiel gespäichert',
		dismissFailed:
			'Dësen Hiweis konnt net zougemaach ginn. Op dësem Apparat huet näischt geännert.',
		experienceDescription: 'Passt d’App un, wéi Dir se benotzt.',
		firstLayerDescription:
			'Dir entscheet, wéi eng Notzunge Dir erlaabt, an Dir kënnt Är Meenung ëmmer an de Privatsphär Astellungen änneren.',
		functionalityDescription: 'Behält Är Astellungen an Är Wiel.',
		introduction:
			'Mir benotzen Donnéeën, fir Är Erfarung ze verbesseren, ze moossen, wéi d’App benotzt gëtt, a relevant Reklamm ze weisen.',
		marketingDescription: 'Weist Iech Reklamm, déi fir Iech relevant ass.',
		measurementDescription: 'Hëlleft eis ze verstoen, wéi d’App benotzt gëtt.',
		necessaryDescription: 'Néideg, fir datt d’App funktionéiert.',
		notOffered: 'An Ärer Regioun net ugebueden.',
		noticeAcknowledged: 'Dateschutzhiweis confirméiert',
		noticeDescription:
			'Dir kënnt dat ëmmer an de Privatsphär Astellungen nokucken oder änneren.',
		policyChanged:
			'Zënter Ärer leschter Wiel huet sech geännert, wéi dës App Donnéeë benotzt, dofir froe mir nach eng Kéier.',
		preferencesDescription:
			'Wielt, wéi eng Zorte vun Donnéeënotzung Dir erlaabt. Ännerunge gëllen op dësem Apparat, soubal Dir späichert.',
		restrictedByGpc:
			'Aus, well Ären Apparat e Global-Privacy-Control-Signal schéckt.',
		saveFailed:
			'Är Wiel konnt net gespäichert ginn. Op dësem Apparat huet näischt geännert.',
		saving: 'Wiel gëtt gespäichert',
	},
	lt: {
		actionTimeInvalid:
			'Nepavyko išsaugoti, nes šio įrenginio data ir laikas atrodo neteisingi. Pirmiausia pataisykite juos nustatymuose.',
		brandPlaceholder: 'Jūsų prekės ženklas',
		choiceExpired:
			'Ankstesnio jūsų pasirinkimo galiojimas baigėsi, todėl klausiame dar kartą.',
		choicesSaved: 'Privatumo pasirinkimai išsaugoti',
		dismissFailed:
			'Nepavyko uždaryti šio pranešimo. Šiame įrenginyje niekas nepasikeitė.',
		experienceDescription: 'Pritaiko programėlę prie to, kaip ja naudojatės.',
		firstLayerDescription:
			'Jūs sprendžiate, kokius naudojimo būdus leisti, ir bet kada galite persigalvoti Privatumo nustatymuose.',
		functionalityDescription: 'Įsimena jūsų nustatymus ir pasirinkimus.',
		introduction:
			'Duomenis naudojame jūsų patirčiai gerinti, programėlės naudojimui matuoti ir aktualiai reklamai rodyti.',
		marketingDescription: 'Rodo jums aktualią reklamą.',
		measurementDescription: 'Padeda mums suprasti, kaip naudojama programėlė.',
		necessaryDescription: 'Būtini, kad programėlė veiktų.',
		notOffered: 'Jūsų regione nesiūloma.',
		noticeAcknowledged: 'Privatumo pranešimas patvirtintas',
		noticeDescription:
			'Tai bet kada galite peržiūrėti arba pakeisti Privatumo nustatymuose.',
		policyChanged:
			'Nuo paskutinio jūsų pasirinkimo pasikeitė, kaip ši programėlė naudoja duomenis, todėl klausiame dar kartą.',
		preferencesDescription:
			'Pasirinkite, kokį duomenų naudojimą leidžiate. Pakeitimai šiame įrenginyje įsigalioja vos išsaugojus.',
		restrictedByGpc:
			'Išjungta, nes jūsų įrenginys siunčia Global Privacy Control signalą.',
		saveFailed:
			'Nepavyko išsaugoti jūsų pasirinkimų. Šiame įrenginyje niekas nepasikeitė.',
		saving: 'Išsaugomi pasirinkimai',
	},
	lv: {
		actionTimeInvalid:
			'Neizdevās saglabāt, jo šīs ierīces datums un laiks šķiet nepareizi. Vispirms izlabojiet tos iestatījumos.',
		brandPlaceholder: 'Jūsu zīmols šeit',
		choiceExpired:
			'Jūsu iepriekšējās izvēles derīgums ir beidzies, tāpēc jautājam vēlreiz.',
		choicesSaved: 'Privātuma izvēle saglabāta',
		dismissFailed:
			'Šo paziņojumu neizdevās aizvērt. Šajā ierīcē nekas netika mainīts.',
		experienceDescription: 'Pielāgo lietotni tam, kā jūs to lietojat.',
		firstLayerDescription:
			'Jūs izlemjat, kādu izmantošanu atļaut, un jebkurā laikā varat pārdomāt sadaļā Privātuma iestatījumi.',
		functionalityDescription: 'Atceras jūsu iestatījumus un izvēles.',
		introduction:
			'Mēs izmantojam datus, lai uzlabotu jūsu pieredzi, mērītu, kā tiek lietota lietotne, un rādītu atbilstošas reklāmas.',
		marketingDescription: 'Rāda jums atbilstošas reklāmas.',
		measurementDescription: 'Palīdz mums saprast, kā tiek lietota lietotne.',
		necessaryDescription: 'Nepieciešamas, lai lietotne darbotos.',
		notOffered: 'Jūsu reģionā netiek piedāvāts.',
		noticeAcknowledged: 'Privātuma paziņojums apstiprināts',
		noticeDescription:
			'To jebkurā laikā varat pārskatīt vai mainīt sadaļā Privātuma iestatījumi.',
		policyChanged:
			'Kopš jūsu pēdējās izvēles ir mainījies tas, kā šī lietotne izmanto datus, tāpēc jautājam vēlreiz.',
		preferencesDescription:
			'Izvēlieties, kādu datu izmantošanu atļaujat. Izmaiņas šajā ierīcē stājas spēkā, tiklīdz saglabājat.',
		restrictedByGpc:
			'Izslēgts, jo jūsu ierīce sūta Global Privacy Control signālu.',
		saveFailed:
			'Jūsu izvēli neizdevās saglabāt. Šajā ierīcē nekas netika mainīts.',
		saving: 'Saglabā izvēli',
	},
	ml: {
		actionTimeInvalid:
			'ഈ ഉപകരണത്തിലെ തീയതിയും സമയവും തെറ്റാണെന്ന് തോന്നുന്നതിനാൽ സംരക്ഷിക്കാനായില്ല. ആദ്യം ക്രമീകരണങ്ങളിൽ അവ ശരിയാക്കുക.',
		brandPlaceholder: 'നിങ്ങളുടെ ബ്രാൻഡ് ഇവിടെ',
		choiceExpired:
			'നിങ്ങളുടെ മുൻ തിരഞ്ഞെടുപ്പിന്റെ കാലാവധി കഴിഞ്ഞു, അതിനാൽ ഞങ്ങൾ വീണ്ടും ചോദിക്കുന്നു.',
		choicesSaved: 'സ്വകാര്യതാ തിരഞ്ഞെടുപ്പുകൾ സംരക്ഷിച്ചു',
		dismissFailed: 'ഈ അറിയിപ്പ് അടയ്ക്കാനായില്ല. ഈ ഉപകരണത്തിൽ ഒന്നും മാറിയിട്ടില്ല.',
		experienceDescription:
			'നിങ്ങൾ ആപ്പ് ഉപയോഗിക്കുന്ന രീതിക്ക് അനുസരിച്ച് അതിനെ ക്രമീകരിക്കുന്നു.',
		firstLayerDescription:
			'ഏതൊക്കെ ഉപയോഗങ്ങൾ അനുവദിക്കണമെന്ന് നിങ്ങൾ തീരുമാനിക്കുന്നു, സ്വകാര്യതാ ക്രമീകരണങ്ങളിൽ എപ്പോൾ വേണമെങ്കിലും തീരുമാനം മാറ്റാം.',
		functionalityDescription: 'നിങ്ങളുടെ ക്രമീകരണങ്ങളും തിരഞ്ഞെടുപ്പുകളും ഓർമ്മിക്കുന്നു.',
		introduction:
			'നിങ്ങളുടെ അനുഭവം മെച്ചപ്പെടുത്താനും ആപ്പ് എങ്ങനെ ഉപയോഗിക്കുന്നുവെന്ന് അളക്കാനും പ്രസക്തമായ പരസ്യങ്ങൾ കാണിക്കാനും ഞങ്ങൾ ഡാറ്റ ഉപയോഗിക്കുന്നു.',
		marketingDescription: 'നിങ്ങൾക്ക് പ്രസക്തമായ പരസ്യങ്ങൾ കാണിക്കുന്നു.',
		measurementDescription:
			'ആപ്പ് എങ്ങനെ ഉപയോഗിക്കുന്നുവെന്ന് മനസ്സിലാക്കാൻ ഞങ്ങളെ സഹായിക്കുന്നു.',
		necessaryDescription: 'ആപ്പ് പ്രവർത്തിക്കാൻ ആവശ്യമാണ്.',
		notOffered: 'നിങ്ങളുടെ പ്രദേശത്ത് ലഭ്യമല്ല.',
		noticeAcknowledged: 'സ്വകാര്യതാ അറിയിപ്പ് സ്വീകരിച്ചു',
		noticeDescription:
			'സ്വകാര്യതാ ക്രമീകരണങ്ങളിൽ എപ്പോൾ വേണമെങ്കിലും നിങ്ങൾക്ക് ഇത് പരിശോധിക്കുകയോ മാറ്റുകയോ ചെയ്യാം.',
		policyChanged:
			'നിങ്ങളുടെ അവസാന തിരഞ്ഞെടുപ്പിന് ശേഷം ഈ ആപ്പ് ഡാറ്റ ഉപയോഗിക്കുന്ന രീതി മാറി, അതിനാൽ ഞങ്ങൾ വീണ്ടും ചോദിക്കുന്നു.',
		preferencesDescription:
			'ഏതുതരം ഡാറ്റാ ഉപയോഗം അനുവദിക്കണമെന്ന് തിരഞ്ഞെടുക്കുക. സംരക്ഷിച്ചാലുടൻ മാറ്റങ്ങൾ ഈ ഉപകരണത്തിൽ ബാധകമാകും.',
		restrictedByGpc:
			'ഓഫാണ്, കാരണം നിങ്ങളുടെ ഉപകരണം ഒരു Global Privacy Control സിഗ്നൽ അയയ്ക്കുന്നു.',
		saveFailed:
			'നിങ്ങളുടെ തിരഞ്ഞെടുപ്പുകൾ സംരക്ഷിക്കാനായില്ല. ഈ ഉപകരണത്തിൽ ഒന്നും മാറിയിട്ടില്ല.',
		saving: 'തിരഞ്ഞെടുപ്പുകൾ സംരക്ഷിക്കുന്നു',
	},
	mr: {
		actionTimeInvalid:
			'जतन करता आले नाही, कारण या डिव्हाइसची तारीख आणि वेळ चुकीची दिसते. आधी सेटिंग्जमध्ये ती दुरुस्त करा.',
		brandPlaceholder: 'तुमचा ब्रँड येथे',
		choiceExpired:
			'तुमच्या आधीच्या निवडीची मुदत संपली आहे, म्हणून आम्ही पुन्हा विचारत आहोत.',
		choicesSaved: 'गोपनीयता निवडी जतन केल्या',
		dismissFailed: 'ही सूचना बंद करता आली नाही. या डिव्हाइसवर काहीही बदलले नाही.',
		experienceDescription: 'तुम्ही अ‍ॅप जसे वापरता त्यानुसार ते जुळवून घेते.',
		firstLayerDescription:
			'कोणत्या वापरांना परवानगी द्यायची हे तुम्ही ठरवता, आणि गोपनीयता सेटिंग्जमध्ये कधीही तुमचा निर्णय बदलू शकता.',
		functionalityDescription: 'तुमच्या सेटिंग्ज आणि निवडी लक्षात ठेवते.',
		introduction:
			'तुमचा अनुभव सुधारण्यासाठी, अ‍ॅप कसे वापरले जाते हे मोजण्यासाठी आणि संबंधित जाहिराती दाखवण्यासाठी आम्ही डेटा वापरतो.',
		marketingDescription: 'तुमच्यासाठी संबंधित जाहिराती दाखवते.',
		measurementDescription: 'अ‍ॅप कसे वापरले जाते हे समजून घेण्यास आम्हाला मदत करते.',
		necessaryDescription: 'अ‍ॅप चालण्यासाठी आवश्यक.',
		notOffered: 'तुमच्या प्रदेशात उपलब्ध नाही.',
		noticeAcknowledged: 'गोपनीयता सूचना स्वीकारली',
		noticeDescription: 'गोपनीयता सेटिंग्जमध्ये तुम्ही हे कधीही तपासू किंवा बदलू शकता.',
		policyChanged:
			'तुमच्या शेवटच्या निवडीनंतर हे अ‍ॅप डेटा कसा वापरते ते बदलले आहे, म्हणून आम्ही पुन्हा विचारत आहोत.',
		preferencesDescription:
			'तुम्ही कोणत्या प्रकारच्या डेटा वापराला परवानगी देता ते निवडा. जतन करताच बदल या डिव्हाइसवर लागू होतात.',
		restrictedByGpc: 'बंद, कारण तुमचे डिव्हाइस Global Privacy Control सिग्नल पाठवते.',
		saveFailed:
			'तुमच्या निवडी जतन करता आल्या नाहीत. या डिव्हाइसवर काहीही बदलले नाही.',
		saving: 'निवडी जतन करत आहे',
	},
	ms: {
		actionTimeInvalid:
			'Tidak dapat menyimpan kerana tarikh dan masa peranti ini kelihatan salah. Betulkannya dahulu dalam Tetapan.',
		brandPlaceholder: 'Jenama anda di sini',
		choiceExpired:
			'Pilihan anda sebelum ini telah tamat tempoh, jadi kami bertanya semula.',
		choicesSaved: 'Pilihan privasi disimpan',
		dismissFailed:
			'Notis ini tidak dapat ditutup. Tiada apa-apa yang berubah pada peranti ini.',
		experienceDescription:
			'Menyesuaikan aplikasi dengan cara anda menggunakannya.',
		firstLayerDescription:
			'Anda yang menentukan penggunaan yang dibenarkan, dan anda boleh mengubah fikiran pada bila-bila masa dalam Tetapan Privasi.',
		functionalityDescription: 'Mengingati tetapan dan pilihan anda.',
		introduction:
			'Kami menggunakan data untuk menambah baik pengalaman anda, mengukur cara aplikasi digunakan dan memaparkan iklan yang berkaitan.',
		marketingDescription: 'Memaparkan iklan yang berkaitan dengan anda.',
		measurementDescription: 'Membantu kami memahami cara aplikasi digunakan.',
		necessaryDescription: 'Diperlukan supaya aplikasi berfungsi.',
		notOffered: 'Tidak ditawarkan di kawasan anda.',
		noticeAcknowledged: 'Notis privasi diakui',
		noticeDescription:
			'Anda boleh menyemak atau mengubahnya pada bila-bila masa dalam Tetapan Privasi.',
		policyChanged:
			'Cara aplikasi ini menggunakan data telah berubah sejak pilihan terakhir anda, jadi kami bertanya semula.',
		preferencesDescription:
			'Pilih jenis penggunaan data yang anda benarkan. Perubahan berkuat kuasa pada peranti ini sebaik sahaja anda menyimpan.',
		restrictedByGpc:
			'Dimatikan kerana peranti anda menghantar isyarat Global Privacy Control.',
		saveFailed:
			'Pilihan anda tidak dapat disimpan. Tiada apa-apa yang berubah pada peranti ini.',
		saving: 'Menyimpan pilihan',
	},
	mt: {
		actionTimeInvalid:
			'Ma setax jiġi ssejvjat għax id-data u l-ħin ta’ dan it-tagħmir jidhru ħżiena. Ikkoreġihom l-ewwel fis-Settings.',
		brandPlaceholder: 'Il-marka tiegħek hawn',
		choiceExpired:
			'L-għażla preċedenti tiegħek skadiet, għalhekk qed nerġgħu nistaqsuk.',
		choicesSaved: 'L-għażliet tal-privatezza ġew issejvjati',
		dismissFailed:
			'Dan l-avviż ma setax jingħalaq. Xejn ma nbidel fuq dan it-tagħmir.',
		experienceDescription: 'Tadatta l-app għall-mod kif tużaha.',
		firstLayerDescription:
			'Inti tiddeċiedi liema użi tippermetti, u tista’ tbiddel fehmtek fi kwalunkwe ħin fis-Settings tal-privatezza.',
		functionalityDescription: 'Tiftakar is-settings u l-għażliet tiegħek.',
		introduction:
			'Nużaw id-data biex intejbu l-esperjenza tiegħek, inkejlu kif tintuża l-app u nuru reklami rilevanti.',
		marketingDescription: 'Turik reklami rilevanti għalik.',
		measurementDescription: 'Tgħinna nifhmu kif tintuża l-app.',
		necessaryDescription: 'Meħtieġa biex taħdem l-app.',
		notOffered: 'Mhux offrut fejn tinsab.',
		noticeAcknowledged: 'L-avviż dwar il-privatezza ġie rikonoxxut',
		noticeDescription:
			'Tista’ tirrevedi jew tbiddel dan fi kwalunkwe ħin fis-Settings tal-privatezza.',
		policyChanged:
			'Il-mod kif din l-app tuża d-data nbidel mill-aħħar għażla tiegħek, għalhekk qed nerġgħu nistaqsuk.',
		preferencesDescription:
			'Agħżel liema tipi ta’ użu tad-data tippermetti. Il-bidliet japplikaw fuq dan it-tagħmir hekk kif tissejvja.',
		restrictedByGpc:
			'Mitfi għax it-tagħmir tiegħek jibgħat sinjal Global Privacy Control.',
		saveFailed:
			'L-għażliet tiegħek ma setgħux jiġu ssejvjati. Xejn ma nbidel fuq dan it-tagħmir.',
		saving: 'Qed jiġu ssejvjati l-għażliet',
	},
	nb: {
		actionTimeInvalid:
			'Kunne ikke lagre fordi dato og klokkeslett på denne enheten ser feil ut. Rett dem i Innstillinger først.',
		brandPlaceholder: 'Merkevaren din her',
		choiceExpired: 'Det forrige valget ditt har utløpt, så vi spør igjen.',
		choicesSaved: 'Personvernvalg lagret',
		dismissFailed:
			'Kunne ikke lukke denne meldingen. Ingenting er endret på denne enheten.',
		experienceDescription: 'Tilpasser appen til hvordan du bruker den.',
		firstLayerDescription:
			'Du bestemmer hvilke bruksområder du tillater, og du kan ombestemme deg når som helst i Personverninnstillinger.',
		functionalityDescription: 'Husker innstillingene og valgene dine.',
		introduction:
			'Vi bruker data til å forbedre opplevelsen din, måle hvordan appen brukes og vise relevant reklame.',
		marketingDescription: 'Viser reklame som er relevant for deg.',
		measurementDescription: 'Hjelper oss å forstå hvordan appen brukes.',
		necessaryDescription: 'Nødvendige for at appen skal fungere.',
		notOffered: 'Tilbys ikke der du er.',
		noticeAcknowledged: 'Personvernmelding bekreftet',
		noticeDescription:
			'Du kan se gjennom eller endre dette når som helst i Personverninnstillinger.',
		policyChanged:
			'Måten denne appen bruker data på, har endret seg siden det forrige valget ditt, så vi spør igjen.',
		preferencesDescription:
			'Velg hvilke typer databruk du tillater. Endringer gjelder på denne enheten så snart du lagrer.',
		restrictedByGpc:
			'Av fordi enheten din sender et Global Privacy Control-signal.',
		saveFailed:
			'Kunne ikke lagre valgene dine. Ingenting er endret på denne enheten.',
		saving: 'Lagrer valg',
	},
	nl: {
		actionTimeInvalid:
			'Opslaan is mislukt omdat de datum en tijd van dit apparaat niet lijken te kloppen. Corrigeer ze eerst in Instellingen.',
		brandPlaceholder: 'Jouw merk hier',
		choiceExpired: 'Je eerdere keuze is verlopen, dus we vragen het opnieuw.',
		choicesSaved: 'Privacykeuzes opgeslagen',
		dismissFailed:
			'Deze melding kon niet worden gesloten. Er is niets veranderd op dit apparaat.',
		experienceDescription: 'Past de app aan op hoe je hem gebruikt.',
		firstLayerDescription:
			'Jij bepaalt welk gebruik je toestaat, en je kunt op elk moment van gedachten veranderen in Privacy-instellingen.',
		functionalityDescription: 'Onthoudt je instellingen en keuzes.',
		introduction:
			'We gebruiken gegevens om je ervaring te verbeteren, te meten hoe de app wordt gebruikt en relevante advertenties te tonen.',
		marketingDescription: 'Toont advertenties die relevant voor je zijn.',
		measurementDescription: 'Helpt ons begrijpen hoe de app wordt gebruikt.',
		necessaryDescription: 'Nodig om de app te laten werken.',
		notOffered: 'Niet beschikbaar in jouw regio.',
		noticeAcknowledged: 'Privacymelding bevestigd',
		noticeDescription:
			'Je kunt dit op elk moment bekijken of wijzigen in Privacy-instellingen.',
		policyChanged:
			'Hoe deze app gegevens gebruikt, is veranderd sinds je laatste keuze, dus we vragen het opnieuw.',
		preferencesDescription:
			'Kies welk soort gegevensgebruik je toestaat. Wijzigingen gelden op dit apparaat zodra je opslaat.',
		restrictedByGpc:
			'Uit omdat je apparaat een Global Privacy Control-signaal verstuurt.',
		saveFailed:
			'Je keuzes konden niet worden opgeslagen. Er is niets veranderd op dit apparaat.',
		saving: 'Keuzes opslaan',
	},
	nn: {
		actionTimeInvalid:
			'Kunne ikkje lagre fordi dato og klokkeslett på denne eininga ser feil ut. Rett dei i Innstillingar først.',
		brandPlaceholder: 'Merkevara di her',
		choiceExpired: 'Det førre valet ditt har gått ut, så vi spør igjen.',
		choicesSaved: 'Personvernval lagra',
		dismissFailed:
			'Kunne ikkje lukke denne meldinga. Ingenting er endra på denne eininga.',
		experienceDescription: 'Tilpassar appen til korleis du brukar han.',
		firstLayerDescription:
			'Du bestemmer kva bruk du tillèt, og du kan ombestemme deg når som helst i Personverninnstillingar.',
		functionalityDescription: 'Hugsar innstillingane og vala dine.',
		introduction:
			'Vi brukar data til å gjere opplevinga di betre, måle korleis appen blir brukt og vise relevant reklame.',
		marketingDescription: 'Viser reklame som er relevant for deg.',
		measurementDescription: 'Hjelper oss å forstå korleis appen blir brukt.',
		necessaryDescription: 'Naudsynte for at appen skal fungere.',
		notOffered: 'Blir ikkje tilbode der du er.',
		noticeAcknowledged: 'Personvernmelding stadfesta',
		noticeDescription:
			'Du kan sjå gjennom eller endre dette når som helst i Personverninnstillingar.',
		policyChanged:
			'Måten denne appen brukar data på, har endra seg sidan det førre valet ditt, så vi spør igjen.',
		preferencesDescription:
			'Vel kva typar databruk du tillèt. Endringar gjeld på denne eininga så snart du lagrar.',
		restrictedByGpc:
			'Av fordi eininga di sender eit Global Privacy Control-signal.',
		saveFailed:
			'Kunne ikkje lagre vala dine. Ingenting er endra på denne eininga.',
		saving: 'Lagrar val',
	},
	pa: {
		actionTimeInvalid:
			'ਸੰਭਾਲਿਆ ਨਹੀਂ ਜਾ ਸਕਿਆ, ਕਿਉਂਕਿ ਇਸ ਡੀਵਾਈਸ ਦੀ ਮਿਤੀ ਅਤੇ ਸਮਾਂ ਗਲਤ ਲੱਗਦੇ ਹਨ। ਪਹਿਲਾਂ ਉਨ੍ਹਾਂ ਨੂੰ ਸੈਟਿੰਗਾਂ ਵਿੱਚ ਠੀਕ ਕਰੋ।',
		brandPlaceholder: 'ਤੁਹਾਡਾ ਬ੍ਰਾਂਡ ਇੱਥੇ',
		choiceExpired:
			'ਤੁਹਾਡੀ ਪਿਛਲੀ ਚੋਣ ਦੀ ਮਿਆਦ ਖਤਮ ਹੋ ਗਈ ਹੈ, ਇਸ ਲਈ ਅਸੀਂ ਦੁਬਾਰਾ ਪੁੱਛ ਰਹੇ ਹਾਂ।',
		choicesSaved: 'ਪਰਦੇਦਾਰੀ ਚੋਣਾਂ ਸੰਭਾਲੀਆਂ ਗਈਆਂ',
		dismissFailed: 'ਇਹ ਸੂਚਨਾ ਬੰਦ ਨਹੀਂ ਹੋ ਸਕੀ। ਇਸ ਡੀਵਾਈਸ ’ਤੇ ਕੁਝ ਨਹੀਂ ਬਦਲਿਆ।',
		experienceDescription: 'ਐਪ ਨੂੰ ਤੁਹਾਡੇ ਵਰਤਣ ਦੇ ਤਰੀਕੇ ਮੁਤਾਬਕ ਢਾਲਦਾ ਹੈ।',
		firstLayerDescription:
			'ਕਿਹੜੀਆਂ ਵਰਤੋਂਆਂ ਦੀ ਇਜਾਜ਼ਤ ਦੇਣੀ ਹੈ, ਇਹ ਤੁਸੀਂ ਤੈਅ ਕਰਦੇ ਹੋ, ਅਤੇ ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਵਿੱਚ ਕਦੇ ਵੀ ਆਪਣਾ ਫੈਸਲਾ ਬਦਲ ਸਕਦੇ ਹੋ।',
		functionalityDescription: 'ਤੁਹਾਡੀਆਂ ਸੈਟਿੰਗਾਂ ਅਤੇ ਚੋਣਾਂ ਯਾਦ ਰੱਖਦਾ ਹੈ।',
		introduction:
			'ਅਸੀਂ ਤੁਹਾਡਾ ਅਨੁਭਵ ਬਿਹਤਰ ਬਣਾਉਣ, ਐਪ ਦੀ ਵਰਤੋਂ ਮਾਪਣ ਅਤੇ ਢੁਕਵੇਂ ਇਸ਼ਤਿਹਾਰ ਦਿਖਾਉਣ ਲਈ ਡਾਟਾ ਵਰਤਦੇ ਹਾਂ।',
		marketingDescription: 'ਤੁਹਾਡੇ ਲਈ ਢੁਕਵੇਂ ਇਸ਼ਤਿਹਾਰ ਦਿਖਾਉਂਦਾ ਹੈ।',
		measurementDescription: 'ਐਪ ਦੀ ਵਰਤੋਂ ਕਿਵੇਂ ਹੁੰਦੀ ਹੈ, ਇਹ ਸਮਝਣ ਵਿੱਚ ਸਾਡੀ ਮਦਦ ਕਰਦਾ ਹੈ।',
		necessaryDescription: 'ਐਪ ਚੱਲਣ ਲਈ ਲੋੜੀਂਦੇ।',
		notOffered: 'ਤੁਹਾਡੇ ਖੇਤਰ ਵਿੱਚ ਉਪਲਬਧ ਨਹੀਂ।',
		noticeAcknowledged: 'ਪਰਦੇਦਾਰੀ ਸੂਚਨਾ ਸਵੀਕਾਰ ਕੀਤੀ ਗਈ',
		noticeDescription:
			'ਤੁਸੀਂ ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਵਿੱਚ ਕਦੇ ਵੀ ਇਸ ਦੀ ਸਮੀਖਿਆ ਕਰ ਸਕਦੇ ਹੋ ਜਾਂ ਇਸ ਨੂੰ ਬਦਲ ਸਕਦੇ ਹੋ।',
		policyChanged:
			'ਤੁਹਾਡੀ ਪਿਛਲੀ ਚੋਣ ਤੋਂ ਬਾਅਦ ਇਹ ਐਪ ਡਾਟਾ ਜਿਵੇਂ ਵਰਤਦਾ ਹੈ ਉਹ ਬਦਲ ਗਿਆ ਹੈ, ਇਸ ਲਈ ਅਸੀਂ ਦੁਬਾਰਾ ਪੁੱਛ ਰਹੇ ਹਾਂ।',
		preferencesDescription:
			'ਚੁਣੋ ਕਿ ਤੁਸੀਂ ਕਿਸ ਤਰ੍ਹਾਂ ਦੀ ਡਾਟਾ ਵਰਤੋਂ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦੇ ਹੋ। ਸੰਭਾਲਦੇ ਹੀ ਬਦਲਾਅ ਇਸ ਡੀਵਾਈਸ ’ਤੇ ਲਾਗੂ ਹੋ ਜਾਂਦੇ ਹਨ।',
		restrictedByGpc:
			'ਬੰਦ, ਕਿਉਂਕਿ ਤੁਹਾਡਾ ਡੀਵਾਈਸ Global Privacy Control ਸਿਗਨਲ ਭੇਜਦਾ ਹੈ।',
		saveFailed: 'ਤੁਹਾਡੀਆਂ ਚੋਣਾਂ ਸੰਭਾਲੀਆਂ ਨਹੀਂ ਜਾ ਸਕੀਆਂ। ਇਸ ਡੀਵਾਈਸ ’ਤੇ ਕੁਝ ਨਹੀਂ ਬਦਲਿਆ।',
		saving: 'ਚੋਣਾਂ ਸੰਭਾਲੀਆਂ ਜਾ ਰਹੀਆਂ ਹਨ',
	},
	pl: {
		actionTimeInvalid:
			'Nie udało się zapisać, ponieważ data i godzina na tym urządzeniu wyglądają na nieprawidłowe. Najpierw popraw je w Ustawieniach.',
		brandPlaceholder: 'Twoja marka',
		choiceExpired: 'Twój wcześniejszy wybór wygasł, więc pytamy ponownie.',
		choicesSaved: 'Wybory dotyczące prywatności zapisane',
		dismissFailed:
			'Nie udało się zamknąć tej informacji. Na tym urządzeniu nic się nie zmieniło.',
		experienceDescription:
			'Dopasowuje aplikację do tego, jak z niej korzystasz.',
		firstLayerDescription:
			'To Ty decydujesz, na jakie wykorzystanie się zgadzasz, i w każdej chwili możesz zmienić zdanie w Ustawieniach prywatności.',
		functionalityDescription: 'Zapamiętuje Twoje ustawienia i wybory.',
		introduction:
			'Używamy danych, aby ulepszać Twoje wrażenia, mierzyć, jak używana jest aplikacja, i wyświetlać trafne reklamy.',
		marketingDescription: 'Wyświetla reklamy dopasowane do Ciebie.',
		measurementDescription: 'Pomaga nam zrozumieć, jak używana jest aplikacja.',
		necessaryDescription: 'Niezbędne do działania aplikacji.',
		notOffered: 'Niedostępne w Twoim regionie.',
		noticeAcknowledged: 'Potwierdzono informację o prywatności',
		noticeDescription:
			'W każdej chwili możesz to przejrzeć lub zmienić w Ustawieniach prywatności.',
		policyChanged:
			'Od Twojego ostatniego wyboru zmienił się sposób, w jaki ta aplikacja używa danych, więc pytamy ponownie.',
		preferencesDescription:
			'Wybierz, na jakie rodzaje wykorzystania danych się zgadzasz. Zmiany obowiązują na tym urządzeniu od razu po zapisaniu.',
		restrictedByGpc:
			'Wyłączone, ponieważ Twoje urządzenie wysyła sygnał Global Privacy Control.',
		saveFailed:
			'Nie udało się zapisać Twoich wyborów. Na tym urządzeniu nic się nie zmieniło.',
		saving: 'Zapisywanie wyborów',
	},
	pt: {
		actionTimeInvalid:
			'Não foi possível salvar porque a data e a hora deste dispositivo parecem erradas. Corrija-as primeiro nos Ajustes do aparelho.',
		brandPlaceholder: 'Sua marca aqui',
		choiceExpired:
			'Sua escolha anterior expirou, por isso estamos perguntando de novo.',
		choicesSaved: 'Escolhas de privacidade salvas',
		dismissFailed:
			'Não foi possível fechar este aviso. Nada mudou neste dispositivo.',
		experienceDescription: 'Adapta o app à forma como você o usa.',
		firstLayerDescription:
			'Você decide quais usos permitir e pode mudar de ideia a qualquer momento em Configurações.',
		functionalityDescription: 'Lembra suas configurações e escolhas.',
		introduction:
			'Usamos dados para melhorar sua experiência, medir como o app é usado e mostrar publicidade relevante.',
		marketingDescription: 'Mostra publicidade relevante para você.',
		measurementDescription: 'Nos ajuda a entender como o app é usado.',
		necessaryDescription: 'Necessários para o app funcionar.',
		notOffered: 'Não disponível na sua região.',
		noticeAcknowledged: 'Aviso de privacidade confirmado',
		noticeDescription:
			'Você pode revisar ou alterar isso a qualquer momento em Configurações.',
		policyChanged:
			'A forma como este app usa dados mudou desde sua última escolha, por isso estamos perguntando de novo.',
		preferencesDescription:
			'Escolha quais tipos de uso de dados você permite. As alterações valem neste dispositivo assim que você salvar.',
		restrictedByGpc:
			'Desativado porque seu dispositivo envia um sinal Global Privacy Control.',
		saveFailed:
			'Não foi possível salvar suas escolhas. Nada mudou neste dispositivo.',
		saving: 'Salvando escolhas',
	},
	rm: {
		actionTimeInvalid:
			'Impussibel da memorisar, perquai che la data e l’ura da quest apparat paran fallidas. Curregi ellas l’emprim en las configuraziuns.',
		brandPlaceholder: 'Vossa marca qua',
		choiceExpired:
			'Vossa tscherna anteriura è scadida, perquai dumandain nus danovamain.',
		choicesSaved: 'Tschernas da la sfera privata memorisadas',
		dismissFailed:
			'Impussibel da serrar questa infurmaziun. Nagut n’è vegnì midà sin quest apparat.',
		experienceDescription: 'Adatta l’app a la moda co Vus l’utilisais.',
		firstLayerDescription:
			'Vus decidais tge utilisaziuns permetter, e Vus pudais midar opiniun da tut temp en las Configuraziuns da la sfera privata.',
		functionalityDescription:
			'Sa regorda da Vossas configuraziuns e tschernas.',
		introduction:
			'Nus utilisain datas per meglierar Vossa experientscha, per mesirar co l’app vegn utilisada e per mussar reclama relevanta.',
		marketingDescription: 'Mussa reclama relevanta per Vus.',
		measurementDescription: 'Ans gida a chapir co l’app vegn utilisada.',
		necessaryDescription: 'Necessari per che l’app funcziunia.',
		notOffered: 'Betg disponibel en Vossa regiun.',
		noticeAcknowledged: 'Infurmaziun davart la protecziun da datas confermada',
		noticeDescription:
			'Vus pudais controllar u midar quai da tut temp en las Configuraziuns da la sfera privata.',
		policyChanged:
			'La moda co questa app utilisescha datas è sa midada dapi Vossa ultima tscherna, perquai dumandain nus danovamain.',
		preferencesDescription:
			'Tschernai tge sorts d’utilisaziun da datas Vus permettais. Las midadas valan sin quest apparat uschespert che Vus memorisais.',
		restrictedByGpc:
			'Deactivà, perquai che Voss apparat trametta in signal Global Privacy Control.',
		saveFailed:
			'Impussibel da memorisar Vossas tschernas. Nagut n’è vegnì midà sin quest apparat.',
		saving: 'Las tschernas vegnan memorisadas',
	},
	ro: {
		actionTimeInvalid:
			'Nu s-a putut salva, deoarece data și ora acestui dispozitiv par greșite. Corectează-le mai întâi în Setări.',
		brandPlaceholder: 'Marca ta aici',
		choiceExpired:
			'Alegerea ta anterioară a expirat, așa că te întrebăm din nou.',
		choicesSaved: 'Alegerile de confidențialitate au fost salvate',
		dismissFailed:
			'Notificarea nu a putut fi închisă. Nimic nu s-a schimbat pe acest dispozitiv.',
		experienceDescription: 'Adaptează aplicația la felul în care o folosești.',
		firstLayerDescription:
			'Tu decizi ce utilizări permiți și te poți răzgândi oricând din Setări de confidențialitate.',
		functionalityDescription: 'Reține setările și alegerile tale.',
		introduction:
			'Folosim date pentru a-ți îmbunătăți experiența, a măsura cum este folosită aplicația și a afișa publicitate relevantă.',
		marketingDescription: 'Afișează publicitate relevantă pentru tine.',
		measurementDescription:
			'Ne ajută să înțelegem cum este folosită aplicația.',
		necessaryDescription: 'Necesare pentru ca aplicația să funcționeze.',
		notOffered: 'Nu este disponibil în regiunea ta.',
		noticeAcknowledged:
			'Notificarea privind confidențialitatea a fost confirmată',
		noticeDescription:
			'Poți verifica sau schimba asta oricând din Setări de confidențialitate.',
		policyChanged:
			'Modul în care această aplicație folosește datele s-a schimbat de la ultima ta alegere, așa că te întrebăm din nou.',
		preferencesDescription:
			'Alege ce tipuri de utilizare a datelor permiți. Modificările se aplică pe acest dispozitiv imediat ce salvezi.',
		restrictedByGpc:
			'Dezactivat deoarece dispozitivul tău trimite un semnal Global Privacy Control.',
		saveFailed:
			'Alegerile tale nu au putut fi salvate. Nimic nu s-a schimbat pe acest dispozitiv.',
		saving: 'Se salvează alegerile',
	},
	ru: {
		actionTimeInvalid:
			'Не удалось сохранить: дата и время на этом устройстве выглядят неверными. Сначала исправьте их в настройках.',
		brandPlaceholder: 'Ваш бренд',
		choiceExpired:
			'Срок действия вашего прежнего выбора истёк, поэтому мы спрашиваем снова.',
		choicesSaved: 'Выбор конфиденциальности сохранён',
		dismissFailed:
			'Не удалось закрыть это уведомление. На этом устройстве ничего не изменилось.',
		experienceDescription:
			'Подстраивает приложение под то, как вы им пользуетесь.',
		firstLayerDescription:
			'Вы сами решаете, какое использование разрешить, и можете передумать в любое время в настройках конфиденциальности.',
		functionalityDescription: 'Запоминает ваши настройки и выбор.',
		introduction:
			'Мы используем данные, чтобы улучшать ваш опыт, измерять, как используется приложение, и показывать подходящую рекламу.',
		marketingDescription: 'Показывает рекламу, которая вам подходит.',
		measurementDescription: 'Помогает нам понять, как используется приложение.',
		necessaryDescription: 'Нужны для работы приложения.',
		notOffered: 'Недоступно в вашем регионе.',
		noticeAcknowledged: 'Уведомление о конфиденциальности принято',
		noticeDescription:
			'Вы можете просмотреть или изменить это в любое время в настройках конфиденциальности.',
		policyChanged:
			'С момента вашего последнего выбора изменилось то, как это приложение использует данные, поэтому мы спрашиваем снова.',
		preferencesDescription:
			'Выберите, какие виды использования данных вы разрешаете. Изменения вступают в силу на этом устройстве сразу после сохранения.',
		restrictedByGpc:
			'Выключено, потому что ваше устройство отправляет сигнал Global Privacy Control.',
		saveFailed:
			'Не удалось сохранить ваш выбор. На этом устройстве ничего не изменилось.',
		saving: 'Сохранение выбора',
	},
	sk: {
		actionTimeInvalid:
			'Uloženie zlyhalo, pretože dátum a čas tohto zariadenia vyzerajú nesprávne. Najprv ich opravte v Nastaveniach.',
		brandPlaceholder: 'Vaša značka',
		choiceExpired:
			'Platnosť vašej predchádzajúcej voľby vypršala, preto sa pýtame znova.',
		choicesSaved: 'Voľby súkromia uložené',
		dismissFailed:
			'Toto oznámenie sa nepodarilo zavrieť. V tomto zariadení sa nič nezmenilo.',
		experienceDescription: 'Prispôsobuje aplikáciu tomu, ako ju používate.',
		firstLayerDescription:
			'Sami rozhodujete, ktoré použitia povolíte, a svoj názor môžete kedykoľvek zmeniť v Nastaveniach súkromia.',
		functionalityDescription: 'Pamätá si vaše nastavenia a voľby.',
		introduction:
			'Údaje používame na zlepšenie vášho zážitku, na meranie toho, ako sa aplikácia používa, a na zobrazovanie relevantnej reklamy.',
		marketingDescription: 'Zobrazuje reklamu, ktorá je pre vás relevantná.',
		measurementDescription: 'Pomáha nám pochopiť, ako sa aplikácia používa.',
		necessaryDescription: 'Potrebné na fungovanie aplikácie.',
		notOffered: 'Vo vašej oblasti nie je k dispozícii.',
		noticeAcknowledged: 'Oznámenie o ochrane súkromia potvrdené',
		noticeDescription:
			'Toto môžete kedykoľvek skontrolovať alebo zmeniť v Nastaveniach súkromia.',
		policyChanged:
			'Spôsob, akým táto aplikácia používa údaje, sa od vašej poslednej voľby zmenil, preto sa pýtame znova.',
		preferencesDescription:
			'Vyberte, aké druhy použitia údajov povolíte. Zmeny platia v tomto zariadení hneď po uložení.',
		restrictedByGpc:
			'Vypnuté, pretože vaše zariadenie odosiela signál Global Privacy Control.',
		saveFailed:
			'Vaše voľby sa nepodarilo uložiť. V tomto zariadení sa nič nezmenilo.',
		saving: 'Ukladanie volieb',
	},
	sl: {
		actionTimeInvalid:
			'Shranjevanje ni uspelo, ker sta datum in čas v tej napravi videti napačna. Najprej ju popravite v Nastavitvah.',
		brandPlaceholder: 'Vaša blagovna znamka',
		choiceExpired:
			'Vaša prejšnja izbira je potekla, zato vas sprašujemo znova.',
		choicesSaved: 'Izbire glede zasebnosti so shranjene',
		dismissFailed:
			'Tega obvestila ni bilo mogoče zapreti. V tej napravi se ni nič spremenilo.',
		experienceDescription: 'Prilagodi aplikacijo načinu, kako jo uporabljate.',
		firstLayerDescription:
			'Sami se odločite, katere uporabe dovolite, in si lahko kadar koli premislite v Nastavitvah zasebnosti.',
		functionalityDescription: 'Zapomni si vaše nastavitve in izbire.',
		introduction:
			'Podatke uporabljamo za izboljšanje vaše izkušnje, merjenje uporabe aplikacije in prikazovanje ustreznih oglasov.',
		marketingDescription: 'Prikazuje oglase, ki so za vas ustrezni.',
		measurementDescription:
			'Pomaga nam razumeti, kako se aplikacija uporablja.',
		necessaryDescription: 'Potrebni za delovanje aplikacije.',
		notOffered: 'Ni na voljo v vaši regiji.',
		noticeAcknowledged: 'Obvestilo o zasebnosti potrjeno',
		noticeDescription:
			'To lahko kadar koli pregledate ali spremenite v Nastavitvah zasebnosti.',
		policyChanged:
			'Način, kako ta aplikacija uporablja podatke, se je od vaše zadnje izbire spremenil, zato vas sprašujemo znova.',
		preferencesDescription:
			'Izberite, katere vrste uporabe podatkov dovolite. Spremembe v tej napravi začnejo veljati takoj, ko shranite.',
		restrictedByGpc:
			'Izklopljeno, ker vaša naprava pošilja signal Global Privacy Control.',
		saveFailed:
			'Vaših izbir ni bilo mogoče shraniti. V tej napravi se ni nič spremenilo.',
		saving: 'Shranjevanje izbir',
	},
	sv: {
		actionTimeInvalid:
			'Det gick inte att spara eftersom enhetens datum och tid ser fel ut. Rätta dem först i Inställningar.',
		brandPlaceholder: 'Ditt varumärke här',
		choiceExpired: 'Ditt tidigare val har gått ut, så vi frågar igen.',
		choicesSaved: 'Integritetsval sparade',
		dismissFailed:
			'Det gick inte att stänga meddelandet. Ingenting har ändrats på den här enheten.',
		experienceDescription: 'Anpassar appen efter hur du använder den.',
		firstLayerDescription:
			'Du bestämmer vilka användningar du tillåter, och du kan ändra dig när som helst i Integritetsinställningar.',
		functionalityDescription: 'Kommer ihåg dina inställningar och val.',
		introduction:
			'Vi använder data för att förbättra din upplevelse, mäta hur appen används och visa relevant reklam.',
		marketingDescription: 'Visar reklam som är relevant för dig.',
		measurementDescription: 'Hjälper oss att förstå hur appen används.',
		necessaryDescription: 'Krävs för att appen ska fungera.',
		notOffered: 'Erbjuds inte där du befinner dig.',
		noticeAcknowledged: 'Integritetsmeddelandet har bekräftats',
		noticeDescription:
			'Du kan granska eller ändra detta när som helst i Integritetsinställningar.',
		policyChanged:
			'Hur appen använder data har ändrats sedan ditt senaste val, så vi frågar igen.',
		preferencesDescription:
			'Välj vilka typer av dataanvändning du tillåter. Ändringar gäller på den här enheten så fort du sparar.',
		restrictedByGpc:
			'Av eftersom din enhet skickar en Global Privacy Control-signal.',
		saveFailed:
			'Det gick inte att spara dina val. Ingenting har ändrats på den här enheten.',
		saving: 'Sparar val',
	},
	ta: {
		actionTimeInvalid:
			'இந்தச் சாதனத்தின் தேதியும் நேரமும் தவறாகத் தெரிவதால் சேமிக்க முடியவில்லை. முதலில் அமைப்புகளில் அவற்றைச் சரிசெய்யவும்.',
		brandPlaceholder: 'உங்கள் பிராண்ட் இங்கே',
		choiceExpired: 'உங்கள் முந்தைய தேர்வின் காலம் முடிந்துவிட்டது, அதனால் மீண்டும் கேட்கிறோம்.',
		choicesSaved: 'தனியுரிமைத் தேர்வுகள் சேமிக்கப்பட்டன',
		dismissFailed: 'இந்த அறிவிப்பை மூட முடியவில்லை. இந்தச் சாதனத்தில் எதுவும் மாறவில்லை.',
		experienceDescription:
			'நீங்கள் ஆப்ஸைப் பயன்படுத்தும் விதத்திற்கு ஏற்ப அதை மாற்றியமைக்கிறது.',
		firstLayerDescription:
			'எந்தப் பயன்பாடுகளை அனுமதிப்பது என்பதை நீங்களே முடிவு செய்கிறீர்கள், தனியுரிமை அமைப்புகளில் எப்போது வேண்டுமானாலும் உங்கள் முடிவை மாற்றலாம்.',
		functionalityDescription: 'உங்கள் அமைப்புகளையும் தேர்வுகளையும் நினைவில் வைக்கிறது.',
		introduction:
			'உங்கள் அனுபவத்தை மேம்படுத்தவும், ஆப்ஸ் எவ்வாறு பயன்படுத்தப்படுகிறது என்பதை அளவிடவும், தொடர்புடைய விளம்பரங்களைக் காட்டவும் தரவைப் பயன்படுத்துகிறோம்.',
		marketingDescription: 'உங்களுக்குத் தொடர்புடைய விளம்பரங்களைக் காட்டுகிறது.',
		measurementDescription:
			'ஆப்ஸ் எவ்வாறு பயன்படுத்தப்படுகிறது என்பதைப் புரிந்துகொள்ள எங்களுக்கு உதவுகிறது.',
		necessaryDescription: 'ஆப்ஸ் செயல்படத் தேவையானவை.',
		notOffered: 'உங்கள் பகுதியில் கிடைக்கவில்லை.',
		noticeAcknowledged: 'தனியுரிமை அறிவிப்பு ஏற்கப்பட்டது',
		noticeDescription:
			'தனியுரிமை அமைப்புகளில் எப்போது வேண்டுமானாலும் இதை மதிப்பாய்வு செய்யலாம் அல்லது மாற்றலாம்.',
		policyChanged:
			'உங்கள் கடைசித் தேர்வுக்குப் பிறகு இந்த ஆப்ஸ் தரவைப் பயன்படுத்தும் விதம் மாறியுள்ளது, அதனால் மீண்டும் கேட்கிறோம்.',
		preferencesDescription:
			'எந்த வகையான தரவுப் பயன்பாட்டை அனுமதிக்கிறீர்கள் என்பதைத் தேர்வுசெய்யவும். சேமித்தவுடன் மாற்றங்கள் இந்தச் சாதனத்தில் பொருந்தும்.',
		restrictedByGpc:
			'முடக்கப்பட்டுள்ளது, ஏனெனில் உங்கள் சாதனம் Global Privacy Control சிக்னலை அனுப்புகிறது.',
		saveFailed:
			'உங்கள் தேர்வுகளைச் சேமிக்க முடியவில்லை. இந்தச் சாதனத்தில் எதுவும் மாறவில்லை.',
		saving: 'தேர்வுகள் சேமிக்கப்படுகின்றன',
	},
	te: {
		actionTimeInvalid:
			'ఈ పరికరం తేదీ, సమయం తప్పుగా కనిపిస్తున్నందున సేవ్ చేయలేకపోయాం. ముందుగా సెట్టింగ్‌లలో వాటిని సరిచేయండి.',
		brandPlaceholder: 'మీ బ్రాండ్ ఇక్కడ',
		choiceExpired: 'మీ మునుపటి ఎంపిక గడువు ముగిసింది, అందుకే మళ్లీ అడుగుతున్నాం.',
		choicesSaved: 'గోప్యతా ఎంపికలు సేవ్ అయ్యాయి',
		dismissFailed: 'ఈ నోటీసును మూసివేయలేకపోయాం. ఈ పరికరంలో ఏదీ మారలేదు.',
		experienceDescription: 'మీరు యాప్‌ను ఉపయోగించే విధానానికి అనుగుణంగా దాన్ని మారుస్తుంది.',
		firstLayerDescription:
			'ఏ వినియోగాలను అనుమతించాలో మీరే నిర్ణయిస్తారు, గోప్యతా సెట్టింగ్‌లలో ఎప్పుడైనా మీ నిర్ణయాన్ని మార్చుకోవచ్చు.',
		functionalityDescription: 'మీ సెట్టింగ్‌లు, ఎంపికలను గుర్తుంచుకుంటుంది.',
		introduction:
			'మీ అనుభవాన్ని మెరుగుపరచడానికి, యాప్ ఎలా ఉపయోగించబడుతుందో కొలవడానికి, సంబంధిత ప్రకటనలు చూపడానికి మేము డేటాను ఉపయోగిస్తాము.',
		marketingDescription: 'మీకు సంబంధించిన ప్రకటనలను చూపుతుంది.',
		measurementDescription: 'యాప్ ఎలా ఉపయోగించబడుతుందో అర్థం చేసుకోవడానికి మాకు సహాయపడుతుంది.',
		necessaryDescription: 'యాప్ పని చేయడానికి అవసరం.',
		notOffered: 'మీ ప్రాంతంలో అందుబాటులో లేదు.',
		noticeAcknowledged: 'గోప్యతా నోటీసు ఆమోదించబడింది',
		noticeDescription: 'గోప్యతా సెట్టింగ్‌లలో మీరు దీన్ని ఎప్పుడైనా సమీక్షించవచ్చు లేదా మార్చవచ్చు.',
		policyChanged:
			'మీ చివరి ఎంపిక తర్వాత ఈ యాప్ డేటాను ఉపయోగించే విధానం మారింది, అందుకే మళ్లీ అడుగుతున్నాం.',
		preferencesDescription:
			'మీరు ఏ రకమైన డేటా వినియోగాన్ని అనుమతిస్తారో ఎంచుకోండి. సేవ్ చేసిన వెంటనే మార్పులు ఈ పరికరంలో వర్తిస్తాయి.',
		restrictedByGpc:
			'ఆఫ్‌లో ఉంది, ఎందుకంటే మీ పరికరం Global Privacy Control సిగ్నల్‌ను పంపుతుంది.',
		saveFailed: 'మీ ఎంపికలను సేవ్ చేయలేకపోయాం. ఈ పరికరంలో ఏదీ మారలేదు.',
		saving: 'ఎంపికలను సేవ్ చేస్తోంది',
	},
	th: {
		actionTimeInvalid:
			'บันทึกไม่ได้เพราะวันที่และเวลาของอุปกรณ์นี้ดูไม่ถูกต้อง โปรดแก้ไขในการตั้งค่าก่อน',
		brandPlaceholder: 'แบรนด์ของคุณ',
		choiceExpired: 'ตัวเลือกก่อนหน้าของคุณหมดอายุแล้ว เราจึงขอถามอีกครั้ง',
		choicesSaved: 'บันทึกตัวเลือกความเป็นส่วนตัวแล้ว',
		dismissFailed: 'ปิดประกาศนี้ไม่ได้ ไม่มีการเปลี่ยนแปลงใดในอุปกรณ์นี้',
		experienceDescription: 'ปรับแอปให้เข้ากับวิธีที่คุณใช้งาน',
		firstLayerDescription:
			'คุณเป็นผู้ตัดสินใจว่าจะอนุญาตการใช้งานแบบใด และเปลี่ยนใจได้ทุกเมื่อในการตั้งค่าความเป็นส่วนตัว',
		functionalityDescription: 'จดจำการตั้งค่าและตัวเลือกของคุณ',
		introduction:
			'เราใช้ข้อมูลเพื่อปรับปรุงประสบการณ์ของคุณ วัดผลการใช้งานแอป และแสดงโฆษณาที่เกี่ยวข้อง',
		marketingDescription: 'แสดงโฆษณาที่เกี่ยวข้องกับคุณ',
		measurementDescription: 'ช่วยให้เราเข้าใจว่ามีการใช้งานแอปอย่างไร',
		necessaryDescription: 'จำเป็นต่อการทำงานของแอป',
		notOffered: 'ไม่มีให้บริการในพื้นที่ของคุณ',
		noticeAcknowledged: 'รับทราบประกาศความเป็นส่วนตัวแล้ว',
		noticeDescription: 'คุณตรวจสอบหรือเปลี่ยนแปลงได้ทุกเมื่อในการตั้งค่าความเป็นส่วนตัว',
		policyChanged: 'วิธีที่แอปนี้ใช้ข้อมูลเปลี่ยนไปตั้งแต่ตัวเลือกล่าสุดของคุณ เราจึงขอถามอีกครั้ง',
		preferencesDescription:
			'เลือกประเภทการใช้ข้อมูลที่คุณอนุญาต การเปลี่ยนแปลงจะมีผลในอุปกรณ์นี้ทันทีที่คุณบันทึก',
		restrictedByGpc: 'ปิดอยู่เพราะอุปกรณ์ของคุณส่งสัญญาณ Global Privacy Control',
		saveFailed: 'บันทึกตัวเลือกของคุณไม่ได้ ไม่มีการเปลี่ยนแปลงใดในอุปกรณ์นี้',
		saving: 'กำลังบันทึกตัวเลือก',
	},
	tr: {
		actionTimeInvalid:
			'Bu cihazın tarihi ve saati yanlış göründüğü için kaydedilemedi. Önce bunları Ayarlar’da düzeltin.',
		brandPlaceholder: 'Markanız burada',
		choiceExpired:
			'Önceki seçiminizin süresi doldu, bu yüzden yeniden soruyoruz.',
		choicesSaved: 'Gizlilik seçimleri kaydedildi',
		dismissFailed: 'Bu bildirim kapatılamadı. Bu cihazda hiçbir şey değişmedi.',
		experienceDescription: 'Uygulamayı kullanım şeklinize göre uyarlar.',
		firstLayerDescription:
			'Hangi kullanımlara izin vereceğinize siz karar verirsiniz ve fikrinizi istediğiniz zaman Gizlilik Ayarları’ndan değiştirebilirsiniz.',
		functionalityDescription: 'Ayarlarınızı ve seçimlerinizi hatırlar.',
		introduction:
			'Verileri deneyiminizi iyileştirmek, uygulamanın nasıl kullanıldığını ölçmek ve ilgili reklamlar göstermek için kullanırız.',
		marketingDescription: 'Sizinle ilgili reklamlar gösterir.',
		measurementDescription:
			'Uygulamanın nasıl kullanıldığını anlamamıza yardımcı olur.',
		necessaryDescription: 'Uygulamanın çalışması için gereklidir.',
		notOffered: 'Bulunduğunuz bölgede sunulmuyor.',
		noticeAcknowledged: 'Gizlilik bildirimi onaylandı',
		noticeDescription:
			'Bunu istediğiniz zaman Gizlilik Ayarları’ndan inceleyebilir veya değiştirebilirsiniz.',
		policyChanged:
			'Son seçiminizden bu yana bu uygulamanın verileri kullanma şekli değişti, bu yüzden yeniden soruyoruz.',
		preferencesDescription:
			'Hangi tür veri kullanımına izin verdiğinizi seçin. Değişiklikler kaydettiğiniz anda bu cihazda geçerli olur.',
		restrictedByGpc:
			'Kapalı, çünkü cihazınız Global Privacy Control sinyali gönderiyor.',
		saveFailed: 'Seçimleriniz kaydedilemedi. Bu cihazda hiçbir şey değişmedi.',
		saving: 'Seçimler kaydediliyor',
	},
	ur: {
		actionTimeInvalid:
			'محفوظ نہیں ہو سکا کیونکہ اس ڈیوائس کی تاریخ اور وقت غلط لگتے ہیں۔ پہلے انہیں ترتیبات میں درست کریں۔',
		brandPlaceholder: 'آپ کا برانڈ یہاں',
		choiceExpired:
			'آپ کے پچھلے انتخاب کی مدت ختم ہو گئی ہے، اس لیے ہم دوبارہ پوچھ رہے ہیں۔',
		choicesSaved: 'رازداری کے انتخاب محفوظ ہو گئے',
		dismissFailed: 'یہ نوٹس بند نہیں ہو سکا۔ اس ڈیوائس پر کچھ نہیں بدلا۔',
		experienceDescription: 'ایپ کو آپ کے استعمال کے طریقے کے مطابق ڈھالتی ہیں۔',
		firstLayerDescription:
			'کن استعمالات کی اجازت دینی ہے یہ آپ طے کرتے ہیں، اور رازداری کی ترتیبات میں کسی بھی وقت اپنا فیصلہ بدل سکتے ہیں۔',
		functionalityDescription: 'آپ کی ترتیبات اور انتخاب یاد رکھتی ہیں۔',
		introduction:
			'ہم آپ کے تجربے کو بہتر بنانے، ایپ کے استعمال کی پیمائش کرنے اور متعلقہ اشتہارات دکھانے کے لیے ڈیٹا استعمال کرتے ہیں۔',
		marketingDescription: 'آپ کے لیے متعلقہ اشتہارات دکھاتی ہیں۔',
		measurementDescription:
			'یہ سمجھنے میں ہماری مدد کرتی ہیں کہ ایپ کیسے استعمال ہوتی ہے۔',
		necessaryDescription: 'ایپ کے کام کرنے کے لیے ضروری۔',
		notOffered: 'آپ کے علاقے میں دستیاب نہیں۔',
		noticeAcknowledged: 'رازداری کا نوٹس تسلیم کر لیا گیا',
		noticeDescription:
			'آپ رازداری کی ترتیبات میں کسی بھی وقت اس کا جائزہ لے سکتے ہیں یا اسے بدل سکتے ہیں۔',
		policyChanged:
			'آپ کے پچھلے انتخاب کے بعد سے یہ ایپ ڈیٹا جس طرح استعمال کرتی ہے وہ بدل گیا ہے، اس لیے ہم دوبارہ پوچھ رہے ہیں۔',
		preferencesDescription:
			'منتخب کریں کہ آپ کس قسم کے ڈیٹا کے استعمال کی اجازت دیتے ہیں۔ محفوظ کرتے ہی تبدیلیاں اس ڈیوائس پر لاگو ہو جاتی ہیں۔',
		restrictedByGpc:
			'بند ہے کیونکہ آپ کی ڈیوائس Global Privacy Control سگنل بھیجتی ہے۔',
		saveFailed: 'آپ کے انتخاب محفوظ نہیں ہو سکے۔ اس ڈیوائس پر کچھ نہیں بدلا۔',
		saving: 'انتخاب محفوظ ہو رہے ہیں',
	},
	vi: {
		actionTimeInvalid:
			'Không thể lưu vì ngày giờ trên thiết bị này có vẻ không đúng. Hãy sửa lại trong Cài đặt trước.',
		brandPlaceholder: 'Thương hiệu của bạn',
		choiceExpired:
			'Lựa chọn trước đây của bạn đã hết hạn, vì vậy chúng tôi hỏi lại.',
		choicesSaved: 'Đã lưu lựa chọn quyền riêng tư',
		dismissFailed:
			'Không thể đóng thông báo này. Không có gì thay đổi trên thiết bị này.',
		experienceDescription: 'Điều chỉnh ứng dụng theo cách bạn sử dụng.',
		firstLayerDescription:
			'Bạn quyết định cho phép những mục đích sử dụng nào và có thể đổi ý bất cứ lúc nào trong Cài đặt quyền riêng tư.',
		functionalityDescription: 'Ghi nhớ cài đặt và lựa chọn của bạn.',
		introduction:
			'Chúng tôi dùng dữ liệu để cải thiện trải nghiệm của bạn, đo lường cách ứng dụng được sử dụng và hiển thị quảng cáo phù hợp.',
		marketingDescription: 'Hiển thị quảng cáo phù hợp với bạn.',
		measurementDescription: 'Giúp chúng tôi hiểu cách ứng dụng được sử dụng.',
		necessaryDescription: 'Cần thiết để ứng dụng hoạt động.',
		notOffered: 'Không có ở khu vực của bạn.',
		noticeAcknowledged: 'Đã xác nhận thông báo về quyền riêng tư',
		noticeDescription:
			'Bạn có thể xem lại hoặc thay đổi điều này bất cứ lúc nào trong Cài đặt quyền riêng tư.',
		policyChanged:
			'Cách ứng dụng này sử dụng dữ liệu đã thay đổi kể từ lựa chọn gần nhất của bạn, vì vậy chúng tôi hỏi lại.',
		preferencesDescription:
			'Chọn những loại sử dụng dữ liệu bạn cho phép. Thay đổi có hiệu lực trên thiết bị này ngay khi bạn lưu.',
		restrictedByGpc:
			'Đang tắt vì thiết bị của bạn gửi tín hiệu Global Privacy Control.',
		saveFailed:
			'Không thể lưu lựa chọn của bạn. Không có gì thay đổi trên thiết bị này.',
		saving: 'Đang lưu lựa chọn',
	},
	yi: {
		actionTimeInvalid:
			'מע האָט נישט געקענט אױפֿהיטן, װײַל די דאַטע און צײַט פֿון דעם מכשיר זעען אױס פֿאַלש. פֿאַרריכט זײ צוערשט אין די אײַנשטעלונגען.',
		brandPlaceholder: 'אײַער מאַרקע דאָ',
		choiceExpired:
			'אײַער פֿריִערדיקע ברירה איז אױסגעגאַנגען, דערפֿאַר פֿרעגן מיר נאָכאַמאָל.',
		choicesSaved: 'פּריװאַטקײט־ברירות אױפֿגעהיט',
		dismissFailed:
			'מע האָט נישט געקענט פֿאַרמאַכן די מעלדונג. גאָרנישט האָט זיך געביטן אױף דעם מכשיר.',
		experienceDescription: 'פּאַסט צו די אַפּ צו װי איר ניצט זי.',
		firstLayerDescription:
			'איר באַשליסט װעלכע ניצונגען צו דערלױבן, און איר קענט זיך איבערטראַכטן װען עס איז אין די פּריװאַטקײט־אײַנשטעלונגען.',
		functionalityDescription: 'געדענקט אײַערע אײַנשטעלונגען און ברירות.',
		introduction:
			'מיר ניצן דאַטן כּדי צו פֿאַרבעסערן אײַער דערפֿאַרונג, מעסטן װי מע ניצט די אַפּ און װײַזן פּאַסיקע רעקלאַמע.',
		marketingDescription: 'װײַזט רעקלאַמע װאָס פּאַסט פֿאַר אײַך.',
		measurementDescription: 'העלפֿט אונדז פֿאַרשטײן װי מע ניצט די אַפּ.',
		necessaryDescription: 'נײטיק כּדי די אַפּ זאָל אַרבעטן.',
		notOffered: 'נישט פֿאַראַן װוּ איר געפֿינט זיך.',
		noticeAcknowledged: 'פּריװאַטקײט־מעלדונג באַשטעטיקט',
		noticeDescription:
			'איר קענט דאָס איבערקוקן אָדער ענדערן װען עס איז אין די פּריװאַטקײט־אײַנשטעלונגען.',
		policyChanged:
			'זינט אײַער לעצטער ברירה האָט זיך געביטן װי די אַפּ ניצט דאַטן, דערפֿאַר פֿרעגן מיר נאָכאַמאָל.',
		preferencesDescription:
			'קלײַבט אױס װעלכע סאָרטן ניצונג פֿון דאַטן איר דערלױבט. ענדערונגען גילטן אױף דעם מכשיר באַלד װי איר היט אױף.',
		restrictedByGpc:
			'אױסגעלאָשן, װײַל אײַער מכשיר שיקט אַ Global Privacy Control סיגנאַל.',
		saveFailed:
			'מע האָט נישט געקענט אױפֿהיטן אײַערע ברירות. גאָרנישט האָט זיך געביטן אױף דעם מכשיר.',
		saving: 'מע היט אױף די ברירות',
	},
	zh: {
		actionTimeInvalid:
			'无法保存，因为此设备的日期和时间似乎不正确。请先在设置中更正。',
		brandPlaceholder: '您的品牌名称',
		choiceExpired: '您之前的选择已过期，因此我们再次询问。',
		choicesSaved: '隐私选择已保存',
		dismissFailed: '无法关闭此通知。此设备上没有任何更改。',
		experienceDescription: '根据您的使用方式调整应用。',
		firstLayerDescription:
			'允许哪些用途由您决定，您可以随时在隐私设置中改变主意。',
		functionalityDescription: '记住您的设置和选择。',
		introduction:
			'我们使用数据来改善您的体验、衡量应用的使用情况并展示相关广告。',
		marketingDescription: '向您展示相关广告。',
		measurementDescription: '帮助我们了解应用的使用情况。',
		necessaryDescription: '应用正常运行所必需。',
		notOffered: '您所在的地区不提供此项。',
		noticeAcknowledged: '已确认隐私声明',
		noticeDescription: '您可以随时在隐私设置中查看或更改此项。',
		policyChanged:
			'自您上次选择以来，此应用使用数据的方式已发生变化，因此我们再次询问。',
		preferencesDescription:
			'选择您允许的数据使用类型。保存后，更改会立即在此设备上生效。',
		restrictedByGpc: '已关闭，因为您的设备发送了 Global Privacy Control 信号。',
		saveFailed: '无法保存您的选择。此设备上没有任何更改。',
		saving: '正在保存选择',
	},
};
