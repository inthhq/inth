import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'すべて同意する',
		acknowledge: '了解しました',
		close: '閉じる',
		customize: '設定を変更する',
		dismiss: '非表示にする',
		rejectAll: 'すべて拒否する',
		save: '設定を保存する',
		securedBy: '同意管理:',
	},
	consentGate: {
		actionButton: '{category}に関する同意を有効にする',
		error: 'このコンテンツを読み込めませんでした。',
		loading: 'コンテンツを読み込んでいます…',
		policyBlocked:
			'お住まいの地域の同意ポリシーにより、このコンテンツはご利用いただけません。',
		title: 'このコンテンツを表示するには、{category}に関する同意が必要です。',
	},
	consentManagerDialog: {
		description:
			'ここでプライバシー設定を変更できます。許可するクッキーやトラッキング技術の種類をお選びください。',
		title: 'プライバシー設定',
		vendors: {
			disabledByCategory:
				'ベンダーを選択するには、このカテゴリを有効にしてください。',
			privacyPolicy: 'プライバシーポリシー',
			switchLabel: '{vendor}を許可する',
			title: 'ベンダー（{count}）',
		},
	},
	consentTypes: {
		experience: {
			description:
				'これらのクッキーは、より良いユーザー体験の提供や新機能のテストに役立ちます。',
			title: 'ユーザー体験',
		},
		functionality: {
			description:
				'これらのクッキーは、ウェブサイトの拡張機能やパーソナライズを可能にします。',
			title: '機能性',
		},
		marketing: {
			description:
				'これらのクッキーは、関連性の高い広告の配信とその効果測定に使用されます。',
			title: 'マーケティング',
		},
		measurement: {
			description:
				'これらのクッキーは、訪問者によるウェブサイトの利用状況を把握し、パフォーマンスを改善するのに役立ちます。',
			title: '分析',
		},
		necessary: {
			description:
				'これらのクッキーはウェブサイトが正常に機能するために不可欠であり、無効にすることはできません。',
			title: '必須',
		},
	},
	cookieBanner: {
		description:
			'当サイトでは、閲覧体験の向上、サイトのトラフィック分析、パーソナライズされたコンテンツの表示のためにクッキーを使用しています。',
		noticeDescription:
			'当サイトでは、サイトの運営、トラフィックの測定、コンテンツや広告のパーソナライズのために、クッキーおよび類似の技術を使用しています。オプトアウトや設定の管理はいつでも行えます。',
		noticeTitle: 'プライバシーに関するお知らせ',
		title: 'お客様のプライバシーを尊重します',
	},
	iab: {
		app: {
			consentStorage:
				'選択内容は、この端末上のアプリの標準設定ストレージにIABTCFキーで最長{days}日間保存されます。選択内容を更新すると、保存期間が更新されます。',
			description:
				'当社および{partnerCount}社のパートナーは、このアプリにおいて以下の目的のために、お客様の端末への情報の保存や端末上の情報へのアクセスを行い、固有識別子や閲覧データなどの個人データを処理します：',
			legitimateInterestExplanation:
				'一部のパートナーは、同意を求める代わりに、正当な利益に基づいて固有識別子や閲覧データなどの個人データを処理します。これはこのアプリにのみ適用されます。お客様には、目的ごと、パートナーごとにこの処理に異議を申し立てる権利があります。',
			scopeServiceSpecific:
				'お客様の同意はこのアプリにのみ適用され、他のサービスには影響しません。',
			withdraw:
				'このアプリのプライバシー設定から、いつでも選択内容を変更したり、同意を撤回したりできます。',
		},
		banner: {
			andMore: 'ほか{count}件...',
			description:
				'当社および{partnerCount}社のパートナーは、このウェブサイトにおいて以下の目的のために、お客様の端末への情報の保存や端末上の情報へのアクセスを行い、固有識別子や閲覧データなどの個人データを処理します：',
			legitimateInterestNotice:
				'一部のパートナーは、お客様のデータを処理することについて正当な利益を主張しています。お客様には、この処理に異議を申し立て、選択内容を変更し、いつでも同意を撤回する権利があります。',
			partnersLink: '{count}社のパートナー',
			scopeGroup:
				'お客様の選択は、このグループに属する当社のすべてのウェブサイトに適用されます。',
			scopeServiceSpecific:
				'お客様の同意はこのウェブサイトにのみ適用され、他のサービスには影響しません。',
			title: 'プライバシー設定',
		},
		common: {
			acceptAll: 'すべて同意する',
			clearSelection: 'クリア',
			customPartner: 'IABに登録されていないカスタムパートナー',
			customize: '設定を変更する',
			loading: '読み込み中...',
			rejectAll: 'すべて拒否する',
			saveSettings: '設定を保存する',
			showingSelectedVendor: '選択したベンダーを表示しています',
		},
		preferenceCenter: {
			description:
				'ここでプライバシー設定を変更できます。許可するクッキーやトラッキング技術の種類をお選びください。',
			features: {
				description:
					'これらの処理方法は、本通知でお客様に選択肢が提示されている1つ以上の目的を達成するためにのみ使用されます。',
				title: '特徴',
			},
			footer: {
				consentStorage:
					'同意の設定は「euconsent-v2」という名前のクッキーに13か月間保存されます。設定を更新すると、保存期間が延長される場合があります。',
			},
			purposeItem: {
				examples: '例',
				legitimateInterest: '正当な利益',
				objectButton: '異議を申し立てる',
				objected: '異議申し立て済み',
				partners: '{count}社のパートナー',
				partnersUsingPurpose: 'この目的を利用するパートナー',
				rightToObject:
					'お客様には、正当な利益に基づく処理に異議を申し立てる権利があります。',
				vendorsUseLegitimateInterest:
					'{count}社のベンダーが正当な利益を主張しています',
				withYourPermission: 'お客様の同意に基づく',
			},
			specialPurposes: {
				title: '基本機能（必須）',
				tooltip:
					'これらはサイトの機能とセキュリティに必要です。IAB TCFにより、これらの特別な目的に異議を申し立てることはできません。',
			},
			tabs: {
				purposes: '目的',
				vendors: 'ベンダー',
			},
			title: 'プライバシー設定',
			vendorList: {
				adTechProvidersHeading: 'Googleの広告技術プロバイダ',
				adTechProvidersNotice:
					'Googleは、IABのフレームワーク外でこれらの広告技術プロバイダと連携しています。お客様の同意がプロバイダに伝わるのは、そのプロバイダを有効にし、かつ端末への保存とパーソナライズ広告の両方を許可した場合のみです。',
				customVendorsHeading: 'カスタムパートナー',
				customVendorsNotice:
					'これらは、IABの透明性と同意に関する枠組み（TCF）に登録されていないカスタムパートナーです。お客様の同意に基づいてデータを処理し、IABに登録されたベンダーとはプライバシーへの取り組みが異なる場合があります。',
				dataCategories: 'データカテゴリ',
				features: '特徴',
				iabVendorsHeading: 'IAB登録ベンダー',
				iabVendorsNotice:
					'これらのパートナーは、同意管理の業界標準であるIABの透明性と同意に関する枠組み（TCF）に登録されています',
				legitimateInterest: '正当な利益',
				maxAge: '最大保存期間：{days}日',
				maxAgeRefreshes: '（更新あり）',
				noVendorsFound:
					'「{searchTerm}」に一致するベンダーは見つかりませんでした',
				nonCookieAccess: 'クッキー以外のアクセス',
				partnerCount: '{count}社のパートナー',
				partnerPlural: '社のパートナー',
				partnerSingular: '社のパートナー',
				privacyPolicy: 'プライバシーポリシー',
				purposes: '目的',
				requiredNotice: 'サイトの機能に必要なため、無効にできません',
				retainedDays: '保存期間：{days}日',
				retention: '保持期間：{days}日',
				search: 'ベンダーを検索...',
				showingCount: '{total}社中{filtered}社のベンダー',
				specialFeatures: '特別な特徴',
				specialPurposes: '特別な目的',
				storageDisclosure: '保存に関する開示',
				usesCookies: 'クッキーを使用',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'クッキーポリシー',
		privacyPolicy: 'プライバシーポリシー',
		termsOfService: '利用規約',
	},
	optOut: {
		action: 'オプトアウト',
		description:
			'このサイトはあなたの個人情報を販売または共有しません。この選択はこのブラウザに保存されています。',
		done: '完了',
		headingAll: '個人情報の販売・共有およびターゲティング広告',
		headingSaleAndShare: '個人情報の販売および共有',
		headingSaleAndTargetedAds: '個人情報の販売およびターゲティング広告',
		lockedByAccount:
			'アカウントでオプトアウトが設定されています。サインイン後に変更できます。',
		lockedByGpc:
			'ブラウザのGlobal Privacy Control信号がオンになっているため、これはオフのままになります。',
		notOptedOut: 'このブラウザではオプトアウトしていません。',
		optInCancel: 'オプトアウトを維持',
		optInConfirm: '再度オプトインする',
		optInDescription: '確認すると、このブラウザでのオプトアウトが終了します。',
		optInDescriptionWithRights:
			'確認すると、このブラウザでの{rights}のオプトアウトが終了します。',
		optInLink: '再度オプトインする…',
		optInTitle: '再度オプトインしますか？',
		receiptAccount: 'このブラウザとアカウントでオプトアウトされています。',
		receiptAccountWithRights:
			'このブラウザとアカウントで{rights}からオプトアウトされています。',
		receiptBrowser: 'このブラウザでオプトアウトされています。',
		receiptBrowserWithRights:
			'このブラウザで{rights}からオプトアウトされています。',
		recordedLabel: '記録日時',
		referenceLabel: '参照番号',
		rightsAll: '販売、共有、ターゲティング広告',
		rightsSaleAndShare: '販売および共有',
		rightsSaleAndTargetedAds: '販売およびターゲティング広告',
		statusRequest: 'オプトアウトのリクエストを反映しました',
		statusSignal: 'オプトアウト設定信号を反映しました',
	},
	privacyChoices: {
		acceptAll: 'すべて同意する',
		advertisingFollowsSale: '広告は上記の選択に従います。',
		advertisingTitle: '広告',
		allow: '許可する',
		alwaysOn: '常にオン',
		announceSaved: '{message}保存しました。',
		askAll:
			'ターゲティング広告目的を含め、お客様の個人情報を販売または共有する',
		askSaleAndShare: 'お客様の個人情報を販売または共有する',
		askSaleAndTargetedAds:
			'お客様の個人情報を販売する、またはターゲティング広告に利用する',
		bannerAllowedRightsOff:
			'任意のクッキーを許可しました。{rights}はオフのままです。「プライバシーの選択」で変更できます。',
		bannerAllowedRightsOffGpc:
			'任意のクッキーを許可しました。Global Privacy Control信号により、{rights}はオフのままです。「プライバシーの選択」で変更できます。',
		bannerRejected:
			'任意のクッキーを拒否しました。「プライバシーの選択」で変更できます。',
		barDescription:
			'当サイトでは、利便性の向上とトラフィック分析のためにクッキーを使用しています。',
		businessFallback: '当サイト',
		choiceRecorded: '選択を記録しました。',
		choicesSaved: '選択を保存しました。「プライバシーの選択」で変更できます。',
		choose: '選択する',
		chooseWhatToAllow: '許可する項目を選択する',
		close: '閉じる',
		confirmDescriptionOptIn:
			'{business}は、{rights}ことができるようになります。この設定はいつでも変更できます。',
		confirmDescriptionOptOut:
			'{business}は、{rights}ことができるようになります。いつでも再度オプトアウトできます。',
		confirmKeepOptedOut: 'オプトアウトを維持',
		confirmTitleOptIn: '{rights}を許可しますか？',
		confirmTitleOptOut: '{rights}を再度許可しますか？',
		copyFailed: 'コピーできませんでした。参照番号を選択してコピーしてください:',
		copyFailedAnnouncement:
			'コピーできませんでした。参照番号の全体は記録に表示されています。',
		copyReference: '参照番号をコピー',
		dialogIntro: '選択内容はすぐに反映されます。',
		dialogTitle: 'プライバシーの選択',
		done: '完了',
		dontAllow: '許可しない',
		euDialogIntro:
			'{business}が使用できる任意のクッキーをお選びください。任意のクッキーは、オンにしない限りオフのままです。',
		euDialogTitle: 'プライバシー設定',
		gpcNote:
			'お使いのブラウザからGlobal Privacy Control信号が送信されたため、{business}は{scope}、{rights}。信号がオンの間は「許可する」を選択できません。',
		justNow: 'たった今',
		nestedSheetNote: '変更は、プライバシー設定で保存すると反映されます。',
		noticeBarDescription:
			'当サイトでは、サイトの運営、トラフィックの測定、広告のパーソナライズのためにクッキーを使用しています。オプトアウトはいつでも行えます。',
		noticeBarDescriptionGpc:
			'当サイトでは、サイトの運営とトラフィックの測定のためにクッキーを使用しています。お客様のGlobal Privacy Control信号を反映しています。',
		noticeGpcHonored: 'ブラウザのGlobal Privacy Control信号を反映しています。',
		noticeRightsAction: '個人データの販売・共有を拒否する',
		nudge: 'まず、2つのボタンのいずれかを選択してください。',
		optInBarDescription:
			'{business}は、任意のクッキーの使用や{rights}の前に、お客様の許可を求めます。',
		optInDescription:
			'お客様の許可をいただいた場合、{business}はサイト機能と分析のために任意のクッキーを使用し、{rights}ことがあります。許可しない限り、何も有効になりません。',
		optInTitle: 'プライバシーの選択',
		optOutOption: 'オプトアウト',
		panelExpanded: 'その他のオプションを表示しました。',
		policyColumn: 'プライバシーポリシー',
		preferencesClose: '設定を閉じる',
		preferencesOnCount: '{count}件オン',
		preferencesSheetIntro: '変更はすぐに反映されます。',
		preferencesSummary: 'サイト機能と分析',
		preferencesTitle: '設定',
		purposeColumn: '目的',
		receiptAllowed: '{rights}を許可済み',
		receiptDetails: '詳細',
		receiptFromGpc: 'Global Privacy Control信号による',
		receiptLive: 'このブラウザのGlobal Privacy Control信号を反映しています',
		receiptLiveDetail: 'アクセスのたびにブラウザから読み取ります。',
		receiptOptedOut: '{rights}からオプトアウト済み',
		receiptRecorded: '記録日時: {date}',
		receiptReference: '参照番号',
		receiptSavedAccount: 'アカウントに保存済み · {date}',
		receiptSavedBrowser: 'このブラウザに保存済み · {date}',
		receiptScopeAccount:
			'このブラウザとお客様の{business}アカウントに適用されます。',
		receiptScopeAccountUnnamed:
			'このブラウザとお客様のアカウントに適用されます。',
		receiptScopeBrowser:
			'このブラウザに適用されます。アカウントにも適用するには、サインインしてください。',
		receiptViaGpc: 'Global Privacy Control信号',
		referenceCopied: '参照番号をコピーしました。',
		refuseAll:
			'お客様の個人情報を販売・共有せず、ターゲティング広告にも利用しません',
		refuseSaleAndShare: 'お客様の個人情報を販売または共有しません',
		refuseSaleAndTargetedAds:
			'お客様の個人情報を販売せず、ターゲティング広告にも利用しません',
		rejectAll: 'すべて拒否する',
		rightsAllowed: '{rights}を許可しました。',
		rightsNotAllowed: '{rights}を許可していません。',
		rightsOptedOut: '{rights}からオプトアウトしました。',
		saleAllowed: '{business}は、{rights}ことができます。',
		saleGroupOptIn: '{rights}を許可する',
		saleGroupSaleAndTargetedAds:
			'個人データの販売とターゲティング広告からオプトアウトする',
		saleOffByDefault:
			'初期設定ではオフです。お客様が許可しない限り、{business}は{rights}。',
		saleRefused: '{business}は、{scope}、{rights}。',
		saveChoices: '選択を保存する',
		saveInSettings: 'プライバシー設定で選択を保存してください',
		savedAutomatically: '自動的に保存されます',
		savedCue: '保存しました',
		scopeAccount: 'このブラウザおよびお客様の{business}アカウントでは',
		scopeAccountUnnamed: 'このブラウザおよびお客様のアカウントでは',
		scopeBrowser: 'このブラウザでは',
		shortAll: '広告目的でのデータの販売・共有',
		shortSaleAndShare: 'データの販売・共有',
		shortSaleAndTargetedAds: 'データの販売や広告への利用',
		stateOff: 'オフ',
		stateOn: 'オン',
		switchColumn: 'オン',
		switchedOff: '{name}をオフにしました。',
		switchedOn: '{name}をオンにしました。',
		titleAll: '販売、共有、ターゲティング広告',
		titleSaleAndShare: '販売および共有',
		titleSaleAndTargetedAds: '販売およびターゲティング広告',
		vendorColumn: 'ベンダー',
		vendorPolicy: '{vendor}のプライバシーポリシー',
		vendorsClose: '{category}のベンダーを閉じる',
		vendorsFor: '（{category}）',
		vendorsHide: '{count}件のベンダーを非表示',
		vendorsHideOne: '1件のベンダーを非表示',
		vendorsOnCount: '{count}件オン',
		vendorsTable: '{category}のベンダー',
		vendorsView: '{count}件のベンダーを表示',
		vendorsViewOne: '1件のベンダーを表示',
	},
	rights: {
		californiaPrivacyChoices: 'カリフォルニア州におけるプライバシーの選択',
		optOut: '個人データの販売・共有を拒否する',
		preferences: '設定を管理する',
		privacyChoices: 'プライバシーの選択',
	},
};

export default translations;
