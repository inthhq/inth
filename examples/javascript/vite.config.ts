// #region docs:vite-config
import { consentManifest } from '@inth/sdk/build';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [consentManifest()],
});
// #endregion docs:vite-config
