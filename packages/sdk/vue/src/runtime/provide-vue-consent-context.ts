import type { App } from 'vue';

import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from './utils/consent-symbols.model';
import type { VueConsentKernelContext } from './vue-consent-kernel-context.model';

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
