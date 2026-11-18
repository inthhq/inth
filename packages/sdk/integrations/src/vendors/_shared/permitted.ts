import { has } from '@inth/sdk/engine';
import type {
	AllConsentNames,
	HasCondition,
	ScriptCallbackInfo,
} from '@inth/sdk/engine';

/**
 * Whether a vendor may run: its consent condition holds and the visitor has
 * not turned the vendor off. `hasConsent` alone does not cover the vendor
 * switch, so a vendor that checked only it would load after the visitor
 * turned it off.
 *
 * @param info - The callback info, or one registration's state.
 * @param condition - Categories to check instead of the script's own
 * condition, which `hasConsent` reports.
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
