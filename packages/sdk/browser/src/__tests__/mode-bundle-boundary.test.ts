// @vitest-environment node
/**
 * The build check that keeps `testing()` out of the production script
 * files (`inth.js`, `inth.hosted.js`, `inth.headless.js`, `inth.iab.js`)
 * and lets `inth.testing.js` carry it, keeps the experiment controller
 * and every UI out of the files the init script runs before the engine,
 * keeps the consent UI's parts out of the engine, and keeps per-kernel
 * state out of `inth.choices.js`.
 */
import { describe, expect, it } from 'vite-plus/test';

import { modeBundleBoundary } from '../../scripts/mode-bundle-boundary';

const ROOT = '/repo/packages/sdk';
const TESTING_TRANSPORT = `${ROOT}/core/dist/transports/testing.js`;
const POLICY_PACK = `${ROOT}/schema/dist/shared/policy/policy-rule-presets.js`;
const HOSTED_TRANSPORT = `${ROOT}/core/dist/transports/hosted.js`;
const EXPERIMENT_CONTROLLER = `${ROOT}/core/dist/libs/experiment-assignment.js`;
const EXPERIMENT_LOADER = `${ROOT}/core/src/libs/experiment.ts`;
const PROMPT_SURFACE = `${ROOT}/browser/src/ui/prompt/create-prompt-surface.ts`;
const BANNER_HOST = `${ROOT}/browser/src/ui/prompt/prompt.ts`;
const DIALOG_HOST = `${ROOT}/browser/src/ui/dialog/index.ts`;
const PARTS_LOADER = `${ROOT}/browser/src/ui/parts/load-script.ts`;
const PARTS_ENGINE = `${ROOT}/browser/src/ui/parts/engine.ts`;
const CHOICES_FILE = `${ROOT}/browser/src/ui/load-choices-file.ts`;
const DIALOG = `${ROOT}/browser/dist/ui/dialog/dialog.js`;
const MORPH = `${ROOT}/browser/src/ui/parts/morph.ts`;
const CARD_CLASSES = `${ROOT}/browser/src/generated/ui/card.ts`;
const STOCK_CLASSES = `${ROOT}/browser/src/generated/styles.ts`;
const SURFACE_SESSION = `${ROOT}/core/dist/surface-session/session.js`;
const OPT_IN_CONFIRMATIONS = `${ROOT}/core/dist/surface-actions/opt-in.js`;
const OPT_OUT_RELOAD_MARKER = `${ROOT}/core/dist/surface-actions/opt-out-reload.store.js`;
const RECEIPT_FOCUS = `${ROOT}/browser/src/ui/parts/receipt-focus.ts`;
const KERNEL = `${ROOT}/core/dist/kernel/create.js`;
const MANIFEST_CACHE_REQUESTS = `${ROOT}/core/dist/libs/manifest-cache-runtime.api.js`;
const COPY_RESOLVER = `${ROOT}/core/dist/libs/consent-copy.js`;
const VENDOR_DENIAL = `${ROOT}/core/dist/modules/vendor-denial.js`;
const DRAWER_SHEET = `${ROOT}/ui/dist/styles/sheets/drawer.js`;
const BANNER_SHEET = `${ROOT}/ui/dist/styles/sheets/banner.js`;
const PARTS_SHEET = `${ROOT}/ui/dist/styles/sheets/parts.js`;

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

	it('keeps the experiment controller out of inth.js and inth.records.js, not the engine', () => {
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

	it('keeps every UI out of inth.js, which only the engine renders', () => {
		for (const id of [
			PROMPT_SURFACE,
			BANNER_HOST,
			STOCK_CLASSES,
			DRAWER_SHEET,
			PARTS_SHEET,
		]) {
			expect(() => check('init', [id])).toThrow(
				/Unexpected implementation in init/u
			);
		}
	});

	it('keeps the consent UI out of inth.hosted.js, which loads it from inth.choices.js', () => {
		for (const id of [
			PROMPT_SURFACE,
			DIALOG,
			MORPH,
			CARD_CLASSES,
			DRAWER_SHEET,
			BANNER_SHEET,
		]) {
			expect(() => check('hosted', [id])).toThrow(
				/Unexpected implementation in hosted/u
			);
		}
		expect(() =>
			check('hosted', [
				BANNER_HOST,
				DIALOG_HOST,
				PARTS_LOADER,
				PARTS_ENGINE,
				RECEIPT_FOCUS,
				CHOICES_FILE,
				STOCK_CLASSES,
				PARTS_SHEET,
			])
		).not.toThrow();
	});

	it('keeps per-kernel state out of inth.choices.js, which takes it from the engine', () => {
		for (const id of [
			SURFACE_SESSION,
			OPT_IN_CONFIRMATIONS,
			OPT_OUT_RELOAD_MARKER,
			RECEIPT_FOCUS,
			PARTS_ENGINE,
			KERNEL,
			MANIFEST_CACHE_REQUESTS,
			HOSTED_TRANSPORT.replace('hosted.js', 'v1/hosted.js'),
		]) {
			expect(() => check('choices', [id])).toThrow(
				/Unexpected implementation in choices/u
			);
		}
		// Its own parts and the stateless resolvers it may carry.
		expect(() =>
			check('choices', [
				PROMPT_SURFACE,
				DIALOG,
				MORPH,
				DRAWER_SHEET,
				COPY_RESOLVER,
				VENDOR_DENIAL,
			])
		).not.toThrow();
	});
});
