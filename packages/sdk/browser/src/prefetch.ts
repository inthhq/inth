/**
 * `@inth/sdk/prefetch`: the early `/init` script for servers that serve
 * the script-tag builds, such as `@c15t/backend`.
 *
 * `@inth/sdk/engine` is external here and pinned to the version the script-tag
 * builds bundle, so the request this builds is the one `c15t.js` expects.
 *
 * @internal
 */
export { buildPrefetchScript } from '@inth/sdk-core';
export type { PrefetchOptions } from '@inth/sdk-core';
