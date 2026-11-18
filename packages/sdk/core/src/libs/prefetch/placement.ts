/**
 * Where an `/init` prefetch script goes in a page, written once for every
 * integration that adds one to HTML.
 */

/** Id of the inline script that starts the `/init` prefetch. */
export const PREFETCH_SCRIPT_ID = 'inth-initial-data-prefetch';

/**
 * Where the script goes: after `<meta charset>`, which must stay in the
 * first 1024 bytes, or else at the start of `<head>`. Either way it comes
 * before stylesheets, which would hold an inline script back until they
 * load. Without a `<head>`, it stays after the doctype: a script before it
 * puts the page in quirks mode.
 */
const PREFETCH_ANCHORS = [
	/<meta\s[^>]*charset[^>]*>/iu,
	/<head(?:\s[^>]*)?>/iu,
	/<html(?:\s[^>]*)?>/iu,
	/<!doctype[^>]*>/iu,
] as const;

/**
 * The offset the prefetch script goes at in an HTML string, or
 * `undefined` when it holds none of the anchors.
 *
 * @param html - The page, or a chunk of its head.
 * @returns The offset right after the first anchor found.
 */
export const prefetchScriptOffset = function prefetchScriptOffset(
	html: string
): number | undefined {
	for (const anchor of PREFETCH_ANCHORS) {
		const match = anchor.exec(html);
		if (match) {
			return match.index + match[0].length;
		}
	}
	return undefined;
};

/**
 * Inserts the prefetch script tag into head chunks, as Nuxt's
 * `render:html` hands them: after the anchor in the first chunk that holds
 * one, or first when none does.
 *
 * @param chunks - The head chunks, edited in place.
 */
export const insertPrefetchScript = function insertPrefetchScript(
	chunks: string[],
	tag: string
): void {
	for (const [index, chunk] of chunks.entries()) {
		const offset = prefetchScriptOffset(chunk);
		if (offset !== undefined) {
			chunks[index] = chunk.slice(0, offset) + tag + chunk.slice(offset);
			return;
		}
	}
	chunks.unshift(tag);
};
