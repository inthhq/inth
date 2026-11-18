// #region docs:theme
import type { Theme } from '@inth/angular';

// Pass as `theme` to provideC15t() in app.config.ts. Slots and
// consentActions apply in the browser; color and other tokens do not.
export const theme: Theme = {
	consentActions: {
		default: { mode: 'stroke', variant: 'neutral' },
		primary: { mode: 'filled', variant: 'primary' },
		reject: { mode: 'filled', variant: 'neutral' },
	},
	slots: {
		consentBannerCard: 'brand-banner-card',
		consentBannerTitle: 'brand-banner-title',
	},
};
// #endregion docs:theme
