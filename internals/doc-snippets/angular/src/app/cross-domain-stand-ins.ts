import type { InthProviderOptions } from '@inth/angular';

/** Stand-ins for the app's own code, so the cross-domain snippet type-checks */
export const user = { id: 'user_1' };
export const identityToken = 'identity-token';
export declare const userConsent: InthProviderOptions['userConsent'];
