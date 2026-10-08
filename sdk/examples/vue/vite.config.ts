// #region docs:vite-config
import vue from '@vitejs/plugin-vue';
import { consentManifest } from 'c15t/build';
import c15tVue from 'c15t/vue/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), 'VITE_');
	return {
		plugins: [
			vue(),
			c15tVue(),
			// Downloads the policy and writes src/c15t-manifest.ts.
			consentManifest({
				backendURL:
					env.VITE_C15T_BACKEND_URL ?? 'https://benchmarks-inth.inth.app',
			}),
		],
	};
});
// #endregion docs:vite-config
