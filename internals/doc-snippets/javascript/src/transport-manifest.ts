// #region docs:transport-manifest title="src/consent-runtime.ts"
import { manifest } from '@c15t/browser';
import { createConsentRuntime } from 'c15t/runtime';

// Fetch the backend's public manifest and resolve the policy in the browser.
// Saves still go to the backend. When the manifest is unavailable, the
// runtime asks the backend's /init instead.
export const runtime = createConsentRuntime({
	mode: manifest(),
	projectUrl: 'https://your-project.inth.app',
});
// #endregion docs:transport-manifest
