/**
 * Astro middleware entrypoint for `@inth/astro`.
 *
 * The integration registers this with `order: 'pre'` so every route — pages,
 * endpoints and server islands alike — sees `Astro.locals.inth` already
 * populated. See {@link createConsentMiddleware} for what it does.
 */

import type { MiddlewareHandler } from 'astro';
import options from 'virtual:inth/options';

import { createConsentMiddleware } from './middleware-handler';
import type { ConsentMiddlewareOptions } from './middleware-handler';
import type { InthLocals } from './types';

declare global {
	// oxlint-disable-next-line typescript/no-namespace -- Astro's documented `App.Locals` augmentation point is a namespace.
	namespace App {
		interface Locals {
			/** Consent context resolved by the Inth middleware. */
			inth: InthLocals;
		}
	}
}

export const onRequest = createConsentMiddleware(options);
export default onRequest;

/**
 * The consent middleware bound to this site's `inth()` options, for a
 * `src/middleware.ts` that composes it itself. Set `middleware: false` in
 * the integration so it does not also run as the `pre` middleware.
 *
 * @param middlewareOptions - Per-request hooks such as `experimentArm`.
 * @example
 * ```ts
 * // src/middleware.ts
 * import { consentMiddleware } from '@inth/astro/middleware';
 *
 * export const onRequest = consentMiddleware({
 *   experimentArm: (context) =>
 *     context.cookies.get('banner-arm')?.value === 'wall' ? 'wall' : 'floating',
 * });
 * ```
 */
export const consentMiddleware = function consentMiddleware(
	middlewareOptions: ConsentMiddlewareOptions = {}
): MiddlewareHandler {
	return createConsentMiddleware(options, middlewareOptions);
};

export { createConsentMiddleware } from './middleware-handler';
export type { ConsentMiddlewareOptions } from './middleware-handler';
