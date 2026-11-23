import type { App } from 'vue';

import type { VueConsentKernelContext } from './create-vue-consent-kernel-context';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from './utils/consent-symbols.model';

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
