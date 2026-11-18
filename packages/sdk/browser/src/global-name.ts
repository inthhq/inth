/**
 * The window property the script-tag API lives on: a queue of calls before
 * a tag runs, the init script's stand-in, then the API. Its own module, so
 * the init script and the add-on tags name it without the API's code.
 *
 * @internal
 */
export const GLOBAL_NAME = 'inth';
