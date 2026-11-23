// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { defineAsyncComponent } from 'vue';

export const LazyOptInConfirmation = defineAsyncComponent(
	() => import('./opt-in-confirmation.vue')
);
