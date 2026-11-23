/**
 * The Privacy Choices prompt as a Card. Only this module carries the
 * `card` stylesheet and class names, so a page that shows another
 * presentation never bundles or adds them.
 *
 * @packageDocumentation
 * @internal
 */

import * as cardSheet from '@inth/sdk-ui/styles/sheets/card';
import * as surfaceSheet from '@inth/sdk-ui/styles/sheets/surface';

import { classes } from '../../generated/privacy-choices/card';
import type { ConsentBannerOptions } from '../../types';
import type { SurfaceContext } from '../surface';
import { createPrivacyChoicesSurface } from './surface';
import type { PresentationEntry, PrivacyChoicesBanner } from './surface';

/** The shell, then the Card rules, in cascade order. */
export const presentation: PresentationEntry = {
	classes,
	sheets: [surfaceSheet, cardSheet],
};

/** The prompt in this presentation. */
export const createSurface = (
	ctx: SurfaceContext,
	options: ConsentBannerOptions
): PrivacyChoicesBanner =>
	createPrivacyChoicesSurface(ctx, options, presentation);
