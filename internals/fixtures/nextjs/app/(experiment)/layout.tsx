import { resolveConsent } from '@inth/nextjs/server';
import { Suspense } from 'react';
import type { ReactNode } from 'react';

import { ExperimentConsent } from '@/components/experiment-consent';
import consentConfig from '@/inth.config';
import { bannerExperiment } from '@/lib/experiment';
import { bannerExperimentFlag } from '@/lib/flags';

import '@/styles/globals.css';

const ResolvedConsent = async ({ children }: { children: ReactNode }) => {
	const arm = await bannerExperimentFlag();
	const state = await resolveConsent({
		config: consentConfig,
		// `off` keeps this visitor out of the experiment.
		experiment: arm === 'off' ? undefined : { ...bannerExperiment, arm },
	});

	return <ExperimentConsent state={state}>{children}</ExperimentConsent>;
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
