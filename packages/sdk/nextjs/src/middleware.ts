/**
 * `@inth/nextjs/middleware` keeps the Next 15 name for the proxy helper.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`; the implementation lives in
 * `@inth/nextjs/proxy` and this entry re-exports it under the old name.
 */

import { inthProxy } from './proxy';

export type { InthProxyOptions as InthMiddlewareOptions } from './proxy';

/**
 * Alias of `inthProxy` from `@inth/nextjs/proxy` for `middleware.ts` files.
 *
 * Both names stay supported. Prefer `inthProxy` in new code, and switch to it
 * when you rename `middleware.ts` to `proxy.ts` on Next 16.
 */
export const inthMiddleware: typeof inthProxy = inthProxy;
