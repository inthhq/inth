/**
 * The transport behind `testing()`: it resolves the recommended
 * policy pack locally and sends nothing.
 *
 * Only testing entries import this module, such as `@c15t/core/testing`
 * and `@c15t/react/testing`, so the policy pack and the resolver stay out
 * of every app that sets `backendURL`.
 *
 * @packageDocumentation
 * @internal
 */
import {
	recommendedPolicyRules,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@c15t/schema/types';
import type { PolicyRule } from '@c15t/schema/types';

import type {
	TestingModeOptions,
	TestingMode,
} from '../modes';
import type { InitContext, KernelTransport } from '../types';
import type { ProviderTransportFactory } from './mode';
import { createOfflineTranslationSelector } from './offline';

/** Bundlers replace `process.env.NODE_ENV` when they build an app. */
declare const process: { env: { NODE_ENV?: string } };

/**
 * What `testing()` from a package's `/testing` entry returns, for a
 * provider's `mode`: the transport that replaces the backend for a test.
 */
export interface ConsentTesting extends TestingMode {
	/** Builds the transport the provider uses in place of the backend. */
	readonly transport: ProviderTransportFactory;
}

/**
 * Throws in a production build. Called when the transport is built, so a
 * test config that reaches production fails on load instead of showing
 * visitors a banner whose choices nobody records.
 *
 * @param entry - The testing entry the app imported, such as
 *   `@c15t/react/testing`.
 * @throws {Error} When `process.env.NODE_ENV` is `'production'`.
 * @internal
 */
export const assertNotProduction = function assertNotProduction(
	entry: string
): void {
	let production = false;
	try {
		production = process.env.NODE_ENV === 'production';
	} catch {
		// No bundler and no `process`: not a production build.
	}
	if (production) {
		throw new Error(
			`c15t: testing() from ${entry} is for tests and does not run in production. Set \`backendURL\` on the provider and remove \`mode: testing()\`.`
		);
	}
};

/**
 * The transport factory `testing()` hands the provider.
 *
 * Each init resolves `options.policy`, or else the recommended policy
 * pack, for the location in the kernel's overrides (`overrides.country`,
 * `overrides.region`), with IAB TCF when the provider configures it or
 * `options.iab` is set. Saves are not sent anywhere: the provider's
 * persistence stores them in the browser.
 *
 * @param entry - The testing entry named in the production error.
 * @param options - `policy` replaces the pack; `iab` picks the pack's IAB
 *   TCF variant.
 * @returns A provider transport factory reporting `kind: 'offline'`.
 * @internal
 */
export const testingTransport = function testingTransport(
	entry: string,
	options: TestingModeOptions = {}
): ProviderTransportFactory {
	return Object.assign(
		(context: Parameters<ProviderTransportFactory>[0]): KernelTransport => {
			assertNotProduction(entry);
			const rules: PolicyRule[] =
				options.policy === undefined
					? recommendedPolicyRules({ iab: options.iab ?? context.iabEnabled })
					: ([] as PolicyRule[]).concat(options.policy);
			// Read at each init: a pending prefetch fills `context.prefetch`
			// after this transport is built.
			const selectTranslations = createOfflineTranslationSelector(
				context.translations,
				context.translationsFor,
				() => context.prefetch.initialOverrides?.language
			);
			return {
				init: ({ overrides }: InitContext) => {
					const countryCode = overrides.country ?? null;
					const regionCode = overrides.region ?? null;
					return Promise.resolve({
						// The location it resolved for, as `/init` answers:
						// surfaces that read the init's display data wait for one.
						location: { countryCode, regionCode },
						policyResolution: writePolicyResolutionWire(
							resolvePolicyRules({
								countryCode,
								iabEnabled: context.iabEnabled,
								regionCode,
								rules,
							})
						),
						translations: selectTranslations(overrides.language),
					});
				},
			};
		},
		{ kind: 'offline' as const }
	);
};

/**
 * Builds the `testing()` a testing entry exports.
 *
 * @param entry - The testing entry, named in the production error.
 * @param options - `policy` replaces the recommended pack; `iab` picks the
 *   pack's IAB TCF variant.
 * @returns The value for the provider's `mode`.
 * @internal
 */
export const createTestingMode = function createTestingMode(
	entry: string,
	options: TestingModeOptions = {}
): ConsentTesting {
	// `transport` is not enumerable, so the value spreads and serializes as
	// its data: a Nuxt or Astro config carries it to the browser as such.
	return Object.defineProperty(
		{ ...options, type: 'testing' as const },
		'transport',
		{ value: testingTransport(entry, options) }
	) as ConsentTesting;
};
