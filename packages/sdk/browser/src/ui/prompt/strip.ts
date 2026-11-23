/**
 * The consent prompt as a Banner. Only this module carries the
 * `bar` stylesheet and class names, so a page that shows another
 * presentation never bundles or adds them. The file is named `strip`,
 * not `banner`: the ES module build loads it as a chunk named after it,
 * and content blockers drop files named like a consent banner.
 *
 * @packageDocumentation
 * @internal
 */

import * as barSheet from '@inth/sdk-ui/styles/sheets/banner';
import * as surfaceSheet from '@inth/sdk-ui/styles/sheets/surface';

import type { ConsentBannerOptions } from '../../consent-client.model';
import { classes } from '../../generated/ui/banner';
import type { SurfaceContext } from '../surface';
import { createPromptSurface } from './create-prompt-surface';
import type { PresentationEntry, PromptSurface } from './create-prompt-surface';

/** The shell, then the Banner rules, in cascade order. */
export const presentation: PresentationEntry = {
	classes,
	sheets: [surfaceSheet, barSheet],
};

/** The prompt in this presentation. */
export const createSurface = (
	ctx: SurfaceContext,
	options: ConsentBannerOptions
): PromptSurface => createPromptSurface(ctx, options, presentation);
