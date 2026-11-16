/**
 * Consent gate: the default handle gives this route `manifest()` mode, so
 * `loadConsent` resolves the fixture manifest in-process, the way
 * CookieBench's SvelteKit fixture resolves its bundled manifest.
 */
export { loadConsent as load } from '@c15t/svelte/kit';
