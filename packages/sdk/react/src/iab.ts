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
 * import { InthProvider, hosted } from '@inth/react';
 * import { IABProvider, IABConsentBanner, IABConsentDialog } from '@inth/react/iab';
 *
 * <InthProvider
 *   options={{ mode: hosted({ projectUrl: '/api/inth' }) }}
 * >
 *   <IABProvider cmpId={28}>
 *     <IABConsentBanner />
 *     <IABConsentDialog />
 *   </IABProvider>
 * </InthProvider>
 * ```
 *
 * @packageDocumentation
 */

export {
	IABConsentBanner,
	type IABConsentBannerProps,
} from './components/iab-prompt';
export type { IABConsentDialogProps } from './components/iab-panel';
export { IABConsentDialog } from './iab-panel';
export {
	type HeadlessIABBannerAction,
	type HeadlessIABBannerState,
	type HeadlessIABDialogAction,
	type HeadlessIABDialogState,
	type HeadlessIABPreferenceTab,
	type UseHeadlessIABConsentUIResult,
	useHeadlessIABConsentUI,
} from './hooks/use-headless-iab-consent-ui';

export { IABProvider } from './iab-provider';
export type { IABProviderProps } from './iab-provider';
