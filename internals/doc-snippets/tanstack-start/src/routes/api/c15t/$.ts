// #region docs:consent-route
import { createConsentRoute } from '@inth/tanstack-start/api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/c15t/$')({
	server: { handlers: createConsentRoute({ proxy: true }) },
});
// #endregion docs:consent-route
