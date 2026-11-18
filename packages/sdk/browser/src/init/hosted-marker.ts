/**
 * `c15t.hosted()` before the engine has loaded.
 *
 * `init({ mode: c15t.hosted({ projectUrl }) })` is the documented way to
 * pick the hosted transport on a script-tag page, but the transport is
 * engine code. The init script's `c15t.hosted()` returns a marker carrying
 * the options instead, and the engine builds the real factory from it.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	HostedModeOptions,
	ProviderTransportFactory,
} from '@inth/sdk-core';

/** Property of a marker that holds its `hosted()` options. */
export const HOSTED_OPTIONS = '__inthHosted';

/** A `c15t.hosted()` result from the init script. @internal */
export type HostedMarker = ProviderTransportFactory & {
	kind: 'hosted';
	[HOSTED_OPTIONS]: HostedModeOptions;
};

/**
 * Build a marker for `hosted(options)`.
 *
 * @param options - The `hosted()` options.
 * @returns A factory that throws if called before the engine replaces it.
 * @internal
 */
export const hostedMarker = function hostedMarker(
	options: HostedModeOptions
): HostedMarker {
	const marker = (() => {
		throw new Error(
			'@inth/sdk: c15t.hosted() from c15t.js runs once c15t.hosted.js has loaded.'
		);
	}) as unknown as HostedMarker;
	marker.kind = 'hosted';
	marker[HOSTED_OPTIONS] = { ...options };
	return marker;
};

/**
 * The options a marker carries, or `undefined` for anything else.
 *
 * @param mode - A `mode` option.
 * @returns The `hosted()` options.
 * @internal
 */
export const readHostedMarker = function readHostedMarker(
	mode: unknown
): HostedModeOptions | undefined {
	return typeof mode === 'function' && HOSTED_OPTIONS in mode
		? (mode as HostedMarker)[HOSTED_OPTIONS]
		: undefined;
};
