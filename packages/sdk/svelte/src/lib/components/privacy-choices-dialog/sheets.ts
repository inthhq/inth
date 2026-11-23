/**
 * What the Privacy Choices dialog renders: the theme tokens and the button
 * rules, which the prompt has usually put on the page already, then the
 * scroll area and group it shares with the banner panels, then the
 * dialog's own rules. The classic dialog sheet stays off the page: the v6
 * sheet carries its own switch and category rows.
 *
 * A module of the dialog's chunk, so only the dialog's code carries the
 * text of its own rules.
 */
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as privacyChoicesDialog from '@inth/sdk/ui/styles/sheets/dialog';
import * as expand from '@inth/sdk/ui/styles/sheets/expand';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { SurfaceStyleSheet } from '../../surface-styles';

/** @internal */
export const PRIVACY_CHOICES_DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	expand,
	privacyChoicesDialog,
];
