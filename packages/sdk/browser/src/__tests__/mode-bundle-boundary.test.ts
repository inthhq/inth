// @vitest-environment node
/**
 * The build check that keeps `testing()` out of the production script
 * files (`c15t.js`, `c15t.hosted.js`, `c15t.headless.js`, `c15t.iab.js`)
 * and lets `c15t.testing.js` carry it.
 */
import { describe, expect, it } from 'vitest';

import { modeBundleBoundary } from '../../scripts/mode-bundle-boundary';

const ROOT = '/repo/packages/sdk';
const TESTING_TRANSPORT = `${ROOT}/core/dist/transports/testing.js`;
const POLICY_PACK = `${ROOT}/schema/dist/shared/policy-rule-presets.js`;
const HOSTED_TRANSPORT = `${ROOT}/core/dist/transports/hosted.js`;

/** Runs the plugin over one chunk holding `modules`. */
const check = function check(
	mode: Parameters<typeof modeBundleBoundary>[0],
	modules: string[]
): void {
	let done: ((stats: unknown) => void) | undefined;
	const compiler = {
		hooks: {
			done: {
				tap: (_name: string, callback: (stats: unknown) => void) => {
					done = callback;
				},
			},
		},
	};
	modeBundleBoundary(mode).apply(compiler as never);
	done?.({
		toJson: () => ({
			chunks: [
				{ modules: modules.map((id) => ({ nameForCondition: id })) },
			],
		}),
	});
};

describe('modeBundleBoundary', () => {
	it.each(['hosted', 'production'] as const)(
		'fails a %s file that contains the testing transport or the policy pack',
		(mode) => {
			expect(() => check(mode, [TESTING_TRANSPORT])).toThrow(
				/Unexpected implementation/u
			);
			expect(() => check(mode, [POLICY_PACK])).toThrow(
				/Unexpected implementation/u
			);
		}
	);

	it('lets c15t.testing.js carry them, but not the hosted transport', () => {
		expect(() =>
			check('testing', [TESTING_TRANSPORT, POLICY_PACK])
		).not.toThrow();
		expect(() => check('testing', [HOSTED_TRANSPORT])).toThrow(
			/Unexpected implementation/u
		);
	});
});
