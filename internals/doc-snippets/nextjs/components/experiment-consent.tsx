'use client';

import { ConsentBanner, ConsentDialog, InthProvider } from '@inth/nextjs';
import type { InthProviderProps } from '@inth/nextjs';
import type { ReactNode } from 'react';

import { experimentCallbacks } from '@/lib/experiment';

/** The `Consent` wrapper with the banner experiment's event callbacks. */
export const ExperimentConsent = ({
	children,
	state,
}: {
	children: ReactNode;
	state: InthProviderProps['state'];
}) => (
	<InthProvider
		state={state}
		options={{ callbacks: experimentCallbacks }}
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
	</InthProvider>
);
