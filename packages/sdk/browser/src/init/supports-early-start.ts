/**
 * Which pages the init script starts `/v1/consent/init` for, shared with the engine,
 * which takes the init script's answer only for the same options.
 *
 * @packageDocumentation
 * @internal
 */

import type { ScriptTagClientOptions } from '../types';
import { readHostedMarker } from './hosted-marker';

/**
 * Whether `mode` sends the request `primeInitRequest` starts: hosted,
 * without a custom init URL, headers, `fetch` or initial data.
 */
const isPlainHostedMode = function isPlainHostedMode(
	mode: ScriptTagClientOptions['mode']
): boolean {
	if (mode === undefined || mode === 'hosted') {
		return true;
	}
	const hostedOptions = readHostedMarker(mode);
	return Boolean(
		hostedOptions &&
		!hostedOptions.initUrl &&
		!hostedOptions.fetch &&
		!hostedOptions.initialData &&
		!Object.keys(hostedOptions.headers ?? {}).length
	);
};

/**
 * Whether the options leave the first `/v1/consent/init` request, the snapshot and a
 * banner save as the init script computes them.
 */
export const supportsEarlyStart = function supportsEarlyStart(
	options: ScriptTagClientOptions,
	projectUrl: string | undefined
): projectUrl is string {
	return Boolean(
		projectUrl &&
		options.enabled !== false &&
		isPlainHostedMode(options.mode) &&
		!(
			options.prefetch ||
			options.experiment ||
			// The init script installs no blocker: requests the page sends
			// before the engine would pass it.
			(options.networkBlocker && options.networkBlocker.enabled !== false) ||
			options.storageConfig ||
			options.persistence !== undefined ||
			options.consentSource ||
			options.manifest ||
			options.manifestUrl ||
			options.vendors ||
			options.user ||
			options.iab
		)
	);
};
