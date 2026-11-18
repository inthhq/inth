import { consentManifest } from '@inth/vue/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The app runs in `hosted()` mode, so a build without a reachable backend
// still succeeds: the policy comes from `/init` at runtime.
export default defineConfig({
	plugins: [vue(), consentManifest({ onBuildError: 'runtime' })],
});
