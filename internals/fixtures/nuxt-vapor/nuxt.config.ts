/**
 * c15t on Nuxt 4.6 with Vue Vapor.
 *
 * `vue.vapor` turns on Nuxt's Vapor interop. Every page and component in
 * `app/` opts in with `<script setup vapor>`, while the c15t components stay
 * on the virtual DOM and render inside them.
 *
 * The acceptance suite points the demo at a mock backend with
 * `NUXT_PUBLIC_C15T_BACKEND_URL`. Without it the demo uses the placeholder
 * project URL, so set the variable to your Inth project URL to run it by hand.
 *
 * `C15T_NUXT_FUTURE=1` builds with the Nuxt 5 preview
 * (`future.compatibilityVersion: 5`) and the 4.6 opt-ins that touch
 * rendering: `early404` and prerendered error pages.
 */
import { manifest } from '@inth/nuxt';

const future = process.env.C15T_NUXT_FUTURE === '1';

export default defineNuxtConfig({
	c15t: {
		// Read at runtime, so the acceptance suite's backend outage reaches
		// the server render.
		mode: manifest({ source: 'runtime' }),
		// The suite's mock backend, or the placeholder project URL.
		projectUrl:
			process.env.NUXT_PUBLIC_C15T_BACKEND_URL ??
			'https://your-project.inth.app',
	},
	compatibilityDate: '2026-10-05',
	css: ['~/consent-example.css'],
	devtools: { enabled: true },
	...(future && {
		experimental: { early404: true, prerenderErrorPages: true },
		future: { compatibilityVersion: 5 },
	}),
	modules: ['@inth/nuxt'],
	typescript: { strict: true },
	// Vapor needs Vue 3.6. Opt components in with `<script setup vapor>`.
	vue: { vapor: true },
});
