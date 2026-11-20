'use client';

import { ConsentDialog, InthProvider } from '@inth/nextjs';
import type { ReactNode } from 'react';

import { northwindTheme } from '@/lib/theme';
import { i18n, scripts, vendors } from '@/lib/vendors';

import { CookieBanner } from './cookie-banner';

// The backend is your Inth project: set NEXT_PUBLIC_INTH_PROJECT_URL in
// .env.local. The policy comes from its consent manifest.
const config = {
	projectUrl:
		process.env.NEXT_PUBLIC_INTH_PROJECT_URL ?? 'https://your-project.inth.app',
};

export const Consent = ({ children }: { children: ReactNode }) => (
	<InthProvider
		config={config}
		state={{}}
		scripts={scripts}
		vendors={vendors}
		options={{ i18n, theme: northwindTheme }}
	>
		{children}
		<CookieBanner />
		{/* Customize and the footer link go to /account/privacy. The dialog
		    stays for the "Do not sell or share" link some regions add to the
		    banner. */}
		<ConsentDialog />
	</InthProvider>
);
