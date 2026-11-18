import { has } from '@inth/sdk/engine';
import type {
	AllConsentNames,
	ConsentState,
	HasCondition,
	ScriptCallbackInfo,
} from '@inth/sdk/engine';

/** Every optional category denied, `necessary` granted. */
export const ALL_DENIED: ConsentState = {
	experience: false,
	functionality: false,
	marketing: false,
	measurement: false,
	necessary: true,
};

/**
 * Whether a vendor may run: its consent condition holds and the visitor has
 * not turned the vendor off. `hasConsent` alone does not cover the vendor
 * switch, so a vendor that checked only it would load after the visitor
 * turned it off.
 *
 * @param info - The callback info, or one registration's state.
 * @param condition - Categories to check instead of the script's own
 * condition, which `hasConsent` reports.
 * @returns `true` when the vendor may run.
 */
export const permitted = function permitted(
	info: Pick<ScriptCallbackInfo, 'consents' | 'hasConsent' | 'vendor'>,
	condition?: HasCondition<AllConsentNames>
): boolean {
	if (info.vendor?.granted === false) {
		return false;
	}
	return condition === undefined
		? info.hasConsent
		: has(condition, info.consents);
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
