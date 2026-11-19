/**
 * The client behind `inth.headless.js` and `inth.iab.js`, which carry the
 * hosted and manifest transports so a script tag can pick one by name with
 * `data-mode`. ES module entries take `hosted()` or a factory instead
 * (`./client`).
 */
import { manifest } from '@inth/sdk-core/transports/manifest-browser';

import {
	createConsentClientWith,
	factoryMode,
	hostedMode,
} from './client-base';
import type { CreateConsentClientContext, ResolvedMode } from './client-base';
import type {
	ConsentClient,
	ConsentModeName,
	ScriptTagClientOptions,
} from './types';

const defaultModeName = function defaultModeName(
	options: ScriptTagClientOptions
): ConsentModeName {
	return options.manifest || options.manifestUrl ? 'manifest' : 'hosted';
};

const resolveMode = function resolveMode(
	options: ScriptTagClientOptions
): ResolvedMode {
	if (typeof options.mode === 'function') {
		return factoryMode(options.mode);
	}
	const name = options.mode ?? defaultModeName(options);
	if (name === 'hosted') {
		return hostedMode(options.projectUrl, '@inth/sdk');
	}
	return {
		factory: manifest({
			inputs: {
				country: options.overrides?.country,
				region: options.overrides?.region,
			},
			manifestUrl: options.manifestUrl,
			projectUrl: options.projectUrl,
			snapshot: options.manifest,
		}),
		name,
	};
};

/**
 * Create a script-tag client without starting it. `mode` may be a name.
 *
 * @param options - Client options from the tag and queued `config` calls.
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
