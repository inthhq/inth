import { hosted } from '@c15t/core/transports';

import { createConsentClientWith } from './client-base';
import type { CreateConsentClientContext, ResolvedMode } from './client-base';
import type { ConsentClient, ConsentClientOptions } from './types';

export { ACTION_ATTRIBUTE, PREFERENCES_HASH } from './client-base';
export type { CreateConsentClientContext, PageAction } from './client-base';

/**
 * Read the transport from the options: a factory such as `manifest()`, a
 * `testing()` value, or the hosted backend at `projectUrl` for `hosted()`
 * and no mode. Mode names are a script-tag feature.
 */
const resolveMode = function resolveMode(
	options: ConsentClientOptions,
	pkg: string
): ResolvedMode {
	const { mode } = options;
	if (typeof mode === 'function') {
		const { kind } = mode;
		return {
			factory: mode,
			name: kind === 'hosted' || kind === 'manifest' ? kind : 'custom',
		};
	}
	// A `testing()` value carries its transport, not enumerable.
	if (typeof mode === 'object' && 'transport' in mode && mode.transport) {
		return { factory: mode.transport, name: 'testing' };
	}
	if (mode !== undefined && mode.type !== 'hosted') {
		throw new Error(
			`${pkg}: \`mode\` must be hosted() or manifest() from ${pkg}, or testing() from @c15t/browser/testing. Mode names like ${JSON.stringify(mode)} work only in the script-tag builds.`
		);
	}
	if (options.projectUrl === undefined) {
		if (options.enabled === false) {
			// Disabled: nothing inits until the page enables it.
			return {
				factory: Object.assign(
					() => ({
						init: () =>
							Promise.reject(new Error(`${pkg}: \`projectUrl\` is required.`)),
					}),
					{ kind: 'hosted' as const }
				),
				name: 'hosted',
			};
		}
		throw new Error(
			`${pkg}: \`projectUrl\` is required. Set it to your Inth project URL, or use \`mode: testing()\` from @c15t/browser/testing in tests.`
		);
	}
	return {
		factory: hosted({ projectUrl: options.projectUrl }),
		name: 'hosted',
	};
};

/**
 * Create the page's consent client without starting it.
 *
 * @param options - Client options.
 * @param context - Entry-point wiring.
 * @returns The client. Call `start()` to resolve the policy and mount.
 * @throws {Error} When there is no backend URL and `mode` is not
 *   `testing()`, or `mode` is not one this entry takes.
 */
export const createConsentClient = function createConsentClient(
	options: ConsentClientOptions,
	context: CreateConsentClientContext = {}
): ConsentClient {
	return createConsentClientWith(
		options,
		resolveMode(options, context.pkg ?? '@c15t/browser'),
		context
	);
};
