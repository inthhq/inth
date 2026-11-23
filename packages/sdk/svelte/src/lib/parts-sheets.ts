import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as parts from '@inth/sdk/ui/styles/sheets/parts-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the IAB banner, the preference widget and the confirmations render
 * first: the theme tokens, the button rules, and the branding, action and
 * legal-link rules with the variables they read.
 *
 * The consent prompt, the trigger and the ConsentGate have sheets of their
 * own (`components/prompt/prompt-sheets.model.ts`, `TRIGGER_SHEETS` and
 * `CONSENT_GATE_SHEETS`), so a page that renders only the prompt never
 * inserts these.
 *
 * @internal
 */
export const PARTS_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	parts,
];
