/**
 * Where the provider's module hands `hosted()` the hosted transport. A
 * module of its own, so the provider does not import `hosted()` and the
 * build's backend URL with it.
 *
 * @packageDocumentation
 * @internal
 */
import type { KernelTransport } from '@c15t/core';
import type { HostedTransportOptions } from '@c15t/core/transports';

/** Builds a hosted transport. @internal */
export type BuildHostedTransport = (
	options: HostedTransportOptions
) => KernelTransport;

let provided: BuildHostedTransport | undefined;

/**
 * Hands `hosted()` the transport builder. The provider's module calls it
 * when it loads, before any runtime is built.
 *
 * @param build - `createHostedTransport` from `@c15t/core/transports`.
 * @internal
 */
export const provideHostedTransport = function provideHostedTransport(
	build: BuildHostedTransport
): void {
	provided = build;
};

/**
 * The builder the provider handed over, if its module has loaded.
 *
 * @returns The builder, or `undefined`.
 * @internal
 */
export const providedHostedTransport = function providedHostedTransport():
	| BuildHostedTransport
	| undefined {
	return provided;
};
