import {
	gateConsentCategories,
	gateScripts,
	updateGateBridge,
} from '@inth/benchmarking/consent-gate-page';
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
	useScriptLoader,
	useSnapshot,
} from '@inth/tanstack-start';
import type { InthProviderProps } from '@inth/tanstack-start';
import { useEffect } from 'react';

import { GateArticle } from './gate-article';

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
 * Consent gate page, after CookieBench's TanStack Start fixture: the route
 * loader resolves consent on the server and `InthProvider` renders the stock
 * banner and dialog into the first HTML.
 */
export const GatePage = ({ state }: { state: InthProviderProps['state'] }) => (
	<InthProvider
		options={{ consentCategories: [...gateConsentCategories] }}
		state={state}
	>
		<GateArticle />
		<GateBridge />
		<ConsentBanner />
		<ConsentDialog />
		{/* The gate reopens the choice here to replay a change of mind. */}
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</InthProvider>
);
