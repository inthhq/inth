/**
 * `inth.hosted()` before the engine has loaded.
 *
 * `init({ mode: inth.hosted({ projectUrl }) })` is the documented way to
 * pick the hosted transport on a script-tag page, but the transport is
 * engine code. The init script's `inth.hosted()` returns a marker carrying
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

/** An `inth.hosted()` result from the init script. @internal */
export type HostedMarker = ProviderTransportFactory & {
	kind: 'hosted';
	[HOSTED_OPTIONS]: HostedModeOptions;
};

/**
 * Build a marker for `hosted(options)`.
 *
 * @returns A factory that throws if called before the engine replaces it.
 * @internal
 */
export const hostedMarker = function hostedMarker(
	options: HostedModeOptions
): HostedMarker {
	const marker = (() => {
		throw new Error(
			'@inth/sdk: inth.hosted() from inth.js runs once inth.hosted.js has loaded.'
		);
	}) as unknown as HostedMarker;
	marker.kind = 'hosted';
	marker[HOSTED_OPTIONS] = { ...options };
	return marker;
};

/**
 * The options a marker carries, or `undefined` for anything else.
 *
 * @internal
 */
export const readHostedMarker = function readHostedMarker(
	mode: unknown
): HostedModeOptions | undefined {
	return typeof mode === 'function' && HOSTED_OPTIONS in mode
		? (mode as HostedMarker)[HOSTED_OPTIONS]
		: undefined;
};
