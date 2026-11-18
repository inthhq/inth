'use client';

import { ConsentBanner } from '@inth/react/consent-banner';
import { ConsentDialog } from '@inth/react/consent-dialog';
import { ConsentDialogLink } from '@inth/react/consent-dialog-link';
import { ConsentProvider } from '@inth/react/provider';
import type { ConsentProviderOptions } from '@inth/react/provider';
import { hosted } from '@inth/sdk/engine';
import type { ReactNode } from 'react';

import { theme } from './theme';

/**
 * The same provider tree as the `v3-react` arm, imported from the split
 * `@inth/react/*` entry points instead of the umbrella.
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
