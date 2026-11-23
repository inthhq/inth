/**
 * The global API of `inth.testing.js`: the stock UI with `testing()`, for
 * tests of pages with no bundler.
 *
 * @internal
 */
import { createTestingMode } from '@inth/sdk-core/testing';
import type { TestingModeOptions } from '@inth/sdk-core/testing';

import type {
	ConsentClient,
	ScriptTagClientOptions,
	TestingScriptTagOptions,
} from './consent-client.model';
import { createConsentClientWith } from './create-consent-client-with';
import type { CreateConsentClientContext } from './create-consent-client-with';
import { createGlobalWith } from './create-global-with';
import type { GlobalApiBase } from './create-global-with';
import { resolveRules } from './policy-rules';
import { readList, readScriptOptions } from './script-tag-options.model';

const ENTRY = '@inth/sdk/testing';

/** The global API installed by `inth.testing.js`. */
export interface TestingGlobalApi extends GlobalApiBase {
	/** The testing mode, for `init({ mode: inth.testing({ policy }) })`. */
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
			`${ENTRY}: inth.testing.js needs no backend. Load inth.js for a page that talks to one.`
		);
	}
	const given = testOptions.mode;
	if (
		given !== undefined &&
		typeof given !== 'function' &&
		(typeof given !== 'object' || !('transport' in given))
	) {
		throw new Error(`${ENTRY}: inth.testing.js runs testing() only.`);
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
 * Build the global API of `inth.testing.js`.
 *
 * @param context - Entry-point wiring (UI mounter, package name).
 * @returns The API, not yet installed on `window`.
 * @internal
 */
export const createTestingGlobal = function createTestingGlobal(
	context: CreateConsentClientContext = {}
): TestingGlobalApi {
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
