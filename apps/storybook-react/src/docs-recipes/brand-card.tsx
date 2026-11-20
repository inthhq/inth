// #region docs:brand-card title="src/consent-ui.tsx"
import { ConsentBanner, ConsentDialog, ConsentTheme } from '@inth/react';

import { brandTheme } from './consent-theme';

/**
 * Render inside your InthProvider, and pass `theme: brandTheme` in the
 * provider options so the action styles apply too.
 */
export const ConsentUI = () => (
	<>
		<ConsentTheme theme={brandTheme} />
		<ConsentBanner />
		<ConsentDialog />
	</>
);
// #endregion docs:brand-card
