/**
 * Shared by `mountDevTools` and the `inth.devtools.js` tag, which differ
 * only in which copy of the launcher slot they publish to.
 *
 * @internal
 * @packageDocumentation
 */

import { createDevTools } from '@inth/sdk-dev-tools';
import type { DevToolsInstance, DevToolsOptions } from '@inth/sdk-dev-tools';
import { attachDevToolsLauncher } from '@inth/sdk-ui/utils/devtools-launcher';
import type { publishDevToolsLauncher } from '@inth/sdk-ui/utils/devtools-launcher';

import type { ConsentClient } from './consent-client.model';

/** Presentation options; the kernel and categories come from the client. */
export type BrowserDevToolsOptions = Omit<
	DevToolsOptions,
	'getConsentCategories' | 'kernel'
>;

/** Offers a DevTools launcher to the stock trigger; see `@inth/sdk/ui`. */
export type PublishDevToolsLauncher = typeof publishDevToolsLauncher;

/**
 * Create the panel for a client and offer its launcher to the client's
 * stock trigger, which then shows a DevTools button and docks the panel
 * beside itself. `destroy()` withdraws the offer first.
 *
 * @param options - Panel placement and initial state.
 * @param publish - The launcher slot's `publishDevToolsLauncher`, from the
 * bundle that renders the trigger. Omit to keep the floating launcher.
 * @internal
 */
export const createBrowserDevTools = function createBrowserDevTools(
	client: ConsentClient,
	options: BrowserDevToolsOptions,
	publish: PublishDevToolsLauncher | undefined
): DevToolsInstance {
	const instance = createDevTools({
		...options,
		clearRecords: options.clearRecords ?? client.runtime.clearRecords,
		getConsentCategories: () => client.consentCategories,
		getPresentation: options.getPresentation ?? (() => client.presentation),
		kernel: client.kernel,
	});
	return publish
		? attachDevToolsLauncher(client.kernel, instance, {
				embedded: options.embedded,
				publish,
			})
		: instance;
};
