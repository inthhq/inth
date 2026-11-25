/**
 * The consent UI's parts for the script-tag builds that stay one file and
 * have no chunk to load on demand: `rslib.config.ts` swaps this in for
 * `./load.ts`. Each part still adds only its own stylesheet when it
 * renders.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentContainer } from '@inth/sdk-core';

import * as dialog from '../dialog/dialog';
import * as optInConfirmation from '../opt-in-confirmation';
import * as card from '../prompt/card';
import * as drawer from '../prompt/drawer';
import * as panel from '../prompt/panel';
import * as banner from '../prompt/strip';
import type { PresentationModule } from './load';

export const importPresentation = (
	type: ConsentContainer['type']
): Promise<PresentationModule> => {
	if (type === 'banner') {
		return Promise.resolve(banner);
	}
	return Promise.resolve(type === 'drawer' ? drawer : card);
};

export const importPanel = (): Promise<typeof panel> => Promise.resolve(panel);

export const importDialog = (): Promise<typeof dialog> =>
	Promise.resolve(dialog);

export const importOptInConfirmation = (): Promise<typeof optInConfirmation> =>
	Promise.resolve(optInConfirmation);

/** One file: the dialog is here already, and warming it costs nothing. */
export const warmsDialogWithBanner = true;
