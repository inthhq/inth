/**
 * One group of `@inth/react`'s public exports. The package index re-exports
 * each group with `export *`, so a bundler that splits code by reachability
 * (esbuild) does not treat every module the index names as part of an app
 * that imports one hook: only the groups it uses are live.
 */
// Browser builds get `deferred/client-provider.tsx`: a client-rendered page
// renders before the consent engine loads. Server builds get the provider
// itself, so a server render is unchanged. `@inth/react/provider` always
// keeps the engine in the page's first-load JavaScript. See `imports` in
// package.json.
export { InthProvider } from '#consent-provider';
