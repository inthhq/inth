/**
 * Vue `#imports` shim. Shared composables import `#imports`; Nuxt resolves to
 * real composables, plain Vue resolves here via the Vite plugin. The Vue and
 * Nuxt packages' `check-types` keep the two compatible, not a separate
 * typeof contract (Nuxt's `useFetch` overloads are not assignable to a narrow
 * stub signature).
 */

export * from '../composables/stubs/use-cookie';
export * from '../composables/stubs/use-fetch';
export * from '../composables/stubs/use-request-headers';
export * from '../composables/stubs/use-state';

export const useHead = function useHead(_input?: unknown): void {
	// Plain Vue does not have Nuxt head management; the Vue plugin adds the
	// token CSS to the document itself.
};
