/**
 * One group of `@c15t/react`'s public exports. The package index re-exports
 * each group with `export *`, so a bundler that splits code by reachability
 * (esbuild) does not treat every module the index names as part of an app
 * that imports one hook: only the groups it uses are live.
 */
// The banner itself. A `consentManifest()` client build that puts the
// static banner in `index.html` resolves this to `deferred/client-banner.tsx`
// instead, whose banner code loads in a chunk of its own.
export { ConsentBanner } from '#consent-banner';
export { useConsentBannerSurface } from '../components/prompt/surface-context';
