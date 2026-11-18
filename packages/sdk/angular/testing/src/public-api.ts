/**
 * `@c15t/angular/testing`: `testing()`, which runs the consent flow
 * with no backend, and Angular CDK component harnesses for the c15t
 * consent surfaces, for your own TestBed tests.
 *
 * The banner, dialog, trigger and IAB surfaces render into `<body>`: find
 * them with `TestbedHarnessEnvironment.documentRootLoader(fixture)`. The
 * widget, gate, buttons and switches render in place, so
 * `TestbedHarnessEnvironment.loader(fixture)` finds them.
 *
 * @packageDocumentation
 */

export { ConsentBannerHarness } from './consent-banner-harness';
export type { ConsentBannerHarnessFilters } from './consent-banner-harness';
export { ConsentButtonHarness } from './consent-button-harness';
export type { ConsentButtonHarnessFilters } from './consent-button-harness';
export { ConsentDialogHarness } from './consent-dialog-harness';
export type { ConsentDialogHarnessFilters } from './consent-dialog-harness';
export { ConsentDialogTriggerHarness } from './consent-dialog-trigger-harness';
export type { ConsentDialogTriggerHarnessFilters } from './consent-dialog-trigger-harness';
export { ConsentGateHarness } from './consent-gate-harness';
export type { ConsentGateHarnessFilters } from './consent-gate-harness';
export { ConsentWidgetHarness } from './consent-widget-harness';
export type { ConsentWidgetHarnessFilters } from './consent-widget-harness';
export { IABConsentBannerHarness } from './iab-consent-banner-harness';
export type { IABConsentBannerHarnessFilters } from './iab-consent-banner-harness';
export { IABConsentDialogHarness } from './iab-consent-dialog-harness';
export type {
	IABConsentDialogHarnessFilters,
	IABConsentDialogTab,
} from './iab-consent-dialog-harness';
export { SwitchHarness } from './switch-harness';
export type { SwitchHarnessFilters } from './switch-harness';
export { testing } from './testing-mode';
export type { ConsentTesting, TestingModeOptions } from './testing-mode';
