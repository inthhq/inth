/**
 * A stylesheet module the client build bundled into a CSS file, with the
 * modules that import it.
 */
export interface StyleSource {
	id: string;
	importers: string[];
}

/** Bundled CSS file name (without directories) to the modules inside it. */
export type StyleSourceIndex = Map<string, StyleSource[]>;

export const QUERY_RE = /\?.*$/u;

export const baseName = (file: string): string =>
	file.slice(file.lastIndexOf('/') + 1);
