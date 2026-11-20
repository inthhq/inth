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
// oxlint-disable no-use-before-define -- TanStack Router's file-route shape: the component reads its own route's loader data.
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { scripts } from '../scripts';
import { testBackend } from '../test-backend';

const projectUrl = 'https://your-project.inth.app';

// Declare the server function in your own module. Start's compiler splits
// the server code out of the browser bundle at this call site.
const getConsentState = createServerFn({ method: 'GET' }).handler(
	createConsentStateHandler({
		projectUrl,
		...testBackend('projectUrl'),
	})
);

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
