import * as widget from '@inth/sdk/ui/styles/sheets/widget';

import { PARTS_SHEETS } from './parts-sheets';
import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the preference widget and the standalone opt-out and opt-in
 * confirmations render: the shared parts, then the widget and confirmation
 * rules with the variables they read. Only their lazy chunks import
 * `widget`, so its rules load with their code.
 *
 * @internal
 */
export const WIDGET_SHEETS: readonly SurfaceStyleSheet[] = [
	...PARTS_SHEETS,
	widget,
];
