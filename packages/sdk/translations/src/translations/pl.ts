import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Zaakceptuj wszystkie',
		acknowledge: 'OK',
		close: 'Zamknij',
		customize: 'Dostosuj',
		dismiss: 'Zamknij',
		rejectAll: 'Odrzuć wszystkie',
		save: 'Zapisz ustawienia',
		securedBy: 'Zgody obsługuje',
	},
	consentGate: {
		actionButton: 'Włącz zgodę na {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Zaakceptuj zgodę na {category}, aby wyświetlić tę treść.',
	},
	consentManagerDialog: {
		description:
			'Dostosuj tutaj swoje ustawienia prywatności. Możesz wybrać, które rodzaje plików cookie i technologii śledzenia chcesz zaakceptować.',
		title: 'Ustawienia prywatności',
		vendors: {
			disabledByCategory: 'Włącz tę kategorię, aby wybrać dostawców.',
			privacyPolicy: 'Polityka prywatności',
			switchLabel: 'Zezwól na {vendor}',
			title: 'Dostawcy ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Te pliki cookie pomagają nam zapewnić lepsze wrażenia użytkownika i testować nowe funkcje.',
			title: 'Doświadczenie',
		},
		functionality: {
			description:
				'Te pliki cookie umożliwiają ulepszoną funkcjonalność i personalizację strony internetowej.',
			title: 'Funkcjonalność',
		},
		marketing: {
			description:
				'Te pliki cookie są używane do dostarczania odpowiednich reklam i śledzenia ich skuteczności.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Te pliki cookie pomagają nam zrozumieć, jak odwiedzający korzystają ze strony internetowej, i poprawić jej wydajność.',
			title: 'Analityka',
		},
		necessary: {
			description:
				'Te pliki cookie są niezbędne do prawidłowego funkcjonowania strony internetowej i nie można ich wyłączyć.',
			title: 'Ściśle niezbędne',
		},
	},
	cookieBanner: {
		description:
			'Ta strona używa plików cookie, aby poprawić Twoje wrażenia z przeglądania, analizować ruch na stronie i wyświetlać spersonalizowane treści.',
		noticeDescription:
			'Używamy plików cookie i podobnych technologii, aby obsługiwać tę stronę, mierzyć ruch oraz personalizować treści i reklamy. W każdej chwili możesz zrezygnować lub zarządzać swoimi preferencjami.',
		noticeTitle: 'Informacja o prywatności',
		title: 'Cenimy Twoją prywatność',
	},
	iab: {
		app: {
			consentStorage:
				'Twoje wybory są przechowywane na tym urządzeniu, w standardowym magazynie ustawień aplikacji pod kluczami IABTCF, przez maksymalnie {days} dni. Okres przechowywania jest odnawiany, gdy zaktualizujesz swoje wybory.',
			description:
				'My i nasi {partnerCount} partnerzy przechowujemy i/lub uzyskujemy dostęp do informacji na urządzeniu oraz przetwarzamy dane osobowe, takie jak unikalne identyfikatory i dane dotyczące przeglądania, w tej aplikacji, aby:',
			legitimateInterestExplanation:
				'Niektórzy partnerzy przetwarzają dane osobowe, takie jak unikalne identyfikatory i dane dotyczące przeglądania, na podstawie swojego uzasadnionego interesu, zamiast prosić o zgodę. Dotyczy to tylko tej aplikacji. Masz prawo sprzeciwić się temu przetwarzaniu w odniesieniu do każdego celu i każdego partnera.',
			scopeServiceSpecific:
				'Twoja zgoda dotyczy tylko tej aplikacji i nie wpływa na inne usługi.',
			withdraw:
				'W każdej chwili możesz zmienić swoje wybory lub wycofać zgodę w Ustawieniach prywatności w tej aplikacji.',
		},
		banner: {
			andMore: 'I {count} więcej...',
			description:
				'My i nasi {partnerCount} partnerzy przechowujemy i/lub uzyskujemy dostęp do informacji na urządzeniu oraz przetwarzamy dane osobowe, takie jak unikalne identyfikatory i dane dotyczące przeglądania, w tej witrynie, aby:',
			legitimateInterestNotice:
				'Niektórzy partnerzy powołują się na uzasadniony interes w przetwarzaniu Twoich danych. Masz prawo sprzeciwić się temu przetwarzaniu, dostosować swoje wybory i wycofać zgodę w dowolnym momencie.',
			partnersLink: '{count} partnerów',
			scopeGroup:
				'Twój wybór ma zastosowanie do wszystkich naszych stron w tej grupie.',
			scopeServiceSpecific:
				'Twoja zgoda dotyczy tylko tej strony internetowej i nie wpływa na inne usługi.',
			title: 'Ustawienia prywatności',
		},
		common: {
			acceptAll: 'Zaakceptuj wszystkie',
			clearSelection: 'Wyczyść',
			customPartner: 'Partner niestandardowy niezarejestrowany w IAB',
			customize: 'Dostosuj',
			loading: 'Ładowanie...',
			rejectAll: 'Odrzuć wszystkie',
			saveSettings: 'Zapisz ustawienia',
			showingSelectedVendor: 'Pokazywanie wybranego dostawcy',
		},
		preferenceCenter: {
			description:
				'Dostosuj tutaj swoje ustawienia prywatności. Możesz wybrać, które rodzaje plików cookie i technologii śledzenia chcesz zaakceptować.',
			features: {
				description:
					'Te sposoby przetwarzania mogą być wykorzystywane wyłącznie w celu realizacji jednego lub kilku celów, co do których dajemy Ci wybór w niniejszej informacji.',
				title: 'Funkcje',
			},
			footer: {
				consentStorage:
					'Preferencje dotyczące zgody są przechowywane w pliku cookie o nazwie „euconsent-v2” przez 13 miesięcy. Okres przechowywania może zostać odnowiony, gdy zaktualizujesz swoje preferencje.',
			},
			purposeItem: {
				examples: 'Przykłady',
				legitimateInterest: 'Uzasadniony interes',
				objectButton: 'Sprzeciw',
				objected: 'Zgłoszono sprzeciw',
				partners: '{count} partnerów',
				partnersUsingPurpose: 'Partnerzy korzystający z tego celu',
				rightToObject:
					'Masz prawo sprzeciwić się przetwarzaniu opartemu na uzasadnionym interesie.',
				vendorsUseLegitimateInterest:
					'{count} dostawców powołuje się na uzasadniony interes',
				withYourPermission: 'Za Twoją zgodą',
			},
			specialPurposes: {
				title: 'Funkcje niezbędne (wymagane)',
				tooltip:
					'Są one wymagane dla funkcjonalności i bezpieczeństwa witryny. Zgodnie z IAB TCF nie można sprzeciwić się tym celom specjalnym.',
			},
			tabs: {
				purposes: 'Cele',
				vendors: 'Dostawcy',
			},
			title: 'Ustawienia prywatności',
			vendorList: {
				adTechProvidersHeading: 'Dostawcy technologii reklamowych Google',
				adTechProvidersNotice:
					'Google współpracuje z tymi dostawcami technologii reklamowych poza ramami IAB. Twoja zgoda trafia do dostawcy tylko wtedy, gdy go włączysz i dodatkowo zezwolisz na przechowywanie informacji na urządzeniu oraz spersonalizowane reklamy.',
				customVendorsHeading: 'Partnerzy niestandardowi',
				customVendorsNotice:
					'Są to partnerzy niestandardowi, którzy nie są zarejestrowani w IAB Transparency & Consent Framework (TCF). Przetwarzają dane na podstawie Twojej zgody i mogą stosować inne praktyki prywatności niż dostawcy zarejestrowani w IAB.',
				dataCategories: 'Kategorie danych',
				features: 'Funkcje',
				iabVendorsHeading: 'Dostawcy zarejestrowani w IAB',
				iabVendorsNotice:
					'Ci partnerzy są zarejestrowani w IAB Transparency & Consent Framework (TCF), standardzie branżowym dotyczącym zarządzania zgodami',
				legitimateInterest: 'Uzasadn. interes',
				maxAge: 'Maks. wiek: {days}d',
				nonCookieAccess: 'Dostęp bez plików cookie',
				privacyPolicy: 'Polityka prywatności',
				purposes: 'Cele',
				requiredNotice:
					'Wymagane dla funkcjonalności witryny, nie można wyłączyć',
				retention: 'Przechowywanie: {days}d',
				search: 'Szukaj dostawców...',
				showingCount: '{filtered} z {total} dostawców',
				specialFeatures: 'Funkcje specjalne',
				specialPurposes: 'Cele specjalne',
				storageDisclosure: 'Ujawnienie informacji o przechowywaniu',
				usesCookies: 'Używa plików cookie',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Polityka plików cookie',
		privacyPolicy: 'Polityka prywatności',
		termsOfService: 'Regulamin',
	},
	optOut: {
		action: 'Zrezygnuj',
		description:
			'Ta witryna nie będzie sprzedawać ani udostępniać Twoich danych osobowych, a Twój wybór został zapisany w tej przeglądarce.',
		done: 'Gotowe',
		headingAll:
			'Sprzedaż i udostępnianie Twoich danych osobowych oraz reklama kierowana',
		headingSaleAndShare: 'Sprzedaż i udostępnianie Twoich danych osobowych',
		headingSaleAndTargetedAds:
			'Sprzedaż Twoich danych osobowych i reklama kierowana',
		lockedByAccount:
			'Twoje konto zrezygnowało, a możesz to zmienić po zalogowaniu.',
		lockedByGpc:
			'Sygnał Global Privacy Control w Twojej przeglądarce jest włączony, więc ta opcja pozostaje wyłączona.',
		notOptedOut: 'Nie zrezygnowano w tej przeglądarce.',
		optInCancel: 'Pozostań wyłączony',
		optInConfirm: 'Włącz ponownie',
		optInDescription:
			'Potwierdzenie kończy Twoją rezygnację w tej przeglądarce.',
		optInDescriptionWithRights:
			'Potwierdzenie kończy Twoją rezygnację z {rights} w tej przeglądarce.',
		optInLink: 'Włącz ponownie…',
		optInTitle: 'Włączyć ponownie?',
		receiptAccount: 'Zrezygnowałeś w tej przeglądarce i na swoim koncie.',
		receiptAccountWithRights:
			'Zrezygnowałeś z {rights} w tej przeglądarce i na swoim koncie.',
		receiptBrowser: 'Zrezygnowałeś w tej przeglądarce.',
		receiptBrowserWithRights: 'Zrezygnowałeś z {rights} w tej przeglądarce.',
		recordedLabel: 'Zapisano',
		referenceLabel: 'Numer referencyjny',
		rightsAll: 'sprzedaży, udostępniania i reklam ukierunkowanych',
		rightsSaleAndShare: 'sprzedaży i udostępniania',
		rightsSaleAndTargetedAds: 'sprzedaży i reklam ukierunkowanych',
		statusRequest: 'Żądanie rezygnacji zostało uwzględnione',
		statusSignal: 'Sygnał preferencji rezygnacji został uwzględniony',
	},
	privacyChoices: {
		acceptAll: 'Zaakceptuj wszystkie',
		advertisingFollowsSale: 'Reklamy zależą od Twojego wyboru powyżej.',
		advertisingTitle: 'Reklamy',
		allow: 'Zezwól',
		alwaysOn: 'Zawsze włączone',
		announceSaved: '{message} Zapisano.',
		askAll:
			'sprzedawać lub udostępniać Twoje dane osobowe, także na potrzeby reklam ukierunkowanych',
		askSaleAndShare: 'sprzedawać lub udostępniać Twoje dane osobowe',
		askSaleAndTargetedAds:
			'sprzedawać Twoje dane osobowe lub używać ich do reklam ukierunkowanych',
		bannerAllowedRightsOff:
			'Opcjonalne pliki cookie dozwolone. {rights} pozostają wyłączone. Możesz to zmienić w sekcji Twoje wybory dotyczące prywatności.',
		bannerAllowedRightsOffGpc:
			'Opcjonalne pliki cookie dozwolone. {rights} pozostają wyłączone ze względu na Twój sygnał Global Privacy Control. Możesz to zmienić w sekcji Twoje wybory dotyczące prywatności.',
		bannerRejected:
			'Opcjonalne pliki cookie odrzucone. Możesz to zmienić w sekcji Twoje wybory dotyczące prywatności.',
		barDescription:
			'Używamy plików cookie, aby poprawić Twoje wrażenia i analizować ruch.',
		businessFallback: 'ta witryna',
		choiceRecorded: 'Wybór zapisany.',
		choicesSaved:
			'Wybory zapisane. Możesz je zmienić w sekcji Twoje wybory dotyczące prywatności.',
		choose: 'Wybierz',
		chooseWhatToAllow: 'Wybierz, na co zezwalasz',
		close: 'Zamknij',
		confirmDescriptionOptIn:
			'{business} może {rights}. Możesz to zmienić w każdej chwili.',
		confirmDescriptionOptOut:
			'{business} może {rights}. W każdej chwili możesz ponownie zrezygnować.',
		confirmKeepOptedOut: 'Pozostań przy rezygnacji',
		confirmTitleOptIn: 'Zezwolić na: {rights}?',
		confirmTitleOptOut: 'Ponownie zezwolić na: {rights}?',
		copyFailed:
			'Nie udało się skopiować. Zaznacz i skopiuj swój numer referencyjny:',
		copyFailedAnnouncement:
			'Nie udało się skopiować. Pełny numer referencyjny znajdziesz w potwierdzeniu.',
		copyReference: 'Kopiuj numer referencyjny',
		dialogIntro: 'Twoje wybory obowiązują od razu.',
		dialogTitle: 'Twoje wybory dotyczące prywatności',
		done: 'Gotowe',
		dontAllow: 'Nie zezwalaj',
		euDialogIntro:
			'Wybierz, których opcjonalnych plików cookie może używać {business}. Opcjonalne pliki cookie pozostają wyłączone, dopóki ich nie włączysz.',
		euDialogTitle: 'Ustawienia prywatności',
		gpcNote:
			'Twoja przeglądarka wysłała sygnał Global Privacy Control, więc {business} {rights} {scope}. Opcja „Zezwól” jest niedostępna, dopóki sygnał jest włączony.',
		justNow: 'przed chwilą',
		nestedSheetNote:
			'Zmiany zaczną obowiązywać po zapisaniu w Ustawieniach prywatności.',
		noticeBarDescription:
			'Używamy plików cookie, aby obsługiwać tę stronę, mierzyć ruch i personalizować reklamy. W każdej chwili możesz zrezygnować.',
		noticeBarDescriptionGpc:
			'Używamy plików cookie, aby obsługiwać tę stronę i mierzyć ruch. Twój sygnał Global Privacy Control jest respektowany.',
		noticeGpcHonored:
			'Sygnał Global Privacy Control z Twojej przeglądarki jest respektowany.',
		noticeRightsAction: 'Nie sprzedawaj ani nie udostępniaj moich danych',
		nudge: 'Najpierw wybierz jeden z dwóch przycisków.',
		optInBarDescription:
			'{business} prosi o zgodę na opcjonalne pliki cookie oraz na {rights}.',
		optInDescription:
			'Za Twoją zgodą {business} może używać opcjonalnych plików cookie do funkcji strony i analityki oraz {rights}. Nic nie zostanie włączone, dopóki na to nie zezwolisz.',
		optInTitle: 'Twoje wybory dotyczące prywatności',
		optOutOption: 'Zrezygnuj',
		panelExpanded: 'Wyświetlono więcej opcji.',
		policyColumn: 'Polityka prywatności',
		preferencesClose: 'Zamknij preferencje',
		preferencesOnCount: 'Włączone: {count}',
		preferencesSheetIntro: 'Zmiany obowiązują od razu.',
		preferencesSummary: 'Funkcje strony i analityka',
		preferencesTitle: 'Preferencje',
		purposeColumn: 'Cel',
		receiptAllowed: 'Zezwolono na: {rights}',
		receiptDetails: 'Szczegóły',
		receiptFromGpc: 'na podstawie Twojego sygnału Global Privacy Control',
		receiptLive:
			'Respektujemy sygnał Global Privacy Control z tej przeglądarki',
		receiptLiveDetail: 'Odczytywany z Twojej przeglądarki przy każdej wizycie.',
		receiptOptedOut: 'Rezygnacja: {rights}',
		receiptRecorded: 'Zapisano: {date}',
		receiptReference: 'Numer referencyjny',
		receiptSavedAccount: 'Zapisano na Twoim koncie · {date}',
		receiptSavedBrowser: 'Zapisano dla tej przeglądarki · {date}',
		receiptScopeAccount: 'Dotyczy tej przeglądarki i Twojego konta {business}.',
		receiptScopeAccountUnnamed: 'Dotyczy tej przeglądarki i Twojego konta.',
		receiptScopeBrowser:
			'Dotyczy tej przeglądarki. Zaloguj się, aby zastosować wybór także na swoim koncie.',
		receiptViaGpc: 'Sygnał Global Privacy Control',
		referenceCopied: 'Skopiowano numer referencyjny.',
		refuseAll:
			'nie będzie sprzedawać ani udostępniać Twoich danych osobowych ani używać ich do reklam ukierunkowanych',
		refuseSaleAndShare:
			'nie będzie sprzedawać ani udostępniać Twoich danych osobowych',
		refuseSaleAndTargetedAds:
			'nie będzie sprzedawać Twoich danych osobowych ani używać ich do reklam ukierunkowanych',
		rejectAll: 'Odrzuć wszystkie',
		rightsAllowed: '{rights}: dozwolone.',
		rightsNotAllowed: '{rights}: niedozwolone.',
		rightsOptedOut: 'Rezygnacja: {rights}.',
		saleAllowed: '{business} może {rights}.',
		saleGroupOptIn: 'Zezwól na: {rights}',
		saleGroupSaleAndTargetedAds:
			'Zrezygnuj ze sprzedaży moich danych osobowych i reklam ukierunkowanych',
		saleOffByDefault:
			'Domyślnie wyłączone. {business} {rights}, dopóki na to nie zezwolisz.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Zapisz wybory',
		saveInSettings: 'Zapisz swoje wybory w Ustawieniach prywatności',
		savedAutomatically: 'Zapisywane automatycznie',
		savedCue: 'Zapisano',
		scopeAccount: 'w tej przeglądarce ani na Twoim koncie {business}',
		scopeAccountUnnamed: 'w tej przeglądarce ani na Twoim koncie',
		scopeBrowser: 'w tej przeglądarce',
		shortAll: 'sprzedaż lub udostępnianie Twoich danych na potrzeby reklam',
		shortSaleAndShare: 'sprzedaż lub udostępnianie Twoich danych',
		shortSaleAndTargetedAds:
			'sprzedaż Twoich danych lub używanie ich do reklam',
		stateOff: 'Wyłączone',
		stateOn: 'Włączone',
		switchColumn: 'Włączone',
		switchedOff: '{name}: wyłączono.',
		switchedOn: '{name}: włączono.',
		titleAll: 'Sprzedaż, udostępnianie i reklamy ukierunkowane',
		titleSaleAndShare: 'Sprzedaż i udostępnianie',
		titleSaleAndTargetedAds: 'Sprzedaż i reklamy ukierunkowane',
		vendorColumn: 'Dostawca',
		vendorPolicy: 'Polityka prywatności: {vendor}',
		vendorsClose: 'Zamknij listę dostawców: {category}',
		vendorsFor: 'w kategorii {category}',
		vendorsHide: 'Ukryj {count} dostawców',
		vendorsHideOne: 'Ukryj 1 dostawcę',
		vendorsOnCount: 'Włączone: {count}',
		vendorsTable: 'Dostawcy: {category}',
		vendorsView: 'Pokaż {count} dostawców',
		vendorsViewOne: 'Pokaż 1 dostawcę',
	},
	rights: {
		californiaPrivacyChoices: 'Twoje wybory dotyczące prywatności w Kalifornii',
		optOut: 'Nie sprzedawaj ani nie udostępniaj moich danych',
		preferences: 'Zarządzaj preferencjami',
		privacyChoices: 'Twoje wybory dotyczące prywatności',
	},
};
export default translations;
