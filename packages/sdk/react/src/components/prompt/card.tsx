'use client';

/**
 * The consent prompt as a Card. Only this module imports the
 * `card` stylesheet, so a page that shows another container never
 * downloads or inlines it.
 */

import presentation from '@inth/sdk/ui/styles/components/consent-card';
import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as cardSheet from '@inth/sdk/ui/styles/sheets/card';
import * as surface from '@inth/sdk/ui/styles/sheets/surface';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from '../shared/surface-styles';
import { PromptSurface } from './surface';
import type { PromptSurfaceOptions } from './surface';

/** Tokens, buttons, the shell, then the Card rules, in cascade order. */
export const CARD_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	surface,
	cardSheet,
];

/** @internal */
export const CardSurface = (props: PromptSurfaceOptions) => (
	<PromptSurface
		{...props}
		sheets={CARD_SHEETS}
		presentation={presentation}
	/>
);
