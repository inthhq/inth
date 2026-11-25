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
	/\/(?:packages\/(?:sdk\/)?schema|@inth\/sdk-schema)\/(?:src|dist)\/shared\/policy\/policy-rule-presets\.[jt]s(?:$|[?|])/u,
];
const HOSTED_EXCLUSIONS = [
	...COMMON_EXCLUSIONS,
	...TESTING_ONLY,
	/\/(?:packages\/(?:sdk\/)?browser|@inth\/sdk-browser)\/(?:src|dist)\/policy-rules\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?schema|@inth\/sdk-schema)\/(?:src|dist)\/shared\/policy\/(?:policy-rule-presets|policy-resolution\.model|policy-rule\.model|policy-rule-fingerprint\.model)\.[jt]s(?:$|[?|])/u,
];
const TESTING_EXCLUSIONS = [
	...COMMON_EXCLUSIONS,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/transports\/(?:hosted[^/]*|mode)\.[jt]s(?:$|[?|])/u,
];
const BROWSER = '(?:packages/(?:sdk/)?browser|@inth/sdk-browser)/(?:src|dist)';

/** `@inth/sdk-ui`'s sheets for the prompt's containers, its options and the dialog. */
const SURFACE_SHEETS =
	/\/(?:packages\/(?:sdk\/)?ui|@inth\/sdk-ui)\/(?:src|dist)\/styles\/sheets\/(?:surface|card|banner|drawer|expand|dialog)\.js(?:$|[?|])/u;

/**
 * The consent UI the engine loads from `inth.choices.js`: the prompt in
 * each container, its options, the dialog, the opt-in confirmation, their
 * class names and stylesheets. The engine keeps the banner and dialog
 * hosts, the loader and the functions it shares with the file
 * (`ui/prompt/prompt.ts`, `ui/dialog/index.ts`, `ui/parts/load-script.ts`,
 * `ui/parts/engine.ts`, `ui/parts/receipt-focus.ts`).
 */
const UI_PARTS = [
	new RegExp(
		`/${BROWSER}/ui/(?:prompt/(?!prompt\\.)|dialog/(?!index\\.)|parts/(?!(?:load-script|engine|receipt-focus)\\.[jt]s(?:$|[?|]))|opt-in-confirmation\\.)`,
		'u'
	),
	new RegExp(`/${BROWSER}/generated/ui/`, 'u'),
	SURFACE_SHEETS,
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
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/(?:surface-session\/session|surface-actions\/(?:rules|opt-in|opt-out|opt-out-reload(?:\.store)?|plain-scripts)|events|libs\/vendors)\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/(?:modules\/(?:iab-controls|revocation-reload|vendor-allowed|persistence\/mount|script-loader\/(?:mount|diagnostics)|network-blocker\/hold)|libs\/(?:manifest-cache-runtime(?:\.api)?|script-loader\/debug))\.[jt]s(?:$|[?|])/u,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/(?:kernel|transports|runtime)\//u,
	new RegExp(
		`/${BROWSER}/ui/(?:parts/(?:receipt-focus|engine)|opt-out-confirmation-state)\\.[jt]s(?:$|[?|])`,
		'u'
	),
];
/**
 * The files the init script runs before the engine: hosted, without the
 * experiment controller, and without any UI, which only the engine
 * renders. `libs/experiment.ts` holds its `import()`, which a one-file
 * script build keeps even when nothing calls it.
 */
const INIT_EXCLUSIONS = [
	...HOSTED_EXCLUSIONS,
	/\/(?:packages\/(?:sdk\/)?core|@inth\/sdk-core)\/(?:src|dist)\/libs\/experiment(?:-assignment|-engine)?\.[jt]s(?:$|[?|])/u,
	new RegExp(`/${BROWSER}/(?:ui|generated|iab)/`, 'u'),
	/\/(?:packages\/(?:sdk\/)?ui|@inth\/sdk-ui)\/(?:src|dist)\/styles\//u,
];

/**
 * What `inth.choices.js` itself must not carry: the dialog and the opt-in
 * confirmation, which are its chunk `inth.choices-dialog.js`, so a visitor
 * who only answers the banner never downloads them.
 */
const DIALOG_PARTS = [
	new RegExp(
		`/${BROWSER}/(?:ui/(?:dialog/dialog|opt-in-confirmation|parts/create-rights-receipt)|entries/cdn-choices-dialog)\\.[jt]s(?:$|[?|])`,
		'u'
	),
];

/** The one chunk `inth.choices.js` may load on demand. */
export const CHOICES_DIALOG_CHUNK = 'inth.choices-dialog';

type BoundaryMode = 'choices' | 'hosted' | 'init' | 'production' | 'testing';

const EXCLUSIONS: Record<BoundaryMode, RegExp[]> = {
	choices: CHOICES_EXCLUSIONS,
	hosted: [...HOSTED_EXCLUSIONS, ...UI_PARTS],
	init: INIT_EXCLUSIONS,
	production: TESTING_ONLY,
	testing: TESTING_EXCLUSIONS,
};

const assertModules = function assertModules(
	mode: BoundaryMode,
	modules: readonly BundledModule[],
	exclusions: readonly RegExp[] = EXCLUSIONS[mode]
): void {
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
			assertModules(mode, module.modules, exclusions);
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
				const initial = chunk.initial !== false;
				if (mode === 'choices' && !initial) {
					// The chunk's URL is set at run time for the one chunk
					// (`src/entries/cdn-choices.ts`): a second would load from it.
					if (!chunk.names?.includes(CHOICES_DIALOG_CHUNK)) {
						throw new Error(
							`Unexpected chunk in choices browser bundle: ${chunk.names?.join(', ') || String(chunk.id)}. inth.choices.js loads only ${CHOICES_DIALOG_CHUNK}.js on demand.`
						);
					}
				}
				assertModules(
					mode,
					chunk.modules ?? [],
					mode === 'choices' && initial
						? [...EXCLUSIONS.choices, ...DIALOG_PARTS]
						: EXCLUSIONS[mode]
				);
			}
		});
	},
});
