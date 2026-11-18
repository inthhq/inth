import { COMPAT_CONSENT_CONFIG } from '@c15t/next-compat-shared/config';
import { createPagesConsentRoute } from '@inth/nextjs/pages';

/**
 * `@inth/nextjs/pages` wraps the App Router consent route from
 * `@inth/nextjs/api` for a `pages/api` catch-all: `GET manifest` proxies
 * the backend `/manifest` through the in-process cache, and `GET init`
 * resolves init from it with the request's geo headers.
 */
export default createPagesConsentRoute({ config: COMPAT_CONSENT_CONFIG });
