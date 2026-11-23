// Promise chains, not async functions: see `../dialog-surface.ts`.
/* oxlint-disable promise/prefer-await-to-then */
/**
 * The Privacy Choices parts in `inth.hosted.js`: `inth.choices.js`, loaded
 * the first time the design needs one (`../privacy-choices-file.ts`).
 * `rslib.config.ts` swaps this in for `./pc-import.ts` in that build.
 *
 * The file's URL is the backend's `__inthChoicesSrc`, the init tag's
 * `data-choices-src`, or `inth.choices.js` next to this file, at this
 * version (`partSrc`). Unlike `inth.dialog.js` it has no copy in the
 * engine to fall back on: a classic site must not carry it. A failed load
 * rejects, the banner keeps the classic design on screen meanwhile, and
 * the next call tries again.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentContainer } from '@inth/sdk-core';

import { adoptedBoot } from '../../init/adopt';
import { partSrc } from '../../init/part-src';
import { version } from '../../version';
import { loadChoicesFile } from '../privacy-choices-file';
import type { ChoicesFile } from '../privacy-choices-file';
import * as engine from './engine';
import type { PresentationModule } from './pc-import';

// Read while this file runs: `currentScript` is this file's tag.
const own =
	typeof document === 'undefined'
		? null
		: (document.currentScript as HTMLScriptElement | null);

const load = (): Promise<ChoicesFile> => {
	const src = partSrc('choices', adoptedBoot()?.script, own?.src);
	if (!src) {
		return Promise.reject(
			new Error('@inth/sdk: no URL for inth.choices.js is known.')
		);
	}
	return loadChoicesFile({
		engine,
		nonce: own?.nonce || undefined,
		src,
		version,
	});
};

export const importPresentation = (
	type: ConsentContainer['type']
): Promise<PresentationModule> =>
	load().then((file) => {
		if (type === 'banner') {
			return file.bar;
		}
		return type === 'drawer' ? file.drawer : file.card;
	});

export const importPanel = (): Promise<ChoicesFile['panel']> =>
	load().then((file) => file.panel);

export const importPrivacyChoicesDialog = (): Promise<ChoicesFile['dialog']> =>
	load().then((file) => file.dialog);

export const importOptInConfirmation = (): Promise<
	ChoicesFile['optInConfirmation']
> => load().then((file) => file.optInConfirmation);
