/**
 * `@inth/sdk/devtools` — the Inth DevTools panel for the script-tag
 * client, the way `@inth/react/devtools` mounts it for a React provider.
 *
 * The panel inspects consents, scripts, policy and events, and its
 * Location tab changes country, region, language and GPC and re-runs
 * init, so a geo-keyed policy can be tried without spoofing headers.
 *
 * @example
 * ```ts
 * import { hosted, init } from '@inth/sdk-browser';
 * import { mountDevTools } from '@inth/sdk-browser/devtools';
 *
 * const client = init({
 *   mode: hosted({ projectUrl: 'https://your-instance.c15t.dev' }),
 * });
 * if (import.meta.env.DEV) {
 *   mountDevTools(client, { defaultOpen: true, defaultTab: 'location' });
 * }
 * ```
 */

import type { DevToolsInstance } from '@inth/sdk-dev-tools';
import { publishDevToolsLauncher } from '@inth/sdk-ui/utils/devtools-launcher';

import { createBrowserDevTools } from './devtools-mount';
import type { BrowserDevToolsOptions } from './devtools-mount';
import type { ConsentClient } from './types';

export type { BrowserDevToolsOptions } from './devtools-mount';

/**
 * Mount the DevTools panel against a client.
 *
 * When the client's stock UI shows the floating trigger, the trigger
 * carries the DevTools button and the panel opens beside it; the panel's
 * own launcher returns while the trigger is hidden.
 *
 * @param client - The page's client.
 * @param options - Panel placement and initial state.
 * @returns The panel; call `destroy()` to remove it.
 */
export const mountDevTools = function mountDevTools(
	client: ConsentClient,
	options: BrowserDevToolsOptions = {}
): DevToolsInstance {
	return createBrowserDevTools(client, options, publishDevToolsLauncher);
};

export { createDevTools } from '@inth/sdk-dev-tools';
export type {
	DevToolsActions,
	DevToolsInstance,
	DevToolsPosition,
	DevToolsTab,
} from '@inth/sdk-dev-tools';
