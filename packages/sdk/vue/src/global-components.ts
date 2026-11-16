/**
 * The components the Nuxt module registers globally, by name and file
 * under `runtime/components/`. A page can render any of them before a tap,
 * so the banner preload keeps their chunks at their priority
 * (`bannerOnlyFiles` in `./prefetch`).
 *
 * @internal
 */
export const GLOBAL_COMPONENTS = [
	// Global so runtime resolution (<component :is="'ConsentRoot'">) works
	// too: ConsentRoot is the documented mount-anywhere entry.
	['ConsentRoot', 'nuxt-root'],
	// Inline consent widget for settings and privacy pages, with the same DOM
	// contract as @c15t/react and @c15t/svelte ConsentWidget.
	['ConsentWidget', 'preferences'],
	['ConsentDialogLink', 'consent-dialog-link'],
	['ConsentDialogTrigger', 'panel-trigger'],
	['ConsentGate', 'consent-gate'],
] as const;
