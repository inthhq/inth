// Promise chains, not async functions: see `../dialog-surface.ts`.
/* oxlint-disable promise/prefer-await-to-then */
/**
 * Loads the Privacy Choices parts on demand: one chunk per presentation,
 * the in-place options when Customize first opens them, and the dialog
 * when it opens. A page on the classic design loads none of them.
 * `rslib.config.ts` swaps in `./pc-import-static.ts` for the script-tag
 * builds, which have no chunks to load.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentContainer } from '@inth/sdk-core';

import type * as card from './card';
import type * as dialog from './dialog';
import type * as panel from './panel';

/** What a presentation chunk exports. */
export type PresentationModule = typeof card;

/** Load the prompt for a container type. */
export const importPresentation = (
	type: ConsentContainer['type']
): Promise<PresentationModule> => {
	if (type === 'banner') {
		return import('./bar');
	}
	if (type === 'drawer') {
		return import('./drawer');
	}
	return import('./card');
};

/** Load the options the prompt shows in place. */
export const importPanel = (): Promise<typeof panel> => import('./panel');

/** Load the "Your Privacy Choices" dialog. */
export const importPrivacyChoicesDialog = (): Promise<typeof dialog> =>
	import('./dialog');
