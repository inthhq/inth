// #region docs:start
import { consentRequestMiddleware } from '@inth/tanstack-start/middleware';
import { createStart } from '@tanstack/react-start';

export const startInstance = createStart(() => ({
	requestMiddleware: [consentRequestMiddleware()],
}));
// #endregion docs:start
