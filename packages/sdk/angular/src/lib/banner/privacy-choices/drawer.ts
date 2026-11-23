/**
 * The Privacy Choices prompt as a Drawer. Only this module names the
 * `drawer` stylesheet, so a page that shows another presentation never
 * downloads it.
 *
 * @packageDocumentation
 */

import presentation from '@inth/sdk/ui/styles/components/consent-drawer';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as drawerSheet from '@inth/sdk/ui/styles/sheets/drawer-deferred';
import * as surface from '@inth/sdk/ui/styles/sheets/surface-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { PresentationModule } from './presentation';

/** Tokens, buttons, the shell, then the Drawer rules, in cascade order. */
export const DRAWER_PRESENTATION: PresentationModule = {
	sheets: [tokens, button, surface, drawerSheet],
	styles: presentation,
};
