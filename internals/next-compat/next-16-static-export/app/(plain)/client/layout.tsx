import { ConsentShell } from '@inth/next-compat-shared/consent-shell';
import type { ReactNode } from 'react';

import { COMPAT_STATIC_BACKEND_URL } from '../../../lib/backend-url';

/**
 * Hosted mode against an absolute backend URL: a static export has no
 * server to proxy `/api/inth`, so the browser calls the backend directly.
 */
const ClientLayout = ({ children }: { children: ReactNode }) => (
	<ConsentShell
		styles={false}
		projectUrl={COMPAT_STATIC_BACKEND_URL}
		scenario="client"
	>
		{children}
	</ConsentShell>
);

export default ClientLayout;
