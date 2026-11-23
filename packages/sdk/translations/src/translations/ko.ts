import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: '모두 허용',
		acknowledge: '확인',
		close: '닫기',
		customize: '맞춤 설정',
		dismiss: '숨기기',
		rejectAll: '모두 거부',
		save: '설정 저장',
		securedBy: '동의 관리:',
	},
	consentGate: {
		actionButton: '{category}에 동의하기',
		error: '이 콘텐츠를 불러올 수 없습니다.',
		loading: '콘텐츠를 불러오는 중…',
		policyBlocked:
			'귀하의 지역에 적용되는 동의 정책에 따라 이 콘텐츠를 이용할 수 없습니다.',
		title: '{category}에 동의하면 이 콘텐츠를 볼 수 있습니다.',
	},
	consentManagerDialog: {
		description:
			'여기에서 개인정보 보호 설정을 변경할 수 있습니다. 허용할 쿠키 및 추적 기술의 유형을 선택해 주십시오.',
		title: '개인정보 보호 설정',
		vendors: {
			disabledByCategory:
				'이 카테고리를 활성화하면 공급업체를 선택할 수 있습니다.',
			privacyPolicy: '개인정보 처리방침',
			switchLabel: '{vendor} 허용',
			title: '공급업체({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'이 쿠키는 더 나은 사용자 경험을 제공하고 새로운 기능을 테스트하는 데 사용됩니다.',
			title: '사용자 경험',
		},
		functionality: {
			description:
				'이 쿠키는 웹사이트의 고급 기능과 개인 맞춤 설정을 제공합니다.',
			title: '기능',
		},
		marketing: {
			description:
				'이 쿠키는 관련성 높은 광고를 제공하고 광고 효과를 측정하는 데 사용됩니다.',
			title: '마케팅',
		},
		measurement: {
			description:
				'이 쿠키는 방문자가 웹사이트를 이용하는 방식을 파악하고 웹사이트 성능을 개선하는 데 도움이 됩니다.',
			title: '분석',
		},
		necessary: {
			description:
				'이 쿠키는 웹사이트가 정상적으로 작동하는 데 반드시 필요하며 비활성화할 수 없습니다.',
			title: '필수',
		},
	},
	cookieBanner: {
		description:
			'이 사이트는 브라우징 환경 개선, 사이트 트래픽 분석, 맞춤형 콘텐츠 제공을 위해 쿠키를 사용합니다.',
		noticeDescription:
			'당사는 이 사이트 운영, 트래픽 측정, 콘텐츠 및 광고 맞춤화를 위해 쿠키 및 유사 기술을 사용합니다. 언제든지 선택적 쿠키 및 유사 기술의 사용을 거부하거나 설정을 관리할 수 있습니다.',
		noticeTitle: '개인정보 보호 안내',
		title: '귀하의 개인정보를 소중히 여깁니다',
	},
	iab: {
		app: {
			consentStorage:
				'귀하의 선택 사항은 이 기기의 앱 표준 설정 저장소에 IABTCF 키로 최대 {days}일 동안 저장됩니다. 선택 사항을 변경하면 저장 기간이 갱신됩니다.',
			description:
				'당사와 {partnerCount}개 파트너는 이 앱에서 다음 목적을 위해 귀하의 기기에 정보를 저장하거나 액세스하고, 고유 식별자 및 브라우징 데이터와 같은 개인정보를 처리합니다:',
			legitimateInterestExplanation:
				'일부 파트너는 동의를 요청하는 대신 정당한 이익에 근거하여 고유 식별자 및 브라우징 데이터와 같은 개인정보를 처리합니다. 이는 이 앱에만 적용됩니다. 귀하는 각 목적 및 각 파트너별로 이러한 처리에 이의를 제기할 권리가 있습니다.',
			scopeServiceSpecific:
				'귀하의 동의는 이 앱에만 적용되며 다른 서비스에는 영향을 주지 않습니다.',
			withdraw:
				'이 앱의 개인정보 보호 설정에서 언제든지 선택 사항을 변경하거나 동의를 철회할 수 있습니다.',
		},
		banner: {
			andMore: '그 외 {count}개...',
			description:
				'당사와 {partnerCount}개 파트너는 이 웹사이트에서 다음 목적을 위해 귀하의 기기에 정보를 저장하거나 액세스하고, 고유 식별자 및 브라우징 데이터와 같은 개인정보를 처리합니다:',
			legitimateInterestNotice:
				'일부 파트너는 귀하의 데이터 처리에 정당한 이익이 있다고 주장합니다. 귀하는 이러한 처리에 이의를 제기하고, 선택 사항을 변경하며, 언제든지 동의를 철회할 권리가 있습니다.',
			partnersLink: '{count}개 파트너',
			scopeGroup:
				'귀하의 선택은 이 그룹에 속한 당사의 모든 웹사이트에 적용됩니다.',
			scopeServiceSpecific:
				'귀하의 동의는 이 웹사이트에만 적용되며 다른 서비스에는 영향을 주지 않습니다.',
			title: '개인정보 보호 설정',
		},
		common: {
			acceptAll: '모두 허용',
			clearSelection: '지우기',
			customPartner: 'IAB에 등록되지 않은 사용자 지정 파트너',
			customize: '맞춤 설정',
			loading: '불러오는 중...',
			rejectAll: '모두 거부',
			saveSettings: '설정 저장',
			showingSelectedVendor: '선택한 공급업체 표시 중',
		},
		preferenceCenter: {
			description:
				'여기에서 개인정보 보호 설정을 변경할 수 있습니다. 허용할 쿠키 및 추적 기술의 유형을 선택해 주십시오.',
			features: {
				description:
					'이러한 처리 방식은 이 고지에서 귀하에게 선택권이 주어진 하나 이상의 목적을 달성하기 위해서만 사용될 수 있습니다.',
				title: '기능',
			},
			footer: {
				consentStorage:
					'동의 설정은 "euconsent-v2"라는 이름의 쿠키에 13개월 동안 저장됩니다. 설정을 변경하면 저장 기간이 갱신될 수 있습니다.',
			},
			purposeItem: {
				examples: '예시',
				legitimateInterest: '정당한 이익',
				objectButton: '이의 제기',
				objected: '이의 제기됨',
				partners: '{count}개 파트너',
				partnersUsingPurpose: '이 목적을 사용하는 파트너',
				rightToObject:
					'귀하는 정당한 이익에 근거한 처리에 이의를 제기할 권리가 있습니다.',
				vendorsUseLegitimateInterest:
					'정당한 이익을 주장하는 공급업체 {count}개',
				withYourPermission: '귀하의 동의에 따라',
			},
			specialPurposes: {
				title: '필수 기능(해제 불가)',
				tooltip:
					'사이트 기능과 보안에 필요한 항목입니다. IAB TCF에 따라 이러한 특별 목적에는 이의를 제기할 수 없습니다.',
			},
			tabs: {
				purposes: '목적',
				vendors: '공급업체',
			},
			title: '개인정보 보호 설정',
			vendorList: {
				adTechProvidersHeading: 'Google 광고 기술 제공업체',
				adTechProvidersNotice:
					'Google은 IAB 프레임워크와 별도로 이러한 광고 기술 제공업체와 협력합니다. 귀하가 해당 제공업체를 켜고 기기 저장소 사용과 맞춤형 광고도 허용한 경우에만 귀하의 동의가 해당 제공업체에 전달됩니다.',
				customVendorsHeading: '사용자 지정 파트너',
				customVendorsNotice:
					'IAB 투명성 및 동의 프레임워크(TCF)에 등록되지 않은 사용자 지정 파트너입니다. 이들은 귀하의 동의에 따라 데이터를 처리하며, IAB에 등록된 공급업체와 개인정보 처리 관행이 다를 수 있습니다.',
				dataCategories: '데이터 카테고리',
				features: '기능',
				iabVendorsHeading: 'IAB 등록 공급업체',
				iabVendorsNotice:
					'이 파트너는 동의 관리를 위한 업계 표준인 IAB 투명성 및 동의 프레임워크(TCF)에 등록되어 있습니다',
				legitimateInterest: '정당한 이익',
				maxAge: '최대 유효 기간: {days}일',
				maxAgeRefreshes: '(갱신됨)',
				noVendorsFound: '"{searchTerm}"에 해당하는 공급업체가 없습니다',
				nonCookieAccess: '쿠키 외 액세스',
				partnerCount: '{count}개 파트너',
				partnerPlural: '파트너',
				partnerSingular: '파트너',
				privacyPolicy: '개인정보 처리방침',
				purposes: '목적',
				requiredNotice: '사이트 기능에 필수적이므로 비활성화할 수 없습니다',
				retainedDays: '{days}일 보관',
				retention: '보존 기간: {days}일',
				search: '공급업체 검색...',
				showingCount: '공급업체 {total}개 중 {filtered}개',
				specialFeatures: '특별 기능',
				specialPurposes: '특별 목적',
				storageDisclosure: '정보 저장에 관한 안내',
				usesCookies: '쿠키 사용',
			},
		},
	},
	legalLinks: {
		cookiePolicy: '쿠키 정책',
		privacyPolicy: '개인정보 처리방침',
		termsOfService: '서비스 이용약관',
	},
	optOut: {
		action: '거부',
		description:
			'이 사이트는 귀하의 개인정보를 판매하거나 공유하지 않으며, 선택 내용은 이 브라우저에 저장됩니다.',
		done: '완료',
		headingAll: '개인정보 판매 및 공유와 맞춤형 광고',
		headingSaleAndShare: '개인정보 판매 및 공유',
		headingSaleAndTargetedAds: '개인정보 판매 및 맞춤형 광고',
		lockedByAccount:
			'계정에서 거부로 설정되어 있으며, 로그인 후 변경할 수 있습니다.',
		lockedByGpc:
			'브라우저의 Global Privacy Control 신호가 켜져 있어 이 설정은 꺼진 상태로 유지됩니다.',
		notOptedOut: '이 브라우저에서 거부하지 않았습니다.',
		optInCancel: '옵트아웃 유지',
		optInConfirm: '다시 옵트인',
		optInDescription: '확인하면 이 브라우저에서의 옵트아웃이 종료됩니다.',
		optInDescriptionWithRights:
			'확인하면 이 브라우저에서의 {rights} 옵트아웃이 종료됩니다.',
		optInLink: '다시 옵트인…',
		optInTitle: '다시 옵트인하시겠습니까?',
		receiptAccount: '이 브라우저와 계정에서 거부 설정이 적용되었습니다.',
		receiptAccountWithRights:
			'이 브라우저와 계정에서 {rights}에 대한 거부 설정이 적용되었습니다.',
		receiptBrowser: '이 브라우저에서 거부 설정이 적용되었습니다.',
		receiptBrowserWithRights:
			'이 브라우저에서 {rights}에 대한 거부 설정이 적용되었습니다.',
		recordedLabel: '기록 시각',
		referenceLabel: '참조 번호',
		rightsAll: '판매, 공유 및 맞춤형 광고',
		rightsSaleAndShare: '판매 및 공유',
		rightsSaleAndTargetedAds: '판매 및 맞춤형 광고',
		statusRequest: '거부 요청이 반영되었습니다',
		statusSignal: '거부 기본 설정 신호가 반영되었습니다',
	},
	privacyChoices: {
		acceptAll: '모두 허용',
		advertisingFollowsSale: '광고는 위에서 선택한 내용을 따릅니다.',
		advertisingTitle: '광고',
		allow: '허용',
		alwaysOn: '항상 켜짐',
		announceSaved: '{message} 저장되었습니다.',
		askAll: '맞춤형 광고 목적을 포함하여 귀하의 개인정보를 판매하거나 공유할',
		askSaleAndShare: '귀하의 개인정보를 판매하거나 공유할',
		askSaleAndTargetedAds: '귀하의 개인정보를 판매하거나 맞춤형 광고에 사용할',
		bannerAllowedRightsOff:
			'선택적 쿠키가 허용되었습니다. {rights}는 꺼진 상태로 유지됩니다. 개인정보 보호 선택에서 변경할 수 있습니다.',
		bannerAllowedRightsOffGpc:
			'선택적 쿠키가 허용되었습니다. Global Privacy Control 신호에 따라 {rights}는 꺼진 상태로 유지됩니다. 개인정보 보호 선택에서 변경할 수 있습니다.',
		bannerRejected:
			'선택적 쿠키가 거부되었습니다. 개인정보 보호 선택에서 변경할 수 있습니다.',
		barDescription:
			'당사는 사용 환경을 개선하고 트래픽을 분석하기 위해 쿠키를 사용합니다.',
		businessFallback: '이 사이트',
		choiceRecorded: '선택 내용이 기록되었습니다.',
		choicesSaved:
			'선택 내용이 저장되었습니다. 개인정보 보호 선택에서 변경할 수 있습니다.',
		choose: '선택',
		chooseWhatToAllow: '허용할 항목 선택',
		close: '닫기',
		confirmDescriptionOptIn:
			'{business}에서 {rights} 수 있게 됩니다. 이 설정은 언제든지 변경할 수 있습니다.',
		confirmDescriptionOptOut:
			'{business}에서 {rights} 수 있게 됩니다. 언제든지 다시 거부할 수 있습니다.',
		confirmKeepOptedOut: '옵트아웃 유지',
		confirmTitleOptIn: '{rights}를 허용하시겠습니까?',
		confirmTitleOptOut: '{rights}를 다시 허용하시겠습니까?',
		copyFailed: '복사하지 못했습니다. 참조 번호를 선택하여 복사해 주십시오:',
		copyFailedAnnouncement:
			'복사하지 못했습니다. 전체 참조 번호는 확인 내역에 표시되어 있습니다.',
		copyReference: '참조 번호 복사',
		dialogIntro: '선택 내용은 즉시 적용됩니다.',
		dialogTitle: '개인정보 보호 선택',
		done: '완료',
		dontAllow: '허용 안 함',
		euDialogIntro:
			'{business}에서 사용할 수 있는 선택적 쿠키를 선택해 주십시오. 선택적 쿠키는 직접 켜기 전까지 꺼진 상태로 유지됩니다.',
		euDialogTitle: '개인정보 보호 설정',
		gpcNote:
			'브라우저에서 Global Privacy Control 신호를 보냈으므로 {business}에서는 {scope} {rights}. 신호가 켜져 있는 동안에는 허용을 선택할 수 없습니다.',
		justNow: '방금',
		nestedSheetNote: '변경 사항은 개인정보 보호 설정에서 저장하면 적용됩니다.',
		noticeBarDescription:
			'당사는 이 사이트 운영, 트래픽 측정, 광고 맞춤화를 위해 쿠키를 사용합니다. 언제든지 거부할 수 있습니다.',
		noticeBarDescriptionGpc:
			'당사는 이 사이트 운영과 트래픽 측정을 위해 쿠키를 사용합니다. 귀하의 Global Privacy Control 신호가 반영되었습니다.',
		noticeGpcHonored:
			'브라우저의 Global Privacy Control 신호가 반영되고 있습니다.',
		noticeRightsAction: '내 개인정보 판매 및 공유 거부',
		nudge: '먼저 두 버튼 중 하나를 선택해 주십시오.',
		optInBarDescription:
			'{business}에서는 선택적 쿠키를 사용하거나 {rights} 전에 먼저 동의를 구합니다.',
		optInDescription:
			'귀하가 허용하는 경우 {business}에서 사이트 기능 및 분석을 위해 선택적 쿠키를 사용하고 {rights} 수 있습니다. 허용하지 않으면 아무것도 켜지지 않습니다.',
		optInTitle: '개인정보 보호 선택',
		optOutOption: '거부',
		panelExpanded: '추가 옵션이 표시되었습니다.',
		policyColumn: '개인정보 처리방침',
		preferencesClose: '설정 닫기',
		preferencesOnCount: '{count}개 켜짐',
		preferencesSheetIntro: '변경 사항은 즉시 적용됩니다.',
		preferencesSummary: '사이트 기능 및 분석',
		preferencesTitle: '설정',
		purposeColumn: '목적',
		receiptAllowed: '{rights} 허용됨',
		receiptDetails: '세부 정보',
		receiptFromGpc: 'Global Privacy Control 신호에 따름',
		receiptLive:
			'이 브라우저의 Global Privacy Control 신호를 반영하고 있습니다',
		receiptLiveDetail: '방문할 때마다 브라우저에서 읽어 옵니다.',
		receiptOptedOut: '{rights} 거부됨',
		receiptRecorded: '기록 시각: {date}',
		receiptReference: '참조 번호',
		receiptSavedAccount: '계정에 저장됨 · {date}',
		receiptSavedBrowser: '이 브라우저에 저장됨 · {date}',
		receiptScopeAccount: '이 브라우저와 귀하의 {business} 계정에 적용됩니다.',
		receiptScopeAccountUnnamed: '이 브라우저와 귀하의 계정에 적용됩니다.',
		receiptScopeBrowser:
			'이 브라우저에 적용됩니다. 계정에도 적용하려면 로그인해 주십시오.',
		receiptViaGpc: 'Global Privacy Control 신호',
		referenceCopied: '참조 번호가 복사되었습니다.',
		refuseAll:
			'귀하의 개인정보를 판매하거나 공유하지 않으며 맞춤형 광고에도 사용하지 않습니다',
		refuseSaleAndShare: '귀하의 개인정보를 판매하거나 공유하지 않습니다',
		refuseSaleAndTargetedAds:
			'귀하의 개인정보를 판매하지 않으며 맞춤형 광고에도 사용하지 않습니다',
		rejectAll: '모두 거부',
		rightsAllowed: '{rights}가 허용되었습니다.',
		rightsNotAllowed: '{rights}가 허용되지 않았습니다.',
		rightsOptedOut: '{rights}를 거부했습니다.',
		saleAllowed: '{business}에서 {rights} 수 있습니다.',
		saleGroupOptIn: '{rights} 허용',
		saleGroupSaleAndTargetedAds: '내 개인정보 판매 및 맞춤형 광고 거부',
		saleOffByDefault:
			'기본적으로 꺼져 있습니다. 귀하가 허용하지 않는 한 {business}에서는 {rights}.',
		saleRefused: '{business}에서는 {scope} {rights}.',
		saveChoices: '선택 내용 저장',
		saveInSettings: '개인정보 보호 설정에서 선택 내용을 저장해 주십시오',
		savedAutomatically: '자동으로 저장됨',
		savedCue: '저장됨',
		scopeAccount: '이 브라우저와 귀하의 {business} 계정에 대해',
		scopeAccountUnnamed: '이 브라우저와 귀하의 계정에 대해',
		scopeBrowser: '이 브라우저에 대해',
		shortAll: '광고를 위해 귀하의 데이터를 판매 또는 공유하기',
		shortSaleAndShare: '귀하의 데이터를 판매 또는 공유하기',
		shortSaleAndTargetedAds: '귀하의 데이터를 판매하거나 광고에 사용하기',
		stateOff: '꺼짐',
		stateOn: '켜짐',
		switchColumn: '켜짐',
		switchedOff: '{name} 꺼짐.',
		switchedOn: '{name} 켜짐.',
		titleAll: '판매, 공유 및 맞춤형 광고',
		titleSaleAndShare: '판매 및 공유',
		titleSaleAndTargetedAds: '판매 및 맞춤형 광고',
		vendorColumn: '공급업체',
		vendorPolicy: '{vendor} 개인정보 처리방침',
		vendorsClose: '{category} 공급업체 닫기',
		vendorsFor: '({category})',
		vendorsHide: '공급업체 {count}개 숨기기',
		vendorsHideOne: '공급업체 1개 숨기기',
		vendorsOnCount: '{count}개 켜짐',
		vendorsTable: '{category} 공급업체',
		vendorsView: '공급업체 {count}개 보기',
		vendorsViewOne: '공급업체 1개 보기',
	},
	rights: {
		californiaPrivacyChoices: '캘리포니아 개인정보 보호 선택',
		optOut: '내 개인정보 판매 및 공유 거부',
		preferences: '설정 관리',
		privacyChoices: '개인정보 보호 선택',
	},
};

export default translations;
