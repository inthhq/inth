/**
 * The provider and the context behind it.
 */

export { InthProvider } from './inth-provider';
export type {
	InthProviderBaseProps,
	InthProviderPromptProps,
	InthProviderProps,
} from './inth-provider';
export type {
	ConsentTrackingReprompt,
	ConsentTrackingRequest,
} from './tracking-sequence';
export { ConsentClientContext, useConsentClient } from './consent-context';
export { ConsentSafeAreaContext } from './safe-area-context';
export type { ConsentSafeAreaInsets } from './safe-area-context';
