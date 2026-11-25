import { importComponent } from '../parts/import-component';

/**
 * The consent dialog's chunk, with its stylesheets. Kept apart from the
 * dialog itself so the banner can warm it on intent without importing it.
 *
 * @internal
 */
export const loadConsentDialog = () =>
	importComponent(() => import('./dialog.vue'));
