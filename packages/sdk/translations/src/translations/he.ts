import type { CompleteTranslations } from '../types';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'אפשר הכל',
		acknowledge: 'אישור',
		close: 'סגור',
		customize: 'התאמה אישית',
		dismiss: 'סגירה',
		rejectAll: 'דחה הכל',
		save: 'שמור הגדרות',
		securedBy: 'מאובטח על ידי',
	},
	consentGate: {
		actionButton: 'הפעל {category} רשות',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'קבל {category} כדי להציג תוכן זה.',
	},
	consentManagerDialog: {
		description:
			'בחר את הגדרות הפרטיות שלך כאן. באפשרותך לבחור אילו סוגי עוגיות וטכנולוגיות מעקב תרצה לאפשר.',
		title: 'הגדרות פרטיות',
		vendors: {
			disabledByCategory: 'הפעילו קטגוריה זו כדי לבחור ספקים.',
			privacyPolicy: 'מדיניות פרטיות',
			switchLabel: 'אפשר את {vendor}',
			title: 'ספקים ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'עוגיות אלו מאפשרות חוויית משתמש טובה יותר ובדיקת פונקציונליות חדשה באתר.',
			title: 'חוויית משתמש',
		},
		functionality: {
			description: 'עוגיות אלו מאפשרות פונקציונליות משופרת והתאמה אישית.',
			title: 'פונקציונליות',
		},
		marketing: {
			description: 'עוגיות אלו משמשות להתאמת פרסומות ומעקב אחר יעילותן.',
			title: 'שיווק',
		},
		measurement: {
			description:
				'עוגיות אלו מסייעות להבין איך משתמשים באתר ולשפר את ביצועיו.',
			title: 'ניתוח',
		},
		necessary: {
			description: 'עוגיות אלו דרושות לפעולת האתר ולא ניתן להשבית אותן.',
			title: 'הכרחיות',
		},
	},
	cookieBanner: {
		description:
			'אתר זה משתמש בעוגיות (קוקיז) בכדי לשפר את חוויית השימוש, לנטר את תעבורת האתר ולהציג תוכן מותאם אישית.',
		noticeDescription:
			'אנו משתמשים בעוגיות ובטכנולוגיות דומות כדי להפעיל אתר זה, למדוד תעבורה ולהתאים אישית תוכן ופרסומות. ניתן לבטל את ההסכמה או לנהל את ההעדפות שלך בכל עת.',
		noticeTitle: 'הודעת פרטיות',
		title: 'פרטיותך חשובה לנו',
	},
	iab: {
		app: {
			consentStorage:
				'הבחירות שלך נשמרות במכשיר זה, באחסון ההגדרות הרגיל של האפליקציה תחת מפתחות IABTCF, למשך עד {days} ימים. משך השמירה מתחדש כאשר תעדכן את הבחירות שלך.',
			description:
				'אנחנו ו-{partnerCount} השותפים שלנו מאחסנים ו/או ניגשים למידע במכשיר שלך ומעבדים נתונים אישיים, כגון מזהים ייחודיים ונתוני גלישה, עבור אפליקציה זו, כדי:',
			legitimateInterestExplanation:
				'חלק מהשותפים מעבדים נתונים אישיים, כגון מזהים ייחודיים ונתוני גלישה, על בסיס האינטרס הלגיטימי שלהם במקום לבקש הסכמה. הדבר חל רק על אפליקציה זו. יש לך זכות להתנגד לעיבוד זה עבור כל מטרה וכל שותף.',
			scopeServiceSpecific:
				'ההסכמה שלך חלה רק על אפליקציה זו ולא תשפיע על שירותים אחרים.',
			withdraw:
				'אפשר לשנות את הבחירות שלך או לבטל את הסכמתך בכל עת דרך הגדרות פרטיות באפליקציה זו.',
		},
		banner: {
			andMore: 'ועוד {count}...',
			description:
				'אנחנו ו-{partnerCount} השותפים שלנו מאחסנים ו/או ניגשים למידע במכשיר שלך ומעבדים נתונים אישיים, כגון מזהים ייחודיים ונתוני גלישה, עבור אתר זה, כדי:',
			legitimateInterestNotice:
				'חלק מהשותפים טוענים לאינטרס לגיטימי לעבד את הנתונים שלך. יש לך זכות להתנגד לעיבוד זה, להתאים אישית את הבחירות שלך ולבטל את הסכמתך בכל עת.',
			partnersLink: '{count} שותפים',
			scopeGroup: 'הבחירה שלך חלה על כל האתרים שלנו בקבוצה זו.',
			scopeServiceSpecific:
				'ההסכמה שלך חלה רק על אתר זה ולא תשפיע על שירותים אחרים.',
			title: 'הגדרות פרטיות',
		},
		common: {
			acceptAll: 'אפשר הכל',
			clearSelection: 'נקה',
			customPartner: 'שותף מותאם אישית שאינו רשום ב-IAB',
			customize: 'התאמה אישית',
			loading: 'טוען...',
			rejectAll: 'דחה הכל',
			saveSettings: 'שמור הגדרות',
			showingSelectedVendor: 'מציג שותף נבחר',
		},
		preferenceCenter: {
			description:
				'התאם אישית את הגדרות הפרטיות שלך כאן. באפשרותך לבחור אילו סוגי עוגיות וטכנולוגיות מעקב תרצה לאפשר.',
			features: {
				description:
					'אמצעי עיבוד אלה יכולים לשמש אך ורק לשם השגת מטרה אחת או יותר, שלגביהן ניתנה לכם אפשרות בחירה בהודעה זו.',
				title: 'תכונות',
			},
			footer: {
				consentStorage:
					'העדפות הסכמה נשמרות בעוגייה בשם "euconsent-v2" למשך 13 חודשים. משך השמירה עשוי להתחדש כאשר תעדכן את ההעדפות שלך.',
			},
			purposeItem: {
				examples: 'דוגמאות',
				legitimateInterest: 'אינטרס לגיטימי',
				objectButton: 'התנגד',
				objected: 'התנגדת',
				partners: '{count} שותפים',
				partnersUsingPurpose: 'שותפים המשתמשים במטרה זו',
				rightToObject: 'יש לך זכות להתנגד לעיבוד המבוסס על אינטרס לגיטימי.',
				vendorsUseLegitimateInterest: '{count} ספקים טוענים לאינטרס לגיטימי',
				withYourPermission: 'בהסכמתך',
			},
			specialPurposes: {
				title: 'פונקציות חיוניות (נדרש)',
				tooltip:
					'אלו נדרשות לתפקוד ואבטחת האתר. על פי IAB TCF, אינך יכול להתנגד למטרות מיוחדות אלו.',
			},
			tabs: {
				purposes: 'מטרות',
				vendors: 'ספקים',
			},
			title: 'הגדרות פרטיות',
			vendorList: {
				adTechProvidersHeading: 'ספקי טכנולוגיית פרסום של Google',
				adTechProvidersNotice:
					'Google עובדת עם ספקי טכנולוגיית הפרסום האלה מחוץ למסגרת של IAB. ההסכמה שלך מגיעה לספק רק אם תפעיל אותו ותאפשר גם אחסון מידע במכשיר שלך ופרסום מותאם אישית.',
				customVendorsHeading: 'שותפים מותאמים אישית',
				customVendorsNotice:
					'אלו הם שותפים מותאמים אישית שאינם רשומים ב-IAB Transparency & Consent Framework (TCF). הם מעבדים נתונים על בסיס הסכמתך ועשויים להיות להם נהלי פרטיות שונים משותפים הרשומים ב-IAB.',
				dataCategories: 'קטגוריות נתונים',
				features: 'תכונות',
				iabVendorsHeading: 'ספקים רשומים ב-IAB',
				iabVendorsNotice:
					'שותפים אלו רשומים במסגרת השקיפות וההסכמה של IAB (TCF), תקן תעשייתי לניהול הסכמה',
				legitimateInterest: 'אינטרס לגיטימי',
				maxAge: 'תוקף מקסימלי: {days} ימים',
				nonCookieAccess: 'גישה ללא עוגיות',
				privacyPolicy: 'מדיניות פרטיות',
				purposes: 'מטרות',
				requiredNotice: 'נדרש לתפעול האתר, לא ניתן להשבית',
				retention: 'שמירה: {days} ימים',
				search: 'חפש ספקים...',
				showingCount: '{filtered} מתוך {total} ספקים',
				specialFeatures: 'תכונות מיוחדות',
				specialPurposes: 'מטרות מיוחדות',
				storageDisclosure: 'גילוי אחסון',
				usesCookies: 'משתמש בעוגיות',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'מדיניות עוגיות',
		privacyPolicy: 'מדיניות פרטיות',
		termsOfService: 'תנאי שירות',
	},
	optOut: {
		action: 'ביטול הסכמה',
		description:
			'אתר זה לא ימכור או ישתף את המידע האישי שלך, והבחירה שלך נשמרה בדפדפן זה.',
		done: 'סיום',
		headingAll: 'מכירה ושיתוף של המידע האישי שלך ופרסום ממוקד',
		headingSaleAndShare: 'מכירה ושיתוף של המידע האישי שלך',
		headingSaleAndTargetedAds: 'מכירה של המידע האישי שלך ופרסום ממוקד',
		lockedByAccount: 'החשבון שלך ביטל השתתפות, ותוכל לשנות זאת לאחר ההתחברות.',
		lockedByGpc:
			'אות Global Privacy Control של הדפדפן שלך פעיל, ולכן אפשרות זו נשארת כבויה.',
		notOptedOut: 'לא ביטלת הסכמה בדפדפן זה.',
		optInCancel: 'להישאר מוסר',
		optInConfirm: 'להצטרף מחדש',
		optInDescription: 'האישור מסיים את הביטול שלך בדפדפן זה.',
		optInDescriptionWithRights:
			'האישור מסיים את הביטול שלך עבור {rights} בדפדפן זה.',
		optInLink: 'להצטרף מחדש…',
		optInTitle: 'להצטרף מחדש?',
		receiptAccount: 'ביטלת את ההשתתפות בדפדפן זה ובחשבון שלך.',
		receiptAccountWithRights:
			'ביטלת את ההשתתפות ב-{rights} בדפדפן זה ובחשבון שלך.',
		receiptBrowser: 'ביטלת את ההשתתפות בדפדפן זה.',
		receiptBrowserWithRights: 'ביטלת את ההשתתפות ב-{rights} בדפדפן זה.',
		recordedLabel: 'נרשם',
		referenceLabel: 'אסמכתא',
		rightsAll: 'מכירה, שיתוף ופרסום ממוקד',
		rightsSaleAndShare: 'מכירה ושיתוף',
		rightsSaleAndTargetedAds: 'מכירה ופרסום ממוקד',
		statusRequest: 'בקשת ביטול ההשתתפות כובדה',
		statusSignal: 'אות העדפת ביטול ההשתתפות כובד',
	},
	rights: {
		californiaPrivacyChoices: 'בחירות הפרטיות שלך בקליפורניה',
		optOut: 'אין למכור או לשתף את הנתונים שלי',
		preferences: 'ניהול העדפות',
		privacyChoices: 'בחירות הפרטיות שלך',
	},
};
export default translations;
