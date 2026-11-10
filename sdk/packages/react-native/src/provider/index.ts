/**
 * The provider and the context behind it.
 */

export { ConsentProvider } from './consent-provider';
export type {
	ConsentProviderBaseProps,
	ConsentProviderPromptProps,
	ConsentProviderProps,
} from './consent-provider';
export type { ConsentTrackingRequest } from './tracking-sequence';
export { ConsentClientContext, useConsentClient } from './consent-context';
export { ConsentSafeAreaContext } from './safe-area-context';
export type { ConsentSafeAreaInsets } from './safe-area-context';
