/**
 * `@c15t/react-native/testing`: test an app that uses `@c15t/react-native`
 * in Jest or Vitest, where no native module exists.
 *
 * {@link createTestConsentClient} builds the real consent client over a fake
 * native core. Pass its `client` to `<ConsentProvider client>`, set the
 * starting consent, assert what the app committed, change consent from the
 * native side, and answer the simulated native prompt.
 *
 * @example
 * ```tsx
 * import { ConsentProvider } from '@c15t/react-native';
 * import { createTestConsentClient } from '@c15t/react-native/testing';
 *
 * const consent = createTestConsentClient({ consent: 'granted' });
 *
 * render(
 *     <ConsentProvider client={consent.client} autoPresent={false}>
 *         <Screen />
 *     </ConsentProvider>
 * );
 * ```
 *
 * @packageDocumentation
 */

export { createTestConsentClient } from './test-consent-client';
export type {
	CreateTestConsentClientOptions,
	TestConsentClient,
	TestConsentPrompt,
	TestConsentSession,
	TestConsentState,
} from './test-consent-client';
