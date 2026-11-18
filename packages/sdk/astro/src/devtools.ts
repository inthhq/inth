/**
 * `@inth/astro/devtools`: the c15t DevTools panel for an Astro site.
 *
 * The panel inspects consents, scripts, policy and events. Mount it from a
 * client script during development:
 *
 * @example
 * ```astro
 * <script>
 *   import { mountDevTools } from '@inth/astro/devtools';
 *
 *   if (import.meta.env.DEV) {
 *     void mountDevTools({ defaultOpen: true });
 *   }
 * </script>
 * ```
 */

import { createDevTools } from '@inth/sdk/devtools';
import type { DevToolsInstance, DevToolsOptions } from '@inth/sdk/devtools';

import { getConsentClient } from './client';

/** Presentation options; the kernel comes from the page's consent client. */
export type AstroDevToolsOptions = Omit<DevToolsOptions, 'kernel'>;

/**
 * Mount the DevTools panel against the page's consent client.
 *
 * Waits for the consent engine to load, so it also works on a page where
 * the engine loads after the first paint.
 *
 * @param options - Panel placement and initial state.
 * @returns The panel; call `destroy()` to remove it.
 * @throws {Error} When the page has no c15t client, such as on the server
 * or on a page without the integration.
 */
export const mountDevTools = async function mountDevTools(
	options: AstroDevToolsOptions = {}
): Promise<DevToolsInstance> {
	const client = getConsentClient();
	if (!client) {
		throw new Error(
			'@inth/astro/devtools: no consent client on this page. Mount the panel from a client script on a page that uses the c15t integration.'
		);
	}
	await client.ready;
	const { runtime } = client;
	if (!runtime) {
		throw new Error('@inth/astro/devtools: the consent engine did not load.');
	}
	return createDevTools({
		...options,
		clearRecords: options.clearRecords ?? runtime.clearRecords,
		kernel: runtime.kernel,
	});
};

export { createDevTools } from '@inth/sdk/devtools';
export type {
	DevToolsActions,
	DevToolsInstance,
	DevToolsOptions,
	DevToolsPosition,
	DevToolsTab,
} from '@inth/sdk/devtools';
