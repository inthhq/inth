'use client';
/* oxlint-disable react/no-danger -- Static fixture markup from consent-gate-page.ts, identical on every arm; no user input. */

import {
	gateConsentCategories,
	gatePageCSS,
	gatePageHTML,
	gateScripts,
	updateGateBridge,
} from '@inth/benchmarking/consent-gate-page';
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
	hosted,
	useScriptLoader,
	useSnapshot,
} from '@inth/react';
import { useEffect } from 'react';

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
 * Consent gate page: CookieBench's article with the stock banner and dialog
 * on a client-rendered `InthProvider`, as an ordinary React app sets it up.
 */
const GatePage = () => (
	<InthProvider
		options={{
			consentCategories: [...gateConsentCategories],
			mode: hosted(),
			projectUrl: '/api/bench-consent',
		}}
	>
		<style dangerouslySetInnerHTML={{ __html: gatePageCSS }} />
		<div dangerouslySetInnerHTML={{ __html: gatePageHTML }} />
		<GateBridge />
		<ConsentBanner />
		<ConsentDialog />
		{/* The gate reopens the choice here to replay a change of mind. */}
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</InthProvider>
);

export default GatePage;
