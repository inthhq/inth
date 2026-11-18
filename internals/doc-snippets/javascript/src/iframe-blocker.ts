// #region docs:iframe-blocker title="src/iframe-blocker.ts"
import type { ConsentKernel } from '@inth/sdk/engine';
import { createIframeBlocker } from '@inth/sdk/modules/iframe-blocker';

// Watches the page for <iframe data-src data-category> and sets `src` while
// the category is allowed.
export const gateIframes = function gateIframes(kernel: ConsentKernel) {
	return createIframeBlocker({ kernel });
};
// #endregion docs:iframe-blocker
