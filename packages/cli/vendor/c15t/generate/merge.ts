import { mergeEnvFile } from './source.ts';
import type { FileMerge } from './types.ts';

/** The file's own indentation step: its first indented line's, else a tab. */
const indentUnit = (content: string): string =>
	content.match(/^(?:\t| +)(?=\S)/mu)?.[0] ?? '\t';

/** Whether `content` has `marker`, or any of the markers in a list. */
const hasMarker = (
	content: string,
	marker: string | string[] | undefined
): boolean => {
	if (marker === undefined) {
		return false;
	}
	if (typeof marker === 'string') {
		return content.includes(marker);
	}
	return marker.some((entry) => content.includes(entry));
};

/** A snippet a file still has under an older name. */
export interface LegacySnippet {
	/** The older name the file uses, such as `#c15t-preferences`. */
	found: string;
	/** The name the generated snippet uses, such as `#inth-preferences`. */
	current: string;
	/** The generated snippet that replaces the old one. */
	content: string;
}

/**
 * Find snippets an existing file has only under an older name. In a marker
 * list, the first entry is the current name and the rest are older names
 * that still count as present, so setup adds no second copy. The SDK only
 * answers to the current name, so the caller should ask for a rename.
 * @param existing Current contents of the project's file.
 * @param merge How the generated file merges into it.
 * @returns One entry per older name the file uses without the current one.
 */
export const legacySnippets = (
	existing: string,
	merge: FileMerge | undefined
): LegacySnippet[] => {
	if (merge?.type !== 'insert') {
		return [];
	}
	const found: LegacySnippet[] = [];
	const check = (marker: string | string[] | undefined, content: string) => {
		if (marker === undefined || typeof marker === 'string') {
			return;
		}
		const current = marker[0];
		if (current === undefined || existing.includes(current)) {
			return;
		}
		for (let index = 1; index < marker.length; index += 1) {
			const name = marker[index];
			if (name !== undefined && existing.includes(name)) {
				found.push({ found: name, current, content });
			}
		}
	};
	for (const insert of merge.inserts) {
		check(insert.marker, insert.content);
		check(merge.marker, insert.content);
	}
	return found;
};

/**
 * Describe each snippet a file still has under an older name.
 * @param path The file's path in the project.
 * @param snippets What {@link legacySnippets} found.
 * @returns One instruction per snippet.
 */
export const legacySnippetInstructions = (
	path: string,
	snippets: LegacySnippet[]
): string[] =>
	snippets.map(
		({ found, current, content }) =>
			`${path} still uses ${found}, which Inth does not read. Replace it with this snippet, which uses ${current}:\n${content}`
	);

/**
 * Apply a generated file to the file a project already has.
 * @param existing Current contents of the project's file.
 * @param generated Contents generated for a project without the file.
 * @param merge How to combine them. Without one, the generated file
 * replaces the existing one.
 * @returns The contents to write. Equal to `existing` when nothing changes.
 * @throws {Error} When an `insert` cannot find where its snippet belongs.
 * @example
 * mergeFile('<body>\n</body>\n', '', {
 *   type: 'insert',
 *   marker: '#inth-preferences',
 *   inserts: [{ before: '</body>', content: '<a href="#inth-preferences">Privacy settings</a>' }],
 * });
 */
export const mergeFile = (
	existing: string,
	generated: string,
	merge: FileMerge | undefined
): string => {
	if (!merge) {
		return generated;
	}
	if (merge.type === 'keep') {
		return existing;
	}
	if (merge.type === 'env') {
		return mergeEnvFile(existing, generated);
	}
	if (hasMarker(existing, merge.marker)) {
		return existing;
	}
	let merged = existing;
	for (const { before, content, marker } of merge.inserts) {
		if (hasMarker(merged, marker)) {
			continue;
		}
		if (before === '') {
			merged = `${content}\n${merged}`;
			continue;
		}
		const index = merged.indexOf(before);
		if (index === -1) {
			throw new Error(
				`Could not find ${before} to add the c15t snippet before. Add it by hand:\n${content}`
			);
		}
		const lineStart = merged.lastIndexOf('\n', index - 1) + 1;
		const leading = merged.slice(lineStart, index);
		if (leading.trim() !== '') {
			// The anchor shares its line with other markup: insert inline.
			merged = `${merged.slice(0, index)}${content}${merged.slice(index)}`;
			continue;
		}
		// A closing tag's children sit one level deeper than the tag.
		const indentation = before.startsWith('</')
			? `${leading}${indentUnit(merged)}`
			: leading;
		const snippet = content
			.split('\n')
			.map((line) => (line ? `${indentation}${line}` : line))
			.join('\n');
		merged = `${merged.slice(0, lineStart)}${snippet}\n${merged.slice(lineStart)}`;
	}
	return merged;
};
