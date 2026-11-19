// The acceptance suite points this app at a mock backend. Astro evaluates the
// config as plain JavaScript, so this reads the variable directly.
const testProjectUrl = process.env.INTH_PROJECT_URL;

/**
 * Overrides the placeholder backend URL when the acceptance suite sets one.
 *
 * @param {string} key - The option that holds the backend URL.
 * @returns {Record<string, string>} The override, or an empty object.
 */
export const testBackend = (key) =>
	testProjectUrl ? { [key]: testProjectUrl } : {};
