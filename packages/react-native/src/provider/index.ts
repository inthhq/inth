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
} from '../tracking/request-sequenced-tracking';
export { ConsentClientContext, useConsentClient } from './consent-client-context';
export { ConsentSafeAreaContext } from './consent-safe-area-context';
export type { ConsentSafeAreaInsets } from './consent-safe-area-context';
