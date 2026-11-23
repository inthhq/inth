/**
 * The Privacy Choices prompt as a Card. Only this module names the
 * `card` stylesheet, so a page that shows another presentation never
 * downloads it.
 *
 * @packageDocumentation
 */

import presentation from '@inth/sdk/ui/styles/components/consent-card';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as cardSheet from '@inth/sdk/ui/styles/sheets/card-deferred';
import * as surface from '@inth/sdk/ui/styles/sheets/surface-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { PresentationModule } from './presentation';

/** Tokens, buttons, the shell, then the Card rules, in cascade order. */
export const CARD_PRESENTATION: PresentationModule = {
	sheets: [tokens, button, surface, cardSheet],
	styles: presentation,
};
