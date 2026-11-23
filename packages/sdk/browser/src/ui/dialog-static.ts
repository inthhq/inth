/**
 * The stock dialog for the script-tag builds other than `inth.hosted.js`,
 * which carry every module and load no chunk: the preference centre, or
 * the Privacy Choices dialog when the design opts in. `rslib.config.ts`
 * swaps this in for `./dialog-surface.ts`.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentDialogOptions } from '../types';
import { createDialog as createClassicDialog } from './dialog';
import { withPrivacyChoicesDialog } from './privacy-choices-design';
import type { Surface, SurfaceContext } from './surface';

/** The stock dialog. The trigger's warm-up has nothing to load here. */
export const createDialog = (
	ctx: SurfaceContext,
	options: ConsentDialogOptions,
	_warmOnMount?: unknown
): Surface =>
	withPrivacyChoicesDialog(ctx, options, createClassicDialog(ctx, options));
