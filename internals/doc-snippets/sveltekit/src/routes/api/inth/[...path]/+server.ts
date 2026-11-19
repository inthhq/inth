// #region docs:route-handlers
import { createConsentRoute } from '@inth/svelte/kit';

// GET /api/inth/init resolves the visitor from the bundled policy, and
// GET /api/inth/manifest serves it. Other methods are not handled: the
// browser saves consent to the backend URL directly. Pair it with
// `inthHandle({ routePrefix: '/api/inth' })`.
export const { GET } = createConsentRoute();
// #endregion docs:route-handlers
