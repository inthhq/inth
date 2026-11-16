/**
 * Which declared vendors a preference surface lists.
 *
 * Split from `./vendors` so the stock surfaces, which read these on first
 * paint through the provider's state, do not carry vendor resolution with
 * them: a bundler places whole modules. `./vendors` re-exports everything
 * here.
 */
import type { AllConsentNames } from '../consent/consent-types';
import type { ResolvedVendor } from '../types';
import type { HasCondition } from './has';
import { extractConsentNamesFromCondition } from './has';

/** Whether a category condition contains a `not` anywhere in its tree. */
const hasNegation = function hasNegation(
	condition: HasCondition<AllConsentNames>
): boolean {
	if (typeof condition === 'string') {
		return false;
	}
	if ('not' in condition) {
		return true;
	}
	const branches = 'and' in condition ? condition.and : condition.or;
	return (Array.isArray(branches) ? branches : [branches]).some(hasNegation);
};

/**
 * Whether a declared vendor can appear as a row anywhere: presentable and
 * without a negation in its condition. A script registering only its slug
 * is not presentable, and a vendor under `{ not: 'marketing' }` gates on a
 * category it cannot be listed under. The preference surfaces use this to
 * decide what a draft was staged against, so an invisible declaration
 * cannot stale a draft.
 *
 * @param vendor - A declared vendor.
 * @returns Whether some category row can list it.
 * @public
 */
export const vendorRenders = function vendorRenders(
	vendor: ResolvedVendor
): boolean {
	return vendor.presentable && !hasNegation(vendor.category);
};

/**
 * The declared vendors a preference surface can show as rows. Vendor
 * switches are opt-in: a site turns them on by declaring a vendor in
 * `vendors` or on the backend. Until then a vendor known only from a
 * script's `vendor` slug, such as an integration helper's, gates loading
 * but gets no row, so the stock dialog shows categories only. Once any
 * vendor is declared, helpers are listed by name alongside it.
 * A helper with a saved denial stays visible so the visitor can change it.
 *
 * @param declared - The kernel's declared vendors.
 * @param denied - Vendor denials honored by the kernel's gates.
 * @returns The vendors that render, in declared order.
 * @internal
 */
export const listedVendors = function listedVendors(
	declared: readonly ResolvedVendor[],
	denied?: ReadonlySet<string> | null
): ResolvedVendor[] {
	const optedIn = declared.some((vendor) => vendor.source !== 'script');
	return declared.filter(
		(vendor) =>
			(optedIn || vendor.source !== 'script' || denied?.has(vendor.id)) &&
			vendorRenders(vendor)
	);
};

/**
 * The vendors a preference center lists under one category: listed (see
 * {@link listedVendors}) and naming that category in their condition. A
 * vendor under `{ not: 'marketing' }` gates on marketing but cannot sit in
 * the marketing row, since turning the category on would switch it off.
 * Every framework's preference center uses this one filter so their rows
 * agree.
 *
 * @param declared - The kernel's declared vendors.
 * @param category - The category row being rendered.
 * @param denied - Vendor denials honored by the kernel's gates.
 * @returns The vendors to list, in declared order.
 * @public
 */
export const vendorsListedUnder = function vendorsListedUnder(
	declared: readonly ResolvedVendor[],
	category: AllConsentNames,
	denied?: ReadonlySet<string> | null
): ResolvedVendor[] {
	return listedVendors(declared, denied).filter((vendor) =>
		extractConsentNamesFromCondition(vendor.category).includes(category)
	);
};
