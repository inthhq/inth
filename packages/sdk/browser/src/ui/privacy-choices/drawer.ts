/**
 * The Privacy Choices prompt as a Drawer. Only this module carries the
 * `drawer` stylesheet and class names, so a page that shows another
 * presentation never bundles or adds them.
 *
 * @packageDocumentation
 * @internal
 */

import * as drawerSheet from '@inth/sdk-ui/styles/sheets/drawer';
import * as surfaceSheet from '@inth/sdk-ui/styles/sheets/surface';

import { classes } from '../../generated/privacy-choices/drawer';
import type { ConsentBannerOptions } from '../../types';
import type { SurfaceContext } from '../surface';
import { createPrivacyChoicesSurface } from './surface';
import type { PresentationEntry, PrivacyChoicesBanner } from './surface';

/** The shell, then the Drawer rules, in cascade order. */
export const presentation: PresentationEntry = {
	classes,
	sheets: [surfaceSheet, drawerSheet],
};

/** The prompt in this presentation. */
export const createSurface = (
	ctx: SurfaceContext,
	options: ConsentBannerOptions
): PrivacyChoicesBanner =>
	createPrivacyChoicesSurface(ctx, options, presentation);
