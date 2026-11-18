import { resolveConsent } from '@inth/nextjs/server';
import type { ReactNode } from 'react';

import consentConfig from '@/inth.config';
import { Consent } from '@/components/consent';

import '@/styles/globals.css';

const RootLayout = ({ children }: { children: ReactNode }) => {
	// Not awaited: the page renders while consent resolves.
	const state = resolveConsent({ config: consentConfig });

	return (
		<html lang="en">
			<body>
				<Consent state={state}>{children}</Consent>
			</body>
		</html>
	);
};

export default RootLayout;

export { metadata } from '@/lib/metadata';
