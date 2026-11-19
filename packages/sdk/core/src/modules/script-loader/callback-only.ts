import type { Script } from './types';

/**
 * Resolve whether a script can use its callbacks without an element.
 * @internal
 */
export const isCallbackOnly = (script: Script): boolean => {
	const { callbackOnly } = script;
	return typeof callbackOnly === 'function'
		? callbackOnly() === true
		: callbackOnly === true;
};
