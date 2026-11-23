import { hosted } from '@inth/sdk/transports';
/**
 * The `inth` plugin for tests whose subject is not the mode. Their
 * options name a backend the way older tests did, with `projectUrl`; this
 * wrapper turns it into `hosted()` and installs the real plugin. A test
 * that passes `mode` or `runtime` gets the plugin unchanged.
 */
import type { App, Plugin } from 'vue';

import { inth as plugin } from '../index';
import type { InthVuePluginOptions as PluginOptions } from '../index';
import type { RuntimeConsentConfig } from '../runtime/create-vue-consent-kernel-context';

// oxlint-disable-next-line oxc/no-barrel-file -- A test stand-in for the plugin entry.
export { generateTokensCSS } from '../index';

/** The plugin options, with `projectUrl` standing in for a hosted mode. */
export type InthVuePluginOptions = Partial<RuntimeConsentConfig> & {
	/** The domain `hosted()` sends with saves. */
	domain?: string;
} & Partial<Pick<PluginOptions, 'mode' | 'runtime'>>;

export const inth: Plugin<[InthVuePluginOptions?]> = {
	install(app: App, options: InthVuePluginOptions = {}) {
		const { projectUrl, domain, ...rest } = options;
		plugin.install?.(
			app,
			(rest.mode || rest.runtime
				? rest
				: {
						...rest,
						mode: hosted({
							projectUrl: projectUrl ?? '/api/inth',
							property: domain,
						}),
					}) as PluginOptions
		);
	},
};
