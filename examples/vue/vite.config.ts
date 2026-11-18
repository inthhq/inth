// #region docs:vite-config
import { consentManifest } from '@inth/vue/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [vue(), consentManifest()],
});
// #endregion docs:vite-config
