import type { ScriptCallbackInfo } from '../libs/script-loader/types';
import type { ConsentState } from '../types';

/** Every optional category denied, `necessary` granted. */
export const ALL_DENIED: ConsentState = {
	experience: false,
	functionality: false,
	marketing: false,
	measurement: false,
	necessary: true,
};

/**
 * The consent state a vendor's own consent API should carry. A vendor the
 * visitor turned off gets every optional category denied, whatever the
 * category state, so its consent API cannot re-enable tracking.
 */
export const signalConsents = function signalConsents(
	info: Pick<ScriptCallbackInfo, 'consents' | 'vendor'>
): ConsentState {
	return info.vendor?.granted === false ? ALL_DENIED : info.consents;
};
