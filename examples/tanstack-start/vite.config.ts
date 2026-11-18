// #region docs:vite-config
import { consentManifest } from '@inth/tanstack-start/build';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [consentManifest(), tanstackStart(), viteReact()],
});
// #endregion docs:vite-config
