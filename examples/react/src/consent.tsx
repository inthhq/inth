// #region docs:consent
import { posthog } from '@c15t/integrations/posthog';
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	ConsentProvider,
} from 'c15t/react';
import type { ReactNode } from 'react';

const options = {
	// Your Inth project URL, from VITE_C15T_BACKEND_URL in .env.
	projectUrl: import.meta.env.VITE_C15T_BACKEND_URL as string,
	scripts: [
		posthog({
			id: 'phc_your_project_key',
			initOptions: { cookieless_mode: 'never' },
			loadMode: 'after-consent',
		}),
	],
};

export const Consent = ({ children }: { children: ReactNode }) => (
	<ConsentProvider options={options}>
		{children}
		<ConsentBanner />
		<ConsentDialog />
		<footer>
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</ConsentProvider>
);
// #endregion docs:consent
