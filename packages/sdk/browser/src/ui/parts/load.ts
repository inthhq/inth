// Promise chains, not async functions: see `../prompt/prompt.ts`.
/* oxlint-disable promise/prefer-await-to-then */
/**
 * Loads the consent UI's parts on demand: one chunk per container, the
 * in-place options when Customize first opens them, the dialog when it
 * opens, and the opt-in confirmation when it is asked for.
 * `rslib.config.ts` swaps in `./load-static.ts` for the script-tag builds
 * that stay one file, and `./load-script.ts` for `inth.hosted.js`.
 *
 * Keep the loaded modules' filenames neutral: each chunk is named after
 * its module, and content blockers drop files named like a consent banner.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentContainer } from '@inth/sdk-core';

import type * as dialog from '../dialog/dialog';
import type * as optInConfirmation from '../opt-in-confirmation';
import type * as card from '../prompt/card';
import type * as panel from '../prompt/panel';

/** What a container chunk exports. */
export type PresentationModule = typeof card;

/** Load the prompt for a container type. */
export const importPresentation = (
	type: ConsentContainer['type']
): Promise<PresentationModule> => {
	if (type === 'banner') {
		return import('../prompt/strip');
	}
	if (type === 'drawer') {
		return import('../prompt/drawer');
	}
	return import('../prompt/card');
};

/** Load the options the prompt shows in place. */
export const importPanel = (): Promise<typeof panel> =>
	import('../prompt/panel');

/** Load the "Your Privacy Choices" dialog. */
export const importDialog = (): Promise<typeof dialog> =>
	import('../dialog/dialog');

/** Load the opt-in confirmation, which the dialog host shows. */
export const importOptInConfirmation = (): Promise<typeof optInConfirmation> =>
	import('../opt-in-confirmation');
