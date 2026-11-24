// @vitest-environment node
/**
 * The build check that keeps `testing()` out of the production script
 * files (`inth.js`, `inth.hosted.js`, `inth.headless.js`, `inth.iab.js`)
 * and lets `inth.testing.js` carry it, and keeps the experiment controller
 * out of the files the init script runs before the engine.
 */
import { describe, expect, it } from 'vite-plus/test';

import { modeBundleBoundary } from '../../scripts/mode-bundle-boundary';

const ROOT = '/repo/packages/sdk';
const TESTING_TRANSPORT = `${ROOT}/core/dist/transports/testing.js`;
const POLICY_PACK = `${ROOT}/schema/dist/shared/policy-rule-presets.js`;
const HOSTED_TRANSPORT = `${ROOT}/core/dist/transports/hosted.js`;
const EXPERIMENT_CONTROLLER = `${ROOT}/core/dist/libs/experiment-assignment.js`;
const EXPERIMENT_LOADER = `${ROOT}/core/src/libs/experiment.ts`;

/** Runs the plugin over one chunk holding `modules`. */
const check = function check(
	mode: Parameters<typeof modeBundleBoundary>[0],
	modules: string[]
): void {
	let done: ((stats: unknown) => void) | undefined;
	const compiler = {
		hooks: {
			done: {
				tap: (_name: string, handler: (stats: unknown) => void) => {
					done = handler;
				},
			},
		},
	};
	modeBundleBoundary(mode).apply(compiler as never);
	done?.({
		toJson: () => ({
			chunks: [{ modules: modules.map((id) => ({ nameForCondition: id })) }],
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

	it('lets inth.testing.js carry them, but not the hosted transport', () => {
		expect(() =>
			check('testing', [TESTING_TRANSPORT, POLICY_PACK])
		).not.toThrow();
		expect(() => check('testing', [HOSTED_TRANSPORT])).toThrow(
			/Unexpected implementation/u
		);
	});

	it('keeps the experiment controller out of inth.js and inth.dialog.js, not the engine', () => {
		expect(() => check('init', [EXPERIMENT_CONTROLLER])).toThrow(
			/Unexpected implementation in init/u
		);
		expect(() => check('init', [EXPERIMENT_LOADER])).toThrow(
			/Unexpected implementation in init/u
		);
		expect(() => check('init', [TESTING_TRANSPORT])).toThrow(
			/Unexpected implementation in init/u
		);
		expect(() => check('init', [HOSTED_TRANSPORT])).not.toThrow();
		expect(() =>
			check('hosted', [EXPERIMENT_CONTROLLER, EXPERIMENT_LOADER])
		).not.toThrow();
	});
});
