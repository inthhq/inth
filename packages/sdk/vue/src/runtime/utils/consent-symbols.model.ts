import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';
import type { ConsentActiveUI } from '@inth/sdk/schema/config';
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue';

import type { ConsentConfig } from '../config';
import type { VueConsentKernelContext, VueConsentDisplayData } from '../kernel';

export const symbolInit = Symbol('inth:init') as InjectionKey<
	Ref<VueConsentDisplayData | undefined>
>;
export const symbolConsent = Symbol('inth:consent') as InjectionKey<
	Readonly<Ref<ConsentSnapshot['explicitChoice']>>
>;
export const symbolActiveUI = Symbol('inth:activeUI') as InjectionKey<
	Ref<ConsentActiveUI>
>;
export const symbolKernel = Symbol(
	'inth:kernel'
) as InjectionKey<ConsentKernel>;
export const symbolSnapshot = Symbol('inth:snapshot') as InjectionKey<
	Ref<ConsentSnapshot>
>;
export const symbolKernelContext = Symbol(
	'inth:kernel-context'
) as InjectionKey<VueConsentKernelContext>;

/**
 * The app's Inth config, as the plugin provides it. Here rather than next
 * to `useConsentConfig`, so code that only provides or reads the raw config
 * does not bring the theme and experiment merge into its chunk.
 */
export const consentConfigKey: InjectionKey<
	MaybeRefOrGetter<Partial<ConsentConfig> | undefined>
> = Symbol('inth:config');

/** Provided by `InthProvider` so `ConsentManager` does not mount a second embedded confirmation host. */
export const symbolConfirmationHosted: InjectionKey<boolean> = Symbol(
	'inth:confirmation-hosted'
);
