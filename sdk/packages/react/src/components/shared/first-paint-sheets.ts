import * as banner from '@c15t/ui/styles/sheets/banner';
import * as button from '@c15t/ui/styles/sheets/button';
import * as tokens from '@c15t/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the banner renders: the theme tokens, the button rules, and the
 * banner, branding, action and legal-link rules with the variables they
 * read. A server-rendered banner puts only these in the HTML, not the
 * trigger's or the ConsentGate's rules.
 *
 * The trigger's and the ConsentGate's sheets live in modules of their own
 * (`trigger-sheets.ts`, `consent-gate-sheets.ts`): a bundler puts a module
 * in the chunk of whatever imports it, so a sheet listed here would ride in
 * the banner's first-load chunk whether or not the page renders its surface.
 *
 * @internal
 */
export const BANNER_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	banner,
];
