import type { InthVuePluginOptions } from '@inth/vue';
import { createApp } from 'vue';

/** Stand-ins for the app's own code, so the cross-domain snippet type-checks */
export const app = createApp({});
export const user = { id: 'user_1' };
export const identityToken = 'identity-token';
export declare const userConsent: InthVuePluginOptions['userConsent'];
