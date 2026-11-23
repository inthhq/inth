import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as parts from '@inth/sdk/ui/styles/sheets/parts';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the IAB banner, the preference widget and the confirmations render
 * first: the theme tokens, the button rules, and the branding, action and
 * legal-link rules with the variables they read.
 *
 * The consent prompt, the trigger and the ConsentGate have sheets of their
 * own (`components/prompt/*`, `trigger-sheets.ts`,
 * `consent-gate-sheets.ts`): a bundler puts a module in the chunk of
 * whatever imports it, so a sheet listed here would ride in every chunk that
 * imports this one whether or not the page renders its surface.
 *
 * @internal
 */
export const PARTS_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	parts,
];
