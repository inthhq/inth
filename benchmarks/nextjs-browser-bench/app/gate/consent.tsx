'use client';

import {
	gateConsentCategories,
	gateScripts,
	updateGateBridge,
} from '@c15t/benchmarking/consent-gate-page';
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	ConsentRoot,
	useScriptLoader,
	useSnapshot,
} from '@inth/nextjs';
import type { ConsentRootProps } from '@inth/nextjs';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { typicalInstallConfig } from '../_bench/typical-install-config';

const scripts = gateScripts();

/** Publishes the snapshot to the gate bridge and loads the gated scripts. */
const GateBridge = () => {
	const snapshot = useSnapshot();
	useScriptLoader(scripts);
	useEffect(() => {
		updateGateBridge(snapshot);
	}, [snapshot]);
	return null;
};

/**
 * CookieBench's Next.js fixture (`with-c15t-nextjs/app/consent.tsx`): one
 * `ConsentRoot` with the quickstart config, the stock banner and dialog,
 * and a probe that loads the gated scripts.
 */
export const GateConsent = ({
	children,
	state,
}: {
	children: ReactNode;
	state: ConsentRootProps['state'];
}) => (
	<ConsentRoot
		config={typicalInstallConfig}
		options={{ consentCategories: [...gateConsentCategories] }}
		state={state}
	>
		{children}
		<GateBridge />
		<ConsentBanner />
		<ConsentDialog />
		{/* The gate reopens the choice here to replay a change of mind. */}
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</ConsentRoot>
);
