/**
 * What the Privacy Choices dialog renders: the theme tokens, the button
 * rules, the scroll area and group it shares with the banner panels, then
 * the dialog's own rules. The classic dialog sheet stays off the page: the
 * v6 sheet carries its own switch and category rows.
 *
 * A module of its own, so only the v6 dialog's chunk names these sheets.
 *
 * @packageDocumentation
 */

import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as expand from '@inth/sdk/ui/styles/sheets/expand-deferred';
import * as privacyChoicesDialog from '@inth/sdk/ui/styles/sheets/dialog-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { SurfaceStyleSheet } from '../../core/consent-styles';

/** @internal */
export const PRIVACY_CHOICES_DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	expand,
	privacyChoicesDialog,
];
