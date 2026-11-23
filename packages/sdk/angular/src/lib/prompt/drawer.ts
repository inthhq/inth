/**
 * The consent prompt as a Drawer. Only this module names the `drawer`
 * stylesheet, so a page that shows another container never downloads it.
 *
 * @packageDocumentation
 */

import styles from '@inth/sdk/ui/styles/components/consent-drawer';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as drawerSheet from '@inth/sdk/ui/styles/sheets/drawer-deferred';
import * as surface from '@inth/sdk/ui/styles/sheets/surface-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { ContainerModule } from './containers';

/** Tokens, buttons, the shell, then the Drawer rules, in cascade order. */
export const DRAWER_CONTAINER: ContainerModule = {
	sheets: [tokens, button, surface, drawerSheet],
	styles,
};
