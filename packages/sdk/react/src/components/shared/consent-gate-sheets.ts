import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as consentGate from '@inth/sdk/ui/styles/sheets/consent-gate';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the ConsentGate placeholder renders: the tokens, the button rules
 * for its button, and its own rules. Only the ConsentGate imports this
 * module, so its sheet loads with the ConsentGate's code.
 *
 * @internal
 */
export const CONSENT_GATE_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	consentGate,
];
