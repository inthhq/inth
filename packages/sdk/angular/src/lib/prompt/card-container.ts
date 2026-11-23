/**
 * The consent prompt as a Card. Only this module names the `card`
 * stylesheet, so a page that shows another container never downloads it.
 *
 * @packageDocumentation
 */

import styles from '@inth/sdk/ui/styles/components/consent-card';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as cardSheet from '@inth/sdk/ui/styles/sheets/card-deferred';
import * as surface from '@inth/sdk/ui/styles/sheets/surface-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { ContainerModule } from './prompt-loaders';

/** Tokens, buttons, the shell, then the Card rules, in cascade order. */
export const CARD_CONTAINER: ContainerModule = {
	sheets: [tokens, button, surface, cardSheet],
	styles,
};
