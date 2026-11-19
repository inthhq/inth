// #region docs:consent-i18n
import type { I18nConfig } from '@inth/angular';

// Pass as `i18n` to provideInth() in app.config.ts. Messages merge over
// the copy for the same language, so list only the keys you change.
export const i18n: Partial<I18nConfig> = {
	locale: 'en',
	messages: {
		en: {
			common: { customize: 'Choose cookies', rejectAll: 'Reject optional' },
			cookieBanner: { title: 'Your privacy on this site' },
		},
	},
};
// #endregion docs:consent-i18n
