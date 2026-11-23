// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { prefetchSurfaceAfterLoad } from './prefetch-surface-after-load';

/**
 * The IAB dialog warms in idle time. The consent dialog does not:
 * importing its chunk applies its stylesheets, which include the banner's
 * in-place panel rules, and a banner whose options are folded would show
 * them unstyled until the visitor reaches for them. It warms on intent
 * instead, from the banner's buttons.
 */
const loadIabConsentDialog = () => import('./iab-panel.vue');

export const prefetchIabConsentDialog = () =>
	prefetchSurfaceAfterLoad(loadIabConsentDialog);
