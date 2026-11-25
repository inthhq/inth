/**
 * Where the script-tag files the init script and the engine load live.
 *
 * @packageDocumentation
 * @internal
 */

import { version } from '../version';

/** A file the init script or the engine loads next to `inth.js`. */
export type InitFile = 'hosted' | 'commit' | 'records' | 'dialog' | 'manifests';

/** The globals the backend's `/inth.js` sets to each file's URL. */
const BACKEND_SRC_GLOBALS: Record<InitFile, string> = {
	commit: '__inthCommitSrc',
	dialog: '__inthDialogSrc',
	hosted: '__inthHostedSrc',
	manifests: '__inthManifestsSrc',
	records: '__inthRecordsSrc',
};

/**
 * The URL of `file`: the backend's global, the init tag's
 * `data-<file>-src`, or `inth.<file>.js` at this version next to
 * `besides`.
 *
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
		? new URL(`inth.${file}.js?v=${version}`, new URL(besides, location.href))
				.href
		: null;
};
