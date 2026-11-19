// #region docs:quickstart-layout title="app/layout.tsx"
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/nextjs';
import { resolveConsent } from '@inth/nextjs/server';
import type { ReactNode } from 'react';

import './globals.css';

const RootLayout = ({ children }: { children: ReactNode }) => (
	<html lang="en">
		<body>
			{/* Not awaited: the page renders while consent resolves. */}
			<InthProvider state={resolveConsent()}>
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
// #endregion docs:quickstart-layout
