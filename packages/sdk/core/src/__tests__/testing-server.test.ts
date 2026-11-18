/**
 * `testing()` on a server: a server render builds the provider's transport
 * without running it, so a production prerender of a test page builds, and
 * the browser refuses it on load.
 *
 * @vitest-environment node
 */
import { afterEach, expect, test, vi } from 'vitest';

import { testing } from '../testing';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

test('a production server render builds the transport without the check', () => {
	vi.stubEnv('NODE_ENV', 'production');
	// The setup file stands a window in for Node tests; a server has none.
	vi.stubGlobal('window', undefined);
	const context = {
		prefetch: {},
		translations: { language: 'en', translations: {} as never },
	};

	expect(() => testing().transport(context)).not.toThrow();
});
