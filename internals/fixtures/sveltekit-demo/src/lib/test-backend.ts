// The acceptance suite points this app at a mock backend. The lines that use
// this helper are hidden from the published docs snippets.
import { PUBLIC_INTH_PROJECT_URL } from '$app/env/public';

/** Overrides the placeholder backend URL when the acceptance suite sets one. */
export const testBackend = <Key extends string>(key: Key) =>
	(PUBLIC_INTH_PROJECT_URL
		? { [key]: PUBLIC_INTH_PROJECT_URL }
		: {}) as Partial<Record<Key, string>>;
