/**
 * `../runtime/kernel` for tests that build a context from a config alone.
 * The plugin always passes a `mode`; these tests describe the hosted
 * transport through the config fields older tests used (`projectUrl`,
 * `customFetch`, `domain`), and this wrapper turns them into `hosted()`.
 */

import { hosted } from '@inth/sdk/transports';

import { createVueConsentKernelContext as createContext } from '../runtime/kernel';
import type {
	RuntimeConsentConfig as KernelConsentConfig,
	VueConsentContextOptions,
	VueConsentKernelContext,
} from '../runtime/kernel';

// oxlint-disable-next-line oxc/no-barrel-file -- A test stand-in for the kernel module.
export * from '../runtime/kernel';

/** The hosted transport fields a test config may carry. */
interface TestTransportConfig {
	projectUrl?: string;
	customFetch?: typeof fetch;
	domain?: string;
}

/** The kernel config, plus the hosted transport fields. */
export type RuntimeConsentConfig = KernelConsentConfig & TestTransportConfig;

/**
 * {@link createContext} with `mode` defaulting to `hosted()` built from the
 * config's `projectUrl`, `customFetch` and `domain`.
 *
 * @param options - The context options.
 * @returns The context.
 */
export const createVueConsentKernelContext =
	function createVueConsentKernelContext(
		options: Omit<VueConsentContextOptions, 'config'> & {
			config: RuntimeConsentConfig;
		}
	): VueConsentKernelContext {
		const { projectUrl, customFetch, domain } = options.config;
		return createContext({
			...options,
			mode:
				options.mode ??
				hosted({
					domain,
					fetch: customFetch,
					projectUrl: projectUrl ?? '/api/inth',
				}),
		});
	};
