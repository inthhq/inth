import { join } from 'node:path';

import { isPrivateSdkName, toPublicSpecifier } from './sdk-parts';

interface ResolveContext {
	resolve: (
		source: string,
		importer?: string,
		options?: { skipSelf?: boolean }
	) => Promise<unknown>;
}

/**
 * A Vite plugin for a framework package's tests. Sources of the shared
 * packages import each other by private name (`@inth/sdk-core`); a test
 * that imports one of them directly would load a second copy of the engine
 * next to the one the framework reaches through `@inth/sdk/engine`. This
 * resolves each private name as its public specifier, from the framework
 * package, so it takes the same aliases and loads the same modules.
 *
 * @param root - The framework package's directory.
 * @returns The Vite plugin.
 */
export const privateSdkNames = function privateSdkNames(root: string) {
	return {
		enforce: 'pre' as const,
		name: 'inth:private-sdk-names',
		resolveId(this: ResolveContext, id: string) {
			if (!isPrivateSdkName(id)) {
				return null;
			}
			return this.resolve(toPublicSpecifier(id), join(root, 'package.json'), {
				skipSelf: true,
			});
		},
	};
};
