/**
 * The global API of `c15t.testing.js`: the stock UI with `testing()`, for
 * tests of pages with no bundler.
 *
 * @internal
 */
import { createTestingMode } from '@inth/sdk-core/testing';
import type { TestingModeOptions } from '@inth/sdk-core/testing';

import { readList, readScriptOptions } from './auto-init';
import { createConsentClientWith } from './client-base';
import type { CreateConsentClientContext } from './client-base';
import { createGlobalWith } from './global-base';
import type { InthGlobalBase } from './global-base';
import { resolveRules } from './policy-rules';
import type {
	ConsentClient,
	ScriptTagClientOptions,
	TestingScriptTagOptions,
} from './types';

const ENTRY = '@inth/sdk/testing';

/** The global API installed by `c15t.testing.js`. */
export interface TestingInthGlobal extends InthGlobalBase {
	/** The testing mode, for `init({ mode: c15t.testing({ policy }) })`. */
	testing: (
		options?: TestingModeOptions
	) => ReturnType<typeof createTestingMode>;
}

const testing = (options: TestingModeOptions = {}) =>
	createTestingMode(ENTRY, options);

/**
 * A client that resolves its policy with `testing()`: the options' `mode`,
 * or one built from `policy` (rules or preset names).
 *
 * @internal
 */
export const createTestingConsentClient = function createTestingConsentClient(
	options: ScriptTagClientOptions,
	context: CreateConsentClientContext
): ConsentClient {
	const testOptions = options as TestingScriptTagOptions;
	if (
		testOptions.projectUrl !== undefined ||
		testOptions.manifest !== undefined ||
		testOptions.manifestUrl !== undefined
	) {
		throw new Error(
			`${ENTRY}: c15t.testing.js needs no backend. Load c15t.js for a page that talks to one.`
		);
	}
	const given = testOptions.mode;
	if (
		given !== undefined &&
		typeof given !== 'function' &&
		(typeof given !== 'object' || !('transport' in given))
	) {
		throw new Error(`${ENTRY}: c15t.testing.js runs testing() only.`);
	}
	const mode =
		testOptions.mode ??
		testing(
			testOptions.policy === undefined
				? {}
				: { policy: resolveRules(testOptions.policy) }
		);
	return createConsentClientWith(
		options,
		{
			// A test's own transport factory is used as is.
			factory: typeof mode === 'function' ? mode : mode.transport,
			name: typeof mode === 'function' ? 'custom' : 'testing',
		},
		context
	);
};

/**
 * Build the global API of `c15t.testing.js`.
 *
 * @param context - Entry-point wiring (UI mounter, package name).
 * @returns The API, not yet installed on `window`.
 * @internal
 */
export const createTestingGlobal = function createTestingGlobal(
	context: CreateConsentClientContext = {}
): TestingInthGlobal {
	return Object.assign(
		createGlobalWith(
			{ ...context, pkg: context.pkg ?? ENTRY },
			createTestingConsentClient,
			'testing',
			(script): ScriptTagClientOptions => {
				const options = readScriptOptions(script) as TestingScriptTagOptions;
				const policy = readList(script?.getAttribute('data-policy') ?? null);
				if (policy) {
					options.policy = policy as TestingScriptTagOptions['policy'];
				}
				return options as ScriptTagClientOptions;
			}
		),
		{ testing }
	);
};
