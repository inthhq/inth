import type { App } from 'vue';

import type { VueConsentKernelContext } from './kernel';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from './utils/symbols';

/**
 * Provide a context to every component of an app under the package's
 * injection keys.
 *
 * @param app - The Vue app.
 * @param context - The app's context.
 */
export const provideVueConsentContext = function provideVueConsentContext(
	app: App,
	context: VueConsentKernelContext
): void {
	app.provide(symbolKernelContext, context);
	app.provide(symbolKernel, context.kernel);
	app.provide(symbolSnapshot, context.snapshot);
	app.provide(symbolInit, context.init);
	app.provide(symbolActiveUI, context.activeUI);
	app.provide(symbolConsent, context.storedConsent);
};
