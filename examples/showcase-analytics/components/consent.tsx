'use client';

import { ConsentBanner, ConsentDialog, ConsentRoot } from 'c15t/next';
import type { ClearOnRevocationConfig, ConsentRootProps } from 'c15t/next';
import type { ReactNode } from 'react';

import { brandTheme } from '@/lib/consent-theme';
import { rememberRevocation } from '@/lib/revocation-storage';
import { scripts, vendors } from '@/lib/scripts';

import { ConsentDevTools } from './consent-dev-tools';

// The backend is your Inth project: set NEXT_PUBLIC_C15T_BACKEND_URL in
// .env.local. The policy comes from its consent manifest.
const config = {
	projectUrl:
		process.env.NEXT_PUBLIC_C15T_BACKEND_URL ?? 'https://your-project.inth.app',
};

const options: ConsentRootProps['options'] = {
	callbacks: {
		// Turning off a category that was on reloads the page, because code a
		// vendor already ran can't be unloaded. Leave a note for the next page.
		onBeforeConsentRevocationReload: rememberRevocation,
	},
	// The layout renders the tokens; the components read the button roles.
	theme: brandTheme,
};

// The reload stops vendor code, but cookies it already wrote stay. c15t
// deletes these whenever their category is denied.
const clearOnRevocation: ClearOnRevocationConfig = {
	marketing: { cookies: ['_fbp', '_fbc'] },
	measurement: {
		cookies: ['_ga', '_ga_*', 'ph_*'],
		localStorage: ['ph_*'],
	},
};

export const Consent = ({ children }: { children: ReactNode }) => (
	<ConsentRoot
		config={config}
		state={{}}
		scripts={scripts}
		vendors={vendors}
		clearOnRevocation={clearOnRevocation}
		options={options}
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
		<ConsentDevTools />
	</ConsentRoot>
);
