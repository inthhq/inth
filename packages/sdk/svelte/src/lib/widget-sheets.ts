import * as primitives from '@inth/sdk/ui/styles/sheets/primitives';
import * as widget from '@inth/sdk/ui/styles/sheets/widget';

import { PARTS_SHEETS } from './parts-sheets';
import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the preference widget and the standalone opt-out and opt-in
 * confirmations render: the shared parts, the widget and confirmation rules
 * with the variables they read, then the primitives the Svelte widget
 * renders, in the order `styles.css` has them.
 *
 * A module of its own, so only the widget's and the confirmations' code
 * carries the widget rules.
 *
 * @internal
 */
export const WIDGET_SHEETS: readonly SurfaceStyleSheet[] = [
	...PARTS_SHEETS,
	widget,
	primitives,
];
