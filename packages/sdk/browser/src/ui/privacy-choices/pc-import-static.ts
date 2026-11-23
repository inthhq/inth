/**
 * The Privacy Choices parts for the script-tag builds, which have no chunk
 * to load on demand: `rslib.config.ts` swaps this in for `./pc-import.ts`.
 * Each part still adds only its own stylesheet when it renders.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentContainer } from '@inth/sdk-core';

import * as optInConfirmation from '../opt-in-confirmation';
import * as bar from './bar';
import * as card from './card';
import * as dialog from './dialog';
import * as drawer from './drawer';
import * as panel from './panel';
import type { PresentationModule } from './pc-import';

export const importPresentation = (
	type: ConsentContainer['type']
): Promise<PresentationModule> => {
	if (type === 'banner') {
		return Promise.resolve(bar);
	}
	return Promise.resolve(type === 'drawer' ? drawer : card);
};

export const importPanel = (): Promise<typeof panel> => Promise.resolve(panel);

export const importPrivacyChoicesDialog = (): Promise<typeof dialog> =>
	Promise.resolve(dialog);

export const importOptInConfirmation = (): Promise<typeof optInConfirmation> =>
	Promise.resolve(optInConfirmation);
