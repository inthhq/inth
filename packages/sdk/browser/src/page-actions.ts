/**
 * The page markup the client acts on, in a module of its own so the init
 * script reads it without the client.
 */

/** Attribute a page element can carry to drive the client on click. */
export const ACTION_ATTRIBUTE = 'data-c15t-action';

/** Link fragment that opens the preference centre, matching `@inth/astro`. */
export const PREFERENCES_HASH = '#c15t-preferences';
