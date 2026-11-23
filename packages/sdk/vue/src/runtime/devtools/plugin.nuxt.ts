import { inject, toValue } from 'vue';

import { defineNuxtPlugin } from '#imports';

import { consentConfigKey } from '../composables/config';
import { symbolKernelContext } from '../utils/consent-symbols.model';
import { readDisplayedCategories } from './read-displayed-categories';
import { registerDevToolsBridge } from './register-devtools-bridge';

/**
 * Development-only client plugin: exposes the app's kernel to the Inth tab
 * in Nuxt DevTools. The module registers it after the consent plugin.
 */
export default defineNuxtPlugin({
	name: 'inth:devtools',
	setup(nuxtApp) {
		const { config, context } = nuxtApp.vueApp.runWithContext(() => ({
			config: inject(consentConfigKey, undefined),
			context: inject(symbolKernelContext, undefined),
		}));
		if (!context) {
			return;
		}
		const unregister = registerDevToolsBridge(window, {
			clearRecords: () => context.clearRecords(),
			getConsentCategories: () =>
				readDisplayedCategories(
					context.kernel,
					toValue(config)?.consentCategories
				),
			getPresentation: () => toValue(config)?.presentation,
			kernel: context.kernel,
		});
		nuxtApp.vueApp.onUnmount(unregister);
		import.meta.hot?.dispose(unregister);
	},
});
