import { resolve } from 'node:path';

import type { ClientManifestChunk } from './consent-prefetch.model';

export const preloadWithEntry = function preloadWithEntry(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean,
	source: string
): void {
	const target = Object.entries(manifest).find(
		([, chunk]) =>
			chunk.isDynamicEntry &&
			chunk.src?.endsWith(source) &&
			isConsentFile(resolve(srcDir, chunk.src))
	)?.[0];
	if (!target) {
		return;
	}
	for (const chunk of Object.values(manifest)) {
		if (chunk.isEntry && !chunk.imports?.includes(target)) {
			chunk.imports = [...(chunk.imports ?? []), target];
		}
	}
};
