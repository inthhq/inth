'use client';

/**
 * The Privacy Choices prompt as a Banner. Only this module imports the
 * `bar` stylesheet, so a page that shows another presentation never
 * downloads or inlines it.
 */

import presentation from '@inth/sdk/ui/styles/components/consent-bar';
import * as barSheet from '@inth/sdk/ui/styles/sheets/bar';
import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as surface from '@inth/sdk/ui/styles/sheets/surface';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from '../../shared/surface-styles';
import { PrivacyChoicesSurface } from './surface';
import type { PrivacyChoicesBannerOptions } from './surface';

/** Tokens, buttons, the shell, then the Banner rules, in cascade order. */
export const BAR_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	surface,
	barSheet,
];

/** @internal */
export const BarSurface = (props: PrivacyChoicesBannerOptions) => (
	<PrivacyChoicesSurface
		{...props}
		sheets={BAR_SHEETS}
		presentation={presentation}
	/>
);
