import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/react';
import type { ReactNode } from 'react';

import { scripts } from './scripts';
import { testBackend } from './test-backend';

const backend = {
	projectUrl: 'https://your-project.inth.app',
	...testBackend('projectUrl'),
};

export const Consent = ({ children }: { children: ReactNode }) => (
	<InthProvider options={{ ...backend, scripts }}>
		{children}
		<ConsentBanner />
		<ConsentDialog />
		<footer>
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</InthProvider>
);
