import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/tanstack-start';
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router';

import appCss from '../styles.css?url';

const projectUrl = 'https://your-project.inth.app';

const RootComponent = () => (
	<html lang="en">
		<head>
			<HeadContent />
		</head>
		<body>
			<InthProvider
				persistence={false}
				state={{ projectUrl }}
				// #region docs:slot
				options={{
					components: {
						banner: {
							root: { className: '!p-[7px] dark:!p-[11px]' },
						},
					},
					// Tailwind 3 builds Inth's stylesheet from styles.css.
					styles: false,
				}}
				// #endregion docs:slot
			>
				<Outlet />
				<ConsentDialogLink />
				<ConsentBanner />
				<ConsentDialog />
			</InthProvider>
			<Scripts />
		</body>
	</html>
);

export const Route = createRootRoute({
	component: RootComponent,
	head: () => ({
		links: [{ href: appCss, rel: 'stylesheet' }],
		meta: [
			{ charSet: 'utf-8' },
			{ content: 'width=device-width, initial-scale=1', name: 'viewport' },
			{ title: 'inth + Tailwind: TanStack Start' },
		],
	}),
});
