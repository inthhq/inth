import { consentLoaderOptions } from '@c15t/tanstack-start/server';
import { createFileRoute } from '@tanstack/react-router';

import { GatePage } from '../bench/gate';
import { getDirectInitConsentState } from '../bench/loaders';
import { consentStylesheetHead } from '../bench/stylesheets';

const GateRoute = () => {
	// oxlint-disable-next-line no-use-before-define -- TanStack Router's file-route shape: the component reads its own route's loader data.
	const state = Route.useLoaderData();
	return <GatePage state={state} />;
};

// Same loader as the `ssr` arm: `/init` from the fixture backend on every
// request, after the bench's simulated backend latency.
export const Route = createFileRoute('/gate')({
	...consentLoaderOptions,
	component: GateRoute,
	head: consentStylesheetHead,
	loader: () => getDirectInitConsentState(),
});
