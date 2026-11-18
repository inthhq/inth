/**
 * The TanStack Router plugin generates these route types in an app's
 * `src/routeTree.gen.ts`. These snippets are never built, so they declare
 * the server routes by hand.
 */
import type { Route as rootRoute } from './rendering/streamed-root';
import type { Route as consentRoute } from './routes/api/inth/$';

declare module '@tanstack/react-router' {
	interface FileRoutesByPath {
		'/api/inth/$': {
			id: '/api/inth/$';
			path: '/api/inth/$';
			fullPath: '/api/inth/$';
			preLoaderRoute: typeof consentRoute;
			parentRoute: typeof rootRoute;
		};
	}
}
