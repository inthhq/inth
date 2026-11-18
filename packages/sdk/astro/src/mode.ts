/**
 * Consent modes for `@inth/astro`.
 *
 * Astro evaluates `astro.config.mjs` at build time, but the browser boot
 * script is a string the integration injects. A transport factory cannot
 * cross that boundary, so the integration takes the plain data
 * `manifest()` and `hosted()` from `@inth/sdk/modes` return, or
 * `testing()` from `@inth/astro/testing`, and the server and the browser
 * each turn it into a transport. The browser's side is `./transport.ts`.
 */

export { hosted, manifest } from '@inth/sdk/modes';
