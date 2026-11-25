/**
 * Where the script-tag files the init script and the engine load live.
 *
 * @packageDocumentation
 * @internal
 */

import { version } from '../version';

/** A file the init script or the engine loads next to `inth.js`. */
export type InitFile = 'hosted' | 'records' | 'choices' | 'choices-dialog';

/** The globals the backend's `/inth.js` sets to each file's URL. */
const BACKEND_SRC_GLOBALS: Record<InitFile, string> = {
	choices: '__inthChoicesSrc',
	'choices-dialog': '__inthChoicesDialogSrc',
	hosted: '__inthHostedSrc',
	records: '__inthRecordsSrc',
};

const CHOICES_FILE = /(?:^|\/)inth\.choices\.js$/u;

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

/**
 * The URL of `inth.choices-dialog.js`, the dialog `inth.choices.js` loads
 * on demand: the backend's `__inthChoicesDialogSrc`, the init tag's
 * `data-choices-dialog-src`, or a file next to `inth.choices.js`. When the
 * choices file has its standard name, only the name changes, so the
 * dialog keeps any query the backend gave the choices file (a version, a
 * signature); otherwise it is `inth.choices-dialog.js` at this version
 * beside it.
 *
 * @param choicesSrc - The URL `inth.choices.js` loads from.
 * @returns The URL, or `null` when none is known.
 * @internal
 */
export const choicesDialogSrc = function choicesDialogSrc(
	tag: Element | null | undefined,
	choicesSrc: string | null | undefined
): string | null {
	const configured = partSrc('choices-dialog', tag, null);
	if (configured || !choicesSrc) {
		return configured;
	}
	const url = new URL(choicesSrc, location.href);
	if (CHOICES_FILE.test(url.pathname)) {
		url.pathname = url.pathname.replace(
			CHOICES_FILE,
			(name) => `${name.startsWith('/') ? '/' : ''}inth.choices-dialog.js`
		);
		return url.href;
	}
	return partSrc('choices-dialog', null, url.href);
};

/** The query parameter a retry adds to a file's URL. */
export const RETRY_PARAM = 'inth-retry';

/**
 * The URL for the `attempt`th try at loading `src`: `src` itself first,
 * then with `inth-retry=<attempt>`. A new URL skips an error response the
 * browser's HTTP cache kept (a missing file's 404 may carry cache
 * headers), and for a module script, the failure the document's module
 * map remembers for the old URL.
 *
 * @internal
 */
export const retrySrc = function retrySrc(
	src: string,
	attempt: number
): string {
	if (attempt < 1) {
		return src;
	}
	const url = new URL(src, location.href);
	url.searchParams.set(RETRY_PARAM, String(attempt));
	return url.href;
};
