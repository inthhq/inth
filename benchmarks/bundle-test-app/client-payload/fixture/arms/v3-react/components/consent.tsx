'use client';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	ConsentProvider,
	hosted,
} from '@inth/react';
import type { ConsentProviderOptions } from '@inth/react';
import type { ReactNode } from 'react';

import { theme } from './theme';

/**
 * The Inth docs site's shape: `ConsentProvider` from the `@inth/react`
 * umbrella entry in hosted mode, fed the server-resolved state.
 */
export const Consent = ({
	children,
	state,
}: {
	children: ReactNode;
	state: ConsentProviderOptions['prefetch'];
}) => (
	<ConsentProvider
		options={{
			mode: hosted(),
			prefetch: state,
			projectUrl: '/mock-backend',
			theme,
		}}
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
		<footer className="mx-auto max-w-3xl px-6 py-8">
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</ConsentProvider>
);
