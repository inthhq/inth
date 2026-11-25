// Promise chains, not async functions: see `../prompt/prompt.ts`.
/* oxlint-disable promise/prefer-await-to-then */
/**
 * The consent UI's parts in `inth.hosted.js`: `inth.choices.js`, loaded
 * the first time the page needs one (`../load-choices-file.ts`), and its
 * chunk `inth.choices-dialog.js`, loaded the first time the dialog or the
 * opt-in confirmation is needed. `rslib.config.ts` swaps this in for
 * `./load.ts` in that build.
 *
 * The choices file's URL is the backend's `__inthChoicesSrc`, the init
 * tag's `data-choices-src`, or `inth.choices.js` next to this file, at this
 * version (`partSrc`). The dialog's is `__inthChoicesDialogSrc`,
 * `data-choices-dialog-src`, or next to the choices file
 * (`choicesDialogSrc`). A failed load rejects, and the next call tries
 * again at a URL of its own.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentContainer } from '@inth/sdk-core';

import { adoptedBoot } from '../../init/adopt-boot';
import { choicesDialogSrc, partSrc } from '../../init/part-src';
import { version } from '../../version';
import { hasChoicesFile, loadChoicesFile } from '../load-choices-file';
import type { ChoicesFile, DialogFile } from '../load-choices-file';
import * as engine from './engine';
import type { PresentationModule } from './load';

// Read while this file runs: `currentScript` is this file's tag.
const own =
	typeof document === 'undefined'
		? null
		: (document.currentScript as HTMLScriptElement | null);

const nonce = (): string | undefined => own?.nonce || undefined;

const choicesSrc = (): string | null =>
	partSrc('choices', adoptedBoot()?.script, own?.src);

const load = (): Promise<ChoicesFile> => {
	const src = choicesSrc();
	if (!src) {
		return Promise.reject(
			new Error('@inth/sdk: no URL for inth.choices.js is known.')
		);
	}
	return loadChoicesFile({ engine, nonce: nonce(), src, version });
};

/** URLs a preload hint was added for, so each gets one. */
const preloaded = new Set<string>();

const loadDialog = (): Promise<DialogFile> => {
	const src = choicesDialogSrc(adoptedBoot()?.script, choicesSrc());
	if (!src) {
		return Promise.reject(
			new Error('@inth/sdk: no URL for inth.choices-dialog.js is known.')
		);
	}
	if (!(hasChoicesFile(version) || preloaded.has(src))) {
		// The dialog is the first part the page needs (a link opened it, or
		// a confirmation is owed): fetch it beside the choices file rather
		// than after it.
		preloaded.add(src);
		const link = document.createElement('link');
		link.rel = 'preload';
		link.as = 'script';
		link.href = src;
		const value = nonce();
		if (value) {
			link.nonce = value;
		}
		document.head.append(link);
	}
	return load().then((file) => file.loadDialog({ nonce: nonce(), src }));
};

export const importPresentation = (
	type: ConsentContainer['type']
): Promise<PresentationModule> =>
	load().then((file) => {
		if (type === 'banner') {
			return file.banner;
		}
		return type === 'drawer' ? file.drawer : file.card;
	});

export const importPanel = (): Promise<ChoicesFile['panel']> =>
	load().then((file) => file.panel);

export const importDialog = (): Promise<DialogFile['dialog']> =>
	loadDialog().then((file) => file.dialog);

export const importOptInConfirmation = (): Promise<
	DialogFile['optInConfirmation']
> => loadDialog().then((file) => file.optInConfirmation);

/**
 * The dialog is a file of its own here: a banner shown on a first visit
 * does not fetch it in idle time, so a visitor who only answers the banner
 * never downloads it. It loads when the dialog opens, or in idle time
 * while only the trigger can open it.
 */
export const warmsDialogWithBanner = false;
