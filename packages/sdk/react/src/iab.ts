/**
 * IAB TCF 2.4 React components and hooks.
 *
 * This subpath export contains all IAB-specific React UI. It is only
 * loaded when explicitly imported from '@inth/react/iab'.
 *
 * Requires `@inth/sdk/iab` as a peer dependency.
 *
 * @example
 * ```tsx
 * import { ConsentProvider, hosted } from '@inth/react';
 * import { IABProvider, IABConsentBanner, IABConsentDialog } from '@inth/react/iab';
 *
 * <ConsentProvider
 *   options={{ mode: hosted({ projectUrl: '/api/c15t' }) }}
 * >
 *   <IABProvider cmpId={28}>
 *     <IABConsentBanner />
 *     <IABConsentDialog />
 *   </IABProvider>
 * </ConsentProvider>
 * ```
 *
 * @packageDocumentation
 */

export {
	IABConsentBanner,
	type IABConsentBannerProps,
} from './components/iab-prompt';
export type { IABConsentDialogProps } from './components/iab-panel';
export { IABConsentDialog } from './iab-dialog-deferred';
export {
	type HeadlessIABBannerAction,
	type HeadlessIABBannerState,
	type HeadlessIABDialogAction,
	type HeadlessIABDialogState,
	type HeadlessIABPreferenceTab,
	type UseHeadlessIABConsentUIResult,
	useHeadlessIABConsentUI,
} from './hooks/use-headless-iab-consent-ui';

export { IABProvider } from './iab-context';
export type { IABProviderProps } from './iab-context';
