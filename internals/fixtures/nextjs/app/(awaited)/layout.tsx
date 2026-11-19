import { resolveConsent } from '@inth/nextjs/server';
import { Suspense } from 'react';
import type { ReactNode } from 'react';

import { Consent } from '@/components/consent';
import consentConfig from '@/inth.config';

import '@/styles/globals.css';

const ResolvedConsent = async ({ children }: { children: ReactNode }) => {
	const state = await resolveConsent({ config: consentConfig });

	return <Consent state={state}>{children}</Consent>;
};

const RootLayout = ({ children }: { children: ReactNode }) => (
	<html lang="en">
		<body>
			<Suspense fallback={null}>
				<ResolvedConsent>{children}</ResolvedConsent>
			</Suspense>
		</body>
	</html>
);

export default RootLayout;

export { metadata } from '@/lib/metadata';
