// oxlint-disable oxc/no-barrel-file -- The components `@inth/vue/vue-plugin` exports.
/**
 * Every public component. `@inth/vue/vue-plugin` re-exports them; the
 * package is side-effect free outside its stylesheets, so a bundler keeps
 * only the components an app imports.
 */
export { default as ConsentActions } from './actions.vue';
export { default as ConsentBanner } from './prompt/prompt.vue';
export { default as ConsentBrandingIcon } from './branding-icon.vue';
export { default as ConsentButton } from './button.vue';
export { default as ConsentDialogLink } from './consent-dialog-link.vue';
export { default as ConsentDialogTrigger } from './panel-trigger.vue';
export { default as ConsentGate } from './consent-gate.vue';
export { default as ConsentLink } from './link.vue';
export { default as ConsentManager } from './dialog/manager.vue';
export { default as InthProvider } from './inth-provider.vue';
export { default as PrivacyChoicesLink } from './privacy-choices-link.vue';
export { default as ConsentSwitch } from './switch.vue';
export { default as ConsentTag } from './tag.vue';
export { default as ConsentWidget } from './preferences.vue';
export { default as IABConsentBanner } from './iab-prompt.vue';
export { default as IABConsentDialog } from './iab-panel.vue';
export { LazyOptOutConfirmation as OptOutConfirmation } from './lazy-surfaces';
