import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'אפשר הכל',
		acknowledge: 'אישור',
		close: 'סגור',
		customize: 'התאמה אישית',
		dismiss: 'סגירה',
		rejectAll: 'דחה הכל',
		save: 'שמור הגדרות',
		securedBy: 'הסכמה באמצעות',
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
	privacyChoices: {
		acceptAll: 'אפשר הכל',
		advertisingFollowsSale: 'הפרסום נקבע לפי הבחירה שלך למעלה.',
		advertisingTitle: 'פרסום',
		allow: 'אפשר',
		alwaysOn: 'פעיל תמיד',
		announceSaved: '{message} נשמר.',
		askAll: 'למכור או לשתף את המידע האישי שלך, כולל לצורך פרסום ממוקד',
		askSaleAndShare: 'למכור או לשתף את המידע האישי שלך',
		askSaleAndTargetedAds: 'למכור את המידע האישי שלך או להשתמש בו לפרסום ממוקד',
		bannerAllowedRightsOff:
			'עוגיות אופציונליות אושרו. {rights} נשארים כבויים. ניתן לשנות זאת תחת ״בחירות הפרטיות שלך״.',
		bannerAllowedRightsOffGpc:
			'עוגיות אופציונליות אושרו. {rights} נשארים כבויים בגלל אות Global Privacy Control שלך. ניתן לשנות זאת תחת ״בחירות הפרטיות שלך״.',
		bannerRejected:
			'עוגיות אופציונליות נדחו. ניתן לשנות זאת תחת ״בחירות הפרטיות שלך״.',
		barDescription: 'אנו משתמשים בעוגיות כדי לשפר את החוויה שלך ולנתח תעבורה.',
		businessFallback: 'אתר זה',
		choiceRecorded: 'הבחירה נרשמה.',
		choicesSaved: 'הבחירות נשמרו. ניתן לשנות אותן תחת ״בחירות הפרטיות שלך״.',
		choose: 'בחר',
		chooseWhatToAllow: 'בחר מה לאפשר',
		close: 'סגור',
		confirmDescriptionOptIn:
			'{business} יהיה רשאי {rights}. תוכל לשנות זאת בכל עת.',
		confirmDescriptionOptOut:
			'{business} יהיה רשאי {rights}. תוכל לבטל שוב את ההסכמה בכל עת.',
		confirmKeepOptedOut: 'להשאיר את הביטול',
		confirmTitleOptIn: 'לאפשר {rights}?',
		confirmTitleOptOut: 'לאפשר שוב {rights}?',
		copyFailed: 'ההעתקה נכשלה. סמן והעתק את האסמכתא שלך:',
		copyFailedAnnouncement: 'ההעתקה נכשלה. האסמכתא המלאה שלך מוצגת באישור.',
		copyReference: 'העתק אסמכתא',
		dialogIntro: 'הבחירות שלך נכנסות לתוקף מיד.',
		dialogTitle: 'בחירות הפרטיות שלך',
		done: 'סיום',
		dontAllow: 'אל תאפשר',
		euDialogIntro:
			'בחר באילו עוגיות אופציונליות {business} רשאי להשתמש. עוגיות אופציונליות נשארות כבויות עד שתפעיל אותן.',
		euDialogTitle: 'הגדרות פרטיות',
		gpcNote:
			'הדפדפן שלך שלח אות Global Privacy Control, ולכן {business} {rights} {scope}. האפשרות ״אפשר״ אינה זמינה כל עוד האות פעיל.',
		justNow: 'ממש עכשיו',
		nestedSheetNote: 'השינויים ייכנסו לתוקף כשתשמור בהגדרות פרטיות.',
		noticeBarDescription:
			'אנו משתמשים בעוגיות כדי להפעיל אתר זה, למדוד תעבורה ולהתאים אישית פרסומות. ניתן לבטל את ההסכמה בכל עת.',
		noticeBarDescriptionGpc:
			'אנו משתמשים בעוגיות כדי להפעיל אתר זה ולמדוד תעבורה. אות Global Privacy Control שלך מכובד.',
		noticeGpcHonored: 'אות Global Privacy Control של הדפדפן שלך מכובד.',
		noticeRightsAction: 'אין למכור או לשתף את הנתונים שלי',
		nudge: 'בחר תחילה באחד משני הכפתורים.',
		optInBarDescription:
			'{business} מבקש את אישורך לפני שימוש בעוגיות אופציונליות או {rights}.',
		optInDescription:
			'באישורך, {business} ישתמש בעוגיות אופציונליות לתכונות האתר ולניתוח, ויהיה רשאי {rights}. שום דבר לא יופעל ללא אישורך.',
		optInTitle: 'בחירות הפרטיות שלך',
		optOutOption: 'ביטול הסכמה',
		panelExpanded: 'אפשרויות נוספות מוצגות.',
		policyColumn: 'מדיניות פרטיות',
		preferencesClose: 'סגור העדפות',
		preferencesOnCount: '{count} פעילות',
		preferencesSheetIntro: 'השינויים נכנסים לתוקף מיד.',
		preferencesSummary: 'תכונות האתר וניתוח',
		preferencesTitle: 'העדפות',
		purposeColumn: 'מטרה',
		receiptAllowed: 'אושרו: {rights}',
		receiptDetails: 'פרטים',
		receiptFromGpc: 'לפי אות Global Privacy Control שלך',
		receiptLive: 'אות Global Privacy Control מדפדפן זה מכובד',
		receiptLiveDetail: 'נקרא מהדפדפן שלך בכל ביקור.',
		receiptOptedOut: 'בוטלה ההסכמה ל{rights}',
		receiptRecorded: 'נרשם: {date}',
		receiptReference: 'אסמכתא',
		receiptSavedAccount: 'נשמר בחשבון שלך · {date}',
		receiptSavedBrowser: 'נשמר עבור דפדפן זה · {date}',
		receiptScopeAccount: 'חל על דפדפן זה ועל חשבון {business} שלך.',
		receiptScopeAccountUnnamed: 'חל על דפדפן זה ועל החשבון שלך.',
		receiptScopeBrowser:
			'חל על דפדפן זה. התחבר כדי להחיל זאת גם על החשבון שלך.',
		receiptViaGpc: 'אות Global Privacy Control',
		referenceCopied: 'האסמכתא הועתקה.',
		refuseAll:
			'לא ימכור ולא ישתף את המידע האישי שלך, ולא ישתמש בו לפרסום ממוקד',
		refuseSaleAndShare: 'לא ימכור ולא ישתף את המידע האישי שלך',
		refuseSaleAndTargetedAds:
			'לא ימכור את המידע האישי שלך ולא ישתמש בו לפרסום ממוקד',
		rejectAll: 'דחה הכל',
		rightsAllowed: '{rights} אושרו.',
		rightsNotAllowed: '{rights} לא אושרו.',
		rightsOptedOut: 'ביטלת את ההסכמה ל{rights}.',
		saleAllowed: '{business} רשאי {rights}.',
		saleGroupOptIn: 'אפשר {rights}',
		saleGroupSaleAndTargetedAds:
			'ביטול הסכמה למכירת המידע האישי שלי ולפרסום ממוקד',
		saleOffByDefault: 'כבוי כברירת מחדל. {business} {rights} אלא אם תאפשר זאת.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'שמור בחירות',
		saveInSettings: 'שמור את הבחירות שלך בהגדרות פרטיות',
		savedAutomatically: 'נשמר אוטומטית',
		savedCue: 'נשמר',
		scopeAccount: 'בדפדפן זה או בחשבון {business} שלך',
		scopeAccountUnnamed: 'בדפדפן זה או בחשבון שלך',
		scopeBrowser: 'בדפדפן זה',
		shortAll: 'מכירה או שיתוף של הנתונים שלך לצורכי פרסום',
		shortSaleAndShare: 'מכירה או שיתוף של הנתונים שלך',
		shortSaleAndTargetedAds: 'מכירת הנתונים שלך או שימוש בהם לפרסום',
		stateOff: 'כבוי',
		stateOn: 'פעיל',
		switchColumn: 'פעיל',
		switchedOff: '{name}: כבוי.',
		switchedOn: '{name}: פעיל.',
		titleAll: 'מכירה, שיתוף ופרסום ממוקד',
		titleSaleAndShare: 'מכירה ושיתוף',
		titleSaleAndTargetedAds: 'מכירה ופרסום ממוקד',
		vendorColumn: 'ספק',
		vendorPolicy: 'מדיניות הפרטיות של {vendor}',
		vendorsClose: 'סגור ספקים: {category}',
		vendorsFor: 'עבור {category}',
		vendorsHide: 'הסתר {count} ספקים',
		vendorsHideOne: 'הסתר ספק אחד',
		vendorsOnCount: '{count} פעילים',
		vendorsTable: 'ספקים: {category}',
		vendorsView: 'הצג {count} ספקים',
		vendorsViewOne: 'הצג ספק אחד',
	},
	rights: {
		californiaPrivacyChoices: 'בחירות הפרטיות שלך בקליפורניה',
		optOut: 'אין למכור או לשתף את הנתונים שלי',
		preferences: 'ניהול העדפות',
		privacyChoices: 'בחירות הפרטיות שלך',
	},
};
export default translations;
