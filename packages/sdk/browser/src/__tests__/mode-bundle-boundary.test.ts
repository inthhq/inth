// @vitest-environment node
/**
 * The build check that keeps `testing()` out of the production script
 * files (`inth.js`, `inth.hosted.js`, `inth.headless.js`, `inth.iab.js`)
 * and lets `inth.testing.js` carry it, keeps the experiment controller
 * out of the files the init script runs before the engine, keeps the
 * Privacy Choices parts out of the engine, and keeps per-kernel state out
 * of `inth.choices.js`.
 */
import { describe, expect, it } from 'vitest';

import { modeBundleBoundary } from '../../scripts/mode-bundle-boundary';

const ROOT = '/repo/packages/sdk';
const TESTING_TRANSPORT = `${ROOT}/core/dist/transports/testing.js`;
const POLICY_PACK = `${ROOT}/schema/dist/shared/policy-rule-presets.js`;
const HOSTED_TRANSPORT = `${ROOT}/core/dist/transports/hosted.js`;
const EXPERIMENT_CONTROLLER = `${ROOT}/core/dist/libs/experiment-assignment.js`;
const EXPERIMENT_LOADER = `${ROOT}/core/src/libs/experiment.ts`;
const PRIVACY_CHOICES_SURFACE = `${ROOT}/browser/src/ui/privacy-choices/surface.ts`;
const PRIVACY_CHOICES_SWITCH = `${ROOT}/browser/src/ui/privacy-choices-design.ts`;
const PRIVACY_CHOICES_LOADER = `${ROOT}/browser/src/ui/privacy-choices/pc-import-script.ts`;
const PRIVACY_CHOICES_ENGINE = `${ROOT}/browser/src/ui/privacy-choices/engine.ts`;
const PRIVACY_CHOICES_FILE = `${ROOT}/browser/src/ui/privacy-choices-file.ts`;
const PRIVACY_CHOICES_DIALOG = `${ROOT}/browser/dist/ui/privacy-choices/dialog.js`;
const PRIVACY_CHOICES_CLASSES = `${ROOT}/browser/src/generated/privacy-choices/card.ts`;
const SURFACE_SESSION = `${ROOT}/core/dist/surface-session/session.js`;
const OPT_IN_CONFIRMATIONS = `${ROOT}/core/dist/surface-actions/opt-in.js`;
const RECEIPT_FOCUS = `${ROOT}/browser/src/ui/receipt-focus.ts`;
const KERNEL = `${ROOT}/core/dist/kernel/create.js`;
const COPY_RESOLVER = `${ROOT}/core/dist/libs/consent-copy.js`;
const VENDOR_DENIAL = `${ROOT}/core/dist/modules/vendor-denial.js`;
const DRAWER_SHEET = `${ROOT}/ui/dist/styles/sheets/drawer.js`;
const BANNER_SHEET = `${ROOT}/ui/dist/styles/sheets/banner.js`;

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

	it('keeps the Privacy Choices design out of inth.js and inth.dialog.js, not the engine', () => {
		for (const id of [
			PRIVACY_CHOICES_SURFACE,
			PRIVACY_CHOICES_SWITCH,
			DRAWER_SHEET,
		]) {
			expect(() => check('init', [id])).toThrow(
				/Unexpected implementation in init/u
			);
		}
		expect(() => check('init', [BANNER_SHEET])).not.toThrow();
	});

	it('keeps the Privacy Choices parts out of inth.hosted.js, which loads them from inth.choices.js', () => {
		for (const id of [
			PRIVACY_CHOICES_SURFACE,
			PRIVACY_CHOICES_DIALOG,
			PRIVACY_CHOICES_CLASSES,
			DRAWER_SHEET,
		]) {
			expect(() => check('hosted', [id])).toThrow(
				/Unexpected implementation in hosted/u
			);
		}
		expect(() =>
			check('hosted', [
				PRIVACY_CHOICES_SWITCH,
				PRIVACY_CHOICES_LOADER,
				PRIVACY_CHOICES_ENGINE,
				PRIVACY_CHOICES_FILE,
				BANNER_SHEET,
			])
		).not.toThrow();
	});

	it('keeps per-kernel state out of inth.choices.js, which takes it from the engine', () => {
		for (const id of [
			SURFACE_SESSION,
			OPT_IN_CONFIRMATIONS,
			RECEIPT_FOCUS,
			PRIVACY_CHOICES_ENGINE,
			KERNEL,
			HOSTED_TRANSPORT.replace('hosted.js', 'v1/hosted.js'),
		]) {
			expect(() => check('choices', [id])).toThrow(
				/Unexpected implementation in choices/u
			);
		}
		// Its own parts and the stateless resolvers it may carry.
		expect(() =>
			check('choices', [
				PRIVACY_CHOICES_SURFACE,
				PRIVACY_CHOICES_DIALOG,
				DRAWER_SHEET,
				COPY_RESOLVER,
				VENDOR_DENIAL,
			])
		).not.toThrow();
	});
});
