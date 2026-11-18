'use client';

/**
 * The quickstart components as one client module. A Server Component that
 * imports them from `@inth/nextjs` gets one client reference for all four, so
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
} from '@inth/react/deferred';
export { ConsentDialogLink } from '@inth/react/components/consent-dialog-link';
