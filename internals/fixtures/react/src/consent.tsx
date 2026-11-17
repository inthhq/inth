import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	ConsentProvider,
} from 'c15t/react';
import type { ReactNode } from 'react';

import { scripts } from './scripts';
import { testBackend } from './test-backend';

const backend = {
	backendURL: 'https://your-project.inth.app',
	...testBackend('backendURL'),
};

export const Consent = ({ children }: { children: ReactNode }) => (
	<ConsentProvider options={{ ...backend, scripts }}>
		{children}
		<ConsentBanner />
		<ConsentDialog />
		<footer>
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</ConsentProvider>
);
