'use client';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	ConsentRoot,
} from '@inth/nextjs';
import type { ConsentRootProps } from '@inth/nextjs';
import type { ReactNode } from 'react';

import consentConfig from '@/inth.config';
import { scripts } from '@/lib/scripts';

interface ConsentProps {
	children: ReactNode;
	state: ConsentRootProps['state'];
}

export const Consent = ({ children, state }: ConsentProps) => (
	<ConsentRoot
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
	</ConsentRoot>
);
