import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Chấp nhận tất cả',
		acknowledge: 'Đã hiểu',
		close: 'Đóng',
		customize: 'Tùy chỉnh',
		dismiss: 'Bỏ qua',
		rejectAll: 'Từ chối tất cả',
		save: 'Lưu cài đặt',
		securedBy: 'Quản lý sự đồng ý bởi',
	},
	consentGate: {
		actionButton: 'Đồng ý cho {category}',
		error: 'Không thể tải nội dung này.',
		loading: 'Đang tải nội dung…',
		policyBlocked:
			'Nội dung này không khả dụng theo chính sách về sự đồng ý tại khu vực của bạn.',
		title: 'Vui lòng đồng ý cho {category} để xem nội dung này.',
	},
	consentManagerDialog: {
		description:
			'Tùy chỉnh cài đặt quyền riêng tư của bạn tại đây. Bạn có thể chọn những loại cookie và công nghệ theo dõi mà bạn cho phép.',
		title: 'Cài đặt quyền riêng tư',
		vendors: {
			disabledByCategory: 'Bật danh mục này để chọn nhà cung cấp.',
			privacyPolicy: 'Chính sách quyền riêng tư',
			switchLabel: 'Cho phép {vendor}',
			title: 'Nhà cung cấp ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Các cookie này giúp chúng tôi mang lại trải nghiệm người dùng tốt hơn và thử nghiệm các tính năng mới.',
			title: 'Trải nghiệm',
		},
		functionality: {
			description:
				'Các cookie này cho phép các chức năng nâng cao và cá nhân hóa trang web.',
			title: 'Chức năng',
		},
		marketing: {
			description:
				'Các cookie này được dùng để hiển thị quảng cáo phù hợp và đo lường hiệu quả của quảng cáo.',
			title: 'Tiếp thị',
		},
		measurement: {
			description:
				'Các cookie này giúp chúng tôi hiểu cách khách truy cập tương tác với trang web và cải thiện hiệu suất của trang.',
			title: 'Phân tích',
		},
		necessary: {
			description:
				'Các cookie này cần thiết để trang web hoạt động bình thường và không thể tắt.',
			title: 'Thiết yếu',
		},
	},
	cookieBanner: {
		description:
			'Trang web này sử dụng cookie để cải thiện trải nghiệm duyệt web, phân tích lưu lượng truy cập và hiển thị nội dung được cá nhân hóa.',
		noticeDescription:
			'Chúng tôi sử dụng cookie và các công nghệ tương tự để vận hành trang web này, đo lường lưu lượng truy cập và cá nhân hóa nội dung cũng như quảng cáo. Bạn có thể từ chối hoặc quản lý tùy chọn của mình bất cứ lúc nào.',
		noticeTitle: 'Thông báo về quyền riêng tư',
		title: 'Chúng tôi tôn trọng quyền riêng tư của bạn',
	},
	iab: {
		app: {
			consentStorage:
				'Lựa chọn của bạn được lưu trên thiết bị này, trong bộ nhớ cài đặt tiêu chuẩn của ứng dụng dưới các khóa IABTCF, tối đa {days} ngày. Thời hạn lưu trữ được gia hạn khi bạn cập nhật lựa chọn của mình.',
			description:
				'Chúng tôi và {partnerCount} đối tác lưu trữ và/hoặc truy cập thông tin trên thiết bị của bạn, đồng thời xử lý dữ liệu cá nhân như mã định danh duy nhất và dữ liệu duyệt web cho ứng dụng này, nhằm:',
			legitimateInterestExplanation:
				'Một số đối tác xử lý dữ liệu cá nhân như mã định danh duy nhất và dữ liệu duyệt web dựa trên lợi ích hợp pháp của họ thay vì yêu cầu sự đồng ý. Điều này chỉ áp dụng cho ứng dụng này. Bạn có quyền phản đối việc xử lý này đối với từng mục đích và từng đối tác.',
			scopeServiceSpecific:
				'Sự đồng ý của bạn chỉ áp dụng cho ứng dụng này và không ảnh hưởng đến các dịch vụ khác.',
			withdraw:
				'Bạn có thể thay đổi lựa chọn hoặc rút lại sự đồng ý bất cứ lúc nào trong Cài đặt quyền riêng tư của ứng dụng này.',
		},
		banner: {
			andMore: 'Và {count} mục khác...',
			description:
				'Chúng tôi và {partnerCount} đối tác lưu trữ và/hoặc truy cập thông tin trên thiết bị của bạn, đồng thời xử lý dữ liệu cá nhân như mã định danh duy nhất và dữ liệu duyệt web cho trang web này, nhằm:',
			legitimateInterestNotice:
				'Một số đối tác cho rằng họ có lợi ích hợp pháp để xử lý dữ liệu của bạn. Bạn có quyền phản đối việc xử lý này, tùy chỉnh lựa chọn của mình và rút lại sự đồng ý bất cứ lúc nào.',
			partnersLink: '{count} đối tác',
			scopeGroup:
				'Lựa chọn của bạn được áp dụng cho các trang web của chúng tôi trong nhóm này.',
			scopeServiceSpecific:
				'Sự đồng ý của bạn chỉ áp dụng cho trang web này và không ảnh hưởng đến các dịch vụ khác.',
			title: 'Cài đặt quyền riêng tư',
		},
		common: {
			acceptAll: 'Chấp nhận tất cả',
			clearSelection: 'Xóa',
			customPartner: 'Đối tác tùy chỉnh chưa đăng ký với IAB',
			customize: 'Tùy chỉnh',
			loading: 'Đang tải...',
			rejectAll: 'Từ chối tất cả',
			saveSettings: 'Lưu cài đặt',
			showingSelectedVendor: 'Đang hiển thị nhà cung cấp đã chọn',
		},
		preferenceCenter: {
			description:
				'Tùy chỉnh cài đặt quyền riêng tư của bạn tại đây. Bạn có thể chọn những loại cookie và công nghệ theo dõi mà bạn cho phép.',
			features: {
				description:
					'Các phương thức xử lý này chỉ có thể được sử dụng để phục vụ một hoặc nhiều mục đích mà bạn được quyền lựa chọn trong thông báo này.',
				title: 'Tính năng',
			},
			footer: {
				consentStorage:
					'Tùy chọn đồng ý được lưu trong cookie có tên "euconsent-v2" trong 13 tháng. Thời hạn lưu trữ có thể được gia hạn khi bạn cập nhật tùy chọn của mình.',
			},
			purposeItem: {
				examples: 'Ví dụ',
				legitimateInterest: 'Lợi ích hợp pháp',
				objectButton: 'Phản đối',
				objected: 'Đã phản đối',
				partners: '{count} đối tác',
				partnersUsingPurpose: 'Các đối tác sử dụng mục đích này',
				rightToObject:
					'Bạn có quyền phản đối việc xử lý dựa trên lợi ích hợp pháp.',
				vendorsUseLegitimateInterest:
					'{count} nhà cung cấp viện dẫn lợi ích hợp pháp',
				withYourPermission: 'Khi có sự cho phép của bạn',
			},
			specialPurposes: {
				title: 'Chức năng thiết yếu (Bắt buộc)',
				tooltip:
					'Các mục này cần thiết cho chức năng và bảo mật của trang web. Theo IAB TCF, bạn không thể phản đối các mục đích đặc biệt này.',
			},
			tabs: {
				purposes: 'Mục đích',
				vendors: 'Nhà cung cấp',
			},
			title: 'Cài đặt quyền riêng tư',
			vendorList: {
				adTechProvidersHeading: 'Nhà cung cấp công nghệ quảng cáo của Google',
				adTechProvidersNotice:
					'Google hợp tác với các nhà cung cấp công nghệ quảng cáo này ngoài khuôn khổ của IAB. Sự đồng ý của bạn chỉ được chuyển đến một nhà cung cấp khi bạn bật nhà cung cấp đó, đồng thời cho phép lưu trữ trên thiết bị và quảng cáo được cá nhân hóa.',
				customVendorsHeading: 'Đối tác tùy chỉnh',
				customVendorsNotice:
					'Đây là các đối tác tùy chỉnh chưa đăng ký với Khung Minh bạch & Đồng ý của IAB (TCF). Họ xử lý dữ liệu dựa trên sự đồng ý của bạn và có thể áp dụng các thông lệ về quyền riêng tư khác với các nhà cung cấp đã đăng ký với IAB.',
				dataCategories: 'Danh mục dữ liệu',
				features: 'Tính năng',
				iabVendorsHeading: 'Nhà cung cấp đã đăng ký với IAB',
				iabVendorsNotice:
					'Các đối tác này đã đăng ký với Khung Minh bạch & Đồng ý của IAB (TCF), một tiêu chuẩn ngành về quản lý sự đồng ý',
				legitimateInterest: 'Lợi ích hợp pháp',
				maxAge: 'Thời hạn tối đa: {days} ngày',
				maxAgeRefreshes: '(được gia hạn)',
				noVendorsFound:
					'Không tìm thấy nhà cung cấp nào khớp với "{searchTerm}"',
				nonCookieAccess: 'Truy cập không qua cookie',
				partnerCount: '{count} đối tác',
				partnerPlural: 'đối tác',
				partnerSingular: 'đối tác',
				privacyPolicy: 'Chính sách quyền riêng tư',
				purposes: 'Mục đích',
				requiredNotice: 'Cần thiết cho chức năng của trang web, không thể tắt',
				retainedDays: 'Lưu giữ: {days} ngày',
				retention: 'Thời gian lưu giữ: {days} ngày',
				search: 'Tìm kiếm nhà cung cấp...',
				showingCount: '{filtered} trên {total} nhà cung cấp',
				specialFeatures: 'Tính năng đặc biệt',
				specialPurposes: 'Mục đích đặc biệt',
				storageDisclosure: 'Công bố về lưu trữ',
				usesCookies: 'Sử dụng cookie',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Chính sách cookie',
		privacyPolicy: 'Chính sách quyền riêng tư',
		termsOfService: 'Điều khoản dịch vụ',
	},
	optOut: {
		action: 'Từ chối',
		description:
			'Trang web này sẽ không bán hoặc chia sẻ thông tin cá nhân của bạn và lựa chọn của bạn đã được lưu trên trình duyệt này.',
		done: 'Xong',
		headingAll:
			'Bán và chia sẻ thông tin cá nhân của bạn cũng như quảng cáo nhắm mục tiêu',
		headingSaleAndShare: 'Bán và chia sẻ thông tin cá nhân của bạn',
		headingSaleAndTargetedAds:
			'Bán thông tin cá nhân của bạn và quảng cáo nhắm mục tiêu',
		lockedByAccount:
			'Tài khoản của bạn đã chọn từ chối và bạn có thể thay đổi sau khi đăng nhập.',
		lockedByGpc:
			'Tín hiệu Global Privacy Control của trình duyệt đang bật nên tùy chọn này vẫn tắt.',
		notOptedOut: 'Bạn chưa từ chối trên trình duyệt này.',
		optInCancel: 'Giữ từ chối',
		optInConfirm: 'Tham gia lại',
		optInDescription:
			'Xác nhận sẽ kết thúc lựa chọn từ chối của bạn trên trình duyệt này.',
		optInDescriptionWithRights:
			'Xác nhận sẽ kết thúc lựa chọn từ chối {rights} của bạn trên trình duyệt này.',
		optInLink: 'Tham gia lại…',
		optInTitle: 'Tham gia lại?',
		receiptAccount: 'Bạn đã từ chối trên trình duyệt này và tài khoản của bạn.',
		receiptAccountWithRights:
			'Bạn đã từ chối {rights} trên trình duyệt này và tài khoản của bạn.',
		receiptBrowser: 'Bạn đã từ chối trên trình duyệt này.',
		receiptBrowserWithRights: 'Bạn đã từ chối {rights} trên trình duyệt này.',
		recordedLabel: 'Đã ghi nhận',
		referenceLabel: 'Mã tham chiếu',
		rightsAll: 'việc bán, chia sẻ và quảng cáo nhắm mục tiêu',
		rightsSaleAndShare: 'việc bán và chia sẻ',
		rightsSaleAndTargetedAds: 'việc bán và quảng cáo nhắm mục tiêu',
		statusRequest: 'Đã thực hiện yêu cầu từ chối',
		statusSignal: 'Đã thực hiện tín hiệu tùy chọn từ chối',
	},
	privacyChoices: {
		acceptAll: 'Chấp nhận tất cả',
		advertisingFollowsSale: 'Quảng cáo tuân theo lựa chọn của bạn ở trên.',
		advertisingTitle: 'Quảng cáo',
		allow: 'Cho phép',
		alwaysOn: 'Luôn bật',
		announceSaved: '{message} Đã lưu.',
		askAll:
			'bán hoặc chia sẻ thông tin cá nhân của bạn, kể cả cho quảng cáo nhắm mục tiêu',
		askSaleAndShare: 'bán hoặc chia sẻ thông tin cá nhân của bạn',
		askSaleAndTargetedAds:
			'bán thông tin cá nhân của bạn hoặc dùng thông tin đó cho quảng cáo nhắm mục tiêu',
		bannerAllowedRightsOff:
			'Đã cho phép cookie tùy chọn. {rights} vẫn tắt. Bạn có thể thay đổi trong mục Lựa chọn quyền riêng tư của bạn.',
		bannerAllowedRightsOffGpc:
			'Đã cho phép cookie tùy chọn. {rights} vẫn tắt do tín hiệu Global Privacy Control của bạn. Bạn có thể thay đổi trong mục Lựa chọn quyền riêng tư của bạn.',
		bannerRejected:
			'Đã từ chối cookie tùy chọn. Bạn có thể thay đổi trong mục Lựa chọn quyền riêng tư của bạn.',
		barDescription:
			'Chúng tôi sử dụng cookie để cải thiện trải nghiệm của bạn và phân tích lưu lượng truy cập.',
		businessFallback: 'trang web này',
		choiceRecorded: 'Đã ghi nhận lựa chọn.',
		choicesSaved:
			'Đã lưu lựa chọn. Bạn có thể thay đổi trong mục Lựa chọn quyền riêng tư của bạn.',
		choose: 'Chọn',
		chooseWhatToAllow: 'Chọn những gì bạn cho phép',
		close: 'Đóng',
		confirmDescriptionOptIn:
			'{business} có thể {rights}. Bạn có thể thay đổi bất cứ lúc nào.',
		confirmDescriptionOptOut:
			'{business} có thể {rights}. Bạn có thể từ chối lại bất cứ lúc nào.',
		confirmKeepOptedOut: 'Giữ từ chối',
		confirmTitleOptIn: 'Cho phép {rights}?',
		confirmTitleOptOut: 'Cho phép lại {rights}?',
		copyFailed:
			'Không sao chép được. Hãy chọn và sao chép mã tham chiếu của bạn:',
		copyFailedAnnouncement:
			'Không sao chép được. Mã tham chiếu đầy đủ được hiển thị trong biên nhận.',
		copyReference: 'Sao chép mã tham chiếu',
		dialogIntro: 'Lựa chọn của bạn có hiệu lực ngay.',
		dialogTitle: 'Lựa chọn quyền riêng tư của bạn',
		done: 'Xong',
		dontAllow: 'Không cho phép',
		euDialogIntro:
			'Chọn những cookie tùy chọn mà {business} được phép sử dụng. Cookie tùy chọn sẽ tắt trừ khi bạn bật.',
		euDialogTitle: 'Cài đặt quyền riêng tư',
		gpcNote:
			'Trình duyệt của bạn đã gửi tín hiệu Global Privacy Control, vì vậy {business} {rights} {scope}. Không thể chọn Cho phép khi tín hiệu đang bật.',
		justNow: 'vừa xong',
		nestedSheetNote:
			'Thay đổi có hiệu lực khi bạn lưu trong Cài đặt quyền riêng tư.',
		noticeBarDescription:
			'Chúng tôi sử dụng cookie để vận hành trang web này, đo lường lưu lượng truy cập và cá nhân hóa quảng cáo. Bạn có thể từ chối bất cứ lúc nào.',
		noticeBarDescriptionGpc:
			'Chúng tôi sử dụng cookie để vận hành trang web này và đo lường lưu lượng truy cập. Tín hiệu Global Privacy Control của bạn được tôn trọng.',
		noticeGpcHonored:
			'Tín hiệu Global Privacy Control của trình duyệt đang được tôn trọng.',
		noticeRightsAction: 'Không bán hoặc chia sẻ dữ liệu của tôi',
		nudge: 'Hãy chọn một trong hai nút trước.',
		optInBarDescription:
			'{business} sẽ hỏi bạn trước khi sử dụng cookie tùy chọn hoặc {rights}.',
		optInDescription:
			'Nếu bạn cho phép, {business} sẽ sử dụng cookie tùy chọn cho các tính năng của trang web và phân tích, đồng thời {rights}. Không có gì được bật trừ khi bạn cho phép.',
		optInTitle: 'Lựa chọn quyền riêng tư của bạn',
		optOutOption: 'Từ chối',
		panelExpanded: 'Đã hiển thị thêm tùy chọn.',
		policyColumn: 'Chính sách quyền riêng tư',
		preferencesClose: 'Đóng tùy chọn',
		preferencesOnCount: '{count} đang bật',
		preferencesSheetIntro: 'Thay đổi có hiệu lực ngay.',
		preferencesSummary: 'Tính năng của trang web và phân tích',
		preferencesTitle: 'Tùy chọn',
		purposeColumn: 'Mục đích',
		receiptAllowed: 'Đã cho phép {rights}',
		receiptDetails: 'Chi tiết',
		receiptFromGpc: 'từ tín hiệu Global Privacy Control của bạn',
		receiptLive: 'Đang tôn trọng Global Privacy Control từ trình duyệt này',
		receiptLiveDetail:
			'Được đọc từ trình duyệt của bạn trong mỗi lần truy cập.',
		receiptOptedOut: 'Đã từ chối {rights}',
		receiptRecorded: 'Đã ghi nhận: {date}',
		receiptReference: 'Mã tham chiếu',
		receiptSavedAccount: 'Đã lưu vào tài khoản của bạn · {date}',
		receiptSavedBrowser: 'Đã lưu cho trình duyệt này · {date}',
		receiptScopeAccount:
			'Áp dụng cho trình duyệt này và tài khoản {business} của bạn.',
		receiptScopeAccountUnnamed:
			'Áp dụng cho trình duyệt này và tài khoản của bạn.',
		receiptScopeBrowser:
			'Áp dụng cho trình duyệt này. Đăng nhập để áp dụng cho cả tài khoản của bạn.',
		receiptViaGpc: 'Tín hiệu Global Privacy Control',
		referenceCopied: 'Đã sao chép mã tham chiếu.',
		refuseAll:
			'sẽ không bán hoặc chia sẻ thông tin cá nhân của bạn, cũng không dùng thông tin đó cho quảng cáo nhắm mục tiêu',
		refuseSaleAndShare: 'sẽ không bán hoặc chia sẻ thông tin cá nhân của bạn',
		refuseSaleAndTargetedAds:
			'sẽ không bán thông tin cá nhân của bạn hoặc dùng thông tin đó cho quảng cáo nhắm mục tiêu',
		rejectAll: 'Từ chối tất cả',
		rightsAllowed: '{rights} được cho phép.',
		rightsNotAllowed: '{rights} không được cho phép.',
		rightsOptedOut: 'Đã từ chối {rights}.',
		saleAllowed: '{business} có thể {rights}.',
		saleGroupOptIn: 'Cho phép {rights}',
		saleGroupSaleAndTargetedAds:
			'Từ chối việc bán dữ liệu cá nhân của tôi và quảng cáo nhắm mục tiêu',
		saleOffByDefault:
			'Tắt theo mặc định. {business} {rights} trừ khi bạn cho phép.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Lưu lựa chọn',
		saveInSettings: 'Lưu lựa chọn của bạn trong Cài đặt quyền riêng tư',
		savedAutomatically: 'Tự động lưu',
		savedCue: 'Đã lưu',
		scopeAccount: 'trên trình duyệt này hoặc cho tài khoản {business} của bạn',
		scopeAccountUnnamed: 'trên trình duyệt này hoặc cho tài khoản của bạn',
		scopeBrowser: 'trên trình duyệt này',
		shortAll: 'bán hoặc chia sẻ dữ liệu của bạn cho quảng cáo',
		shortSaleAndShare: 'bán hoặc chia sẻ dữ liệu của bạn',
		shortSaleAndTargetedAds:
			'bán dữ liệu của bạn hoặc dùng dữ liệu đó cho quảng cáo',
		stateOff: 'Tắt',
		stateOn: 'Bật',
		switchColumn: 'Bật',
		switchedOff: 'Đã tắt {name}.',
		switchedOn: 'Đã bật {name}.',
		titleAll: 'Việc bán, chia sẻ và quảng cáo nhắm mục tiêu',
		titleSaleAndShare: 'Việc bán và chia sẻ',
		titleSaleAndTargetedAds: 'Việc bán và quảng cáo nhắm mục tiêu',
		vendorColumn: 'Nhà cung cấp',
		vendorPolicy: 'Chính sách quyền riêng tư của {vendor}',
		vendorsClose: 'Đóng danh sách nhà cung cấp {category}',
		vendorsFor: 'cho {category}',
		vendorsHide: 'Ẩn {count} nhà cung cấp',
		vendorsHideOne: 'Ẩn 1 nhà cung cấp',
		vendorsOnCount: '{count} đang bật',
		vendorsTable: 'Nhà cung cấp {category}',
		vendorsView: 'Xem {count} nhà cung cấp',
		vendorsViewOne: 'Xem 1 nhà cung cấp',
	},
	rights: {
		californiaPrivacyChoices: 'Lựa chọn quyền riêng tư tại California của bạn',
		optOut: 'Không bán hoặc chia sẻ dữ liệu của tôi',
		preferences: 'Quản lý tùy chọn',
		privacyChoices: 'Lựa chọn quyền riêng tư của bạn',
	},
};

export default translations;
