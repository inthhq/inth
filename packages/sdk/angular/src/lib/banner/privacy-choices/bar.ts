/**
 * The Privacy Choices prompt as a Banner. Only this module names the
 * `bar` stylesheet, so a page that shows another presentation never
 * downloads it.
 *
 * @packageDocumentation
 */

import presentation from '@inth/sdk/ui/styles/components/consent-bar';
import * as barSheet from '@inth/sdk/ui/styles/sheets/bar-deferred';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as surface from '@inth/sdk/ui/styles/sheets/surface-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { PresentationModule } from './presentation';

/** Tokens, buttons, the shell, then the Banner rules, in cascade order. */
export const BAR_PRESENTATION: PresentationModule = {
	sheets: [tokens, button, surface, barSheet],
	styles: presentation,
};
