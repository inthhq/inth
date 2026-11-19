// oxlint-disable no-use-before-define -- TanStack Router's file-route shape: the component reads its own route's loader data.
// #region docs:root
import { posthog } from '@inth/integrations/posthog';
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/tanstack-start';
import {
	consentLoaderOptions,
	createConsentStateHandler,
} from '@inth/tanstack-start/server';
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

// Start's compiler keeps the handler and the bundled policy on the server.
const getConsentState = createServerFn({ method: 'GET' }).handler(
	createConsentStateHandler()
);

// #region docs:scripts
const scripts = [
	posthog({
		id: 'phc_your_project_key',
		initOptions: { cookieless_mode: 'never' },
		loadMode: 'after-consent',
	}),
];
// #endregion docs:scripts

const RootComponent = () => {
	const { consent } = Route.useLoaderData();
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<InthProvider
					state={consent}
					scripts={scripts}
				>
					<Outlet />
					<ConsentBanner />
					<ConsentDialog />
					<footer>
						<ConsentDialogLink>Privacy settings</ConsentDialogLink>
					</footer>
				</InthProvider>
				<Scripts />
			</body>
		</html>
	);
};

export const Route = createRootRoute({
	...consentLoaderOptions,
	component: RootComponent,
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ content: 'width=device-width, initial-scale=1', name: 'viewport' },
		],
	}),
	loader: async () => ({ consent: await getConsentState() }),
});
// #endregion docs:root
