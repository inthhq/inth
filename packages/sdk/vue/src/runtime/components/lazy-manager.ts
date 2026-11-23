// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { defineAsyncComponent } from 'vue';

/**
 * The stock consent dialog, with the opt-in confirmation it hosts. Its
 * chunk loads when the dialog first opens.
 */
export const LazyConsentManager = defineAsyncComponent(
	() => import('./dialog/manager.vue')
);
