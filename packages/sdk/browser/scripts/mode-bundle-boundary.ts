import type { Rspack } from '@rslib/core';

interface BundledModule {
	identifier?: string;
	nameForCondition?: string | null;
	modules?: BundledModule[];
}

const COMMON_EXCLUSIONS = [
	/\/(?:packages\/(?:sdk\/)?browser|@inth\/sdk-browser)\/(?:src|dist)\/(?:client|global|transports\/manifest)\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/transports\/manifest[^/]*\.[jt]s(?:$|[?|])/u,
];
/** The testing transport, its policy pack and the offline resolver. */
const TESTING_ONLY = [
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/(?:transports\/(?:offline|testing)|testing)\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?browser|@inth\/sdk-browser)\/(?:src|dist)\/(?:policy-rules|testing-global)\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?schema|@inth\/sdk-schema)\/(?:src|dist)\/shared\/policy-rule-presets\.[jt]s(?:$|[?|])/u,
];
const HOSTED_EXCLUSIONS = [
	...COMMON_EXCLUSIONS,
	...TESTING_ONLY,
	/\/(?:packages\/(?:sdk\/)?browser|@inth\/sdk-browser)\/(?:src|dist)\/policy-rules\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?schema|@inth\/sdk-schema)\/(?:src|dist)\/shared\/(?:policy-rule-presets|policy-resolution|policy-rule|policy-rule-fingerprint)\.[jt]s(?:$|[?|])/u,
];
const TESTING_EXCLUSIONS = [
	...COMMON_EXCLUSIONS,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/transports\/(?:hosted[^/]*|mode)\.[jt]s(?:$|[?|])/u,
];
/**
 * The Privacy Choices design: its surfaces, class names and stylesheets.
 * Only the engine and `inth.choices.js` render it; the init script and `inth.dialog.js` render
 * the classic banner and dialog, and leave this design to the engine.
 */
const PRIVACY_CHOICES = [
	/\/(?:packages\/(?:sdk\/)?browser|@inth\/sdk-browser)\/(?:src|dist)\/(?:ui|generated)\/privacy-choices(?:-design)?(?:\/|\.[jt]s(?:$|[?|]))/u,
	/\/(?:packages\/(?:sdk\/)?ui|@inth\/sdk-ui)\/(?:src|dist)\/styles\/sheets\/(?:surface|card|bar|drawer|expand|privacy-choices-dialog)\.js(?:$|[?|])/u,
];
/**
 * The Privacy Choices parts the engine loads from `inth.choices.js`: its
 * surfaces, class names and stylesheets. The engine keeps the switch
 * between the designs, the loader and the functions it shares with the
 * file (`ui/privacy-choices/pc-import-script.ts`, `ui/privacy-choices/engine.ts`).
 */
const PRIVACY_CHOICES_PARTS = [
	/\/(?:packages\/(?:sdk\/)?browser|@inth\/sdk-browser)\/(?:src|dist)\/ui\/privacy-choices\/(?!(?:pc-import-script|engine)\.[jt]s(?:$|[?|]))/u,
	/\/(?:packages\/(?:sdk\/)?browser|@inth\/sdk-browser)\/(?:src|dist)\/generated\/privacy-choices\//u,
	PRIVACY_CHOICES[1] as RegExp,
];
/**
 * What `inth.choices.js` must take from the engine rather than carry: every
 * module that keeps per-kernel or per-page state the engine's surfaces
 * also read (the surface session, the confirmations and their reload
 * hooks, the action rules, the receipt focus, the vendor registry, the
 * kernel and its modules). A second copy would keep its own state.
 */
const CHOICES_EXCLUSIONS = [
	...HOSTED_EXCLUSIONS,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/(?:surface-session\/session|surface-actions\/(?:rules|opt-in|opt-out|opt-out-reload|plain-scripts)|events|libs\/vendors)\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/(?:modules\/(?:iab-controls|revocation-reload|vendor-allowed|persistence\/mount|script-loader\/(?:mount|diagnostics)|network-blocker\/hold)|libs\/(?:manifest-cache-runtime|script-loader\/debug))\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/(?:kernel|transports|runtime)\//u,
	/\/(?:packages\/(?:sdk\/)?browser|@inth\/sdk-browser)\/(?:src|dist)\/ui\/(?:receipt-focus|opt-out-confirmation-state|privacy-choices\/engine)\.[jt]s(?:$|[?|])/u,
];
/**
 * The files the init script runs before the engine: hosted, and without
 * the experiment controller. `libs/experiment.ts` holds its `import()`,
 * which a one-file script build keeps even when nothing calls it.
 */
const INIT_EXCLUSIONS = [
	...HOSTED_EXCLUSIONS,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/libs\/experiment(?:-assignment|-engine)?\.[jt]s(?:$|[?|])/u,
	...PRIVACY_CHOICES,
];

type BoundaryMode = 'choices' | 'hosted' | 'init' | 'production' | 'testing';

const EXCLUSIONS: Record<BoundaryMode, RegExp[]> = {
	choices: CHOICES_EXCLUSIONS,
	hosted: [...HOSTED_EXCLUSIONS, ...PRIVACY_CHOICES_PARTS],
	init: INIT_EXCLUSIONS,
	production: TESTING_ONLY,
	testing: TESTING_EXCLUSIONS,
};

const assertModules = function assertModules(
	mode: BoundaryMode,
	modules: readonly BundledModule[]
): void {
	const exclusions = EXCLUSIONS[mode];
	for (const module of modules) {
		const id = (module.nameForCondition ?? module.identifier ?? '').replaceAll(
			'\\',
			'/'
		);
		if (exclusions.some((pattern) => pattern.test(id))) {
			throw new Error(
				`Unexpected implementation in ${mode} browser bundle: ${id}`
			);
		}
		if (module.modules) {
			assertModules(mode, module.modules);
		}
	}
};

/**
 * Check emitted chunks after tree shaking, including concatenated modules.
 * Parsed but unused barrel exports do not count as bundled code.
 *
 * @param mode - The bundle's supported transport.
 * @returns A build plugin that fails if another mode enters the output.
 */
export const modeBundleBoundary = (
	mode: BoundaryMode
): Rspack.RspackPluginInstance => ({
	apply(compiler) {
		compiler.hooks.done.tap('BrowserModeBundleBoundary', (stats) => {
			const output = stats.toJson({
				all: false,
				cachedModules: true,
				chunkModules: true,
				chunkModulesSpace: Number.POSITIVE_INFINITY,
				chunks: true,
				dependentModules: true,
				groupModulesByAttributes: false,
				groupModulesByCacheStatus: false,
				groupModulesByExtension: false,
				groupModulesByLayer: false,
				groupModulesByPath: false,
				groupModulesByType: false,
				nestedModules: true,
				nestedModulesSpace: Number.POSITIVE_INFINITY,
				orphanModules: true,
			});
			for (const chunk of output.chunks ?? []) {
				assertModules(mode, chunk.modules ?? []);
			}
		});
	},
});
