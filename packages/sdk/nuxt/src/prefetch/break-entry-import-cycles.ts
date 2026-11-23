import type { ClientManifestChunk } from './consent-prefetch.model';

/**
 * Drop the entry from the `imports` of chunks the entry itself imports
 * statically. Rolldown can list the entry there for a chunk that only loads
 * on demand from it, such as the Inth chunk group (`group-consent-chunks.ts`), which
 * makes a cycle. Nuxt's renderer reads a cycle's far end as having no
 * dependencies, so the page would stop preloading the Inth chunk and the
 * browser would fetch it only after parsing the entry. The entry loads
 * first anyway, so the edge only ever repeated a preload.
 *
 * Edits the manifest in place.
 * @internal
 */
export const breakEntryImportCycles = function breakEntryImportCycles(
	manifest: Record<string, ClientManifestChunk>
): void {
	for (const [entry, chunk] of Object.entries(manifest)) {
		if (!chunk.isEntry) {
			continue;
		}
		const reached = new Set<string>();
		const visit = (key: string): void => {
			if (key === entry || reached.has(key)) {
				return;
			}
			reached.add(key);
			for (const dependency of manifest[key]?.imports ?? []) {
				visit(dependency);
			}
		};
		for (const dependency of chunk.imports ?? []) {
			visit(dependency);
		}
		for (const key of reached) {
			const imported = manifest[key];
			if (imported?.imports?.includes(entry)) {
				imported.imports = imported.imports.filter((id) => id !== entry);
			}
		}
	}
};
