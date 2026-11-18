// #region docs:vite-config
import { consentManifest } from '@inth/sdk/build';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react(), consentManifest()],
});
// #endregion docs:vite-config
