// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { defineChunkComponent } from './parts/define-chunk-component';
import { importComponent } from './parts/import-component';

/**
 * The stock consent dialog, with the opt-in confirmation it hosts. Its
 * chunk loads when the dialog first opens, and again on the next open
 * after a failed load.
 */
export const LazyConsentDialog = defineChunkComponent(
	'LazyConsentDialog',
	() => importComponent(() => import('./dialog/manager.vue'))
);
