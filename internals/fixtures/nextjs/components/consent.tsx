'use client';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/nextjs';
import type { InthProviderProps } from '@inth/nextjs';
import type { ReactNode } from 'react';

import consentConfig from '@/inth.config';
import { scripts } from '@/lib/scripts';

interface ConsentProps {
	children: ReactNode;
	state: InthProviderProps['state'];
}

export const Consent = ({ children, state }: ConsentProps) => (
	<InthProvider
		state={state}
		config={consentConfig}
		scripts={scripts}
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
		<footer>
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</InthProvider>
);
