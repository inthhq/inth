// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { defineChunkComponent } from './parts/define-chunk-component';
import { importComponent } from './parts/import-component';

export const LazyOptInConfirmation = defineChunkComponent(
	'LazyOptInConfirmation',
	() => importComponent(() => import('./opt-in-confirmation.vue'))
);
