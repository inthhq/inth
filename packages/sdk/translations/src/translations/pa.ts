import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'ਸਭ ਸਵੀਕਾਰ ਕਰੋ',
		acknowledge: 'ਠੀਕ ਹੈ',
		close: 'ਬੰਦ ਕਰੋ',
		customize: 'ਅਨੁਕੂਲਿਤ ਕਰੋ',
		dismiss: 'ਲੁਕਾਓ',
		rejectAll: 'ਸਭ ਰੱਦ ਕਰੋ',
		save: 'ਸੈਟਿੰਗਾਂ ਸੰਭਾਲੋ',
		securedBy: 'ਸਹਿਮਤੀ ਪ੍ਰਦਾਤਾ:',
	},
	consentGate: {
		actionButton: '{category} ਲਈ ਸਹਿਮਤੀ ਦਿਓ',
		error: 'ਇਹ ਸਮੱਗਰੀ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕੀ।',
		loading: 'ਸਮੱਗਰੀ ਲੋਡ ਹੋ ਰਹੀ ਹੈ…',
		policyBlocked: 'ਤੁਹਾਡੇ ਖੇਤਰ ਦੀ ਸਹਿਮਤੀ ਨੀਤੀ ਅਧੀਨ ਇਹ ਸਮੱਗਰੀ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।',
		title: 'ਇਹ ਸਮੱਗਰੀ ਦੇਖਣ ਵਾਸਤੇ {category} ਲਈ ਸਹਿਮਤੀ ਦਿਓ।',
	},
	consentManagerDialog: {
		description:
			'ਆਪਣੀਆਂ ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਇੱਥੇ ਬਦਲੋ। ਤੁਸੀਂ ਚੁਣ ਸਕਦੇ ਹੋ ਕਿ ਕਿਸ ਤਰ੍ਹਾਂ ਦੀਆਂ ਕੂਕੀਜ਼ ਅਤੇ ਟਰੈਕਿੰਗ ਤਕਨੀਕਾਂ ਦੀ ਇਜਾਜ਼ਤ ਦੇਣੀ ਹੈ।',
		title: 'ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ',
		vendors: {
			disabledByCategory: 'ਵਿਕਰੇਤਾ ਚੁਣਨ ਲਈ ਇਹ ਸ਼੍ਰੇਣੀ ਚਾਲੂ ਕਰੋ।',
			privacyPolicy: 'ਪਰਦੇਦਾਰੀ ਨੀਤੀ',
			switchLabel: '{vendor} ਨੂੰ ਇਜਾਜ਼ਤ ਦਿਓ',
			title: 'ਵਿਕਰੇਤਾ ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'ਇਹ ਕੂਕੀਜ਼ ਸਾਨੂੰ ਬਿਹਤਰ ਵਰਤੋਂਕਾਰ ਅਨੁਭਵ ਦੇਣ ਅਤੇ ਨਵੀਆਂ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਦੀ ਜਾਂਚ ਕਰਨ ਵਿੱਚ ਮਦਦ ਕਰਦੀਆਂ ਹਨ।',
			title: 'ਅਨੁਭਵ',
		},
		functionality: {
			description:
				'ਇਹ ਕੂਕੀਜ਼ ਵੈੱਬਸਾਈਟ ਦੀ ਵਧੀਕ ਕਾਰਜਸ਼ੀਲਤਾ ਅਤੇ ਨਿੱਜੀਕਰਨ ਨੂੰ ਸੰਭਵ ਬਣਾਉਂਦੀਆਂ ਹਨ।',
			title: 'ਕਾਰਜਸ਼ੀਲਤਾ',
		},
		marketing: {
			description:
				'ਇਹ ਕੂਕੀਜ਼ ਢੁਕਵੇਂ ਇਸ਼ਤਿਹਾਰ ਦਿਖਾਉਣ ਅਤੇ ਉਹਨਾਂ ਦੇ ਅਸਰ ਨੂੰ ਮਾਪਣ ਲਈ ਵਰਤੀਆਂ ਜਾਂਦੀਆਂ ਹਨ।',
			title: 'ਮਾਰਕੀਟਿੰਗ',
		},
		measurement: {
			description:
				'ਇਹ ਕੂਕੀਜ਼ ਸਾਨੂੰ ਇਹ ਸਮਝਣ ਵਿੱਚ ਮਦਦ ਕਰਦੀਆਂ ਹਨ ਕਿ ਵਿਜ਼ਟਰ ਵੈੱਬਸਾਈਟ ਨੂੰ ਕਿਵੇਂ ਵਰਤਦੇ ਹਨ, ਤਾਂ ਜੋ ਅਸੀਂ ਇਸ ਦੀ ਕਾਰਗੁਜ਼ਾਰੀ ਸੁਧਾਰ ਸਕੀਏ।',
			title: 'ਵਿਸ਼ਲੇਸ਼ਣ',
		},
		necessary: {
			description:
				'ਇਹ ਕੂਕੀਜ਼ ਵੈੱਬਸਾਈਟ ਦੇ ਠੀਕ ਢੰਗ ਨਾਲ ਚੱਲਣ ਲਈ ਜ਼ਰੂਰੀ ਹਨ ਅਤੇ ਇਹਨਾਂ ਨੂੰ ਬੰਦ ਨਹੀਂ ਕੀਤਾ ਜਾ ਸਕਦਾ।',
			title: 'ਲਾਜ਼ਮੀ',
		},
	},
	cookieBanner: {
		description:
			'ਇਹ ਸਾਈਟ ਤੁਹਾਡੇ ਬ੍ਰਾਊਜ਼ਿੰਗ ਅਨੁਭਵ ਨੂੰ ਬਿਹਤਰ ਬਣਾਉਣ, ਸਾਈਟ ਟ੍ਰੈਫ਼ਿਕ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰਨ ਅਤੇ ਤੁਹਾਡੀ ਪਸੰਦ ਮੁਤਾਬਕ ਸਮੱਗਰੀ ਦਿਖਾਉਣ ਲਈ ਕੂਕੀਜ਼ ਵਰਤਦੀ ਹੈ।',
		noticeDescription:
			'ਅਸੀਂ ਇਹ ਸਾਈਟ ਚਲਾਉਣ, ਟ੍ਰੈਫ਼ਿਕ ਮਾਪਣ ਅਤੇ ਸਮੱਗਰੀ ਤੇ ਇਸ਼ਤਿਹਾਰਾਂ ਨੂੰ ਤੁਹਾਡੀ ਪਸੰਦ ਮੁਤਾਬਕ ਢਾਲਣ ਲਈ ਕੂਕੀਜ਼ ਅਤੇ ਮਿਲਦੀਆਂ-ਜੁਲਦੀਆਂ ਤਕਨੀਕਾਂ ਵਰਤਦੇ ਹਾਂ। ਤੁਸੀਂ ਕਿਸੇ ਵੀ ਸਮੇਂ ਇਸ ਤੋਂ ਬਾਹਰ ਹੋ ਸਕਦੇ ਹੋ ਜਾਂ ਆਪਣੀਆਂ ਤਰਜੀਹਾਂ ਦਾ ਪ੍ਰਬੰਧ ਕਰ ਸਕਦੇ ਹੋ।',
		noticeTitle: 'ਪਰਦੇਦਾਰੀ ਸੂਚਨਾ',
		title: 'ਅਸੀਂ ਤੁਹਾਡੀ ਪਰਦੇਦਾਰੀ ਦੀ ਕਦਰ ਕਰਦੇ ਹਾਂ',
	},
	iab: {
		app: {
			consentStorage:
				'ਤੁਹਾਡੀਆਂ ਚੋਣਾਂ ਇਸ ਡਿਵਾਈਸ ਉੱਤੇ, ਐਪ ਦੀ ਮਿਆਰੀ ਸੈਟਿੰਗ ਸਟੋਰੇਜ ਵਿੱਚ IABTCF ਕੁੰਜੀਆਂ ਹੇਠ, ਵੱਧ ਤੋਂ ਵੱਧ {days} ਦਿਨਾਂ ਲਈ ਸਟੋਰ ਕੀਤੀਆਂ ਜਾਂਦੀਆਂ ਹਨ। ਜਦੋਂ ਤੁਸੀਂ ਆਪਣੀਆਂ ਚੋਣਾਂ ਬਦਲਦੇ ਹੋ, ਤਾਂ ਸਟੋਰੇਜ ਦੀ ਮਿਆਦ ਨਵੇਂ ਸਿਰਿਓਂ ਸ਼ੁਰੂ ਹੁੰਦੀ ਹੈ।',
			description:
				'ਅਸੀਂ ਅਤੇ ਸਾਡੇ {partnerCount} ਭਾਈਵਾਲ ਇਸ ਐਪ ਲਈ, ਹੇਠ ਲਿਖੇ ਮਕਸਦਾਂ ਵਾਸਤੇ, ਤੁਹਾਡੇ ਡਿਵਾਈਸ ਉੱਤੇ ਜਾਣਕਾਰੀ ਸਟੋਰ ਕਰਦੇ ਹਾਂ ਅਤੇ/ਜਾਂ ਉਸ ਤੱਕ ਪਹੁੰਚ ਕਰਦੇ ਹਾਂ, ਅਤੇ ਨਿੱਜੀ ਡਾਟੇ, ਜਿਵੇਂ ਕਿ ਵਿਲੱਖਣ ਪਛਾਣਕਰਤਾ ਅਤੇ ਬ੍ਰਾਊਜ਼ਿੰਗ ਡਾਟਾ, ਉੱਤੇ ਕਾਰਵਾਈ ਕਰਦੇ ਹਾਂ:',
			legitimateInterestExplanation:
				'ਕੁਝ ਭਾਈਵਾਲ ਸਹਿਮਤੀ ਮੰਗਣ ਦੀ ਬਜਾਏ ਆਪਣੇ ਜਾਇਜ਼ ਹਿੱਤ ਦੇ ਆਧਾਰ ਉੱਤੇ ਨਿੱਜੀ ਡਾਟੇ, ਜਿਵੇਂ ਕਿ ਵਿਲੱਖਣ ਪਛਾਣਕਰਤਾ ਅਤੇ ਬ੍ਰਾਊਜ਼ਿੰਗ ਡਾਟਾ, ਉੱਤੇ ਕਾਰਵਾਈ ਕਰਦੇ ਹਨ। ਇਹ ਸਿਰਫ਼ ਇਸ ਐਪ ਉੱਤੇ ਲਾਗੂ ਹੁੰਦਾ ਹੈ। ਤੁਹਾਨੂੰ ਹਰ ਮਕਸਦ ਅਤੇ ਹਰ ਭਾਈਵਾਲ ਲਈ ਇਸ ਕਾਰਵਾਈ ਉੱਤੇ ਇਤਰਾਜ਼ ਕਰਨ ਦਾ ਹੱਕ ਹੈ।',
			scopeServiceSpecific:
				'ਤੁਹਾਡੀ ਸਹਿਮਤੀ ਸਿਰਫ਼ ਇਸ ਐਪ ਉੱਤੇ ਲਾਗੂ ਹੁੰਦੀ ਹੈ ਅਤੇ ਹੋਰ ਸੇਵਾਵਾਂ ਉੱਤੇ ਅਸਰ ਨਹੀਂ ਪਾਵੇਗੀ।',
			withdraw:
				'ਤੁਸੀਂ ਇਸ ਐਪ ਵਿੱਚ ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਤੋਂ ਕਿਸੇ ਵੀ ਸਮੇਂ ਆਪਣੀਆਂ ਚੋਣਾਂ ਬਦਲ ਸਕਦੇ ਹੋ ਜਾਂ ਆਪਣੀ ਸਹਿਮਤੀ ਵਾਪਸ ਲੈ ਸਕਦੇ ਹੋ।',
		},
		banner: {
			andMore: 'ਅਤੇ {count} ਹੋਰ...',
			description:
				'ਅਸੀਂ ਅਤੇ ਸਾਡੇ {partnerCount} ਭਾਈਵਾਲ ਇਸ ਵੈੱਬਸਾਈਟ ਲਈ, ਹੇਠ ਲਿਖੇ ਮਕਸਦਾਂ ਵਾਸਤੇ, ਤੁਹਾਡੇ ਡਿਵਾਈਸ ਉੱਤੇ ਜਾਣਕਾਰੀ ਸਟੋਰ ਕਰਦੇ ਹਾਂ ਅਤੇ/ਜਾਂ ਉਸ ਤੱਕ ਪਹੁੰਚ ਕਰਦੇ ਹਾਂ, ਅਤੇ ਨਿੱਜੀ ਡਾਟੇ, ਜਿਵੇਂ ਕਿ ਵਿਲੱਖਣ ਪਛਾਣਕਰਤਾ ਅਤੇ ਬ੍ਰਾਊਜ਼ਿੰਗ ਡਾਟਾ, ਉੱਤੇ ਕਾਰਵਾਈ ਕਰਦੇ ਹਾਂ:',
			legitimateInterestNotice:
				'ਕੁਝ ਭਾਈਵਾਲ ਤੁਹਾਡੇ ਡਾਟੇ ਉੱਤੇ ਕਾਰਵਾਈ ਕਰਨ ਲਈ ਜਾਇਜ਼ ਹਿੱਤ ਦਾ ਦਾਅਵਾ ਕਰਦੇ ਹਨ। ਤੁਹਾਨੂੰ ਇਸ ਕਾਰਵਾਈ ਉੱਤੇ ਇਤਰਾਜ਼ ਕਰਨ, ਆਪਣੀਆਂ ਚੋਣਾਂ ਬਦਲਣ ਅਤੇ ਕਿਸੇ ਵੀ ਸਮੇਂ ਆਪਣੀ ਸਹਿਮਤੀ ਵਾਪਸ ਲੈਣ ਦਾ ਹੱਕ ਹੈ।',
			partnersLink: '{count} ਭਾਈਵਾਲ',
			scopeGroup: 'ਤੁਹਾਡੀ ਚੋਣ ਇਸ ਸਮੂਹ ਵਿਚਲੀਆਂ ਸਾਡੀਆਂ ਸਾਰੀਆਂ ਵੈੱਬਸਾਈਟਾਂ ਉੱਤੇ ਲਾਗੂ ਹੁੰਦੀ ਹੈ।',
			scopeServiceSpecific:
				'ਤੁਹਾਡੀ ਸਹਿਮਤੀ ਸਿਰਫ਼ ਇਸ ਵੈੱਬਸਾਈਟ ਉੱਤੇ ਲਾਗੂ ਹੁੰਦੀ ਹੈ ਅਤੇ ਹੋਰ ਸੇਵਾਵਾਂ ਉੱਤੇ ਅਸਰ ਨਹੀਂ ਪਾਵੇਗੀ।',
			title: 'ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ',
		},
		common: {
			acceptAll: 'ਸਭ ਸਵੀਕਾਰ ਕਰੋ',
			clearSelection: 'ਸਾਫ਼ ਕਰੋ',
			customPartner: 'IAB ਨਾਲ ਰਜਿਸਟਰ ਨਾ ਹੋਇਆ ਕਸਟਮ ਭਾਈਵਾਲ',
			customize: 'ਅਨੁਕੂਲਿਤ ਕਰੋ',
			loading: 'ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...',
			rejectAll: 'ਸਭ ਰੱਦ ਕਰੋ',
			saveSettings: 'ਸੈਟਿੰਗਾਂ ਸੰਭਾਲੋ',
			showingSelectedVendor: 'ਚੁਣਿਆ ਹੋਇਆ ਵਿਕਰੇਤਾ ਦਿਖਾਇਆ ਜਾ ਰਿਹਾ ਹੈ',
		},
		preferenceCenter: {
			description:
				'ਆਪਣੀਆਂ ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਇੱਥੇ ਬਦਲੋ। ਤੁਸੀਂ ਚੁਣ ਸਕਦੇ ਹੋ ਕਿ ਕਿਸ ਤਰ੍ਹਾਂ ਦੀਆਂ ਕੂਕੀਜ਼ ਅਤੇ ਟਰੈਕਿੰਗ ਤਕਨੀਕਾਂ ਦੀ ਇਜਾਜ਼ਤ ਦੇਣੀ ਹੈ।',
			features: {
				description:
					'ਕਾਰਵਾਈ ਦੇ ਇਹ ਤਰੀਕੇ ਸਿਰਫ਼ ਉਹਨਾਂ ਇੱਕ ਜਾਂ ਵੱਧ ਮਕਸਦਾਂ ਲਈ ਵਰਤੇ ਜਾ ਸਕਦੇ ਹਨ, ਜਿਨ੍ਹਾਂ ਲਈ ਇਸ ਸੂਚਨਾ ਵਿੱਚ ਤੁਹਾਨੂੰ ਚੋਣ ਦਿੱਤੀ ਗਈ ਹੈ।',
				title: 'ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ',
			},
			footer: {
				consentStorage:
					'ਸਹਿਮਤੀ ਤਰਜੀਹਾਂ "euconsent-v2" ਨਾਂ ਦੀ ਕੂਕੀ ਵਿੱਚ 13 ਮਹੀਨਿਆਂ ਲਈ ਸਟੋਰ ਕੀਤੀਆਂ ਜਾਂਦੀਆਂ ਹਨ। ਜਦੋਂ ਤੁਸੀਂ ਆਪਣੀਆਂ ਤਰਜੀਹਾਂ ਬਦਲਦੇ ਹੋ, ਤਾਂ ਸਟੋਰੇਜ ਦੀ ਮਿਆਦ ਨਵੇਂ ਸਿਰਿਓਂ ਸ਼ੁਰੂ ਹੋ ਸਕਦੀ ਹੈ।',
			},
			purposeItem: {
				examples: 'ਉਦਾਹਰਨਾਂ',
				legitimateInterest: 'ਜਾਇਜ਼ ਹਿੱਤ',
				objectButton: 'ਇਤਰਾਜ਼ ਕਰੋ',
				objected: 'ਇਤਰਾਜ਼ ਕੀਤਾ',
				partners: '{count} ਭਾਈਵਾਲ',
				partnersUsingPurpose: 'ਇਹ ਮਕਸਦ ਵਰਤਣ ਵਾਲੇ ਭਾਈਵਾਲ',
				rightToObject:
					'ਤੁਹਾਨੂੰ ਜਾਇਜ਼ ਹਿੱਤ ਦੇ ਆਧਾਰ ਉੱਤੇ ਹੋਣ ਵਾਲੀ ਕਾਰਵਾਈ ਉੱਤੇ ਇਤਰਾਜ਼ ਕਰਨ ਦਾ ਹੱਕ ਹੈ।',
				vendorsUseLegitimateInterest:
					'ਜਾਇਜ਼ ਹਿੱਤ ਦਾ ਦਾਅਵਾ ਕਰਨ ਵਾਲੇ ਵਿਕਰੇਤਾ: {count}',
				withYourPermission: 'ਤੁਹਾਡੀ ਇਜਾਜ਼ਤ ਨਾਲ',
			},
			specialPurposes: {
				title: 'ਜ਼ਰੂਰੀ ਕਾਰਜ (ਲਾਜ਼ਮੀ)',
				tooltip:
					'ਇਹ ਸਾਈਟ ਦੀ ਕਾਰਜਸ਼ੀਲਤਾ ਅਤੇ ਸੁਰੱਖਿਆ ਲਈ ਲੋੜੀਂਦੇ ਹਨ। IAB TCF ਮੁਤਾਬਕ, ਤੁਸੀਂ ਇਹਨਾਂ ਖ਼ਾਸ ਮਕਸਦਾਂ ਉੱਤੇ ਇਤਰਾਜ਼ ਨਹੀਂ ਕਰ ਸਕਦੇ।',
			},
			tabs: {
				purposes: 'ਮਕਸਦ',
				vendors: 'ਵਿਕਰੇਤਾ',
			},
			title: 'ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ',
			vendorList: {
				adTechProvidersHeading: 'Google ਇਸ਼ਤਿਹਾਰ ਤਕਨੀਕ ਪ੍ਰਦਾਤਾ',
				adTechProvidersNotice:
					'Google ਇਹਨਾਂ ਇਸ਼ਤਿਹਾਰ ਤਕਨੀਕ ਪ੍ਰਦਾਤਿਆਂ ਨਾਲ IAB ਫ਼ਰੇਮਵਰਕ ਤੋਂ ਬਾਹਰ ਕੰਮ ਕਰਦਾ ਹੈ। ਤੁਹਾਡੀ ਸਹਿਮਤੀ ਕਿਸੇ ਪ੍ਰਦਾਤਾ ਤੱਕ ਤਾਂ ਹੀ ਪਹੁੰਚਦੀ ਹੈ ਜੇ ਤੁਸੀਂ ਉਸ ਨੂੰ ਚਾਲੂ ਕਰਦੇ ਹੋ ਅਤੇ ਨਾਲ ਹੀ ਡਿਵਾਈਸ ਉੱਤੇ ਸਟੋਰੇਜ ਅਤੇ ਤੁਹਾਡੀ ਪਸੰਦ ਮੁਤਾਬਕ ਇਸ਼ਤਿਹਾਰਾਂ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦੇ ਹੋ।',
				customVendorsHeading: 'ਕਸਟਮ ਭਾਈਵਾਲ',
				customVendorsNotice:
					'ਇਹ ਕਸਟਮ ਭਾਈਵਾਲ ਹਨ ਜੋ IAB ਪਾਰਦਰਸ਼ਤਾ ਅਤੇ ਸਹਿਮਤੀ ਫ਼ਰੇਮਵਰਕ (TCF) ਨਾਲ ਰਜਿਸਟਰ ਨਹੀਂ ਹਨ। ਇਹ ਤੁਹਾਡੀ ਸਹਿਮਤੀ ਮੁਤਾਬਕ ਡਾਟੇ ਉੱਤੇ ਕਾਰਵਾਈ ਕਰਦੇ ਹਨ ਅਤੇ ਇਹਨਾਂ ਦੇ ਪਰਦੇਦਾਰੀ ਤਰੀਕੇ IAB-ਰਜਿਸਟਰਡ ਵਿਕਰੇਤਾਵਾਂ ਤੋਂ ਵੱਖਰੇ ਹੋ ਸਕਦੇ ਹਨ।',
				dataCategories: 'ਡਾਟਾ ਸ਼੍ਰੇਣੀਆਂ',
				features: 'ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ',
				iabVendorsHeading: 'IAB ਨਾਲ ਰਜਿਸਟਰਡ ਵਿਕਰੇਤਾ',
				iabVendorsNotice:
					'ਇਹ ਭਾਈਵਾਲ IAB ਪਾਰਦਰਸ਼ਤਾ ਅਤੇ ਸਹਿਮਤੀ ਫ਼ਰੇਮਵਰਕ (TCF) ਨਾਲ ਰਜਿਸਟਰਡ ਹਨ, ਜੋ ਸਹਿਮਤੀ ਦੇ ਪ੍ਰਬੰਧ ਲਈ ਇੱਕ ਉਦਯੋਗਿਕ ਮਿਆਰ ਹੈ',
				legitimateInterest: 'ਜਾਇਜ਼ ਹਿੱਤ',
				maxAge: 'ਵੱਧ ਤੋਂ ਵੱਧ ਮਿਆਦ: {days} ਦਿਨ',
				maxAgeRefreshes: '(ਨਵਿਆਈ ਜਾਂਦੀ ਹੈ)',
				noVendorsFound: '"{searchTerm}" ਨਾਲ ਮੇਲ ਖਾਂਦਾ ਕੋਈ ਵਿਕਰੇਤਾ ਨਹੀਂ ਮਿਲਿਆ',
				nonCookieAccess: 'ਕੂਕੀ ਤੋਂ ਬਿਨਾਂ ਪਹੁੰਚ',
				partnerCount: '{count} ਭਾਈਵਾਲ',
				partnerPlural: 'ਭਾਈਵਾਲ',
				partnerSingular: 'ਭਾਈਵਾਲ',
				privacyPolicy: 'ਪਰਦੇਦਾਰੀ ਨੀਤੀ',
				purposes: 'ਮਕਸਦ',
				requiredNotice: 'ਸਾਈਟ ਚੱਲਣ ਲਈ ਲੋੜੀਂਦਾ, ਬੰਦ ਨਹੀਂ ਕੀਤਾ ਜਾ ਸਕਦਾ',
				retainedDays: 'ਸੰਭਾਲਿਆ ਜਾਂਦਾ ਹੈ: {days} ਦਿਨ',
				retention: 'ਸੰਭਾਲ ਦੀ ਮਿਆਦ: {days} ਦਿਨ',
				search: 'ਵਿਕਰੇਤਾ ਖੋਜੋ...',
				showingCount: '{total} ਵਿੱਚੋਂ {filtered} ਵਿਕਰੇਤਾ',
				specialFeatures: 'ਖ਼ਾਸ ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ',
				specialPurposes: 'ਖ਼ਾਸ ਮਕਸਦ',
				storageDisclosure: 'ਸਟੋਰੇਜ ਦਾ ਖੁਲਾਸਾ',
				usesCookies: 'ਕੂਕੀਜ਼ ਵਰਤਦਾ ਹੈ',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'ਕੂਕੀ ਨੀਤੀ',
		privacyPolicy: 'ਪਰਦੇਦਾਰੀ ਨੀਤੀ',
		termsOfService: 'ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ',
	},
	optOut: {
		action: 'ਆਪਟ ਆਊਟ ਕਰੋ',
		description:
			'ਇਹ ਸਾਈਟ ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਨਹੀਂ ਵੇਚੇਗੀ ਜਾਂ ਸਾਂਝੀ ਨਹੀਂ ਕਰੇਗੀ, ਅਤੇ ਤੁਹਾਡੀ ਚੋਣ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਸੁਰੱਖਿਅਤ ਹੈ।',
		done: 'ਹੋ ਗਿਆ',
		headingAll: 'ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਦੀ ਵਿਕਰੀ ਅਤੇ ਸਾਂਝਾਕਰਨ ਅਤੇ ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰ',
		headingSaleAndShare: 'ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਦੀ ਵਿਕਰੀ ਅਤੇ ਸਾਂਝਾਕਰਨ',
		headingSaleAndTargetedAds:
			'ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਦੀ ਵਿਕਰੀ ਅਤੇ ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰ',
		lockedByAccount:
			'ਤੁਹਾਡੇ ਖਾਤੇ ਨੇ ਔਪਟ-ਆਊਟ ਕੀਤਾ ਹੈ, ਅਤੇ ਤੁਸੀਂ ਸਾਈਨ ਇਨ ਕਰਨ ਤੋਂ ਬਾਅਦ ਇਸਨੂੰ ਬਦਲ ਸਕਦੇ ਹੋ।',
		lockedByGpc:
			'ਤੁਹਾਡੇ ਬ੍ਰਾਊਜ਼ਰ ਦਾ Global Privacy Control ਸਿਗਨਲ ਚਾਲੂ ਹੈ, ਇਸ ਲਈ ਇਹ ਬੰਦ ਰਹਿੰਦਾ ਹੈ।',
		notOptedOut: 'ਤੁਸੀਂ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਤੇ ਆਪਟ ਆਊਟ ਨਹੀਂ ਕੀਤਾ ਹੈ।',
		optInCancel: 'ਆਪਟ-ਆਊਟ ਰਹੋ',
		optInConfirm: 'ਦੁਬਾਰਾ ਆਪਟ-ਇਨ ਕਰੋ',
		optInDescription: 'ਪੁਸ਼ਟੀ ਕਰਨ ਨਾਲ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਤੇ ਤੁਹਾਡਾ ਆਪਟ-ਆਊਟ ਖ਼ਤਮ ਹੋ ਜਾਂਦਾ ਹੈ।',
		optInDescriptionWithRights:
			'ਪੁਸ਼ਟੀ ਕਰਨ ਨਾਲ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਤੇ {rights} ਤੋਂ ਤੁਹਾਡਾ ਆਪਟ-ਆਊਟ ਖ਼ਤਮ ਹੋ ਜਾਂਦਾ ਹੈ।',
		optInLink: 'ਦੁਬਾਰਾ ਆਪਟ-ਇਨ ਕਰੋ…',
		optInTitle: 'ਕੀ ਦੁਬਾਰਾ ਆਪਟ-ਇਨ ਕਰਨਾ ਹੈ?',
		receiptAccount: 'ਤੁਸੀਂ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਅਤੇ ਆਪਣੇ ਖਾਤੇ ਵਿੱਚ ਔਪਟ-ਆਊਟ ਹੋ ਗਏ ਹੋ।',
		receiptAccountWithRights:
			'ਤੁਸੀਂ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਅਤੇ ਆਪਣੇ ਖਾਤੇ ਵਿੱਚ {rights} ਤੋਂ ਔਪਟ-ਆਊਟ ਹੋ ਗਏ ਹੋ।',
		receiptBrowser: 'ਤੁਸੀਂ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਔਪਟ-ਆਊਟ ਹੋ ਗਏ ਹੋ।',
		receiptBrowserWithRights: 'ਤੁਸੀਂ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ {rights} ਤੋਂ ਔਪਟ-ਆਊਟ ਹੋ ਗਏ ਹੋ।',
		recordedLabel: 'ਦਰਜ ਕੀਤਾ ਗਿਆ',
		referenceLabel: 'ਹਵਾਲਾ',
		rightsAll: 'ਵਿਕਰੀ, ਸਾਂਝਾਕਰਨ ਅਤੇ ਨਿਸ਼ਾਨਾ ਵਿਗਿਆਪਨ',
		rightsSaleAndShare: 'ਵਿਕਰੀ ਅਤੇ ਸਾਂਝਾਕਰਨ',
		rightsSaleAndTargetedAds: 'ਵਿਕਰੀ ਅਤੇ ਨਿਸ਼ਾਨਾ ਵਿਗਿਆਪਨ',
		statusRequest: 'ਔਪਟ-ਆਊਟ ਬੇਨਤੀ ਮੰਨ ਲਈ ਗਈ',
		statusSignal: 'ਔਪਟ-ਆਊਟ ਤਰਜੀਹ ਸਿਗਨਲ ਮੰਨ ਲਿਆ ਗਿਆ',
	},
	privacyChoices: {
		acceptAll: 'ਸਭ ਸਵੀਕਾਰ ਕਰੋ',
		advertisingFollowsSale: 'ਇਸ਼ਤਿਹਾਰ ਉੱਪਰ ਦਿੱਤੀ ਤੁਹਾਡੀ ਚੋਣ ਮੁਤਾਬਕ ਚੱਲਦੇ ਹਨ।',
		advertisingTitle: 'ਇਸ਼ਤਿਹਾਰ',
		allow: 'ਇਜਾਜ਼ਤ ਦਿਓ',
		alwaysOn: 'ਹਮੇਸ਼ਾ ਚਾਲੂ',
		announceSaved: '{message} ਸੰਭਾਲਿਆ ਗਿਆ।',
		askAll:
			'ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰਾਂ ਸਮੇਤ ਹੋਰ ਮਕਸਦਾਂ ਲਈ ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਵੇਚ ਜਾਂ ਸਾਂਝੀ ਕਰ',
		askSaleAndShare: 'ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਵੇਚ ਜਾਂ ਸਾਂਝੀ ਕਰ',
		askSaleAndTargetedAds:
			'ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਵੇਚ ਜਾਂ ਇਸਨੂੰ ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰਾਂ ਲਈ ਵਰਤ',
		bannerAllowedRightsOff:
			'ਵਿਕਲਪਿਕ ਕੂਕੀਜ਼ ਦੀ ਇਜਾਜ਼ਤ ਦਿੱਤੀ ਗਈ। {rights} ਬੰਦ ਰਹਿਣਗੇ। ਤੁਸੀਂ ਇਸਨੂੰ "ਤੁਹਾਡੀਆਂ ਗੋਪਨੀਯਤਾ ਚੋਣਾਂ" ਵਿੱਚ ਬਦਲ ਸਕਦੇ ਹੋ।',
		bannerAllowedRightsOffGpc:
			'ਵਿਕਲਪਿਕ ਕੂਕੀਜ਼ ਦੀ ਇਜਾਜ਼ਤ ਦਿੱਤੀ ਗਈ। ਤੁਹਾਡੇ Global Privacy Control ਸਿਗਨਲ ਕਰਕੇ {rights} ਬੰਦ ਰਹਿਣਗੇ। ਤੁਸੀਂ ਇਸਨੂੰ "ਤੁਹਾਡੀਆਂ ਗੋਪਨੀਯਤਾ ਚੋਣਾਂ" ਵਿੱਚ ਬਦਲ ਸਕਦੇ ਹੋ।',
		bannerRejected:
			'ਵਿਕਲਪਿਕ ਕੂਕੀਜ਼ ਰੱਦ ਕੀਤੀਆਂ ਗਈਆਂ। ਤੁਸੀਂ ਇਸਨੂੰ "ਤੁਹਾਡੀਆਂ ਗੋਪਨੀਯਤਾ ਚੋਣਾਂ" ਵਿੱਚ ਬਦਲ ਸਕਦੇ ਹੋ।',
		barDescription:
			'ਅਸੀਂ ਤੁਹਾਡਾ ਅਨੁਭਵ ਬਿਹਤਰ ਬਣਾਉਣ ਅਤੇ ਟ੍ਰੈਫ਼ਿਕ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰਨ ਲਈ ਕੂਕੀਜ਼ ਵਰਤਦੇ ਹਾਂ।',
		businessFallback: 'ਇਹ ਸਾਈਟ',
		choiceRecorded: 'ਚੋਣ ਦਰਜ ਕੀਤੀ ਗਈ।',
		choicesSaved:
			'ਚੋਣਾਂ ਸੰਭਾਲੀਆਂ ਗਈਆਂ। ਤੁਸੀਂ ਇਨ੍ਹਾਂ ਨੂੰ "ਤੁਹਾਡੀਆਂ ਗੋਪਨੀਯਤਾ ਚੋਣਾਂ" ਵਿੱਚ ਬਦਲ ਸਕਦੇ ਹੋ।',
		choose: 'ਚੁਣੋ',
		chooseWhatToAllow: 'ਚੁਣੋ ਕਿ ਕਿਸ ਚੀਜ਼ ਦੀ ਇਜਾਜ਼ਤ ਦੇਣੀ ਹੈ',
		close: 'ਬੰਦ ਕਰੋ',
		confirmDescriptionOptIn:
			'{business} {rights} ਸਕੇਗੀ। ਤੁਸੀਂ ਇਸਨੂੰ ਕਿਸੇ ਵੀ ਸਮੇਂ ਬਦਲ ਸਕਦੇ ਹੋ।',
		confirmDescriptionOptOut:
			'{business} {rights} ਸਕੇਗੀ। ਤੁਸੀਂ ਕਿਸੇ ਵੀ ਸਮੇਂ ਦੁਬਾਰਾ ਆਪਟ ਆਊਟ ਕਰ ਸਕਦੇ ਹੋ।',
		confirmKeepOptedOut: 'ਆਪਟ-ਆਊਟ ਰਹੋ',
		confirmTitleOptIn: 'ਕੀ {rights} ਦੀ ਇਜਾਜ਼ਤ ਦੇਣੀ ਹੈ?',
		confirmTitleOptOut: 'ਕੀ {rights} ਦੀ ਦੁਬਾਰਾ ਇਜਾਜ਼ਤ ਦੇਣੀ ਹੈ?',
		copyFailed: 'ਕਾਪੀ ਨਹੀਂ ਹੋ ਸਕਿਆ। ਆਪਣਾ ਹਵਾਲਾ ਚੁਣੋ ਅਤੇ ਕਾਪੀ ਕਰੋ:',
		copyFailedAnnouncement:
			'ਕਾਪੀ ਨਹੀਂ ਹੋ ਸਕਿਆ। ਤੁਹਾਡਾ ਪੂਰਾ ਹਵਾਲਾ ਰਸੀਦ ਵਿੱਚ ਦਿਖਾਇਆ ਗਿਆ ਹੈ।',
		copyReference: 'ਹਵਾਲਾ ਕਾਪੀ ਕਰੋ',
		dialogIntro: 'ਤੁਹਾਡੀਆਂ ਚੋਣਾਂ ਤੁਰੰਤ ਲਾਗੂ ਹੁੰਦੀਆਂ ਹਨ।',
		dialogTitle: 'ਤੁਹਾਡੀਆਂ ਗੋਪਨੀਯਤਾ ਚੋਣਾਂ',
		done: 'ਹੋ ਗਿਆ',
		dontAllow: 'ਇਜਾਜ਼ਤ ਨਾ ਦਿਓ',
		euDialogIntro:
			'ਚੁਣੋ ਕਿ {business} ਕਿਹੜੀਆਂ ਵਿਕਲਪਿਕ ਕੂਕੀਜ਼ ਵਰਤ ਸਕਦੀ ਹੈ। ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਚਾਲੂ ਨਹੀਂ ਕਰਦੇ, ਵਿਕਲਪਿਕ ਕੂਕੀਜ਼ ਬੰਦ ਰਹਿੰਦੀਆਂ ਹਨ।',
		euDialogTitle: 'ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ',
		gpcNote:
			'ਤੁਹਾਡੇ ਬ੍ਰਾਊਜ਼ਰ ਨੇ Global Privacy Control ਸਿਗਨਲ ਭੇਜਿਆ ਹੈ, ਇਸ ਲਈ {business} {scope} {rights}। ਜਦੋਂ ਤੱਕ ਸਿਗਨਲ ਚਾਲੂ ਹੈ, ਇਜਾਜ਼ਤ ਦੇਣ ਦਾ ਵਿਕਲਪ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।',
		justNow: 'ਹੁਣੇ-ਹੁਣੇ',
		nestedSheetNote: 'ਜਦੋਂ ਤੁਸੀਂ ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਵਿੱਚ ਸੰਭਾਲਦੇ ਹੋ ਤਾਂ ਤਬਦੀਲੀਆਂ ਲਾਗੂ ਹੁੰਦੀਆਂ ਹਨ।',
		noticeBarDescription:
			'ਅਸੀਂ ਇਹ ਸਾਈਟ ਚਲਾਉਣ, ਟ੍ਰੈਫ਼ਿਕ ਮਾਪਣ ਅਤੇ ਇਸ਼ਤਿਹਾਰਾਂ ਨੂੰ ਤੁਹਾਡੀ ਪਸੰਦ ਮੁਤਾਬਕ ਢਾਲਣ ਲਈ ਕੂਕੀਜ਼ ਵਰਤਦੇ ਹਾਂ। ਤੁਸੀਂ ਕਿਸੇ ਵੀ ਸਮੇਂ ਆਪਟ ਆਊਟ ਕਰ ਸਕਦੇ ਹੋ।',
		noticeBarDescriptionGpc:
			'ਅਸੀਂ ਇਹ ਸਾਈਟ ਚਲਾਉਣ ਅਤੇ ਟ੍ਰੈਫ਼ਿਕ ਮਾਪਣ ਲਈ ਕੂਕੀਜ਼ ਵਰਤਦੇ ਹਾਂ। ਤੁਹਾਡੇ Global Privacy Control ਸਿਗਨਲ ਦੀ ਪਾਲਣਾ ਕੀਤੀ ਜਾਂਦੀ ਹੈ।',
		noticeGpcHonored:
			'ਤੁਹਾਡੇ ਬ੍ਰਾਊਜ਼ਰ ਦੇ Global Privacy Control ਸਿਗਨਲ ਦੀ ਪਾਲਣਾ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ।',
		noticeRightsAction: 'ਮੇਰਾ ਡਾਟਾ ਨਾ ਵੇਚੋ ਅਤੇ ਨਾ ਸਾਂਝਾ ਕਰੋ',
		nudge: 'ਪਹਿਲਾਂ ਦੋਵਾਂ ਵਿੱਚੋਂ ਇੱਕ ਬਟਨ ਚੁਣੋ।',
		optInBarDescription:
			'{business} ਵਿਕਲਪਿਕ ਕੂਕੀਜ਼ ਵਰਤਣ ਜਾਂ {rights} ਤੋਂ ਪਹਿਲਾਂ ਤੁਹਾਡੀ ਇਜਾਜ਼ਤ ਮੰਗਦੀ ਹੈ।',
		optInDescription:
			'ਤੁਹਾਡੀ ਇਜਾਜ਼ਤ ਨਾਲ, {business} ਸਾਈਟ ਦੀਆਂ ਸਹੂਲਤਾਂ ਅਤੇ ਵਿਸ਼ਲੇਸ਼ਣ ਲਈ ਵਿਕਲਪਿਕ ਕੂਕੀਜ਼ ਵਰਤੇਗੀ ਅਤੇ {rights} ਸਕੇਗੀ। ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਇਜਾਜ਼ਤ ਨਹੀਂ ਦਿੰਦੇ, ਕੁਝ ਵੀ ਚਾਲੂ ਨਹੀਂ ਹੁੰਦਾ।',
		optInTitle: 'ਤੁਹਾਡੀਆਂ ਗੋਪਨੀਯਤਾ ਚੋਣਾਂ',
		optOutOption: 'ਆਪਟ ਆਊਟ ਕਰੋ',
		panelExpanded: 'ਹੋਰ ਵਿਕਲਪ ਦਿਖਾਏ ਗਏ ਹਨ।',
		policyColumn: 'ਪਰਦੇਦਾਰੀ ਨੀਤੀ',
		preferencesClose: 'ਤਰਜੀਹਾਂ ਬੰਦ ਕਰੋ',
		preferencesOnCount: '{count} ਚਾਲੂ',
		preferencesSheetIntro: 'ਤਬਦੀਲੀਆਂ ਤੁਰੰਤ ਲਾਗੂ ਹੁੰਦੀਆਂ ਹਨ।',
		preferencesSummary: 'ਸਾਈਟ ਦੀਆਂ ਸਹੂਲਤਾਂ ਅਤੇ ਵਿਸ਼ਲੇਸ਼ਣ',
		preferencesTitle: 'ਤਰਜੀਹਾਂ',
		purposeColumn: 'ਮਕਸਦ',
		receiptAllowed: 'ਇਜਾਜ਼ਤ ਦਿੱਤੀ: {rights}',
		receiptDetails: 'ਵੇਰਵੇ',
		receiptFromGpc: 'ਤੁਹਾਡੇ Global Privacy Control ਸਿਗਨਲ ਤੋਂ',
		receiptLive: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਦੇ Global Privacy Control ਦੀ ਪਾਲਣਾ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ',
		receiptLiveDetail: 'ਹਰ ਫੇਰੀ ਤੇ ਤੁਹਾਡੇ ਬ੍ਰਾਊਜ਼ਰ ਤੋਂ ਪੜ੍ਹਿਆ ਜਾਂਦਾ ਹੈ।',
		receiptOptedOut: 'ਆਪਟ ਆਊਟ ਕੀਤਾ: {rights}',
		receiptRecorded: 'ਦਰਜ ਕੀਤਾ ਗਿਆ: {date}',
		receiptReference: 'ਹਵਾਲਾ',
		receiptSavedAccount: 'ਤੁਹਾਡੇ ਖਾਤੇ ਵਿੱਚ ਸੰਭਾਲਿਆ ਗਿਆ · {date}',
		receiptSavedBrowser: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਲਈ ਸੰਭਾਲਿਆ ਗਿਆ · {date}',
		receiptScopeAccount: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਅਤੇ ਤੁਹਾਡੇ {business} ਖਾਤੇ ਤੇ ਲਾਗੂ ਹੁੰਦਾ ਹੈ।',
		receiptScopeAccountUnnamed: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਅਤੇ ਤੁਹਾਡੇ ਖਾਤੇ ਤੇ ਲਾਗੂ ਹੁੰਦਾ ਹੈ।',
		receiptScopeBrowser:
			'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਤੇ ਲਾਗੂ ਹੁੰਦਾ ਹੈ। ਇਸਨੂੰ ਆਪਣੇ ਖਾਤੇ ਤੇ ਵੀ ਲਾਗੂ ਕਰਨ ਲਈ ਸਾਈਨ ਇਨ ਕਰੋ।',
		receiptViaGpc: 'Global Privacy Control ਸਿਗਨਲ',
		referenceCopied: 'ਹਵਾਲਾ ਕਾਪੀ ਕੀਤਾ ਗਿਆ।',
		refuseAll:
			'ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਨਾ ਵੇਚੇਗੀ, ਨਾ ਸਾਂਝੀ ਕਰੇਗੀ ਅਤੇ ਨਾ ਇਸਨੂੰ ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰਾਂ ਲਈ ਵਰਤੇਗੀ',
		refuseSaleAndShare: 'ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਨਾ ਵੇਚੇਗੀ ਅਤੇ ਨਾ ਸਾਂਝੀ ਕਰੇਗੀ',
		refuseSaleAndTargetedAds:
			'ਤੁਹਾਡੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਨਾ ਵੇਚੇਗੀ ਅਤੇ ਨਾ ਇਸਨੂੰ ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰਾਂ ਲਈ ਵਰਤੇਗੀ',
		rejectAll: 'ਸਭ ਰੱਦ ਕਰੋ',
		rightsAllowed: '{rights}: ਇਜਾਜ਼ਤ ਦਿੱਤੀ ਗਈ।',
		rightsNotAllowed: '{rights}: ਇਜਾਜ਼ਤ ਨਹੀਂ ਦਿੱਤੀ ਗਈ।',
		rightsOptedOut: '{rights} ਤੋਂ ਆਪਟ ਆਊਟ ਕੀਤਾ ਗਿਆ।',
		saleAllowed: '{business} {rights} ਸਕਦੀ ਹੈ।',
		saleGroupOptIn: '{rights} ਦੀ ਇਜਾਜ਼ਤ ਦਿਓ',
		saleGroupSaleAndTargetedAds:
			'ਮੇਰੇ ਨਿੱਜੀ ਡਾਟਾ ਦੀ ਵਿਕਰੀ ਅਤੇ ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰਾਂ ਤੋਂ ਆਪਟ ਆਊਟ ਕਰੋ',
		saleOffByDefault:
			'ਮੂਲ ਰੂਪ ਵਿੱਚ ਬੰਦ। ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਇਜਾਜ਼ਤ ਨਹੀਂ ਦਿੰਦੇ, {business} {rights}।',
		saleRefused: '{business} {scope} {rights}।',
		saveChoices: 'ਚੋਣਾਂ ਸੰਭਾਲੋ',
		saveInSettings: 'ਆਪਣੀਆਂ ਚੋਣਾਂ ਪਰਦੇਦਾਰੀ ਸੈਟਿੰਗਾਂ ਵਿੱਚ ਸੰਭਾਲੋ',
		savedAutomatically: 'ਆਪਣੇ-ਆਪ ਸੰਭਾਲਿਆ ਜਾਂਦਾ ਹੈ',
		savedCue: 'ਸੰਭਾਲਿਆ ਗਿਆ',
		scopeAccount: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਤੇ ਜਾਂ ਤੁਹਾਡੇ {business} ਖਾਤੇ ਲਈ',
		scopeAccountUnnamed: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਤੇ ਜਾਂ ਤੁਹਾਡੇ ਖਾਤੇ ਲਈ',
		scopeBrowser: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਤੇ',
		shortAll: 'ਇਸ਼ਤਿਹਾਰਾਂ ਲਈ ਤੁਹਾਡਾ ਡਾਟਾ ਵੇਚਣ ਜਾਂ ਸਾਂਝਾ ਕਰਨ',
		shortSaleAndShare: 'ਤੁਹਾਡਾ ਡਾਟਾ ਵੇਚਣ ਜਾਂ ਸਾਂਝਾ ਕਰਨ',
		shortSaleAndTargetedAds: 'ਤੁਹਾਡਾ ਡਾਟਾ ਵੇਚਣ ਜਾਂ ਇਸਨੂੰ ਇਸ਼ਤਿਹਾਰਾਂ ਲਈ ਵਰਤਣ',
		stateOff: 'ਬੰਦ',
		stateOn: 'ਚਾਲੂ',
		switchColumn: 'ਚਾਲੂ',
		switchedOff: '{name} ਬੰਦ।',
		switchedOn: '{name} ਚਾਲੂ।',
		titleAll: 'ਵਿਕਰੀ, ਸਾਂਝਾਕਰਨ ਅਤੇ ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰ',
		titleSaleAndShare: 'ਵਿਕਰੀ ਅਤੇ ਸਾਂਝਾਕਰਨ',
		titleSaleAndTargetedAds: 'ਵਿਕਰੀ ਅਤੇ ਨਿਸ਼ਾਨਾਬੱਧ ਇਸ਼ਤਿਹਾਰ',
		vendorColumn: 'ਵਿਕਰੇਤਾ',
		vendorPolicy: '{vendor} ਦੀ ਪਰਦੇਦਾਰੀ ਨੀਤੀ',
		vendorsClose: '{category} ਵਿਕਰੇਤਾ ਬੰਦ ਕਰੋ',
		vendorsFor: '{category} ਲਈ',
		vendorsHide: '{count} ਵਿਕਰੇਤਾ ਲੁਕਾਓ',
		vendorsHideOne: '1 ਵਿਕਰੇਤਾ ਲੁਕਾਓ',
		vendorsOnCount: '{count} ਚਾਲੂ',
		vendorsTable: '{category} ਵਿਕਰੇਤਾ',
		vendorsView: '{count} ਵਿਕਰੇਤਾ ਦੇਖੋ',
		vendorsViewOne: '1 ਵਿਕਰੇਤਾ ਦੇਖੋ',
	},
	rights: {
		californiaPrivacyChoices: 'ਤੁਹਾਡੀਆਂ ਕੈਲੀਫੋਰਨੀਆ ਗੋਪਨੀਯਤਾ ਚੋਣਾਂ',
		optOut: 'ਮੇਰਾ ਡਾਟਾ ਨਾ ਵੇਚੋ ਅਤੇ ਨਾ ਸਾਂਝਾ ਕਰੋ',
		preferences: 'ਤਰਜੀਹਾਂ ਦਾ ਪ੍ਰਬੰਧ ਕਰੋ',
		privacyChoices: 'ਤੁਹਾਡੀਆਂ ਗੋਪਨੀਯਤਾ ਚੋਣਾਂ',
	},
};

export default translations;
