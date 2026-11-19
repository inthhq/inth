'use client';

import { ConsentBanner, ConsentDialog, InthProvider } from '@inth/nextjs';
import type { ReactNode } from 'react';

import { callbacks } from '@/lib/consent-callbacks';
import { brandTheme } from '@/lib/consent-theme';
import { bannerArmFromFlag, bannerExperiment } from '@/lib/experiment';

// The backend is your Inth project: set NEXT_PUBLIC_INTH_PROJECT_URL in
// .env.local. The policy comes from its consent manifest.
const config = {
	projectUrl:
		process.env.NEXT_PUBLIC_INTH_PROJECT_URL ?? 'https://your-project.inth.app',
};

export const Consent = ({ children }: { children: ReactNode }) => (
	<InthProvider
		config={config}
		state={{}}
		options={{
			callbacks,
			// What the banner asks about. In a real shop the analytics and ad
			// scripts you pass as `scripts` declare these for you.
			consentCategories: ['measurement', 'marketing'],
			// The flag's arm, or none so Inth picks one by `split` and keeps
			// it for this visitor.
			experiment: { ...bannerExperiment, arm: bannerArmFromFlag() },
			theme: brandTheme,
		}}
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
	</InthProvider>
);
