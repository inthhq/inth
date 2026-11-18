'use client';

import { ConsentRoot } from '@inth/nextjs';
import type { ConsentPresentation } from '@inth/nextjs';
import type { ReactNode } from 'react';

import { scripts } from '@/lib/scripts';

import { ConsentDialog } from './consent-dialog';

// The backend is your Inth project: set NEXT_PUBLIC_C15T_BACKEND_URL in
// .env.local. The policy comes from its consent manifest.
const config = {
	projectUrl:
		process.env.NEXT_PUBLIC_C15T_BACKEND_URL ?? 'https://your-project.inth.app',
};

// A wall blocks the page until the visitor answers. c15t reports it as
// `banner.blocking`, and refuses it for a notice, which must never block.
const presentation: ConsentPresentation = { prompt: { variant: 'wall' } };

/**
 * The c15t runtime with Northwind's own consent UI. No stock banner, dialog
 * or c15t stylesheet: `ConsentDialog` renders everything from the headless
 * hooks.
 */
export const Consent = ({ children }: { children: ReactNode }) => (
	<ConsentRoot
		config={config}
		state={{}}
		scripts={scripts}
		options={{ presentation }}
	>
		{children}
		<ConsentDialog />
	</ConsentRoot>
);
