// The acceptance suite points this app at a mock backend. The lines that use
// this helper are hidden from the published docs snippets.
const testProjectUrl = import.meta.env.VITE_INTH_PROJECT_URL;

/** Overrides the placeholder backend URL when the acceptance suite sets one. */
export const testBackend = <Key extends string>(key: Key) =>
	(testProjectUrl ? { [key]: testProjectUrl } : {}) as Partial<
		Record<Key, string>
	>;
