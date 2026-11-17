'use client';

import { crisp } from '@c15t/integrations/crisp';
import { ConsentBanner, ConsentDialog, ConsentRoot } from 'c15t/next';
import type { ReactNode } from 'react';

import { brandTheme } from '@/lib/consent-theme';

// The backend is your Inth project: set NEXT_PUBLIC_C15T_BACKEND_URL in
// .env.local. The policy comes from its consent manifest.
const config = {
	projectUrl:
		process.env.NEXT_PUBLIC_C15T_BACKEND_URL ?? 'https://your-project.inth.app',
};

// The support chat is a script, not an iframe. c15t adds it to the page only
// while Functionality is allowed. The script loader handles loading; the chat
// card in the article shows the placeholder.
const scripts = [
	crisp({
		websiteId:
			process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID ?? 'YOUR_CRISP_WEBSITE_ID',
	}),
];

export const Consent = ({ children }: { children: ReactNode }) => (
	<ConsentRoot
		config={config}
		state={{}}
		scripts={scripts}
		options={{ theme: brandTheme }}
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
	</ConsentRoot>
);
