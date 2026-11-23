// #region docs:choice-wall title="src/cookie-banner.tsx"
import { ConsentBanner } from '@inth/react';

/** A centred Card with a backdrop. The page waits for a choice. */
export const CookieBanner = () => (
	<ConsentBanner container={{ position: 'center', type: 'card' }} />
);
// #endregion docs:choice-wall
