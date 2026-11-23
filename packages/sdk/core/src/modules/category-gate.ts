/**
 * The category and vendor part of gate evaluation, without IAB.
 *
 * `evaluateConsent` (`./has.ts`) runs this for every target without IAB
 * fields. It is a module of its own so code that gates only on categories
 * and vendors, such as the script tag's inert `data-inth-category` tags
 * before the engine loads, does not carry the IAB evaluation.
 *
 * @packageDocumentation
 */

import { evaluateConsentRecord } from '../consent-record/evaluate';
import type { AllConsentNames } from '../consent/consent-types';
import { has } from '../libs/has';
import type { HasCondition } from '../libs/has';
import { vendorAxisActive } from '../libs/vendors';
import type { ConsentSnapshot } from '../consent-kernel.model';
import { isVendorDenied } from './vendor-denial';

export { deniedVendorIds, isVendorDenied } from './vendor-denial';

/**
 * Reads permissions at the gate's clock without changing the kernel.
 * Reuses evaluated fields until the next semantic deadline.
 * @param now - Current epoch milliseconds.
 * @returns Effective category permissions and independent restrictions.
 */
export const getEffectiveGateState = function getEffectiveGateState(
	snapshot: ConsentSnapshot,
	now = Date.now()
): Pick<ConsentSnapshot, 'effectivePermissions' | 'restrictions'> {
	if (snapshot.nextDeadline === null || now < snapshot.nextDeadline) {
		return snapshot;
	}
	const evaluation = evaluateConsentRecord({
		choice: snapshot.explicitChoice,
		gpc: snapshot.privacySignals.gpc.active,
		noticeDismissal: snapshot.noticeDismissal,
		now,
		optOut: snapshot.optOut,
		policy: snapshot.evaluationPolicy,
	});
	return {
		effectivePermissions: evaluation.permissions,
		restrictions: evaluation.restrictions,
	};
};

/**
 * Whether a target without IAB fields may run: its category condition at
 * the gate's clock, then, outside `model === 'iab'`, its vendor not turned
 * off. The same answer `evaluateConsent` gives such a target.
 * @param target - Category condition and optional vendor slug.
 * @param now - Gate clock in epoch milliseconds.
 * @returns Whether the target may run at this time.
 * @throws {Error} For an unknown category, as `has` does.
 */
export const evaluateCategoryGate = function evaluateCategoryGate<
	CategoryType extends AllConsentNames,
>(
	target: { category: HasCondition<CategoryType>; vendor?: string },
	snapshot: ConsentSnapshot,
	now = Date.now()
): boolean {
	const allowed = has(
		target.category,
		getEffectiveGateState(snapshot, now).effectivePermissions
	);
	if (!allowed || target.vendor === undefined || !vendorAxisActive(snapshot)) {
		return allowed;
	}
	return !isVendorDenied(snapshot, target.vendor);
};
