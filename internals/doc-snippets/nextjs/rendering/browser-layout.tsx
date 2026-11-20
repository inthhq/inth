// #region docs:browser-layout title="app/layout.tsx"
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/nextjs';
import type { ReactNode } from 'react';

import './globals.css';

// No resolveConsent: the browser resolves consent, so pages can be static.
const RootLayout = ({ children }: { children: ReactNode }) => (
	<html lang="en">
		<body>
			<InthProvider>
				{children}
				<ConsentBanner />
				<ConsentDialog />
				<footer>
					<ConsentDialogLink>Privacy settings</ConsentDialogLink>
				</footer>
			</InthProvider>
		</body>
	</html>
);

export default RootLayout;
// #endregion docs:browser-layout
