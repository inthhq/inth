/**
 * The method handlers a framework route exports, built from one function
 * that maps the framework's request to the consent route handler, and a
 * cache for adapters that read the route's options per request.
 */
import type { ConsentProxyOptions } from './consent-proxy.api';
import { createConsentRouteHandler } from './consent-route.api';
import type {
	ConsentRouteHandler,
	ConsentRouteHandlerOptions,
	ConsentRouteName,
} from './consent-route.api';

/** A consent route's handlers: `GET`, which serves `manifest` and `init`. */
export interface ConsentRouteMethodHandlers<Handler> {
	GET: Handler;
}

/** A consent route's handlers with `proxy` on: every method it forwards. */
export interface ConsentProxyRouteMethodHandlers<
	Handler,
> extends ConsentRouteMethodHandlers<Handler> {
	POST: Handler;
	PATCH: Handler;
	PUT: Handler;
	DELETE: Handler;
	OPTIONS: Handler;
}

/**
 * The handler set for a route's options: every method when `proxy` is set
 * to anything truthy, `GET` otherwise.
 */
export type ConsentRouteMethodHandlersFor<Options, Handler> = Options extends {
	proxy: true | ConsentProxyOptions;
}
	? ConsentProxyRouteMethodHandlers<Handler>
	: ConsentRouteMethodHandlers<Handler>;

/**
 * Builds a route's method handlers. `GET` lets the route pick `manifest`,
 * `init` or a forwarded path; the write methods are proxied, and exist
 * only with `proxy` on.
 *
 * @param proxy - The route's `proxy` option.
 * @param handlerFor - Maps the framework's request to the consent route,
 * for `route` (`undefined` for `GET`, `'proxy'` for the write methods).
 * @returns `GET`, plus `POST`, `PATCH`, `PUT`, `DELETE` and `OPTIONS` with
 * `proxy` on.
 * @example
 * ```ts
 * const handlers = createConsentRouteMethodHandlers(options.proxy, (route) =>
 *   (request: Request) => handle(request, { route })
 * );
 * ```
 */
export const createConsentRouteMethodHandlers =
	function createConsentRouteMethodHandlers<
		Options extends { proxy?: boolean | ConsentProxyOptions },
		Handler,
	>(
		proxy: Options['proxy'],
		handlerFor: (route: ConsentRouteName | undefined) => Handler
	): ConsentRouteMethodHandlersFor<Options, Handler> {
		const GET = handlerFor(undefined);
		if (!proxy) {
			const handlers: ConsentRouteMethodHandlers<Handler> = { GET };
			return handlers as ConsentRouteMethodHandlersFor<Options, Handler>;
		}
		const forward = handlerFor('proxy');
		const handlers: ConsentProxyRouteMethodHandlers<Handler> = {
			DELETE: forward,
			GET,
			OPTIONS: forward,
			PATCH: forward,
			POST: forward,
			PUT: forward,
		};
		return handlers as ConsentRouteMethodHandlersFor<Options, Handler>;
	};

/** Whether two option sets hold the same values, key by key. */
const sameOptions = function sameOptions(
	previous: ConsentRouteHandlerOptions,
	next: ConsentRouteHandlerOptions
): boolean {
	const names = new Set([...Object.keys(previous), ...Object.keys(next)]);
	return [...names].every(
		(name) =>
			previous[name as keyof ConsentRouteHandlerOptions] ===
			next[name as keyof ConsentRouteHandlerOptions]
	);
};

/**
 * A consent route handler for options an adapter reads per request (from
 * runtime config or request locals). The handler is built once and
 * rebuilt only when an option's value changes.
 *
 * @returns The function that gives the handler for a request's options.
 * @example
 * ```ts
 * const handlerFor = createConsentRouteHandlerCache();
 * const response = await handlerFor(readOptions(event))(request, context);
 * ```
 */
export const createConsentRouteHandlerCache =
	function createConsentRouteHandlerCache(): (
		options: ConsentRouteHandlerOptions
	) => ConsentRouteHandler {
		let built:
			| { handle: ConsentRouteHandler; options: ConsentRouteHandlerOptions }
			| undefined;
		return (options) => {
			if (!(built && sameOptions(built.options, options))) {
				built = { handle: createConsentRouteHandler(options), options };
			}
			return built.handle;
		};
	};
