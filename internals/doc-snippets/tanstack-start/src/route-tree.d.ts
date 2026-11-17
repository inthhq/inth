/**
 * The TanStack Router plugin generates these route types in an app's
 * `src/routeTree.gen.ts`. These snippets are never built, so they declare
 * the server routes by hand.
 */
import type { Route as rootRoute } from './rendering/streamed-root';
import type { Route as consentRoute } from './routes/api/c15t/$';

declare module '@tanstack/react-router' {
	interface FileRoutesByPath {
		'/api/c15t/$': {
			id: '/api/c15t/$';
			path: '/api/c15t/$';
			fullPath: '/api/c15t/$';
			preLoaderRoute: typeof consentRoute;
			parentRoute: typeof rootRoute;
		};
	}
}
