/**
 * `init()` from the ES module entries with `testing()`, for tests that
 * describe their policy with rules or preset names and need no backend.
 */
import { init as initIABEntry } from '../../iab';
import { init as initEntry } from '../../index';
import { resolveRules } from '../../policy-rules';
import { testing } from '../../testing';
import type {
	ConsentClient,
	ConsentClientOptions,
	TestingScriptTagOptions,
} from '../../consent-client.model';

/**
 * Turns test options into ES module options with `testing({ policy })`.
 *
 * @param options - Options with an optional policy, as rules or preset
 *   names.
 * @returns The same options with `mode: testing()`.
 */
export const toFactoryOptions = function toFactoryOptions(
	options: TestingScriptTagOptions = {}
): ConsentClientOptions {
	const { mode, policy, ...rest } = options;
	if (mode !== undefined) {
		return { ...rest, mode };
	}
	return {
		...rest,
		mode: testing(policy === undefined ? {} : { policy: resolveRules(policy) }),
	};
};

/** `init()` from `@inth/sdk`, with `testing()`. */
export const init = (options?: TestingScriptTagOptions): ConsentClient =>
	initEntry(toFactoryOptions(options));

/** `init()` from `@inth/sdk/iab-client`, with `testing()`. */
export const initIAB = (options?: TestingScriptTagOptions): ConsentClient =>
	initIABEntry(toFactoryOptions(options));
