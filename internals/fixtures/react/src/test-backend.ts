/**
 * The acceptance suite in `internals/fixtures/acceptance` points this app at a mock
 * backend through `VITE_INTH_PROJECT_URL`.
 */
const testProjectUrl = import.meta.env.VITE_INTH_PROJECT_URL;

/** Overrides the placeholder backend URL when the acceptance suite sets one. */
export const testBackend = <Key extends string>(key: Key) =>
	(testProjectUrl ? { [key]: testProjectUrl } : {}) as Partial<
		Record<Key, string>
	>;
