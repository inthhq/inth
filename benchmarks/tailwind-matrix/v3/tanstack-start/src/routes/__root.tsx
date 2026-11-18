import {
	ConsentBanner,
	ConsentDialog,
	ConsentRoot,
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
			<ConsentRoot
				persistence={false}
				state={{ projectUrl }}
				// #region docs:slot
				options={{
					components: {
						banner: {
							root: { className: '!p-[7px] dark:!p-[11px]' },
						},
					},
					// Tailwind 3 builds c15t's stylesheet from styles.css.
					styles: false,
				}}
				// #endregion docs:slot
			>
				<Outlet />
				<ConsentBanner />
				<ConsentDialog />
			</ConsentRoot>
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
			{ title: 'c15t + Tailwind: TanStack Start' },
		],
	}),
});
