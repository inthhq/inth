'use client';

/**
 * The quickstart components as one client module. A Server Component that
 * imports them from `c15t/next` gets one client reference for all four, so
 * the bundler keeps them in one scope, as it would behind an app's own
 * `'use client'` wrapper. Separate references each start a module scope of
 * their own, which costs first-load bytes in Turbopack.
 *
 * @internal
 */
export { ConsentRoot } from './root';
export {
	DeferredConsentBanner as ConsentBanner,
	DeferredConsentDialog as ConsentDialog,
} from '@c15t/react/deferred';
export { ConsentDialogLink } from '@c15t/react/components/consent-dialog-link';
