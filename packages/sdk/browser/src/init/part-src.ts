/**
 * Where the script-tag files the init script and the engine load live.
 *
 * @packageDocumentation
 * @internal
 */

import { version } from '../version';

/** A file the init script or the engine loads next to `c15t.js`. */
export type InitFile = 'hosted' | 'commit' | 'records' | 'dialog';

/**
 * The globals the backend's `/c15t.js` sets to each file's URL. A contract
 * with the backend, so the names keep the c15t spelling.
 */
const BACKEND_SRC_GLOBALS: Record<InitFile, string> = {
	commit: '__c15tCommitSrc',
	dialog: '__c15tDialogSrc',
	hosted: '__c15tHostedSrc',
	records: '__c15tRecordsSrc',
};

/**
 * The URL of `file`: the backend's global, the init tag's
 * `data-<file>-src`, or `c15t.<file>.js` at this version next to
 * `besides`.
 *
 * @param file - The file.
 * @param tag - The init script's tag.
 * @param besides - The URL of a file the wanted one sits next to.
 * @returns The URL, or `null` when none is known.
 * @internal
 */
export const partSrc = function partSrc(
	file: InitFile,
	tag: Element | null | undefined,
	besides: string | null | undefined
): string | null {
	const configured =
		(window as unknown as Record<string, unknown>)[BACKEND_SRC_GLOBALS[file]] ??
		tag?.getAttribute(`data-${file}-src`);
	if (typeof configured === 'string' && configured) {
		return configured;
	}
	return besides
		? new URL(`c15t.${file}.js?v=${version}`, new URL(besides, location.href))
				.href
		: null;
};
