// The acceptance suite in `internals/fixtures/acceptance` points this app at a mock backend.
const testProjectUrl = process.env.NEXT_PUBLIC_INTH_PROJECT_URL;

/** Overrides the placeholder backend URL when the acceptance suite sets one. */
export const testBackend = <Key extends string>(key: Key) =>
	(testProjectUrl ? { [key]: testProjectUrl } : {}) as Partial<
		Record<Key, string>
	>;
