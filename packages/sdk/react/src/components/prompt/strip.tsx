'use client';

/**
 * The consent prompt as a Banner. Only this module imports the
 * `banner` stylesheet, so a page that shows another container never
 * downloads or inlines it. The file is named `strip`, not `banner`: it
 * loads on demand, bundlers name its chunk after it, and content blockers
 * drop files named like a consent banner.
 */

import presentation from '@inth/sdk/ui/styles/components/consent-banner';
import * as bannerSheet from '@inth/sdk/ui/styles/sheets/banner';
import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as surface from '@inth/sdk/ui/styles/sheets/surface';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from '../shared/surface-styles';
import { PromptSurface } from './prompt-surface';
import type { PromptSurfaceOptions } from './prompt-surface';

/** Tokens, buttons, the shell, then the Banner rules, in cascade order. */
export const BANNER_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	surface,
	bannerSheet,
];

/** @internal */
export const BannerSurface = (props: PromptSurfaceOptions) => (
	<PromptSurface
		{...props}
		sheets={BANNER_SHEETS}
		presentation={presentation}
	/>
);
