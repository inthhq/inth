// #region docs:server-function-middleware title="src/consent-state.ts"
import { createServerFn } from '@tanstack/react-start';
import { consentRequestMiddleware } from 'c15t/tanstack-start/middleware';
import { createConsentStateHandler } from 'c15t/tanstack-start/server';

export const getConsentState = createServerFn({ method: 'GET' })
	.middleware([consentRequestMiddleware()])
	.handler(createConsentStateHandler());
// #endregion docs:server-function-middleware
