// #region docs:vite-config title="vite.config.ts"
import { consentManifest } from '@inth/vue/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [vue(), consentManifest({ projectUrl: '/api/inth' })],
});
// #endregion docs:vite-config
