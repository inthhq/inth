// #region docs:bottom-bar title="src/cookie-banner.tsx"
import { ConsentBanner } from '@inth/react';

/** The stock banner, drawn as a full-width Banner along the bottom edge. */
export const CookieBanner = () => (
	<ConsentBanner container={{ edge: 'bottom', type: 'banner' }} />
);
// #endregion docs:bottom-bar
