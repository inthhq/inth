'use client';

import { ConsentRoot } from 'c15t/next';
import { ConsentGPP } from 'c15t/react/gpp';
import {
	IABConsentBanner,
	IABConsentDialog,
	IABProvider,
} from 'c15t/react/iab';
import type { ReactNode } from 'react';

import { brandTheme } from '@/lib/consent-theme';

// The backend is your Inth project: set NEXT_PUBLIC_C15T_BACKEND_URL in
// .env.local. The policy comes from its consent manifest.
const config = {
	backendURL:
		process.env.NEXT_PUBLIC_C15T_BACKEND_URL ?? 'https://your-project.inth.app',
};

// A demonstration CMP ID, the same one c15t's own IAB demos use. Every TC
// string names the CMP that wrote it, so a real site uses the ID IAB Europe
// assigned when its CMP registered: https://register.consensu.org/CMP
const CMP_ID = 160;

// A three-vendor list served from public/vendor-list.json so the demo runs
// offline. Its vendors are made up. In production, remove `gvlURL`: c15t then
// loads the official Global Vendor List, either through your backend with
// `hosted()` or from c15t's GVL endpoint, filtered to the vendors you work
// with through the `vendors` prop.
const GVL_URL = '/vendor-list.json';

export const Consent = ({ children }: { children: ReactNode }) => (
	<ConsentRoot
		config={config}
		state={{}}
		options={{ theme: brandTheme }}
	>
		{/* Before the page, so __tcfapi exists when the ad slots ask for it. */}
		<IABProvider
			cmpId={CMP_ID}
			gvlURL={GVL_URL}
		>
			<IABConsentBanner />
			<IABConsentDialog />
		</IABProvider>
		{/* The same TC string, as the tcfeuv2 section of a GPP string, for ad
		    tech that reads window.__gpp instead of window.__tcfapi. */}
		<ConsentGPP />
		{children}
	</ConsentRoot>
);
