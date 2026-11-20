'use client';

import { ConsentBanner, ConsentDialog, InthProvider } from '@inth/nextjs';
import type { ClearOnRevocationConfig, InthProviderProps } from '@inth/nextjs';
import type { ReactNode } from 'react';

import { brandTheme } from '@/lib/consent-theme';
import { rememberRevocation } from '@/lib/revocation-storage';
import { scripts, vendors } from '@/lib/scripts';

import { ConsentDevTools } from './consent-dev-tools';

// The backend is your Inth project: set NEXT_PUBLIC_INTH_PROJECT_URL in
// .env.local. The policy comes from its consent manifest.
const config = {
	projectUrl:
		process.env.NEXT_PUBLIC_INTH_PROJECT_URL ?? 'https://your-project.inth.app',
};

const options: InthProviderProps['options'] = {
	callbacks: {
		// Turning off a category that was on reloads the page, because code a
		// vendor already ran can't be unloaded. Leave a note for the next page.
		onBeforeConsentRevocationReload: rememberRevocation,
	},
	// The layout renders the tokens; the components read the button roles.
	theme: brandTheme,
};

// The reload stops vendor code, but cookies it already wrote stay. Inth
// deletes these whenever their category is denied.
const clearOnRevocation: ClearOnRevocationConfig = {
	marketing: { cookies: ['_fbp', '_fbc'] },
	measurement: {
		cookies: ['_ga', '_ga_*', 'ph_*'],
		localStorage: ['ph_*'],
	},
};

export const Consent = ({ children }: { children: ReactNode }) => (
	<InthProvider
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
	</InthProvider>
);
