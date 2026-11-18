// Resolves from the backend's cached policy manifest, the mode
// `src/hooks.server.ts` gives this area, instead of calling the backend's
// `/init` on every page load. The browser re-inits through `/api/inth`.
export { loadConsent as load } from '@inth/svelte/kit';
