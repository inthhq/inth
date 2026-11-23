// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { defineAsyncComponent } from 'vue';

export const LazyIabConsentDialog = defineAsyncComponent(
	() => import('./iab-panel.vue')
);
