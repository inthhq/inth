/**
 * `@inth/sdk/prefetch`: the early `/v1/consent/init` script for servers that
 * serve the script-tag builds.
 *
 * `@inth/sdk/engine` is external here and pinned to the version the script-tag
 * builds bundle, so the request this builds is the one `inth.js` expects.
 *
 * @internal
 */
export { buildPrefetchScript } from '@inth/sdk-core';
export type { PrefetchOptions } from '@inth/sdk-core';
