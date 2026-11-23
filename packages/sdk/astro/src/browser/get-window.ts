import type { ClientWindow } from './page-state.model';

/** `window`, or `undefined` outside the browser. */
export const getWindow = function getWindow(): ClientWindow | undefined {
	return typeof window === 'undefined' ? undefined : (window as ClientWindow);
};
