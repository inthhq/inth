// A promise chain, not an async function: see `./prompt/prompt.ts`.
/* oxlint-disable promise/prefer-await-to-then */
/**
 * `inth.choices.js`, the consent UI as a file of its own.
 *
 * The engine (`inth.hosted.js`) carries the banner and dialog hosts
 * (`./prompt/prompt.ts`, `./dialog/index.ts`). The prompt in each
 * container, the in-place options, the dialog and the opt-in confirmation
 * it hosts are this one file, which the engine loads the first time the
 * page needs one of them, so a returning visitor who never sees them
 * never downloads them. The init script starts fetching it alongside the
 * engine when a banner is owed (`../init/run-init-script.ts`). They share one copy of
 * the morph registry and of the page block, so they stay one file.
 *
 * The file calls the engine's copy of everything that keeps per-kernel
 * state (the surface session, the confirmations, the receipt focus), which
 * the engine publishes on {@link CHOICES_ENGINE_KEY} before it loads the
 * file: two copies of that state would disagree about what is open. The
 * build swaps `./parts/engine.ts` for that global in the file and checks
 * no stateful module slips in (`scripts/mode-bundle-boundary.ts`).
 *
 * @packageDocumentation
 * @internal
 */

import type * as dialog from './dialog/dialog';
import type * as optInConfirmation from './opt-in-confirmation';
import type * as engine from './parts/engine';
import type * as card from './prompt/card';
import type * as drawer from './prompt/drawer';
import type * as panel from './prompt/panel';
import type * as banner from './prompt/strip';

/** Global `inth.choices.js` publishes its {@link ChoicesFile} on. */
export const CHOICES_KEY = '__inthChoices';

/** Global the engine publishes its shared functions on, for the file. */
export const CHOICES_ENGINE_KEY = '__inthChoicesEngine';

/** What `inth.choices.js` publishes. @internal */
export interface ChoicesFile {
	banner: typeof banner;
	card: typeof card;
	drawer: typeof drawer;
	panel: typeof panel;
	dialog: typeof dialog;
	optInConfirmation: typeof optInConfirmation;
	/** The package version the file was built from. */
	version: string;
}

/** What the engine publishes on {@link CHOICES_ENGINE_KEY}. @internal */
export type ChoicesEngine = typeof engine;

type Globals = Record<string, unknown>;

const published = (version: string): ChoicesFile | undefined => {
	const file = (window as unknown as Globals)[CHOICES_KEY] as
		| ChoicesFile
		| undefined;
	// A file from another release may not match this engine's state.
	return file?.version === version ? file : undefined;
};

let pending: Promise<ChoicesFile> | undefined;

/**
 * Load `inth.choices.js` from `src`, once, after publishing the engine's
 * shared functions for it.
 *
 * @returns What the file published. Rejects when the file fails to load,
 * does not publish, or is from another release; the next call tries again.
 * @internal
 */
export const loadChoicesFile = function loadChoicesFile(params: {
	src: string;
	nonce: string | undefined;
	engine: ChoicesEngine;
	version: string;
}): Promise<ChoicesFile> {
	const ready = published(params.version);
	if (ready) {
		return Promise.resolve(ready);
	}
	(window as unknown as Globals)[CHOICES_ENGINE_KEY] ??= params.engine;
	// oxlint-disable-next-line promise/avoid-new -- Settled by the script element.
	pending ??= new Promise<ChoicesFile>((resolve, reject) => {
		const element = document.createElement('script');
		element.src = params.src;
		if (params.nonce) {
			element.nonce = params.nonce;
		}
		const settle = () => {
			element.remove();
			// Later calls read the published file, or try again.
			pending = undefined;
			const file = published(params.version);
			if (file) {
				resolve(file);
				return;
			}
			reject(
				new Error(
					`@inth/sdk: ${params.src} did not load, or is from another release.`
				)
			);
		};
		element.addEventListener('load', settle);
		element.addEventListener('error', settle);
		document.head.append(element);
	});
	return pending;
};
