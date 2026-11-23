/**
 * The consent prompt's stylesheets, one list per container, so a page
 * inserts only the container it shows: a Drawer page never downloads or
 * inlines the Card or Banner rules.
 *
 * The deferred form, like the banner's: an id and a `load()`. A
 * server-rendered SvelteKit page already holds the text `inthHandle` wrote,
 * and a page rendered only in the browser loads each text once.
 */
import type { ResolvedConsentLayout } from '@inth/sdk/engine';
import * as banner from '@inth/sdk/ui/styles/sheets/banner-deferred';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as card from '@inth/sdk/ui/styles/sheets/card-deferred';
import * as drawer from '@inth/sdk/ui/styles/sheets/drawer-deferred';
import * as surface from '@inth/sdk/ui/styles/sheets/surface-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { SurfaceStyleSheet } from '../../surface-styles';

/** Tokens, buttons, the shell, then the Card rules, in cascade order. */
export const CARD_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	surface,
	card,
];

/** Tokens, buttons, the shell, then the Banner rules, in cascade order. */
export const BANNER_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	surface,
	banner,
];

/** Tokens, buttons, the shell, then the Drawer rules, in cascade order. */
export const DRAWER_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	surface,
	drawer,
];

/**
 * The sheets of the container the prompt renders. The desktop container
 * picks it, as the server renders it and as React does.
 *
 * @internal
 */
export const presentationSheets = function presentationSheets(
	type: ResolvedConsentLayout['type']
): readonly SurfaceStyleSheet[] {
	switch (type) {
		case 'banner':
			return BANNER_SHEETS;
		case 'drawer':
			return DRAWER_SHEETS;
		default:
			return CARD_SHEETS;
	}
};
