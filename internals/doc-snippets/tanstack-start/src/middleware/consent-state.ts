// #region docs:server-function-middleware title="src/consent-state.ts"
import { consentRequestMiddleware } from '@inth/tanstack-start/middleware';
import { createConsentStateHandler } from '@inth/tanstack-start/server';
import { createServerFn } from '@tanstack/react-start';

export const getConsentState = createServerFn({ method: 'GET' })
	.middleware([consentRequestMiddleware()])
	.handler(createConsentStateHandler());
// #endregion docs:server-function-middleware
