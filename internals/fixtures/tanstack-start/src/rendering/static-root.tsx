import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
	consentPrefetchHead,
} from '@inth/tanstack-start';
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router';

import { scripts } from '../scripts';
import { testBackend } from '../test-backend';

const projectUrl = 'https://your-project.inth.app';

// No loader: the HTML is built ahead of time, so the browser resolves
// consent after it loads.
const RootComponent = () => (
	<html lang="en">
		<head>
			<HeadContent />
		</head>
		<body>
			<InthProvider
				state={{ projectUrl, ...testBackend('projectUrl') }}
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

export const Route = createRootRoute({
	component: RootComponent,
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ content: 'width=device-width, initial-scale=1', name: 'viewport' },
		],
		// Optional: start the /init request while the browser parses <head>.
		...consentPrefetchHead({
			projectUrl,
			...testBackend('projectUrl'),
		}),
	}),
});
