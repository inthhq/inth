// #region docs:static-config
import { manifest } from '@inth/nuxt';

export default defineNuxtConfig({
	compatibilityDate: '2026-07-04',
	inth: {
		// A static host has no server: the browser resolves the policy the
		// build bundled, and the module adds no consent route.
		mode: manifest({ resolve: 'browser' }),
		routePrefix: false,
	},
	modules: ['@inth/nuxt'],
	ssr: false,
});
// #endregion docs:static-config
