import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';
import * as trigger from '@inth/sdk/ui/styles/sheets/trigger';

import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the dialog trigger renders. It renders in the browser only, so its
 * sheet never reaches the server HTML, and only the trigger's own chunk
 * imports this module, so the sheet loads with the trigger's code.
 *
 * @internal
 */
export const TRIGGER_SHEETS: readonly SurfaceStyleSheet[] = [tokens, trigger];
