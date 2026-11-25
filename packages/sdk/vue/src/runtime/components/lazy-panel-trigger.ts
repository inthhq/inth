// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { defineChunkComponent } from './parts/define-chunk-component';
import { importComponent } from './parts/import-component';

/**
 * The floating dialog trigger renders nothing before the page mounts, so
 * it never takes part in the first paint. Its chunk carries its
 * stylesheet, which the bundler loads before the component renders: kept
 * out of the entry, the trigger's rules no longer block the first paint of
 * every page, and a page without the trigger never downloads them. A
 * failed load is tried again on the next consent snapshot.
 */
export const LazyConsentDialogTrigger = defineChunkComponent(
	'LazyConsentDialogTrigger',
	() => importComponent(() => import('./panel-trigger.vue')),
	{ suspensible: false }
);
