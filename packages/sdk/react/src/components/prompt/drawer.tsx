'use client';

/**
 * The consent prompt as a Drawer. Only this module imports the
 * `drawer` stylesheet, so a page that shows another container never
 * downloads or inlines it.
 */

import presentation from '@inth/sdk/ui/styles/components/consent-drawer';
import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as drawerSheet from '@inth/sdk/ui/styles/sheets/drawer';
import * as surface from '@inth/sdk/ui/styles/sheets/surface';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from '../shared/surface-styles';
import { PromptSurface } from './surface';
import type { PromptSurfaceOptions } from './surface';

/** Tokens, buttons, the shell, then the Drawer rules, in cascade order. */
export const DRAWER_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	surface,
	drawerSheet,
];

/** @internal */
export const DrawerSurface = (props: PromptSurfaceOptions) => (
	<PromptSurface
		{...props}
		sheets={DRAWER_SHEETS}
		presentation={presentation}
	/>
);
