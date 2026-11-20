'use client';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/nextjs';
import type { InthProviderProps } from '@inth/nextjs';
import type { ReactNode } from 'react';

import consentConfig from '../inth.config';
import { theme } from './theme';

/**
 * The v3 App Router guide's client wrapper, without the example's PostHog
 * and X Pixel scripts, plus the custom theme every arm uses.
 */
export const Consent = ({
	children,
	state,
}: {
	children: ReactNode;
	state: InthProviderProps['state'];
}) => (
	<InthProvider
		config={consentConfig}
		options={{ theme }}
		state={state}
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
		<footer className="mx-auto max-w-3xl px-6 py-8">
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</InthProvider>
);
