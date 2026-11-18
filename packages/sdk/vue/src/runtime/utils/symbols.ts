import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';
import type { ConsentActiveUI } from '@inth/sdk/schema/config';
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue';

import type { ConsentConfig } from '../config';
import type { VueConsentKernelContext, VueConsentDisplayData } from '../kernel';

export const symbolInit = Symbol('c15t:init') as InjectionKey<
	Ref<VueConsentDisplayData | undefined>
>;
export const symbolConsent = Symbol('c15t:consent') as InjectionKey<
	Readonly<Ref<ConsentSnapshot['explicitChoice']>>
>;
export const symbolActiveUI = Symbol('c15t:activeUI') as InjectionKey<
	Ref<ConsentActiveUI>
>;
export const symbolKernel = Symbol(
	'c15t:kernel'
) as InjectionKey<ConsentKernel>;
export const symbolSnapshot = Symbol('c15t:snapshot') as InjectionKey<
	Ref<ConsentSnapshot>
>;
export const symbolKernelContext = Symbol(
	'c15t:kernel-context'
) as InjectionKey<VueConsentKernelContext>;

/**
 * The app's c15t config, as the plugin provides it. Here rather than next
 * to `useConsentConfig`, so code that only provides or reads the raw config
 * does not bring the theme and experiment merge into its chunk.
 */
export const consentConfigKey: InjectionKey<
	MaybeRefOrGetter<Partial<ConsentConfig> | undefined>
> = Symbol('c15t:config');
