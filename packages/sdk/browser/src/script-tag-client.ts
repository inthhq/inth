/**
 * The client behind `c15t.headless.js` and `c15t.iab.js`, which carry the
 * hosted and manifest transports so a script tag can pick one by name with
 * `data-mode`. ES module entries take `hosted()` or a factory instead
 * (`./client`).
 */
import { hosted } from '@c15t/core/transports';
import { manifest } from '@c15t/core/transports/manifest-browser';

import { createConsentClientWith } from './client-base';
import type { CreateConsentClientContext, ResolvedMode } from './client-base';
import type {
	ConsentClient,
	ConsentModeName,
	ScriptTagClientOptions,
} from './types';

const defaultModeName = function defaultModeName(
	options: ScriptTagClientOptions
): ConsentModeName {
	return options.manifest || options.manifestURL ? 'manifest' : 'hosted';
};

const resolveMode = function resolveMode(
	options: ScriptTagClientOptions
): ResolvedMode {
	if (typeof options.mode === 'function') {
		const { kind } = options.mode;
		return {
			factory: options.mode,
			name:
				kind === 'hosted' || kind === 'manifest' ? kind : 'custom',
		};
	}
	const name = options.mode ?? defaultModeName(options);
	if (name === 'hosted') {
		if (!options.backendURL) {
			throw new Error(
				'@c15t/browser: `backendURL` is required (data-backend-url on the script tag). Tests load c15t.testing.js instead.'
			);
		}
		return { factory: hosted({ backendURL: options.backendURL }), name };
	}
	return {
			factory: manifest({
				backendURL: options.backendURL,
				inputs: {
					country: options.overrides?.country,
					region: options.overrides?.region,
				},
				manifestURL: options.manifestURL,
				snapshot: options.manifest,
			}),
		name,
	};
};

/**
 * Create a script-tag client without starting it. `mode` may be a name.
 *
 * @param options - Client options from the tag and queued `config` calls.
 * @param context - Entry-point wiring.
 * @returns The client. Call `start()` to resolve the policy and mount.
 * @throws {Error} When the selected mode or policy presets are invalid.
 * @internal
 */
export const createScriptTagConsentClient =
	function createScriptTagConsentClient(
		options: ScriptTagClientOptions = {},
		context: CreateConsentClientContext = {}
	): ConsentClient {
		return createConsentClientWith(options, resolveMode(options), context);
	};
