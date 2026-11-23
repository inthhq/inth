/**
 * Node-only: loads the static banner's renderer from the installed
 * `@inth/react`, for `consentManifest()`.
 *
 * @packageDocumentation
 * @internal
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { StaticBannerRenderer } from './build-static-banner.model';

/**
 * Loads `@inth/react/static-banner` from the installed package.
 *
 * @returns Its exports, or `undefined` when this version has none.
 * @internal
 */
export const loadStaticBannerRenderer = async function loadStaticBannerRenderer(
	reactRoot: string
): Promise<StaticBannerRenderer | undefined> {
	try {
		const file = createRequire(join(reactRoot, 'package.json')).resolve(
			'@inth/react/static-banner'
		);
		return (await import(pathToFileURL(file).href)) as StaticBannerRenderer;
	} catch {
		return undefined;
	}
};
