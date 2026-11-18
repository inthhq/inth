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

type BoundaryMode = 'hosted' | 'production' | 'testing';

const EXCLUSIONS: Record<BoundaryMode, RegExp[]> = {
	hosted: HOSTED_EXCLUSIONS,
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
