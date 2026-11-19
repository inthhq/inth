/**
 * `check` and `accept` of `@inth/sdk/runtime/documents`, as the chunk they
 * load on their first call. Bundled with everything it imports, for the
 * reason `lazy-hosted.ts` gives: a module this chunk shared with the page
 * would carry what the chunk uses into the page's first load.
 *
 * @internal
 */
export { acceptDocuments, checkDocument } from '../documents/runtime';
